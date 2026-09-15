/**
 * Resume safety on the emulator (spec §5.5).
 *
 * The same scripted game (one seed, the same orders at the same ticks) runs three times:
 *   1. control: one engine instance, never stopped
 *   2. restart: the singleton engine is stopped mid-game with an order still pending
 *      (traded but not yet drained into the impact term), then a NEW GameEngine loads
 *      from Firestore and finishes the script
 *   3. recovery: like 2, but `_engine/state` is deleted before the reload, so fair value
 *      is replayed from tick 0 and impact is recovered from the rounded prices
 *
 * The restart must be exact: every price, fill, cash balance, history chunk, news doc,
 * standing and the persisted engine state match the control run. The recovery path
 * replays v, h and m exactly; impact comes back from rounded prices, so prices stay
 * within one cent.
 *
 * Only data that does not depend on wall-clock time is compared (no timestamps or ids).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  estFillPrice,
  intervalShareCap,
  type HistoryChunk,
  type Holding,
  type Leaderboard,
  type NewsEvent,
  type OrderSide,
  type Team,
  type Trade,
  type ValueChunk,
} from '@deca/shared';
import { db, emulatorMode } from '../../src/firebase';
import { GameEngine, engine as singleton } from '../../src/engine/loop';
import { createMarket } from '../../src/services/market';
import { createCrew } from '../../src/services/crews';
import { executeOrder } from '../../src/services/trading';
import { resetLeaderboardCache } from '../../src/services/leaderboard';

const SEED = 'resume-int-3b9d';
const CREW = 'resume-crew';
const CAPITAL = 20_000_000_000; // 200M Ð: orders big enough to move prices by whole cents stay affordable

type CompanyState = { v: number; m: number; f: number; h: number };
type EngineDoc = { lastTick: number; hM: number; companies: Record<string, CompanyState> };

type Step =
  | { kind: 'tick'; to: number }
  | { kind: 'order'; label: string; orders: Array<{ co: 'a' | 'b'; side: OrderSide; frac: number }> };

/**
 * Orders at tick 0, 2, 5 (left pending across the restart), 5 again after the restart,
 * and 9; ticks include multi-tick catch-ups (2 → 5, 6 → 9).
 */
const SCRIPT: Step[] = [
  { kind: 'order', label: 'order@0', orders: [{ co: 'a', side: 'buy', frac: 0.3 }] },
  { kind: 'tick', to: 2 },
  { kind: 'order', label: 'order@2', orders: [{ co: 'b', side: 'buy', frac: 0.3 }, { co: 'a', side: 'sell', frac: 0.05 }] },
  { kind: 'tick', to: 5 },
  { kind: 'order', label: 'order@5', orders: [{ co: 'a', side: 'buy', frac: 0.2 }, { co: 'b', side: 'sell', frac: 0.1 }] },
  { kind: 'order', label: 'order@5-after', orders: [{ co: 'a', side: 'buy', frac: 0.1 }] },
  { kind: 'tick', to: 6 },
  { kind: 'tick', to: 9 },
  { kind: 'order', label: 'order@9', orders: [{ co: 'a', side: 'sell', frac: 0.15 }] },
  { kind: 'tick', to: 12 },
];

interface Checkpoint {
  label: string;
  tick: number;
  prices: Record<string, number>;
}

interface RunResult {
  checkpoints: Checkpoint[];
  /** Quote for the first post-restart order, taken just before it was placed. */
  quoteAfterRestart: ReturnType<GameEngine['quote']>;
  fills: Array<Omit<Trade, 'id' | 'executedAt' | 'clientOrderId'>>;
  engineDoc: EngineDoc;
  chunks: Record<string, HistoryChunk>;
  composite: number[];
  news: Array<Omit<NewsEvent, 'firedAt'>>;
  team: Pick<Team, 'cashBalance' | 'totalValue' | 'realizedPnl' | 'feesPaid' | 'tradeCount' | 'holdingsCount' | 'rank'>;
  holdings: Holding[];
  teamValues: number[];
  teamStats: { exposure: number; weight: number; lastTick: number };
  standings: Array<Pick<Leaderboard['entries'][number], 'teamId' | 'totalValue' | 'returnPct' | 'cashPct' | 'spark' | 'rank'>>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function data<T>(path: string): Promise<T | undefined> {
  return (await db.doc(path).get()).data() as T | undefined;
}

async function clearEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT;
  const res = await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`could not clear the Firestore emulator: HTTP ${res.status}`);
}

async function runScript(mode: 'control' | 'restart' | 'recovery'): Promise<RunResult> {
  await clearEmulator();
  resetLeaderboardCache();
  await createMarket({
    seed: SEED,
    keepCrews: false,
    adminPassword: 'pw',
    settings: { gameLengthMs: HOUR_MS, startingCapital: CAPITAL, maxPositionPct: 1 },
  });
  await createCrew('Resume Crew', 'pass', CAPITAL);

  // The control run uses its own instance; the interrupted runs start on the process singleton.
  let eng: GameEngine = mode === 'control' ? new GameEngine() : singleton;
  await eng.load(); // load() never starts the wall-clock timer
  await eng.startGame();
  expect(eng.state).toMatchObject({ phase: 'live', startingCapital: CAPITAL, maxPositionPct: 1 });
  const { startAt, tickIntervalMs } = eng.state as { startAt: number; tickIntervalMs: number };

  // Two liquid-enough companies with the smallest one-interval notional, so the orders are affordable.
  const byCost = [...eng.companies()].sort(
    (x, y) => intervalShareCap(x.sharesOutstanding) * x.startPriceCents - intervalShareCap(y.sharesOutstanding) * y.startPriceCents,
  );
  const ids = { a: byCost[0]!.id, b: byCost[1]!.id };
  const qty = (co: 'a' | 'b', frac: number) => Math.max(1, Math.floor(frac * intervalShareCap(eng.getCompany(ids[co])!.sharesOutstanding)));

  const checkpoints: Checkpoint[] = [];
  const snapshotPrices = (label: string) =>
    checkpoints.push({ label, tick: eng.state.currentTick, prices: Object.fromEntries(eng.companies().map((c) => [c.id, eng.getPrice(c.id)])) });
  let quoteAfterRestart: RunResult['quoteAfterRestart'] | undefined;
  let n = 0;

  for (const step of SCRIPT) {
    if (step.kind === 'tick') {
      await eng.tickOnce(startAt + step.to * tickIntervalMs + 10);
      expect(eng.state.currentTick).toBe(step.to);
      snapshotPrices(`tick ${step.to}`);
      await sleep(5); // orders after a tick are priced strictly after its lastTickAt
      continue;
    }

    if (step.label === 'order@5-after' && mode !== 'control') {
      // ─── Restart: stop mid-game with the order@5 flow still pending, then load a new instance. ───
      await eng.stop();
      if (mode === 'recovery') await db.doc('_engine/state').delete();
      resetLeaderboardCache(); // a real restart has no in-memory standings either
      const pendingState = (await data<EngineDoc>('_engine/state'))?.companies[ids.a];
      eng = new GameEngine();
      await eng.load();
      expect(eng.state).toMatchObject({ phase: 'live', currentTick: 5, startAt });

      if (mode === 'restart') {
        // Sensitivity: the rebuilt pending flow must be priced in (a quote without it differs).
        const c = eng.getCompany(ids.a)!;
        const s = pendingState!;
        const q = qty('a', 0.1);
        const withoutPending = estFillPrice('buy', Math.exp(s.v + s.m + s.f), c.lambda, q, 0);
        expect(Math.abs(eng.quote(ids.a, 'buy', q, CREW).fillPrice / withoutPending - 1)).toBeGreaterThan(1e-4);
      }
    }

    if (step.label === 'order@5-after') {
      const o = step.orders[0]!;
      quoteAfterRestart = eng.quote(ids[o.co], o.side, qty(o.co, o.frac), CREW);
    }
    for (const o of step.orders) {
      await executeOrder(eng, CREW, { companyId: ids[o.co], side: o.side, quantity: qty(o.co, o.frac), clientOrderId: `resume-${n++}` });
    }
    snapshotPrices(step.label);
  }

  const engineDoc = (await data<EngineDoc>('_engine/state'))!;
  const chunks: Record<string, HistoryChunk> = {};
  for (const c of eng.companies()) chunks[c.id] = (await data<HistoryChunk>(`companies/${c.id}/history/0`))!;
  const trades = (await db.collection('trades').where('teamId', '==', CREW).get()).docs
    .map((d) => d.data() as Trade)
    .sort((x, y) => Number(x.clientOrderId.split('-')[1]) - Number(y.clientOrderId.split('-')[1]));
  const team = (await data<Team>(`teams/${CREW}`))!;
  const board = (await data<Leaderboard>('leaderboard/current'))!;
  const stats = (await data<RunResult['teamStats']>(`_teamStats/${CREW}`))!;

  const result: RunResult = {
    checkpoints,
    quoteAfterRestart: quoteAfterRestart!,
    fills: trades.map(({ id: _id, executedAt: _at, clientOrderId: _c, ...rest }) => rest),
    engineDoc,
    chunks,
    composite: (await data<ValueChunk>('market/summary/history/0'))!.values,
    news: (await db.collection('news').get()).docs
      .map((d) => {
        const { firedAt: _f, ...rest } = d.data() as NewsEvent;
        return rest;
      })
      .sort((x, y) => (x.id < y.id ? -1 : 1)),
    team: {
      cashBalance: team.cashBalance,
      totalValue: team.totalValue,
      realizedPnl: team.realizedPnl,
      feesPaid: team.feesPaid,
      tradeCount: team.tradeCount,
      holdingsCount: team.holdingsCount,
      rank: team.rank,
    },
    holdings: (await db.collection(`teams/${CREW}/holdings`).get()).docs.map((d) => d.data() as Holding).sort((x, y) => (x.companyId < y.companyId ? -1 : 1)),
    teamValues: (await data<ValueChunk>(`teams/${CREW}/history/0`))!.values,
    teamStats: { exposure: stats.exposure, weight: stats.weight, lastTick: stats.lastTick },
    standings: board.entries.map(({ teamId, totalValue, returnPct, cashPct, spark, rank }) => ({ teamId, totalValue, returnPct, cashPct, spark, rank })),
  };
  await eng.stop();
  return result;
}

describe('engine resume on the emulator', () => {
  let control: RunResult;

  beforeAll(async () => {
    expect(emulatorMode).toBe(true);
    expect(process.env.GCLOUD_PROJECT).toMatch(/^demo-/);
    await singleton.stop();
    control = await runScript('control');
  });

  afterAll(async () => {
    await singleton.stop();
    await db.terminate();
  });

  it('the control run trades and moves prices (the scenario is not trivial)', () => {
    expect(control.fills).toHaveLength(7);
    expect(control.checkpoints.at(-1)!.tick).toBe(12);
    expect(control.team.tradeCount).toBe(7);
    expect(control.chunks[control.fills[0]!.companyId]!.prices).toHaveLength(13);
    expect(control.chunks[control.fills[0]!.companyId]!.volumes.some((v) => v > 0)).toBe(true);
    expect(control.engineDoc.lastTick).toBe(12);
    // The orders are large enough that impact shows up in whole cents: f is not negligible.
    const f = Math.abs(control.engineDoc.companies[control.fills[0]!.companyId]!.f);
    expect(f).toBeGreaterThan(1e-3);
  });

  it('stop mid-game + a new GameEngine instance continues exactly like the uninterrupted run', async () => {
    const resumed = await runScript('restart');

    expect(resumed.checkpoints).toEqual(control.checkpoints);
    expect(resumed.quoteAfterRestart).toEqual(control.quoteAfterRestart); // pending flow and interval use were rebuilt
    expect(resumed.fills).toEqual(control.fills);
    expect(resumed.engineDoc).toEqual(control.engineDoc);
    expect(resumed.chunks).toEqual(control.chunks);
    expect(resumed.composite).toEqual(control.composite);
    expect(resumed.news).toEqual(control.news);
    expect(resumed.team).toEqual(control.team);
    expect(resumed.holdings).toEqual(control.holdings);
    expect(resumed.teamValues).toEqual(control.teamValues);
    expect(resumed.teamStats).toEqual(control.teamStats);
    expect(resumed.standings).toEqual(control.standings);
  });

  it('with _engine/state lost, the reload replays fair value exactly and recovers impact to within a cent', async () => {
    const recovered = await runScript('recovery');

    expect(recovered.engineDoc.lastTick).toBe(control.engineDoc.lastTick);
    expect(recovered.engineDoc.hM).toBe(control.engineDoc.hM);
    for (const [id, s] of Object.entries(control.engineDoc.companies)) {
      const r = recovered.engineDoc.companies[id]!;
      expect({ id, v: r.v, m: r.m, h: r.h }).toEqual({ id, v: s.v, m: s.m, h: s.h });
      expect(Math.abs(r.f - s.f), id).toBeLessThan(1e-3);
    }
    expect(recovered.checkpoints.map((c) => [c.label, c.tick])).toEqual(control.checkpoints.map((c) => [c.label, c.tick]));
    recovered.checkpoints.forEach((cp, i) => {
      for (const [id, price] of Object.entries(control.checkpoints[i]!.prices)) {
        expect(Math.abs(cp.prices[id]! - price), `${cp.label} ${id}`).toBeLessThanOrEqual(1);
      }
    });
    expect(recovered.fills.map((t) => [t.companyId, t.side, t.quantity, t.tick])).toEqual(control.fills.map((t) => [t.companyId, t.side, t.quantity, t.tick]));
  });
});
