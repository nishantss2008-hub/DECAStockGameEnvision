/**
 * Leaderboard, crew value history and the research-grade accumulators.
 *
 * `recomputeLeaderboard` runs after every committed tick: it marks every crew to
 * market with the engine's live prices and writes, in ONE `store.tx()`,
 *   - `crews` {totalValue, rank, holdingsCount} (+ sessionOpenValue when a session starts)
 *   - `crew_history` one row per tick with the crew's total value
 *   - `crew_stats` exposure += Σ value·q, weight += Σ value (holdings only, per elapsed tick)
 *   - `leaderboard` entries with prevRank and a ≤40-point spark
 *
 * prevRank is the crew's rank at the start of the current session. It is stored in the
 * leaderboard row itself — an entry's `prevRank` is that crew's session start rank — so it
 * survives a restart without a column of its own, and a movement arrow stays up for the whole
 * session instead of flickering back after one tick.
 *
 * The research grade uses the visible-fundamentals `q`, not `qEff`, so it rewards
 * reading the statements rather than the hidden surprise.
 *
 * `finalizeLeaderboard` runs once at the end: holdings are valued at the closing
 * price (impact excluded), which stops last-interval pumping of final marks.
 *
 * Cash and holdings are read at the top of the recompute, so a fill landing mid-recompute
 * can be one trade behind for one tick. These are display values; the next tick
 * self-corrects and authoritative cash/holdings are never touched here.
 */

import type { FinalEntry, Holding, Leaderboard, LeaderboardEntry, Team } from '@deca/shared';
import type { GameEngine } from '../engine/loop';
import {
  crossedSession,
  putSeriesValue,
  rankEntries,
  researchGrade,
  seriesFromValues,
  seriesRows,
  sessionStartRank,
  type StandingRow,
  type TeamSeries,
} from '../engine/loopHelpers';
import type { CrewRow, Store } from '../store';

interface LeaderboardCache {
  /** Total value per tick per crew. */
  series: Map<string, TeamSeries>;
  /** Last tick recorded per crew (session crossings and time weights). */
  lastTick: Map<string, number>;
  /** Session start rank per crew, read back from the stored leaderboard on first use. */
  startRanks: Map<string, number> | null;
}

function freshCache(): LeaderboardCache {
  return { series: new Map(), lastTick: new Map(), startRanks: null };
}

let cache = freshCache();

/** Drops every in-memory series and rank (call after a new market is created). */
export function resetLeaderboardCache(): void {
  cache = freshCache();
}

interface CrewRead {
  crew: Team;
  holdings: Holding[];
}

function readCrews(store: Store): CrewRead[] {
  const holdings = store.holdings.all();
  return store.crews.all().map((crew) => ({ crew, holdings: holdings[crew.id] ?? [] }));
}

/** Loads stored value history for crews seen for the first time since the cache was reset. */
function ensureSeries(store: Store, crewIds: string[]): void {
  for (const id of crewIds) {
    if (cache.series.has(id) || cache.lastTick.has(id)) continue;
    const s = seriesFromValues(store.crewHistory.series(id));
    if (s) {
      cache.series.set(id, s);
      cache.lastTick.set(id, s.start + s.values.length - 1);
    }
  }
}

/** The session start rank each crew carried into this recompute (the stored entry's prevRank). */
function storedStartRanks(store: Store): Map<string, number> {
  if (!cache.startRanks) {
    cache.startRanks = new Map((store.leaderboard.get()?.entries ?? []).map((e) => [e.teamId, e.prevRank]));
  }
  return cache.startRanks;
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

interface Valued {
  read: CrewRead;
  totalValue: number;
  invested: number;
  exposure: number;
  holdingsCount: number;
}

function valueCrew(read: CrewRead, priceOf: (companyId: string) => number, qOf: (companyId: string) => number): Valued {
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
  return { read, totalValue: read.crew.cashBalance + invested, invested, exposure, holdingsCount };
}

/** Marks every crew to market at `tick` and writes the standings. Returns what was stored. */
export function recomputeLeaderboard(store: Store, engine: GameEngine, tick: number): Leaderboard {
  const { startingCapital, sessionTicks } = engine.state;
  const reads = readCrews(store);
  ensureSeries(
    store,
    reads.map((r) => r.crew.id),
  );
  const sessionStarts = new Set<string>();

  const qOf = (id: string) => engine.getCompany(id)?.q ?? 0;
  const rows: StandingRow[] = [];
  const updates: { id: string; data: Partial<CrewRow> }[] = [];
  const historyRows: { crewId: string; tick: number; value: number }[] = [];
  const stats: { crewId: string; exposure: number; weight: number }[] = [];

  for (const read of reads) {
    const id = read.crew.id;
    const v = valueCrew(read, (cid) => engine.getPrice(cid), qOf);
    const prev = cache.lastTick.get(id);
    const series = putSeriesValue(cache.series.get(id), tick, v.totalValue);
    cache.series.set(id, series);
    cache.lastTick.set(id, tick);

    const newSession = crossedSession(prev, tick, sessionTicks);
    if (newSession) sessionStarts.add(id);
    const sessionOpenValue = newSession ? v.totalValue : read.crew.sessionOpenValue || startingCapital;
    rows.push({
      teamId: id,
      name: read.crew.name,
      totalValue: v.totalValue,
      cash: read.crew.cashBalance,
      holdingsCount: v.holdingsCount,
      sessionOpenValue,
      series: series.values,
    });

    const data: Partial<CrewRow> = { totalValue: v.totalValue, holdingsCount: v.holdingsCount };
    if (newSession) data.sessionOpenValue = v.totalValue;
    updates.push({ id, data });

    // Every tick the crew was not marked at (a catch-up, or its first standings) gets a row too, so the
    // history is dense and `series(crewId)` stays indexed by tick.
    for (const p of seriesRows(series, prev === undefined ? series.start : Math.min(prev + 1, tick), tick)) {
      historyRows.push({ crewId: id, tick: p.tick, value: p.value });
    }

    const elapsed = prev === undefined ? 1 : Math.max(0, tick - prev);
    if (elapsed > 0) stats.push({ crewId: id, exposure: v.exposure * elapsed, weight: v.invested * elapsed });
  }

  const stored = storedStartRanks(store);
  const { entries, startRanks } = rankWithSessionStart(
    rows,
    startingCapital,
    (id) => stored.get(id),
    (id) => sessionStarts.has(id),
  );
  const rankOf = new Map(entries.map((e) => [e.teamId, e.rank]));
  for (const u of updates) u.data.rank = rankOf.get(u.id) ?? 0;

  const leaderboard: Leaderboard = { updatedAt: Date.now(), tick, entries };
  store.tx(() => {
    if (historyRows.length > 0) store.crewHistory.append(historyRows);
    for (const s of stats) store.crewStats.add(s.crewId, s.exposure, s.weight);
    for (const u of updates) store.crews.update(u.id, u.data);
    store.leaderboard.set(leaderboard);
  });
  cache.startRanks = startRanks;
  return leaderboard;
}

/**
 * Final standings at the closing marks. Each final entry carries the research grade and what it rests on:
 * `researchWeight` (holdings value summed over the price updates it was held for) and `heldAnyShares`.
 * A crew that bought only after the last price update has no time-summed weight, so it is graded on its
 * closing holdings (counted as one update) rather than shown as holding nothing.
 */
export function finalizeLeaderboard(store: Store, engine: GameEngine): Leaderboard {
  const { startingCapital, currentTick: tick } = engine.state;
  const reads = readCrews(store);
  ensureSeries(
    store,
    reads.map((r) => r.crew.id),
  );
  const closing = new Map<string, Valued>();

  const qOf = (id: string) => engine.getCompany(id)?.q ?? 0;
  const rows: StandingRow[] = [];
  const updates: { id: string; data: Partial<CrewRow> }[] = [];
  const historyRows: { crewId: string; tick: number; value: number }[] = [];

  for (const read of reads) {
    const id = read.crew.id;
    const v = valueCrew(read, (cid) => engine.closePrice(cid), qOf);
    closing.set(id, v);
    const series = putSeriesValue(cache.series.get(id), tick, v.totalValue);
    cache.series.set(id, series);
    cache.lastTick.set(id, tick);
    rows.push({
      teamId: id,
      name: read.crew.name,
      totalValue: v.totalValue,
      cash: read.crew.cashBalance,
      holdingsCount: v.holdingsCount,
      sessionOpenValue: read.crew.sessionOpenValue || startingCapital,
      series: series.values,
    });
    updates.push({ id, data: { totalValue: v.totalValue, holdingsCount: v.holdingsCount } });
    for (const p of seriesRows(series, tick, tick)) historyRows.push({ crewId: id, tick: p.tick, value: p.value });
  }

  const stored = storedStartRanks(store);
  const { entries } = rankWithSessionStart(
    rows,
    startingCapital,
    (id) => stored.get(id),
    () => false,
  );
  const rankOf = new Map(entries.map((e) => [e.teamId, e.rank]));
  for (const u of updates) u.data.rank = rankOf.get(u.id) ?? 0;

  const finalEntries: FinalEntry[] = entries.map((e) => {
    const s = store.crewStats.get(e.teamId);
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
  const leaderboard: Leaderboard = {
    updatedAt: now,
    tick,
    entries,
    final: { endedAt: engine.state.endedAt ?? now, entries: finalEntries },
  };
  store.tx(() => {
    if (historyRows.length > 0) store.crewHistory.append(historyRows);
    for (const u of updates) store.crews.update(u.id, u.data);
    store.leaderboard.set(leaderboard);
  });
  return leaderboard;
}
