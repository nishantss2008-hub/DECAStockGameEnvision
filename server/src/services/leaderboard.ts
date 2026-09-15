/**
 * Leaderboard, team value history and the research-grade accumulators.
 *
 * `recomputeLeaderboard` runs after every committed tick: it marks every crew to
 * market with the engine's live prices and writes
 *   - `teams/{id}` {totalValue, rank, holdingsCount} (+ sessionOpenValue when a session starts)
 *   - `teams/{id}/history/{chunk}` total value per tick (ValueChunk)
 *   - `_teamStats/{id}` exposure += Σ value·q, weight += Σ value (holdings only, per elapsed tick)
 *   - `leaderboard/current` entries with prevRank and a ≤40-point spark
 *
 * prevRank is the crew's rank at the start of the current session (`teams/{id}.sessionStartRank`,
 * stored when a session opens or at the crew's first standings), so a movement arrow stays up for the
 * whole session instead of flickering back after one tick.
 *
 * The research grade uses the visible-fundamentals `q`, not `qEff`, so it rewards
 * reading the statements rather than the hidden surprise.
 *
 * `finalizeLeaderboard` runs once at the end: holdings are valued at the closing
 * price (impact excluded), which stops last-interval pumping of final marks.
 *
 * Cash and holdings are read outside a transaction, so a fill landing mid-recompute
 * can be one trade behind for one tick. These are display values; the next tick
 * self-corrects and authoritative cash/holdings are never touched here.
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { FinalEntry, Holding, LeaderboardEntry, Team, ValueChunk } from '@deca/shared';
import { db } from '../firebase';
import type { GameEngine } from '../engine/loop';
import {
  commitInBatches,
  crossedSession,
  putSeriesValue,
  rankEntries,
  researchGrade,
  seriesChunks,
  seriesFromChunks,
  sessionStartRank,
  type BatchOp,
  type StandingRow,
  type TeamSeries,
} from '../engine/loopHelpers';

interface LeaderboardCache {
  /** Total value per tick per team. */
  series: Map<string, TeamSeries>;
  /** Last tick recorded per team (session crossings and time weights). */
  lastTick: Map<string, number>;
}

function freshCache(): LeaderboardCache {
  return { series: new Map(), lastTick: new Map() };
}

let cache = freshCache();

/** Drops every in-memory series and rank (call after a new market is created). */
export function resetLeaderboardCache(): void {
  cache = freshCache();
}

interface TeamRead {
  team: Team;
  holdings: Holding[];
}

async function readTeams(): Promise<TeamRead[]> {
  const [teamsSnap, holdingsSnap] = await Promise.all([db.collection('teams').get(), db.collectionGroup('holdings').get()]);
  const byTeam = new Map<string, Holding[]>();
  for (const doc of holdingsSnap.docs) {
    const teamId = doc.ref.parent.parent?.id;
    if (!teamId || doc.ref.parent.parent?.parent.id !== 'teams') continue;
    const h = doc.data() as Partial<Holding>;
    const list = byTeam.get(teamId) ?? [];
    list.push({ companyId: h.companyId ?? doc.id, shares: Number(h.shares) || 0, avgCost: Number(h.avgCost) || 0 });
    byTeam.set(teamId, list);
  }
  return teamsSnap.docs.map((doc) => {
    const t = doc.data() as Partial<Team>;
    const team: Team = {
      id: doc.id,
      name: t.name ?? doc.id,
      cashBalance: Number(t.cashBalance) || 0,
      totalValue: Number(t.totalValue) || 0,
      rank: Number(t.rank) || 0,
      realizedPnl: Number(t.realizedPnl) || 0,
      feesPaid: Number(t.feesPaid) || 0,
      tradeCount: Number(t.tradeCount) || 0,
      tradingDisabled: Boolean(t.tradingDisabled),
      sessionOpenValue: Number(t.sessionOpenValue) || 0,
      holdingsCount: Number(t.holdingsCount) || 0,
      createdAt: Number(t.createdAt) || 0,
      sessionStartRank: Number(t.sessionStartRank) || 0,
    };
    return { team, holdings: byTeam.get(doc.id) ?? [] };
  });
}

/** Loads stored value history for teams seen for the first time since the cache was reset. */
async function ensureSeries(teamIds: string[]): Promise<void> {
  const missing = teamIds.filter((id) => !cache.series.has(id) && !cache.lastTick.has(id));
  await Promise.all(
    missing.map(async (id) => {
      const snap = await db.collection(`teams/${id}/history`).get();
      const s = seriesFromChunks(snap.docs.map((d) => d.data() as ValueChunk));
      if (s) {
        cache.series.set(id, s);
        cache.lastTick.set(id, s.start + s.values.length - 1);
      }
    }),
  );
}

/**
 * Ranks the rows, then sets each entry's prevRank to the crew's session start rank: its current rank when
 * `newSession(teamId)` is true or none is stored, else the stored one. Returns the entries and the start ranks.
 */
function rankWithSessionStart(
  rows: StandingRow[],
  startingCapital: number,
  stored: (teamId: string) => number | undefined,
  newSession: (teamId: string) => boolean,
): { entries: LeaderboardEntry[]; startRanks: Map<string, number> } {
  const ranked = rankEntries(rows, {}, startingCapital);
  const startRanks = new Map(ranked.map((e) => [e.teamId, sessionStartRank(stored(e.teamId), e.rank, newSession(e.teamId))]));
  return { entries: ranked.map((e) => ({ ...e, prevRank: startRanks.get(e.teamId)! })), startRanks };
}

/**
 * Team doc updates: one batch normally; if a crew was removed mid-recompute the
 * batch fails, so fall back to single updates and skip the missing crews.
 */
async function commitTeamUpdates(updates: { id: string; data: Record<string, unknown> }[]): Promise<void> {
  const ops: BatchOp[] = updates.map(({ id, data }) => (b) => b.update(db.doc(`teams/${id}`), data));
  try {
    await commitInBatches(db, ops);
  } catch {
    await Promise.all(
      updates.map(({ id, data }) =>
        db
          .doc(`teams/${id}`)
          .update(data)
          .catch((err: { code?: number }) => {
            if (err?.code !== 5) console.error('[leaderboard] team update failed', id, err); // 5 = NOT_FOUND
          }),
      ),
    );
  }
}

interface Valued {
  read: TeamRead;
  totalValue: number;
  invested: number;
  exposure: number;
  holdingsCount: number;
}

function valueTeam(read: TeamRead, priceOf: (companyId: string) => number, qOf: (companyId: string) => number): Valued {
  let invested = 0;
  let exposure = 0;
  let holdingsCount = 0;
  for (const h of read.holdings) {
    if (h.shares <= 0) continue;
    const value = Math.round(h.shares * priceOf(h.companyId));
    invested += value;
    exposure += value * qOf(h.companyId);
    holdingsCount++;
  }
  return { read, totalValue: read.team.cashBalance + invested, invested, exposure, holdingsCount };
}

export async function recomputeLeaderboard(engine: GameEngine, tick: number): Promise<void> {
  const { startingCapital, sessionTicks } = engine.state;
  const reads = await readTeams();
  await ensureSeries(reads.map((r) => r.team.id));
  const sessionStarts = new Set<string>();

  const qOf = (id: string) => engine.getCompany(id)?.q ?? 0;
  const rows: StandingRow[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const ops: BatchOp[] = [];

  for (const read of reads) {
    const id = read.team.id;
    const v = valueTeam(read, (cid) => engine.getPrice(cid), qOf);
    const prev = cache.lastTick.get(id);
    const series = putSeriesValue(cache.series.get(id), tick, v.totalValue);
    cache.series.set(id, series);
    cache.lastTick.set(id, tick);

    const newSession = crossedSession(prev, tick, sessionTicks);
    if (newSession) sessionStarts.add(id);
    const sessionOpenValue = newSession ? v.totalValue : read.team.sessionOpenValue || startingCapital;
    rows.push({
      teamId: id,
      name: read.team.name,
      totalValue: v.totalValue,
      cash: read.team.cashBalance,
      holdingsCount: v.holdingsCount,
      sessionOpenValue,
      series: series.values,
    });

    const data: Record<string, unknown> = { totalValue: v.totalValue, holdingsCount: v.holdingsCount };
    if (newSession) data.sessionOpenValue = v.totalValue;
    updates.push({ id, data });

    for (const chunk of seriesChunks(series, prev === undefined ? tick : Math.min(prev + 1, tick), tick)) {
      ops.push((b) => b.set(db.doc(`teams/${id}/history/${chunk.chunk}`), chunk));
    }

    const elapsed = prev === undefined ? 1 : Math.max(0, tick - prev);
    if (elapsed > 0) {
      ops.push((b) =>
        b.set(
          db.doc(`_teamStats/${id}`),
          {
            teamId: id,
            exposure: FieldValue.increment(v.exposure * elapsed),
            weight: FieldValue.increment(v.invested * elapsed),
            lastTick: tick,
          },
          { merge: true },
        ),
      );
    }
  }

  const storedStart = new Map(reads.map((r) => [r.team.id, r.team.sessionStartRank]));
  const { entries, startRanks } = rankWithSessionStart(rows, startingCapital, (id) => storedStart.get(id), (id) => sessionStarts.has(id));
  const rankOf = new Map(entries.map((e) => [e.teamId, e.rank]));
  for (const u of updates) {
    u.data.rank = rankOf.get(u.id) ?? 0;
    const start = startRanks.get(u.id);
    if (start !== undefined && start !== storedStart.get(u.id)) u.data.sessionStartRank = start;
  }

  ops.push((b) => b.set(db.doc('leaderboard/current'), { updatedAt: Date.now(), tick, entries }));
  await commitInBatches(db, ops);
  await commitTeamUpdates(updates);
}

/**
 * Final standings at the closing marks. Each final entry carries the research grade and what it rests on:
 * `researchWeight` (holdings value summed over the price updates it was held for) and `heldAnyShares`.
 * A crew that bought only after the last price update has no time-summed weight, so it is graded on its
 * closing holdings (counted as one update) rather than shown as holding nothing.
 */
export async function finalizeLeaderboard(engine: GameEngine): Promise<void> {
  const { startingCapital, currentTick: tick } = engine.state;
  const [reads, statsSnap] = await Promise.all([readTeams(), db.collection('_teamStats').get()]);
  await ensureSeries(reads.map((r) => r.team.id));
  const stats = new Map(statsSnap.docs.map((d) => [d.id, d.data() as { exposure?: number; weight?: number }]));
  const closing = new Map<string, Valued>();

  const qOf = (id: string) => engine.getCompany(id)?.q ?? 0;
  const rows: StandingRow[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const ops: BatchOp[] = [];

  for (const read of reads) {
    const id = read.team.id;
    const v = valueTeam(read, (cid) => engine.closePrice(cid), qOf);
    closing.set(id, v);
    const series = putSeriesValue(cache.series.get(id), tick, v.totalValue);
    cache.series.set(id, series);
    cache.lastTick.set(id, tick);
    rows.push({
      teamId: id,
      name: read.team.name,
      totalValue: v.totalValue,
      cash: read.team.cashBalance,
      holdingsCount: v.holdingsCount,
      sessionOpenValue: read.team.sessionOpenValue || startingCapital,
      series: series.values,
    });
    updates.push({ id, data: { totalValue: v.totalValue, holdingsCount: v.holdingsCount } });
    for (const chunk of seriesChunks(series, tick, tick)) {
      ops.push((b) => b.set(db.doc(`teams/${id}/history/${chunk.chunk}`), chunk));
    }
  }

  const storedStart = new Map(reads.map((r) => [r.team.id, r.team.sessionStartRank]));
  const { entries } = rankWithSessionStart(rows, startingCapital, (id) => storedStart.get(id), () => false);
  const rankOf = new Map(entries.map((e) => [e.teamId, e.rank]));
  for (const u of updates) u.data.rank = rankOf.get(u.id) ?? 0;

  const finalEntries: FinalEntry[] = entries.map((e) => {
    const s = stats.get(e.teamId);
    const close = closing.get(e.teamId);
    let researchWeight = Number(s?.weight) || 0;
    let exposure = Number(s?.exposure) || 0;
    if (researchWeight <= 0 && close && close.invested > 0) {
      researchWeight = close.invested;
      exposure = close.exposure;
    }
    const researchScore = researchWeight > 0 ? exposure / researchWeight : 0;
    return {
      ...e,
      researchScore,
      researchGrade: researchGrade(researchScore),
      researchWeight,
      heldAnyShares: researchWeight > 0 || (close?.holdingsCount ?? 0) > 0,
    };
  });

  const now = Date.now();
  ops.push((b) =>
    b.set(db.doc('leaderboard/current'), {
      updatedAt: now,
      tick,
      entries,
      final: { endedAt: engine.state.endedAt ?? now, entries: finalEntries },
    }),
  );
  await commitInBatches(db, ops);
  await commitTeamUpdates(updates);
}
