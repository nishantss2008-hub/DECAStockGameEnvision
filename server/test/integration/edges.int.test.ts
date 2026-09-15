/**
 * Adversarial edge cases on the Firestore + Auth emulators:
 *
 *   A. a restart right after a fill (before the next tick), and a crash part-way through a long catch-up commit
 *   B. a new game while crew orders and a crew removal are still in flight (the busy guard)
 *   C. removing a crew while its orders and a standings recompute are in flight
 *   D. concurrent duplicate clientOrderIds
 *   E. prevRank across session boundaries, a restart, a removal and a new game
 *   F. researchWeight / heldAnyShares for crews that sold everything, round-tripped, never traded or bought late
 *   G. the closing mark is the last history point exactly once (chunk edges, retries, restarts, a failed tick)
 *
 * Host actions go through the real routes (in-process Fastify, real auth middleware with Auth emulator tokens)
 * wherever the route is what keeps them safe. Run with `npm run test:integration` from the repo root.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  HOUR_MS,
  intervalShareCap,
  type Company,
  type GameState,
  type HistoryChunk,
  type Holding,
  type Leaderboard,
  type NewsEvent,
  type OrderRecord,
  type OrderSide,
  type Team,
  type Trade,
  type ValueChunk,
} from '@deca/shared';
import type { Query } from 'firebase-admin/firestore';
import { db, emulatorMode } from '../../src/firebase';
import { GameEngine, engine as singleton } from '../../src/engine/loop';
import { hostEvent } from '../../src/engine/news';
import { adminRoutes } from '../../src/routes/admin';
import { orderRoutes } from '../../src/routes/orders';
import { createCrew } from '../../src/services/crews';
import { resetLeaderboardCache } from '../../src/services/leaderboard';
import { createMarket } from '../../src/services/market';
import { executeOrder, TradeError } from '../../src/services/trading';
import { clearEmulator, crashCommitWriting, data, pathsUnder, sleep, tokenFor } from './helpers';

const CAPITAL = 2_000_000_000; // Ð20M: every order below is affordable unless a test says otherwise

type CompanyState = { v: number; m: number; f: number; h: number };
type EngineDoc = { lastTick: number; hM: number; companies: Record<string, CompanyState> };
type Standing = [rank: number, prevRank: number];

async function freshMarket(seed: string, gameLengthMs: number = HOUR_MS): Promise<void> {
  await clearEmulator();
  resetLeaderboardCache();
  await createMarket({
    seed,
    keepCrews: false,
    adminPassword: 'pw',
    settings: { gameLengthMs, startingCapital: CAPITAL, maxPositionPct: 1 },
  });
}

/** Wall-clock time a little after tick `t` of the running game. */
function at(e: GameEngine, t: number): number {
  return e.state.startAt! + t * e.state.tickIntervalMs + 10;
}

function order(companyId: string, side: OrderSide, quantity: number, clientOrderId: string) {
  return { companyId, side, quantity, clientOrderId };
}

async function count(q: Query): Promise<number> {
  return (await q.get()).size;
}

async function standings(): Promise<Record<string, Standing>> {
  const lb = (await data<Leaderboard>('leaderboard/current'))!;
  return Object.fromEntries(lb.entries.map((e) => [e.teamId, [e.rank, e.prevRank] as Standing]));
}

/** Every trace a crew can leave: its docs and subcollections, stats, trades, orders and standings rows. */
async function tracesOf(teamId: string): Promise<string[]> {
  const out = [...(await pathsUnder(`teams/${teamId}`))];
  if ((await db.doc(`_auth/${teamId}`).get()).exists) out.push(`_auth/${teamId}`);
  if ((await db.doc(`_teamStats/${teamId}`).get()).exists) out.push(`_teamStats/${teamId}`);
  for (const col of ['trades', 'orders']) {
    for (const d of (await db.collection(col).where('teamId', '==', teamId).get()).docs) out.push(d.ref.path);
  }
  const lb = await data<Leaderboard>('leaderboard/current');
  if (lb?.entries.some((e) => e.teamId === teamId)) out.push('leaderboard/current.entries');
  if (lb?.final?.entries.some((e) => e.teamId === teamId)) out.push('leaderboard/current.final');
  return out;
}

/** Holds the next standings read of every crew's holdings until `open()` (a recompute that has read the crews). */
function holdStandingsRead(): { reached: Promise<void>; open: () => void; restore: () => void } {
  const original = db.collectionGroup.bind(db);
  let open!: () => void;
  let reach!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const reached = new Promise<void>((r) => (reach = r));
  let armed = true;
  (db as unknown as { collectionGroup: (id: string) => unknown }).collectionGroup = (id: string) => {
    const q = original(id);
    if (id !== 'holdings' || !armed) return q;
    armed = false;
    return {
      get: async () => {
        reach();
        await gate;
        return q.get();
      },
    };
  };
  return { reached, open, restore: () => void delete (db as unknown as { collectionGroup?: unknown }).collectionGroup };
}

let app: FastifyInstance;
let ADMIN: Record<string, string>;

beforeAll(async () => {
  expect(emulatorMode).toBe(true);
  expect(process.env.GCLOUD_PROJECT).toMatch(/^demo-/);
  await singleton.stop();
  app = Fastify();
  await app.register(orderRoutes);
  await app.register(adminRoutes);
  await app.ready();
  ADMIN = { authorization: `Bearer ${await tokenFor('admin')}` };
});

afterAll(async () => {
  await app.close();
  await singleton.stop();
  await db.terminate();
});

// ─── A. Restarts ──────────────────────────────────────────────────────────────

describe('A. a restart right after a fill, and a crash part-way through a catch-up commit', () => {
  const CREW = 'edge-crew';

  interface RestartRun {
    ticks: { x: number; y: number };
    quotesBefore: { a: unknown; b: unknown };
    quotesAfter: { a: unknown; b: unknown };
    netAfter: Record<string, number>;
    fills: Array<Omit<Trade, 'id' | 'executedAt'>>;
    chunks: Record<string, HistoryChunk>;
    engineDoc: EngineDoc;
    team: Pick<Team, 'cashBalance' | 'totalValue' | 'tradeCount' | 'feesPaid' | 'realizedPnl'>;
  }

  async function fillThenMaybeRestart(restart: boolean): Promise<RestartRun> {
    await freshMarket('edge-restart-7c1e');
    await createCrew('Edge Crew', 'pass', CAPITAL);
    let eng = new GameEngine();
    await eng.load();
    await eng.startGame();
    const [a, b] = eng.companies();
    await eng.tickOnce(at(eng, 2));
    // Priced straight after tick 2 drained (often in the same millisecond): tick 3 drains it.
    const x = await executeOrder(eng, CREW, order(a!.id, 'buy', 20_000, 'edge-x-0001'));
    await eng.tickOnce(at(eng, 3));
    // Priced at tick 3 and still pending when the process stops.
    const y = await executeOrder(eng, CREW, order(b!.id, 'buy', 30_000, 'edge-y-0001'));
    const quotesBefore = { a: eng.quote(a!.id, 'buy', 1_000, CREW), b: eng.quote(b!.id, 'sell', 1_000, CREW) };

    if (restart) {
      await eng.stop();
      resetLeaderboardCache();
      eng = new GameEngine();
      await eng.load();
    }
    const quotesAfter = { a: eng.quote(a!.id, 'buy', 1_000, CREW), b: eng.quote(b!.id, 'sell', 1_000, CREW) };
    const netAfter = Object.fromEntries(eng.adminMarket().map((r) => [r.companyId, r.netFlow]));

    await eng.tickOnce(at(eng, 8)); // a five-tick catch-up: the pending buy drains on its first tick only
    await executeOrder(eng, CREW, order(a!.id, 'sell', 20_000, 'edge-z-0001'));
    await eng.tickOnce(at(eng, 9));
    await eng.stop();

    const fills = (await db.collection('trades').get()).docs
      .map((d) => d.data() as Trade)
      .sort((p, q) => (p.clientOrderId < q.clientOrderId ? -1 : 1))
      .map(({ id: _id, executedAt: _at, ...rest }) => rest);
    const team = (await data<Team>(`teams/${CREW}`))!;
    return {
      ticks: { x: x.tick, y: y.tick },
      quotesBefore,
      quotesAfter,
      netAfter,
      fills,
      chunks: {
        [a!.id]: (await data<HistoryChunk>(`companies/${a!.id}/history/0`))!,
        [b!.id]: (await data<HistoryChunk>(`companies/${b!.id}/history/0`))!,
      },
      engineDoc: (await data<EngineDoc>('_engine/state'))!,
      team: {
        cashBalance: team.cashBalance,
        totalValue: team.totalValue,
        tradeCount: team.tradeCount,
        feesPaid: team.feesPaid,
        realizedPnl: team.realizedPnl,
      },
    };
  }

  it('a restart straight after a fill prices it in once, then catches up exactly like the uninterrupted run', async () => {
    const control = await fillThenMaybeRestart(false);
    const restarted = await fillThenMaybeRestart(true);

    expect(control.ticks).toEqual({ x: 2, y: 3 });
    expect(restarted.ticks).toEqual({ x: 2, y: 3 });
    // The drained buy is not pending again; the pending buy is (price and interval use).
    expect(restarted.quotesAfter).toEqual(restarted.quotesBefore);
    expect(restarted.quotesAfter).toEqual(control.quotesAfter);
    expect(Object.values(restarted.netAfter).filter((n) => n !== 0)).toEqual([30_000]);
    expect(restarted.fills).toEqual(control.fills);
    expect(restarted.chunks).toEqual(control.chunks);
    expect(restarted.engineDoc).toEqual(control.engineDoc);
    expect(restarted.team).toEqual(control.team);
    expect(control.fills).toHaveLength(3);
  });

  it('a crash part-way through a long catch-up commit leaves companies, summary, engine and game state together at the last committed tick; the restart catches up with no duplicate news and no double-counted volume', async () => {
    await freshMarket('edge-crash-2d5a');
    await createCrew('Edge Crew', 'pass', CAPITAL);
    const first = new GameEngine();
    await first.load();
    await first.startGame();
    const { startAt } = first.state as { startAt: number };
    const cos = first.companies();
    const a = cos[0]!;
    await executeOrder(first, CREW, order(a.id, 'buy', 5_000, 'edge-crash-0001'));
    // 460 host news queued before the catch-up: more than one batch of news docs, so the commit must split.
    const pending = Array.from({ length: 460 }, (_, i) =>
      hostEvent(1, cos, {
        companyIds: [cos[i % cos.length]!.id],
        type: 'earnings',
        magnitude: i % 2 ? 0.001 : -0.001,
        headline: `Edge host ${i}`,
        body: '',
      }),
    );
    await db.doc('_schedule/_news').set({ pending }, { merge: true });
    await first.stop();

    const crashing = new GameEngine();
    await crashing.load();
    expect(crashing.scheduledNews().filter((e) => e.source === 'host')).toHaveLength(460);
    const restore = crashCommitWriting('game/state');
    try {
      await expect(crashing.tickOnce(startAt + 10 * crashing.state.tickIntervalMs + 10)).rejects.toThrow(/injected crash/);
    } finally {
      restore();
    }
    await crashing.stop();

    // What reached Firestore: an earlier batch landed, but nothing that describes "now" moved past tick 0.
    expect(await count(db.collection('news').where('source', '==', 'host'))).toBeGreaterThan(0);
    expect((await data<GameState>('game/state'))!.currentTick).toBe(0);
    expect((await data<EngineDoc>('_engine/state'))!.lastTick).toBe(0);
    expect((await data<{ lastTick: number }>('market/summary'))!.lastTick).toBe(0);
    for (const c of cos) {
      const doc = (await data<Company>(`companies/${c.id}`))!;
      expect({ id: c.id, lastTick: doc.lastTick, price: doc.currentPrice, volume: doc.sessionVolume }).toEqual({
        id: c.id,
        lastTick: 0,
        price: c.startPriceCents,
        volume: 0,
      });
    }

    // Restart, then catch up a little later than the crashed attempt.
    resetLeaderboardCache();
    const restarted = new GameEngine();
    await restarted.load();
    expect(restarted.state.currentTick).toBe(0);
    expect(restarted.getPrice(a.id)).toBe(a.startPriceCents);
    expect(restarted.adminMarket()[0]!.netFlow).toBe(5_000);
    await restarted.tickOnce(startAt + 13 * restarted.state.tickIntervalMs + 10);
    await restarted.stop();

    const host = (await db.collection('news').where('source', '==', 'host').get()).docs.map((d) => d.data() as NewsEvent);
    const schedule = (await data<{ events: Array<{ source: string; tick: number }>; pending: unknown[] }>('_schedule/_news'))!;
    const hostTicks = [...new Set(schedule.events.filter((e) => e.source === 'host').map((e) => e.tick))];
    expect(schedule.pending).toEqual([]);
    expect(hostTicks).toHaveLength(1);
    expect(host).toHaveLength(460); // each host headline published once
    expect(host.every((n) => n.tick === hostTicks[0])).toBe(true);

    const chunk = (await data<HistoryChunk>(`companies/${a.id}/history/0`))!;
    expect(chunk.prices).toHaveLength(14);
    expect(chunk.volumes.reduce((s, v) => s + v, 0)).toBe(5_000);
    expect(chunk.volumes[1]).toBe(5_000);
    expect((await data<Company>(`companies/${a.id}`))!.sessionVolume).toBe(5_000);
    expect((await data<EngineDoc>('_engine/state'))!.lastTick).toBe(13);
    expect((await data<GameState>('game/state'))!.currentTick).toBe(13);
    for (const c of cos) {
      const doc = (await data<Company>(`companies/${c.id}`))!;
      const h = (await data<HistoryChunk>(`companies/${c.id}/history/0`))!;
      expect([c.id, doc.lastTick, doc.currentPrice]).toEqual([c.id, 13, h.prices[13]]);
    }
  });
});

// ─── B. New game while things are in flight ───────────────────────────────────

describe('B. a new game while crew orders and a crew removal are in flight', () => {
  it('orders in flight settle before the market is cleared: nothing from the old game reaches the new one', async () => {
    await freshMarket('edge-newgame-91b0');
    await createCrew('Busy Crew', 'pass', CAPITAL);
    await singleton.load();
    await singleton.startGame();
    const crew = { authorization: `Bearer ${await tokenFor('busy-crew')}` };
    const cos = singleton.companies();
    const post = (i: number) =>
      app.inject({
        method: 'POST',
        url: '/orders',
        headers: crew,
        payload: order(cos[i % 5]!.id, 'buy', 10, `busy-order-${String(i).padStart(4, '0')}`),
      });

    const early = Array.from({ length: 8 }, (_, i) => post(i));
    const rebuild = app.inject({ method: 'POST', url: '/admin/game/new', headers: ADMIN, payload: { keepCrews: true } });
    await sleep(50);
    const late = Array.from({ length: 8 }, (_, i) => post(100 + i));
    const [built, ...orders] = await Promise.all([rebuild, ...early, ...late]);
    await singleton.stop();

    expect(built.statusCode, built.body).toBe(200);
    for (const r of orders) {
      expect([200, 400], r.body).toContain(r.statusCode);
      if (r.statusCode === 400) expect(r.json()).toMatchObject({ error: 'market_closed' });
    }
    expect(singleton.state.phase).toBe('lobby');
    expect(await count(db.collection('trades'))).toBe(0);
    expect(await count(db.collection('orders'))).toBe(0);
    expect(await count(db.collection('_teamStats'))).toBe(0);
    expect((await db.doc('leaderboard/current').get()).exists).toBe(false);
    expect(await pathsUnder('teams/busy-crew')).toEqual(['teams/busy-crew']);
    expect(await data<Team>('teams/busy-crew')).toMatchObject({ cashBalance: CAPITAL, totalValue: CAPITAL, tradeCount: 0, holdingsCount: 0, feesPaid: 0, realizedPnl: 0 });
    expect(singleton.adminMarket().every((r) => r.netFlow === 0)).toBe(true);
  });

  it('a crew removal already running when the new game starts finishes first: no standings, history or stats leak into the new game', async () => {
    await freshMarket('edge-newgame-rm-4a7d');
    await createCrew('Keep Crew', 'pass', CAPITAL);
    await createCrew('Gone Crew', 'pass', CAPITAL);
    await singleton.load();
    await singleton.startGame();
    const co = singleton.companies()[0]!.id;
    await executeOrder(singleton, 'gone-crew', order(co, 'buy', 100, 'gone-order-0001'));
    await executeOrder(singleton, 'keep-crew', order(co, 'buy', 100, 'keep-order-0001'));
    await singleton.tickOnce(at(singleton, 1));
    expect((await data<Leaderboard>('leaderboard/current'))!.entries).toHaveLength(2);

    const removal = app.inject({ method: 'DELETE', url: '/admin/teams/gone-crew', headers: ADMIN });
    for (let i = 0; i < 500 && (await db.doc('_auth/gone-crew').get()).exists; i++) await sleep(2); // the removal has begun
    const rebuild = app.inject({ method: 'POST', url: '/admin/game/new', headers: ADMIN, payload: { keepCrews: true } });
    const [removed, built] = await Promise.all([removal, rebuild]);
    await singleton.stop();
    await sleep(300); // anything still writing lands now

    expect(removed.statusCode, removed.body).toBe(200);
    expect(built.statusCode, built.body).toBe(200);
    expect(singleton.state.phase).toBe('lobby');
    expect((await db.doc('leaderboard/current').get()).exists).toBe(false);
    expect(await count(db.collection('_teamStats'))).toBe(0);
    expect(await tracesOf('gone-crew')).toEqual([]);
    expect(await pathsUnder('teams/keep-crew')).toEqual(['teams/keep-crew']);
    expect(await data<Team>('teams/keep-crew')).toMatchObject({ cashBalance: CAPITAL, rank: 0, tradeCount: 0, sessionStartRank: 0 });
  });
});

// ─── C. Removal with orders in flight ─────────────────────────────────────────

describe('C. removing a crew while its orders and a standings recompute are in flight', () => {
  it('in-flight and later orders leave no trade, order, holding, history or stats behind, and release their flow', async () => {
    await freshMarket('edge-remove-6b2c');
    await createCrew('Keep Crew', 'pass', CAPITAL);
    await createCrew('Gone Crew', 'pass', CAPITAL);
    await singleton.load();
    await singleton.startGame();
    const cos = singleton.companies();
    await executeOrder(singleton, 'gone-crew', order(cos[0]!.id, 'buy', 1_000, 'gone-order-0001'));
    await singleton.tickOnce(at(singleton, 1));
    expect(await tracesOf('gone-crew')).not.toEqual([]);

    const inFlight = [
      ...Array.from({ length: 6 }, (_, i) => executeOrder(singleton, 'gone-crew', order(cos[i % 4]!.id, 'buy', 50 + i, `gone-flight-${i}000`))),
      executeOrder(singleton, 'gone-crew', order(cos[0]!.id, 'sell', 1_000, 'gone-flight-sell')),
      executeOrder(singleton, 'gone-crew', { ...order(cos[1]!.id, 'buy', 10, 'gone-flight-moved'), quotedPrice: 1 }),
    ].map((p) => p.then((trade) => ({ code: 'filled', trade }), (e: unknown) => ({ code: (e as TradeError).code ?? String(e), trade: null })));
    const removal = app.inject({ method: 'DELETE', url: '/admin/teams/gone-crew', headers: ADMIN });
    const tick = singleton.tickOnce(at(singleton, 2)); // drains before any in-flight order is priced
    const [removed, , ...outcomes] = await Promise.all([removal, tick, ...inFlight]);
    expect(removed.statusCode, removed.body).toBe(200);
    for (const o of outcomes) expect(['filled', 'no_team', 'price_moved']).toContain(o.code);
    // Fills that landed before the crew's account was deleted were real trades priced after tick 2's drain: their
    // flow stays pending for tick 3. Everything else released its reservation.
    const pendingFromFills = new Map<string, number>();
    for (const { trade } of outcomes) {
      if (!trade) continue;
      expect(trade.tick).toBe(2);
      pendingFromFills.set(trade.companyId, (pendingFromFills.get(trade.companyId) ?? 0) + (trade.side === 'buy' ? trade.quantity : -trade.quantity));
    }

    // After the removal, orders that fail validation (not only in the transaction) write nothing either.
    const later = [
      executeOrder(singleton, 'gone-crew', order(cos[2]!.id, 'buy', 1.5, 'gone-later-badqty')),
      executeOrder(singleton, 'gone-crew', { ...order(cos[2]!.id, 'buy', 10, 'gone-later-moved'), quotedPrice: 1 }),
      executeOrder(singleton, 'gone-crew', order(cos[2]!.id, 'buy', intervalShareCap(cos[2]!.sharesOutstanding) + 1, 'gone-later-cap')),
      executeOrder(singleton, 'gone-crew', order('no-such-company', 'buy', 10, 'gone-later-unknown')),
    ];
    for (const p of later) await expect(p).rejects.toBeInstanceOf(TradeError);
    await singleton.pauseGame();
    await expect(executeOrder(singleton, 'gone-crew', order(cos[2]!.id, 'buy', 10, 'gone-later-paused'))).rejects.toMatchObject({ code: 'market_closed' });
    await singleton.resumeGame();

    await sleep(200);
    expect(await tracesOf('gone-crew')).toEqual([]);
    expect(singleton.adminMarket().map((r) => r.netFlow)).toEqual(cos.map((c) => pendingFromFills.get(c.id) ?? 0));
    expect(Object.keys(await standings())).toEqual(['keep-crew']);
    await singleton.stop();
  });

  it('a standings recompute that read the crews before the removal cannot write the removed crew back', async () => {
    await freshMarket('edge-remove-race-3f8e');
    await createCrew('Keep Crew', 'pass', CAPITAL);
    await createCrew('Gone Crew', 'pass', CAPITAL);
    await singleton.load();
    await singleton.startGame();
    const co = singleton.companies()[0]!.id;
    await executeOrder(singleton, 'gone-crew', order(co, 'buy', 1_000, 'gone-order-0001'));
    await singleton.tickOnce(at(singleton, 1));

    const hold = holdStandingsRead();
    let removed: Awaited<ReturnType<FastifyInstance['inject']>> | undefined;
    try {
      const tick = singleton.tickOnce(at(singleton, 2));
      await hold.reached; // tick 2 is committed and its recompute has read both crews
      const removal = app.inject({ method: 'DELETE', url: '/admin/teams/gone-crew', headers: ADMIN });
      await sleep(1_500); // time for every removal step to finish if nothing makes it wait for the recompute
      hold.open();
      [removed] = await Promise.all([removal, tick]);
    } finally {
      hold.open();
      hold.restore();
    }
    await singleton.stop();
    expect(removed!.statusCode, removed!.body).toBe(200);
    expect(await tracesOf('gone-crew')).toEqual([]);
    expect(await standings()).toEqual({ 'keep-crew': [1, 1] });
    const keep = (await data<ValueChunk>('teams/keep-crew/history/0'))!;
    expect(keep.values).toHaveLength(3); // the keeper's history is intact: ticks 0, 1 and 2
  });
});

// ─── D. Duplicate clientOrderIds ──────────────────────────────────────────────

describe('D. concurrent duplicate clientOrderIds', () => {
  it('fill once, answer every duplicate with the same trade, and never reserve phantom flow that would move other fills', async () => {
    await freshMarket('edge-dup-5e3f');
    await createCrew('Dup Crew', 'pass', CAPITAL);
    const eng = new GameEngine();
    await eng.load();
    await eng.startGame();
    const a = eng.companies()[3]!;
    const q = 2_000;

    let maxNet = 0;
    let done = false;
    const sampler = (async () => {
      while (!done) {
        maxNet = Math.max(maxNet, eng.adminMarket().find((r) => r.companyId === a.id)!.netFlow);
        await new Promise((r) => setImmediate(r));
      }
    })();
    const dup = order(a.id, 'buy', q, 'dup-order-0001');
    const results = await Promise.all(Array.from({ length: 8 }, () => executeOrder(eng, 'dup-crew', dup)));
    done = true;
    await sampler;

    expect(new Set(results.map((t) => t.id)).size).toBe(1);
    expect(maxNet).toBe(q);
    expect(eng.adminMarket().find((r) => r.companyId === a.id)!.netFlow).toBe(q);
    expect(eng.quote(a.id, 'buy', 1, 'dup-crew').intervalRemaining).toBe(intervalShareCap(a.sharesOutstanding) - q);
    expect(await count(db.collection('trades').where('teamId', '==', 'dup-crew'))).toBe(1);
    const team = (await data<Team>('teams/dup-crew'))!;
    expect(team).toMatchObject({ tradeCount: 1, cashBalance: results[0]!.cashAfter });
    expect((await data<Holding>(`teams/dup-crew/holdings/${a.id}`))!.shares).toBe(q);
    await eng.stop();
  });

  it('duplicates of an order that is rejected all get that same rejection, not a misleading interval limit', async () => {
    await freshMarket('edge-dup-reject-8c4d');
    await createCrew('Dup Crew', 'pass', CAPITAL);
    const eng = new GameEngine();
    await eng.load();
    await eng.startGame();
    const big = [...eng.companies()].sort((x, y) => intervalShareCap(y.sharesOutstanding) * y.startPriceCents - intervalShareCap(x.sharesOutstanding) * x.startPriceCents)[0]!;
    const cap = intervalShareCap(big.sharesOutstanding);
    expect(cap * big.startPriceCents).toBeGreaterThan(1.1 * CAPITAL); // one interval's worth is unaffordable

    const dup = order(big.id, 'buy', cap, 'dup-order-0002');
    const errors = await Promise.all(Array.from({ length: 4 }, () => executeOrder(eng, 'dup-crew', dup).then(() => null, (e: unknown) => e as TradeError)));
    for (const e of errors) expect(e).toMatchObject({ code: 'insufficient_funds' });
    expect(new Set(errors.map((e) => e!.message)).size).toBe(1);
    expect(await data<OrderRecord>('orders/dup-crew_dup-order-0002')).toMatchObject({ status: 'rejected', code: 'insufficient_funds' });
    expect(eng.adminMarket().every((r) => r.netFlow === 0)).toBe(true);
    expect(eng.quote(big.id, 'buy', 1, 'dup-crew').intervalRemaining).toBe(cap);
    expect(await data<Team>('teams/dup-crew')).toMatchObject({ cashBalance: CAPITAL, tradeCount: 0 });
    await eng.stop();
  });
});

// ─── E. prevRank ──────────────────────────────────────────────────────────────

describe('E. prevRank across session boundaries, a restart, removals and a new game', () => {
  it('movement is measured from the rank at the start of the session, and removed crews do not shift anyone’s arrow', async () => {
    await freshMarket('edge-rank-0e61'); // 1 hour: sessions of 90 ticks
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) await createCrew(name, 'pass', CAPITAL);
    await singleton.load();
    await singleton.startGame();
    const cash = (id: string, cents: number) => db.doc(`teams/${id}`).update({ cashBalance: cents });
    const tick = (t: number) => singleton.tickOnce(at(singleton, t));

    await tick(1);
    expect(await standings()).toEqual({ alpha: [1, 1], bravo: [2, 2], charlie: [3, 3], delta: [4, 4] });
    await cash('charlie', 2 * CAPITAL);
    await tick(2);
    expect(await standings()).toEqual({ charlie: [1, 3], alpha: [2, 1], bravo: [3, 2], delta: [4, 4] });

    // A restart keeps the session start ranks.
    resetLeaderboardCache();
    await singleton.reload();
    await singleton.stop();
    await tick(3);
    expect(await standings()).toEqual({ charlie: [1, 3], alpha: [2, 1], bravo: [3, 2], delta: [4, 4] });

    // A catch-up onto the session boundary restarts movement there.
    await tick(90);
    expect(await standings()).toEqual({ charlie: [1, 1], alpha: [2, 2], bravo: [3, 3], delta: [4, 4] });
    await cash('bravo', 3 * CAPITAL);
    await tick(91);
    expect(await standings()).toEqual({ bravo: [1, 3], charlie: [2, 1], alpha: [3, 2], delta: [4, 4] });

    // Removing Alpha (2nd at the session start) moves nobody's arrow: the crews below it started one place higher.
    const rm = await app.inject({ method: 'DELETE', url: '/admin/teams/alpha', headers: ADMIN });
    expect(rm.statusCode, rm.body).toBe(200);
    expect(await standings()).toEqual({ bravo: [1, 2], charlie: [2, 1], delta: [3, 3] });
    const startRanks: Record<string, number | undefined> = {};
    for (const id of ['bravo', 'charlie', 'delta']) startRanks[id] = (await data<Team>(`teams/${id}`))!.sessionStartRank;
    expect(startRanks).toEqual({ bravo: 2, charlie: 1, delta: 3 });
    await tick(92);
    expect(await standings()).toEqual({ bravo: [1, 2], charlie: [2, 1], delta: [3, 3] });

    await singleton.endGame();
    const final = () => data<Leaderboard>('leaderboard/current').then((lb) => lb!.final!.entries.map((e) => [e.teamId, e.rank, e.prevRank]));
    expect(await final()).toEqual([['bravo', 1, 2], ['charlie', 2, 1], ['delta', 3, 3]]);

    // After the end, removing Charlie renumbers the final standings, their arrows and the crews' own ranks.
    const rm2 = await app.inject({ method: 'DELETE', url: '/admin/teams/charlie', headers: ADMIN });
    expect(rm2.statusCode, rm2.body).toBe(200);
    expect(await final()).toEqual([['bravo', 1, 1], ['delta', 2, 2]]);
    expect(await standings()).toEqual({ bravo: [1, 1], delta: [2, 2] });
    expect([(await data<Team>('teams/bravo'))!.rank, (await data<Team>('teams/delta'))!.rank]).toEqual([1, 2]);

    // A new game keeping crews starts movement from scratch.
    const built = await app.inject({ method: 'POST', url: '/admin/game/new', headers: ADMIN, payload: { keepCrews: true } });
    expect(built.statusCode, built.body).toBe(200);
    await singleton.stop();
    for (const id of ['bravo', 'delta']) expect(await data<Team>(`teams/${id}`)).toMatchObject({ rank: 0, sessionStartRank: 0, cashBalance: CAPITAL });
    await singleton.startGame();
    await tick(1);
    expect(await standings()).toEqual({ bravo: [1, 1], delta: [2, 2] });
    await cash('delta', 2 * CAPITAL);
    await tick(2);
    expect(await standings()).toEqual({ delta: [1, 2], bravo: [2, 1] });
    await singleton.stop();
  });
});

// ─── F. Research grade inputs ─────────────────────────────────────────────────

describe('F. researchWeight and heldAnyShares', () => {
  it('a crew that sold everything before the end keeps the weight it held; a same-interval round trip and an idle crew have none; a late buyer is graded on its closing holdings', async () => {
    await freshMarket('edge-grade-1d9b');
    for (const name of ['Seller', 'Flipper', 'Idle', 'Late']) await createCrew(name, 'pass', CAPITAL);
    const eng = new GameEngine();
    await eng.load();
    await eng.startGame();
    const c = eng.companies()[2]!;
    const q = (await data<{ q: number }>(`_schedule/${c.id}`))!.q;
    const tick = (t: number) => eng.tickOnce(at(eng, t));

    await executeOrder(eng, 'seller', order(c.id, 'buy', 1_000, 'seller-buy-0001'));
    for (const t of [1, 2, 3]) await tick(t);
    await executeOrder(eng, 'seller', order(c.id, 'sell', 1_000, 'seller-sell-0001'));
    await tick(4);
    await executeOrder(eng, 'flipper', order(c.id, 'buy', 500, 'flipper-buy-0001'));
    await executeOrder(eng, 'flipper', order(c.id, 'sell', 500, 'flipper-sell-0001'));
    await tick(5);
    await executeOrder(eng, 'late', order(c.id, 'buy', 700, 'late-buy-00001'));
    await eng.endGame();
    await eng.stop();

    const prices = (await data<HistoryChunk>(`companies/${c.id}/history/0`))!.prices;
    const heldWeight = [1, 2, 3].reduce((s, t) => s + Math.round(1_000 * prices[t]!), 0);
    const final = Object.fromEntries((await data<Leaderboard>('leaderboard/current'))!.final!.entries.map((e) => [e.teamId, e]));
    const stats = async (id: string) => (await data<{ weight: number; exposure: number }>(`_teamStats/${id}`))!;

    expect((await stats('seller')).weight).toBe(heldWeight);
    expect(final.seller).toMatchObject({ researchWeight: heldWeight, heldAnyShares: true, holdings: 0 });
    expect(final.seller!.researchScore).toBeCloseTo(q, 9);

    expect((await stats('flipper')).weight).toBe(0);
    expect(final.flipper).toMatchObject({ researchWeight: 0, heldAnyShares: false, researchScore: 0 });
    expect(final.idle).toMatchObject({ researchWeight: 0, heldAnyShares: false, researchScore: 0 });

    const close = (await data<Company>(`companies/${c.id}`))!.currentPrice;
    expect(final.late).toMatchObject({ researchWeight: Math.round(700 * close), heldAnyShares: true, holdings: 1 });
    expect(final.late!.researchScore).toBeCloseTo(q, 9);
  });
});

// ─── G. The closing mark ──────────────────────────────────────────────────────

describe('G. the closing mark is the last history point exactly once', () => {
  async function endAt(seed: string, endTick: number, opts: { failTick?: number } = {}) {
    await freshMarket(seed);
    await createCrew('Mark Crew', 'pass', CAPITAL);
    const eng = new GameEngine();
    await eng.load();
    await eng.startGame();
    const co = eng.companies()[1]!;
    await executeOrder(eng, 'mark-crew', order(co.id, 'buy', 1_000, 'mark-buy-00001'));
    if (opts.failTick !== undefined) {
      await eng.tickOnce(at(eng, opts.failTick - 1));
      const restore = crashCommitWriting('game/state');
      try {
        await expect(eng.tickOnce(at(eng, opts.failTick))).rejects.toThrow(/injected crash/);
      } finally {
        restore();
      }
      expect((await data<GameState>('game/state'))!.currentTick).toBe(opts.failTick - 1);
    } else {
      await eng.tickOnce(at(eng, endTick));
    }
    expect(eng.state.currentTick).toBe(endTick);
    await eng.endGame();
    return { eng, co };
  }

  async function historyDocs(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const path of [...(await pathsUnder('companies')), ...(await pathsUnder('market')), ...(await pathsUnder('teams'))]) {
      if (/\/history\/\d+$/.test(path)) out[path] = await data(path);
    }
    return out;
  }

  async function expectClosingMarkOnce(eng: GameEngine, tick: number): Promise<void> {
    const chunkNo = Math.floor(tick / 120);
    const at = tick - chunkNo * 120;
    const summary = (await data<{ composite: { value: number } }>('market/summary'))!;
    for (const c of eng.companies()) {
      const doc = (await data<Company>(`companies/${c.id}`))!;
      const chunk = (await data<HistoryChunk>(`companies/${c.id}/history/${chunkNo}`))!;
      expect([c.id, chunk.prices.length, chunk.volumes.length]).toEqual([c.id, at + 1, at + 1]);
      expect([c.id, chunk.prices[at]]).toEqual([c.id, eng.closePrice(c.id)]);
      expect(doc.currentPrice).toBe(eng.closePrice(c.id));
      expect((await db.doc(`companies/${c.id}/history/${chunkNo + 1}`).get()).exists).toBe(false);
    }
    const composite = (await data<ValueChunk>(`market/summary/history/${chunkNo}`))!;
    expect(composite.values).toHaveLength(at + 1);
    expect(composite.values[at]).toBe(summary.composite.value);
    expect((await db.doc(`market/summary/history/${chunkNo + 1}`).get()).exists).toBe(false);
    const team = (await data<ValueChunk>(`teams/mark-crew/history/${chunkNo}`))!;
    const final = (await data<Leaderboard>('leaderboard/current'))!.final!.entries[0]!;
    expect(team.values).toHaveLength(at + 1);
    expect(team.values[at]).toBe(final.totalValue);
    expect((await db.doc(`teams/mark-crew/history/${chunkNo + 1}`).get()).exists).toBe(false);
    expect((await data<GameState>('game/state'))).toMatchObject({ phase: 'ended', currentTick: tick });
  }

  it('at the last slot of a chunk (tick 119), and again after a retried end and a restart', async () => {
    const { eng } = await endAt('edge-close-119', 119);
    await expectClosingMarkOnce(eng, 119);
    const before = await historyDocs();
    await eng.endGame(); // a retried end changes nothing
    await eng.stop();
    resetLeaderboardCache();
    const restarted = new GameEngine();
    await restarted.load();
    await restarted.tickOnce(Date.now() + 24 * HOUR_MS);
    await restarted.stop();
    expect(await historyDocs()).toEqual(before);
    await expectClosingMarkOnce(restarted, 119);
  });

  it('on a chunk boundary (tick 120): the closing mark is the only point of the new chunk', async () => {
    const { eng } = await endAt('edge-close-120', 120);
    await expectClosingMarkOnce(eng, 120);
    await eng.stop();
  });

  it('after a failed tick commit: the end replaces the uncommitted tick’s price instead of adding a point after it', async () => {
    const { eng } = await endAt('edge-close-failed', 6, { failTick: 6 });
    await expectClosingMarkOnce(eng, 6);
    await eng.stop();
  });
});
