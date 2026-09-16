/**
 * GameEngine IO layer (loop.ts) and leaderboard.ts against an in-memory `Store`
 * (test/helpers/memoryStore.ts). No database file, no network, no credentials.
 *
 * Prices are checked against an independent replay built from the pure model
 * primitives (marketStep/companyStep), so the loop's orchestration — flow drain,
 * news, catch-up, the one-transaction-per-tick commit, resume — is verified tick by tick.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EDGE_SPREAD,
  GAME_LENGTH_OPTIONS_MS,
  MODEL,
  deriveClock,
  impactLambda,
  intervalShareCap,
  type Company,
  type GameState,
  type Holding,
  type Leaderboard,
  type MarketSummary,
  type NewsEvent,
  type Trade,
} from '@deca/shared';
import { EngineError, GameEngine, setRealtimeHub, type RealtimeHub, type TickPayload } from '../src/engine/loop';
import { compositeValue, researchGrade, revealLabel, sampleSpark } from '../src/engine/loopHelpers';
import type { CompanySecret } from '../src/store/types';
import {
  companyStep,
  derive,
  effectiveQuality,
  initialState,
  marketStep,
  surpriseFor,
  type CompanyState,
  type ModelCompany,
} from '../src/engine/model';
import { buildSchedule, jumpsAtTick, type ScheduledEvent } from '../src/engine/news';
import { finalizeLeaderboard, resetLeaderboardCache } from '../src/services/leaderboard';
import { MemoryStore, seedMarketInto } from './helpers/memoryStore';

const SEED = 'engine-loop-test-seed';
const T0 = Date.UTC(2026, 8, 14, 12, 0, 0);
const SHORT = GAME_LENGTH_OPTIONS_MS[0]!;
const LONG = GAME_LENGTH_OPTIONS_MS.at(-1)!;

const store = new MemoryStore();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterAll(() => {
  vi.useRealTimers();
});
afterEach(() => {
  setRealtimeHub(null);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface RefCompany extends ModelCompany {
  name: string;
  ticker: string;
  sector: string;
  q: number;
  startPriceCents: number;
}

/** The hidden companies, in the id order the engine uses. */
function secretCompanies(): RefCompany[] {
  const secrets = store.secrets.all();
  return Object.entries(secrets)
    .map(([id, s]: [string, CompanySecret]) => {
      const c = store.companies.get(id)!;
      return {
        id,
        name: c.name,
        ticker: c.ticker,
        sector: c.sector as string,
        q: s.q,
        qEff: effectiveQuality(s.q, surpriseFor(SEED, id)),
        beta: s.beta,
        idioVol: s.idioVol,
        sharesOutstanding: c.sharesOutstanding,
        lambda: impactLambda(s.beta, c.sharesOutstanding),
        startPriceCents: s.startPriceCents,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

interface Reference {
  prices: Record<string, number[]>;
  hM: number;
  companies: Record<string, CompanyState>;
}

/** Independent replay from the pure model: flowAt[t][id] = net shares drained at tick t. */
function reference(
  gameLengthMs: number,
  cos: RefCompany[],
  events: ScheduledEvent[],
  toTick: number,
  flowAt: Record<number, Record<string, number>> = {},
): Reference {
  const clock = deriveClock(gameLengthMs);
  const d = derive(clock, EDGE_SPREAD.normal);
  const byTick = jumpsAtTick(events);
  const mk = { hM: 1 };
  const companies: Record<string, CompanyState> = {};
  const prices: Record<string, number[]> = {};
  for (const c of cos) {
    companies[c.id] = initialState(c.startPriceCents);
    prices[c.id] = [c.startPriceCents];
  }
  for (let t = 1; t <= toTick; t++) {
    const rM = marketStep(SEED, t, mk, d);
    const evs = byTick.get(t) ?? [];
    for (const c of cos) {
      let jump = 0;
      for (const e of evs) jump += e.jumps[c.id] ?? 0;
      prices[c.id]!.push(companyStep(SEED, t, c, companies[c.id]!, rM, jump, flowAt[t]?.[c.id] ?? 0, d));
    }
  }
  return { prices, hM: mk.hM, companies };
}

async function newMarket(gameLengthMs = SHORT): Promise<GameEngine> {
  store.reset();
  resetLeaderboardCache();
  setRealtimeHub(null);
  vi.setSystemTime(T0);
  seedMarketInto(store, SEED, { gameLengthMs });
  const e = new GameEngine(store);
  await e.load();
  return e;
}

function addCrew(id: string, cash: number, holdings: Record<string, number> = {}): void {
  store.tx(() => {
    store.crews.create({ id, name: id.toUpperCase(), passwordHash: 'x', startingCapital: cash, createdAt: Date.now() });
    // A crew that holds shares has traded.
    store.crews.update(id, { tradeCount: Object.keys(holdings).length, holdingsCount: Object.keys(holdings).length });
    for (const [companyId, shares] of Object.entries(holdings)) store.holdings.upsert(id, { companyId, shares, avgCost: 1000 });
  });
}

async function tickTo(e: GameEngine, t: number): Promise<void> {
  const now = e.state.startAt! + t * e.state.tickIntervalMs;
  vi.setSystemTime(now);
  await e.tickOnce(now);
}

/**
 * Reserves flow like executeOrder, then records the trade row: executedAt is `advanceMs` after the
 * reservation, and tick is the tick the order was priced at (what the pending-flow rebuild reads).
 */
function trade(e: GameEngine, teamId: string, companyId: string, side: 'buy' | 'sell', quantity: number, advanceMs = 1): void {
  const r = e.reserveFlow(teamId, companyId, side, quantity);
  vi.setSystemTime(Date.now() + advanceMs);
  const t: Trade = {
    id: `${teamId}-${companyId}-${Date.now()}`,
    teamId,
    companyId,
    side,
    quantity,
    price: Math.round(r.fillPrice),
    lastPrice: r.lastPrice,
    impactBps: r.impactBps,
    fee: 0,
    realizedPnl: 0,
    executedAt: Date.now(),
    tick: r.tick,
    cashAfter: 0,
    sharesAfter: quantity,
    clientOrderId: `${Date.now()}`,
  };
  store.trades.insert(t);
}

const priceSeries = (id: string, to: number): number[] => store.history.range(id, 0, to).map((p) => p.price);
const volumeSeries = (id: string, to: number): number[] => store.history.range(id, 0, to).map((p) => p.volume);
const compositeSeries = (to: number): number[] => store.market.historyRange(0, to).map((p) => p.value);
const gameRow = (): GameState => store.game.get()!;
const engineRow = () => store.engine.get()!;
const newsRows = (): NewsEvent[] => store.news.recent(10_000);
/** The stored schedule as plain ScheduledEvents (the storage columns dropped). */
const scheduleRows = (): ScheduledEvent[] => store.newsSchedule.all().map(({ rowId: _r, fired: _f, ...e }) => e);
const crewSeries = (id: string): number[] => store.crewHistory.series(id);

/** Every table a tick is allowed to touch. */
const TICK_TABLES = [
  /^price_history\//,
  /^companies\//,
  /^market_summary$/,
  /^market_history$/,
  /^news\//,
  /^news_schedule$/,
  /^meta\/news_pending$/,
  /^game_state$/,
  /^engine_state$/,
  /^leaderboard$/,
  /^crews\//,
  /^crew_history\//,
  /^crew_stats\//,
  /^audit_log$/,
];

// ─── (a) Tick writes ──────────────────────────────────────────────────────────

describe('engine loop: tick writes (spec §7/§9)', () => {
  it('startGame persists the schedule, engine state and tick-0 rows', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = secretCompanies();
    expect(cos).toHaveLength(25);
    const clock = deriveClock(SHORT);
    const state = gameRow();
    expect(state).toMatchObject({
      phase: 'live',
      currentTick: 0,
      tickIntervalMs: clock.tickIntervalMs,
      totalTicks: clock.totalTicks,
      sessionTicks: clock.sessionTicks,
    });
    expect(state.endAt! - state.startAt!).toBe(clock.totalTicks * clock.tickIntervalMs);
    // The stored schedule is exactly buildSchedule of the seed, clock and hidden companies.
    expect(scheduleRows()).toEqual(buildSchedule(SEED, clock, cos, derive(clock, EDGE_SPREAD.normal)));
    expect(store.meta.get('news_pending')).toBe('[]');
    const es = engineRow();
    expect(es.lastTick).toBe(0);
    for (const c of cos) {
      expect(es.companies[c.id]).toEqual(initialState(c.startPriceCents));
      expect(store.history.range(c.id, 0, 0)).toEqual([{ tick: 0, price: c.startPriceCents, volume: 0 }]);
    }
    const summary = store.market.get()!;
    expect(summary.composite.value).toBe(1000);
    expect(Object.values(summary.sectors).every((s) => s.value === 1000)).toBe(true);
    expect(store.market.historyRange(0, 0)).toEqual([{ tick: 0, value: 1000 }]);
  });

  it('ticks and a catch-up match the pure model, sessions, indexes, breadth and news', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = secretCompanies();
    const events = scheduleRows();
    const S = e.state.sessionTicks;
    const END = S + 35;
    const OPEN = Math.floor(END / S) * S; // the session that tick END is in
    store.commits = [];
    for (let t = 1; t <= 3; t++) await tickTo(e, t);
    await tickTo(e, END); // one call: ticks 4..END
    const ref = reference(SHORT, cos, events, END);

    for (const c of cos) {
      expect(priceSeries(c.id, END)).toEqual(ref.prices[c.id]);
      expect(volumeSeries(c.id, END)).toEqual(new Array(END + 1).fill(0));

      const p = ref.prices[c.id]!;
      const session = p.slice(OPEN, END + 1);
      const doc = store.companies.get(c.id)!;
      expect(doc).toMatchObject({
        currentPrice: p[END],
        sessionOpen: p[OPEN],
        sessionHigh: Math.max(...session),
        sessionLow: Math.min(...session),
        sessionVolume: 0,
        voyageHigh: Math.max(...p),
        voyageLow: Math.min(...p),
        marketCap: p[END]! * c.sharesOutstanding,
        lastTick: END,
        startPrice: c.startPriceCents,
      });
      expect(doc.sessionChange).toBeCloseTo(p[END]! / p[OPEN]! - 1, 12);
      expect(doc.voyageChange).toBeCloseTo(p[END]! / c.startPriceCents - 1, 12);
    }

    // Engine state is the exact model state (no flow → f = 0).
    const es = engineRow();
    expect(es.lastTick).toBe(END);
    expect(es.hM).toBe(ref.hM);
    for (const c of cos) expect(es.companies[c.id]).toEqual(ref.companies[c.id]);
    expect(gameRow().currentTick).toBe(END);

    // Composite and sector indexes: 1000·Σ(price·shares)/Σ(start·shares), session open at tick S.
    const starts = Object.fromEntries(cos.map((c) => [c.id, c.startPriceCents]));
    const shares = Object.fromEntries(cos.map((c) => [c.id, c.sharesOutstanding]));
    const at = (t: number) => Object.fromEntries(cos.map((c) => [c.id, ref.prices[c.id]![t]!]));
    const ids = cos.map((c) => c.id);
    const summary = store.market.get()!;
    expect(summary.lastTick).toBe(END);
    expect(summary.composite.value).toBe(compositeValue(at(END), starts, shares, ids));
    expect(summary.composite.sessionOpen).toBe(compositeValue(at(OPEN), starts, shares, ids));
    for (const sector of new Set(cos.map((c) => c.sector))) {
      const sIds = cos.filter((c) => c.sector === sector).map((c) => c.id);
      expect(summary.sectors[sector]!.value).toBe(compositeValue(at(END), starts, shares, sIds));
      expect(summary.sectors[sector]!.sessionOpen).toBe(compositeValue(at(OPEN), starts, shares, sIds));
    }
    const adv = cos.filter((c) => ref.prices[c.id]![END]! > ref.prices[c.id]![OPEN]!).length;
    const dec = cos.filter((c) => ref.prices[c.id]![END]! < ref.prices[c.id]![OPEN]!).length;
    expect(summary.breadth).toMatchObject({ advancers: adv, decliners: dec, unchanged: 25 - adv - dec, sessionVolume: 0 });
    expect(compositeSeries(END)).toEqual(
      Array.from({ length: END + 1 }, (_, t) => compositeValue(at(t), starts, shares, ids)),
    );

    // News: every event up to END fired once, priceAtFire = price at the end of t−1, no hidden fields.
    const fired = events.filter((ev) => ev.tick <= END);
    expect(newsRows()).toHaveLength(fired.length);
    for (const [t, evs] of jumpsAtTick(fired)) {
      evs.forEach((ev, seq) => {
        const n = newsRows().find((x) => x.id === `${ev.source}-${t}-${ev.companyIds[0]}-${seq}`)!;
        expect(n).toMatchObject({ headline: ev.headline, body: ev.body, type: ev.type, sentiment: ev.sentiment, tick: t, companyIds: ev.companyIds });
        for (const id of ev.companyIds) expect(n.priceAtFire[id]).toBe(ref.prices[id]![t - 1]);
        expect(Object.keys(n).sort()).toEqual(['body', 'companyIds', 'firedAt', 'headline', 'id', 'priceAtFire', 'sentiment', 'source', 'tick', 'type']);
      });
    }

    for (const commit of store.commits) for (const key of commit) expect(TICK_TABLES.some((re) => re.test(key)), key).toBe(true);
  });

  it('a whole game caught up in one call fires every news event once and ends', async () => {
    const e = await newMarket(LONG);
    addCrew('alpha', 100_000_000);
    await e.startGame();
    const clock = deriveClock(LONG);
    expect(e.state).toMatchObject({ totalTicks: clock.totalTicks, sessionTicks: clock.sessionTicks });
    const cos = secretCompanies();
    const events = scheduleRows();
    store.commits = [];
    await tickTo(e, clock.totalTicks);
    expect(e.state.phase).toBe('ended');
    const ref = reference(LONG, cos, events, clock.totalTicks);
    for (const c of cos) {
      // Every tick but the last is the model price; the last is the closing mark.
      expect(priceSeries(c.id, clock.totalTicks - 1)).toEqual(ref.prices[c.id]!.slice(0, clock.totalTicks));
      expect(priceSeries(c.id, clock.totalTicks).at(-1)).toBe(e.closePrice(c.id));
    }
    expect(newsRows()).toHaveLength(events.length);
    expect(store.leaderboard.get()!.final!.entries).toHaveLength(1);
  });
});

// ─── (b) Resume ───────────────────────────────────────────────────────────────

describe('engine loop: resume after a crash', () => {
  it('a fresh load continues with byte-identical prices, rebuilt pending flow and interval caps', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = secretCompanies();
    const [a, b] = [cos[3]!, cos[7]!];
    for (let t = 1; t <= 5; t++) await tickTo(e, t);
    vi.setSystemTime(Date.now() + 1_000);
    trade(e, 'alpha', a.id, 'buy', 20_000);
    trade(e, 'alpha', b.id, 'sell', 5_000);
    const quote = e.quote(a.id, 'buy', 1_000, 'alpha');
    const crashedAt = Date.now();
    const snapshot = store.dump();

    for (let t = 6; t <= 10; t++) await tickTo(e, t);
    const expectedPrices = Object.fromEntries(cos.map((c) => [c.id, priceSeries(c.id, 10)]));
    const expectedEngine = engineRow();
    const ref = reference(SHORT, cos, scheduleRows(), 10, { 6: { [a.id]: 20_000, [b.id]: -5_000 } });
    for (const c of cos) expect(expectedPrices[c.id]).toEqual(ref.prices[c.id]);
    expect(volumeSeries(a.id, 10)[6]).toBe(20_000);
    expect(volumeSeries(b.id, 10)[6]).toBe(5_000);

    // Restart from the crash snapshot.
    store.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const e2 = new GameEngine(store);
    await e2.load();
    expect(e2.state.currentTick).toBe(5);
    expect(e2.quote(a.id, 'buy', 1_000, 'alpha')).toEqual(quote);
    expect(() => e2.reserveFlow('alpha', a.id, 'buy', intervalShareCap(a.sharesOutstanding) - 20_000 + 1)).toThrow(EngineError);
    for (let t = 6; t <= 10; t++) await tickTo(e2, t);
    for (const c of cos) expect(priceSeries(c.id, 10)).toEqual(expectedPrices[c.id]);
    expect(engineRow()).toEqual(expectedEngine);
  });

  it('pending flow is rebuilt by tick, not time: trades priced in the same millisecond as a drain land on the right side of it', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = secretCompanies();
    const [a, b] = [cos[2]!, cos[4]!];
    for (let t = 1; t <= 4; t++) await tickTo(e, t);
    const drainAt = e.state.startAt! + 5 * e.state.tickIntervalMs;
    vi.setSystemTime(drainAt);
    trade(e, 'alpha', b.id, 'sell', 7_000, 0); // priced at drainAt just BEFORE tick 5 drains: part of tick 5
    await e.tickOnce(drainAt);
    expect(e.state.lastTickAt).toBe(drainAt);
    trade(e, 'alpha', a.id, 'buy', 25_000, 0); // priced at drainAt just AFTER the drain: waits for tick 6
    expect(Date.now()).toBe(drainAt);
    expect(store.trades.recent(10).map((t) => [t.companyId, t.executedAt, t.tick]).sort()).toEqual(
      [
        [b.id, drainAt, 4],
        [a.id, drainAt, 5],
      ].sort(),
    );
    expect(gameRow()).toMatchObject({ currentTick: 5, lastTickAt: drainAt });
    const quoteA = e.quote(a.id, 'buy', 1_000, 'alpha');
    const quoteB = e.quote(b.id, 'sell', 1_000, 'alpha');
    const snapshot = store.dump();

    for (let t = 6; t <= 9; t++) await tickTo(e, t);
    const expectedPrices = Object.fromEntries(cos.map((c) => [c.id, priceSeries(c.id, 9)]));
    const expectedEngine = engineRow();
    const ref = reference(SHORT, cos, scheduleRows(), 9, { 5: { [b.id]: -7_000 }, 6: { [a.id]: 25_000 } });
    for (const c of cos) expect(expectedPrices[c.id]).toEqual(ref.prices[c.id]);

    // Restart from the snapshot taken in that same millisecond.
    store.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(drainAt);
    const e2 = new GameEngine(store);
    await e2.load();
    expect(e2.state.currentTick).toBe(5);
    expect(e2.quote(a.id, 'buy', 1_000, 'alpha')).toEqual(quoteA); // the post-drain buy is pending again (and counts toward the cap)
    expect(e2.quote(b.id, 'sell', 1_000, 'alpha')).toEqual(quoteB); // the pre-drain sell is not pending twice
    for (let t = 6; t <= 9; t++) await tickTo(e2, t);
    for (const c of cos) expect(priceSeries(c.id, 9)).toEqual(expectedPrices[c.id]);
    expect(engineRow()).toEqual(expectedEngine);
  });

  it('without the engine_state row it replays fair value and recovers impact from prices', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = secretCompanies();
    for (let t = 1; t <= 5; t++) await tickTo(e, t);
    addCrew('alpha', 100_000_000);
    vi.setSystemTime(Date.now() + 1_000);
    trade(e, 'alpha', cos[0]!.id, 'buy', 30_000);
    const crashedAt = Date.now();
    const snapshot = store.dump();
    for (let t = 6; t <= 12; t++) await tickTo(e, t);
    const expectedPrices = Object.fromEntries(cos.map((c) => [c.id, priceSeries(c.id, 12)]));
    const expectedEngine = engineRow();

    store.restore(snapshot);
    store.t.engine = null;
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const e3 = new GameEngine(store);
    await e3.load();
    for (let t = 6; t <= 12; t++) await tickTo(e3, t);
    const es = engineRow();
    expect(es.hM).toBe(expectedEngine.hM);
    for (const c of cos) {
      const got = es.companies[c.id]!;
      const want = expectedEngine.companies[c.id]!;
      expect(got.v).toBe(want.v);
      expect(got.h).toBe(want.h);
      expect(Math.abs(got.f - want.f)).toBeLessThan(1e-3);
      priceSeries(c.id, 12).forEach((p, i) => expect(Math.abs(p - expectedPrices[c.id]![i]!)).toBeLessThanOrEqual(1));
    }
  });
});

describe('engine loop: resilience', () => {
  it('a failed tick commit writes nothing and is retried by the next tick with nothing lost', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = secretCompanies();
    const events = scheduleRows();
    for (let t = 1; t <= 2; t++) await tickTo(e, t);
    store.failNextCommitMatching = /^engine_state$/;
    await expect(tickTo(e, 3)).rejects.toThrow(/injected/);
    // The whole transaction rolled back: nothing from tick 3 reached any table.
    expect(gameRow().currentTick).toBe(2);
    expect(engineRow().lastTick).toBe(2);
    for (const c of cos) expect(store.history.range(c.id, 3, 3)).toEqual([]);
    expect(newsRows().filter((n) => n.tick === 3)).toEqual([]);

    await tickTo(e, 5);
    const ref = reference(SHORT, cos, events, 5);
    for (const c of cos) expect(priceSeries(c.id, 5)).toEqual(ref.prices[c.id]);
    expect(newsRows()).toHaveLength(events.filter((x) => x.tick <= 5).length);
    expect(engineRow().lastTick).toBe(5);
  });

  it('a tick is ONE transaction: the rows, the summary, the engine state and the game state commit together', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.startGame();
    store.commits = [];
    await tickTo(e, 1);
    // One tick commit, then the standings commit.
    expect(store.commits).toHaveLength(2);
    const tickCommit = store.commits[0]!;
    for (const key of ['game_state', 'engine_state', 'market_summary', 'market_history']) expect(tickCommit).toContain(key);
    expect(tickCommit.filter((k) => k.startsWith('price_history/'))).toHaveLength(25);
    expect(tickCommit.filter((k) => k.startsWith('companies/'))).toHaveLength(25);
    expect(store.commits[1]!.some((k) => k === 'leaderboard')).toBe(true);
    // A long catch-up is still one transaction, with one row per company per tick.
    store.commits = [];
    await tickTo(e, 11);
    expect(store.commits).toHaveLength(2);
    expect(store.commits[0]!.filter((k) => k === 'price_history/' + secretCompanies()[0]!.id)).toHaveLength(10);
  });

  it('a crash before the commit publishes each host news once and counts volume once on the restart', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = secretCompanies();
    const a = cos[0]!;
    trade(e, 'alpha', a.id, 'buy', 5_000);
    for (let i = 0; i < 40; i++) {
      await e.queueHostNews({ companyIds: [cos[i % cos.length]!.id], type: 'earnings', magnitude: i % 2 ? 0.001 : -0.001, headline: `Host ${i}`, body: '' });
    }

    store.failNextCommitMatching = /^game_state$/;
    await expect(tickTo(e, 10)).rejects.toThrow(/injected/);
    // Nothing of the failed tick landed: no news, no rows, no snapshot move.
    expect(newsRows().filter((n) => n.source === 'host')).toHaveLength(0);
    for (const c of cos) expect(store.companies.get(c.id)).toMatchObject({ lastTick: 0, currentPrice: c.startPriceCents, sessionVolume: 0 });
    expect(store.market.get()!.lastTick).toBe(0);

    resetLeaderboardCache();
    const e2 = new GameEngine(store);
    await e2.load();
    expect(e2.state.currentTick).toBe(0);
    expect(e2.scheduledNews().filter((x) => x.source === 'host' && !x.fired)).toHaveLength(40);
    await tickTo(e2, 13);
    const host = newsRows().filter((n) => n.source === 'host');
    expect(host).toHaveLength(40);
    expect(new Set(host.map((n) => n.tick))).toEqual(new Set([13]));
    expect(store.companies.get(a.id)!.sessionVolume).toBe(5_000);
    expect(volumeSeries(a.id, 13).reduce((x, v) => x + v, 0)).toBe(5_000);
    expect(priceSeries(a.id, 13)).toHaveLength(14);
    for (const c of cos) expect(store.companies.get(c.id)!.currentPrice).toBe(priceSeries(c.id, 13)[13]);
  });

  it('releasing a reservation after a tick drained it takes its (decayed) impact back out of the price', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = secretCompanies();
    const [a, b] = [cos[1]!, cos[9]!];
    const clean = reference(SHORT, cos, scheduleRows(), 12);
    await tickTo(e, 1);
    // Failed order straddling one tick: reserved at tick 1, drained at 2, released after.
    const failedA = e.reserveFlow('alpha', a.id, 'buy', intervalShareCap(a.sharesOutstanding));
    await tickTo(e, 2);
    expect(e.getPrice(a.id)).toBeGreaterThan(clean.prices[a.id]![2]!);
    failedA.release();
    failedA.release(); // idempotent
    // Failed order straddling a catch-up: reserved at 2, drained at 3, decayed to 6, released after.
    const failedB = e.reserveFlow('bravo', b.id, 'sell', 50_000);
    await tickTo(e, 6);
    failedB.release();
    // A reservation released before any drain never reaches the price at all.
    e.reserveFlow('alpha', a.id, 'sell', 10_000).release();
    for (let t = 7; t <= 12; t++) await tickTo(e, t);
    for (const c of cos) expect(e.getPrice(c.id), c.id).toBe(clean.prices[c.id]![12]);
    const es = engineRow();
    expect(Math.abs(es.companies[a.id]!.f)).toBeLessThan(1e-15);
    expect(Math.abs(es.companies[b.id]!.f)).toBeLessThan(1e-15);
  });

  it('host news queued before a restart still fires at the next tick after it', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = secretCompanies();
    const target = cos[5]!;
    for (let t = 1; t <= 3; t++) await tickTo(e, t);
    await e.queueHostNews({ companyIds: [target.id], type: 'scandal', magnitude: -0.2, headline: 'Host bad news', body: '' });
    const snapshot = store.dump();
    const crashedAt = Date.now();
    await tickTo(e, 4);
    const expectedPrices = Object.fromEntries(cos.map((c) => [c.id, priceSeries(c.id, 4)]));
    const expectedNews = newsRows().filter((n) => n.source === 'host');
    expect(expectedNews).toHaveLength(1);

    store.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const e2 = new GameEngine(store);
    await e2.load();
    expect(e2.scheduledNews().filter((x) => x.source === 'host' && !x.fired)).toHaveLength(1);
    await tickTo(e2, 4);
    for (const c of cos) expect(priceSeries(c.id, 4)).toEqual(expectedPrices[c.id]);
    expect(newsRows().filter((n) => n.source === 'host')).toEqual(expectedNews);
  });

  it('a restart while paused keeps the pause, and resume shifts the clock from the persisted pausedAt', async () => {
    const e = await newMarket();
    await e.startGame();
    const { startAt, endAt, tickIntervalMs } = e.state;
    await tickTo(e, 6);
    const pausedAt = startAt! + 6.2 * tickIntervalMs;
    vi.setSystemTime(pausedAt);
    await e.pauseGame();
    resetLeaderboardCache();
    const e2 = new GameEngine(store);
    vi.setSystemTime(pausedAt + 3_600_000);
    await e2.load();
    expect(e2.state).toMatchObject({ phase: 'paused', pausedAt, currentTick: 6 });
    await e2.tickOnce(Date.now());
    expect(e2.state.currentTick).toBe(6);
    await e2.resumeGame();
    expect(e2.state).toMatchObject({ phase: 'live', startAt: startAt! + 3_600_000, endAt: endAt! + 3_600_000 });
    await e2.tickOnce(Date.now());
    expect(e2.state.currentTick).toBe(6);
  });

  it('every crew starts the game with the Starting cash set in the lobby (COPY §11 startingCash.help)', async () => {
    const e = await newMarket();
    addCrew('early', e.state.startingCapital); // created before the host changed the setting
    await e.applySettings({ startingCapital: 50_000_000 });
    addCrew('late', 50_000_000);
    await e.startGame();
    for (const id of ['early', 'late']) {
      expect(store.crews.get(id)).toMatchObject({ cashBalance: 50_000_000, totalValue: 50_000_000, sessionOpenValue: 50_000_000 });
    }
    await tickTo(e, 1);
    const lb = store.leaderboard.get()!;
    for (const entry of lb.entries) {
      expect(entry.returnPct).toBe(0);
      expect(entry.spark).toEqual([50_000_000, 50_000_000]);
    }
    // Crew value history starts at tick 0 with the starting cash, like the composite starts at 1000.
    for (const id of ['early', 'late']) expect(crewSeries(id)).toEqual([50_000_000, 50_000_000]);
  });

  it("a crew's tick-0 history point is its starting cash, not a copy of tick 1", async () => {
    const e = await newMarket();
    addCrew('alpha', e.state.startingCapital);
    await e.startGame();
    expect(crewSeries('alpha')).toEqual([e.state.startingCapital]);
    const cos = secretCompanies();
    vi.setSystemTime(Date.now() + 500);
    trade(e, 'alpha', cos[0]!.id, 'buy', 10_000);
    // Simulate the fill's effect on the crew (trading.ts writes this in the order transaction).
    store.crews.update('alpha', { cashBalance: e.state.startingCapital - 1_500_000, tradeCount: 1, holdingsCount: 1 });
    store.holdings.upsert('alpha', { companyId: cos[0]!.id, shares: 10_000, avgCost: 150 });
    await tickTo(e, 1);
    const v1 = e.state.startingCapital - 1_500_000 + Math.round(10_000 * e.getPrice(cos[0]!.id));
    expect(crewSeries('alpha')).toEqual([e.state.startingCapital, v1]);
    expect(store.leaderboard.get()!.entries[0]!.spark).toEqual([e.state.startingCapital, v1]);
  });
});

// ─── (c) Pause/resume and catch-up ────────────────────────────────────────────

describe('engine loop: pause, resume and downtime catch-up', () => {
  it('pause stops the clock and resume shifts startAt/endAt by the pause length', async () => {
    const e = await newMarket();
    await e.startGame();
    const { startAt, endAt, tickIntervalMs } = e.state;
    const cos = secretCompanies();
    await tickTo(e, 4);
    const pausedAt = startAt! + 4.5 * tickIntervalMs;
    vi.setSystemTime(pausedAt);
    await e.pauseGame();
    expect(gameRow()).toMatchObject({ phase: 'paused', pausedAt });
    let err: unknown;
    try {
      e.reserveFlow('alpha', cos[0]!.id, 'buy', 1);
    } catch (x) {
      err = x;
    }
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('market_closed');
    expect((err as EngineError).message).toBe('The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.');
    await e.tickOnce(pausedAt + 100 * tickIntervalMs);
    expect(e.state.currentTick).toBe(4);

    const resumedAt = pausedAt + 600_000;
    vi.setSystemTime(resumedAt);
    await e.resumeGame();
    expect(gameRow()).toMatchObject({ phase: 'live', pausedAt: null, startAt: startAt! + 600_000, endAt: endAt! + 600_000 });
    expect(e.state).toMatchObject({ startAt: startAt! + 600_000, endAt: endAt! + 600_000 });
    expect(e.health(resumedAt).ticksBehind).toBe(0);
    await e.tickOnce(resumedAt);
    expect(e.state.currentTick).toBe(4);
    await tickTo(e, 5);
    const ref = reference(SHORT, cos, scheduleRows(), 5);
    for (const c of cos) expect(e.getPrice(c.id)).toBe(ref.prices[c.id]![5]);
  });

  it('a catch-up after downtime equals ticking one by one: flow only on the first tick', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = secretCompanies();
    const a = cos[11]!;
    await tickTo(e, 1);
    await tickTo(e, 2);
    vi.setSystemTime(Date.now() + 2_000);
    trade(e, 'alpha', a.id, 'buy', 30_000);
    const crashedAt = Date.now();
    const snapshot = store.dump();
    for (let t = 3; t <= 12; t++) await tickTo(e, t);
    const expectedPrices = Object.fromEntries(cos.map((c) => [c.id, priceSeries(c.id, 12)]));
    const expectedVolumes = volumeSeries(a.id, 12);
    const expectedEngine = engineRow();
    const expectedComposite = compositeSeries(12);

    store.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const y = new GameEngine(store);
    await y.load();
    store.commits = [];
    await tickTo(y, 12);
    for (const c of cos) expect(priceSeries(c.id, 12)).toEqual(expectedPrices[c.id]);
    expect(volumeSeries(a.id, 12)).toEqual(expectedVolumes);
    expect(engineRow()).toEqual(expectedEngine);
    expect(compositeSeries(12)).toEqual(expectedComposite);
    expect(expectedVolumes[3]).toBe(30_000);
    expect(expectedVolumes.filter((v, i) => i !== 3 && v !== 0)).toEqual([]);
    const ref = reference(SHORT, cos, scheduleRows(), 12, { 3: { [a.id]: 30_000 } });
    for (const c of cos) expect(expectedPrices[c.id]).toEqual(ref.prices[c.id]);
    // The whole catch-up is one tick transaction plus one standings transaction.
    expect(store.commits).toHaveLength(2);
    for (const commit of store.commits) for (const key of commit) expect(TICK_TABLES.some((re) => re.test(key)), key).toBe(true);
  });
});

// ─── (d) Leaderboard, closing mark and reveal ─────────────────────────────────

describe('engine loop: leaderboard, closing mark and reveal', () => {
  it('ranks, prevRank, sparks and research stats per tick; endGame marks at the close and reveals', async () => {
    const e = await newMarket();
    const cos = secretCompanies();
    const byQ = [...cos].sort((x, y) => y.q - x.q);
    const hi = byQ[0]!;
    const lo = byQ[24]!;
    addCrew('alpha', 40_000_000, { [hi.id]: 20_000 });
    addCrew('bravo', 70_000_000, { [lo.id]: 10_000 });
    addCrew('cash-only', 100_000_000);
    await e.startGame();
    const startingCapital = e.state.startingCapital;
    const holdings: Record<string, { id: string; shares: number; q: number; cash: number }> = {
      alpha: { id: hi.id, shares: 20_000, q: hi.q, cash: 40_000_000 },
      bravo: { id: lo.id, shares: 10_000, q: lo.q, cash: 70_000_000 },
      'cash-only': { id: hi.id, shares: 0, q: 0, cash: 100_000_000 },
    };
    const series: Record<string, number[]> = { alpha: [], bravo: [], 'cash-only': [] };
    const exposure: Record<string, number> = { alpha: 0, bravo: 0, 'cash-only': 0 };
    const weight: Record<string, number> = { alpha: 0, bravo: 0, 'cash-only': 0 };
    let startRanks: Record<string, number> | null = null;

    for (let t = 1; t <= 4; t++) {
      if (t === 4) {
        vi.setSystemTime(Date.now() + 1_000);
        trade(e, 'alpha', hi.id, 'buy', intervalShareCap(hi.sharesOutstanding)); // pumps the last price
      }
      await tickTo(e, t);
      const lb = store.leaderboard.get()!;
      expect(lb.tick).toBe(t);
      for (const [teamId, h] of Object.entries(holdings)) {
        const invested = Math.round(h.shares * e.getPrice(h.id));
        const value = h.cash + invested;
        series[teamId]!.push(value);
        exposure[teamId]! += invested * h.q;
        weight[teamId]! += invested;
        expect(store.crews.get(teamId)!.totalValue).toBe(value);
        const entry = lb.entries.find((x) => x.teamId === teamId)!;
        expect(entry.totalValue).toBe(value);
        expect(entry.returnPct).toBeCloseTo(value / startingCapital - 1, 12);
        expect(entry.cashPct).toBeCloseTo(h.cash / value, 12);
        // Movement is measured from the start of the session (here: the first standings, tick 1), not the last tick.
        expect(entry.prevRank).toBe(startRanks?.[teamId] ?? entry.rank);
        // Series starts at the chunk start (tick 0 takes the first value for a crew with no tick-0 row).
        expect(entry.spark).toEqual(sampleSpark([series[teamId]![0]!, ...series[teamId]!]));
        const stats = store.crewStats.get(teamId);
        expect(stats.exposure).toBeCloseTo(exposure[teamId]!, 3);
        expect(stats.weight).toBe(weight[teamId]);
      }
      const sorted = [...lb.entries].sort((x, y) => y.totalValue - x.totalValue);
      expect(lb.entries.map((x) => x.teamId)).toEqual(sorted.map((x) => x.teamId));
      expect(lb.entries.map((x) => x.rank)).toEqual([1, 2, 3]);
      startRanks ??= Object.fromEntries(lb.entries.map((x) => [x.teamId, x.rank]));
    }

    const es = engineRow();
    const lastTraded = e.getPrice(hi.id);
    const closeHi = Math.max(1, Math.round(Math.exp(es.companies[hi.id]!.v + es.companies[hi.id]!.m)));
    expect(lastTraded).toBeGreaterThan(closeHi); // impact is in the last price, not in the close

    // A crew that bought only after the last price update holds shares at the close but has no time-weighted exposure.
    const mid = byQ[12]!;
    addCrew('late', 90_000_000, { [mid.id]: 5_000 });
    const pricesBefore = priceSeries(hi.id, 4);
    const volumesBefore = volumeSeries(hi.id, 4);
    expect(pricesBefore).toHaveLength(5);
    expect(volumesBefore[4]).toBe(intervalShareCap(hi.sharesOutstanding));

    vi.setSystemTime(Date.now() + 1_500);
    await e.endGame();
    const state = gameRow();
    expect(state).toMatchObject({ phase: 'ended', endedAt: T0 + 4 * e.state.tickIntervalMs + 1_500 });
    const d = derive(deriveClock(SHORT), EDGE_SPREAD.normal);
    for (const c of cos) {
      const s = es.companies[c.id]!;
      const close = Math.max(1, Math.round(Math.exp(s.v + s.m)));
      expect(e.closePrice(c.id)).toBe(close);
      const doc = store.companies.get(c.id)!;
      const secret = store.secrets.all()[c.id]!;
      expect(doc.currentPrice).toBe(close);
      const r = doc.reveal!;
      const expectedReturn = d.spread * c.qEff + c.beta * MODEL.mktDrift;
      const actualReturn = Math.log(close / c.startPriceCents);
      expect(r).toMatchObject({ q: c.q, quality: secret.quality, grade: secret.grade, pillars: secret.pillars, surprise: surpriseFor(SEED, c.id) });
      expect(r.qEff).toBe(c.qEff);
      expect(r.fairValue).toBe(Math.max(1, Math.round(Math.exp(s.v))));
      expect(r.expectedReturn).toBeCloseTo(expectedReturn, 12);
      expect(r.actualReturn).toBeCloseTo(actualReturn, 12);
      expect(r.luck).toBeCloseTo(actualReturn - expectedReturn, 12);
      expect(r.label).toBe(revealLabel(c.q, r.luck));
    }

    // The closing mark is the last point of every price chart and of the composite, like the final crew values.
    for (const c of cos) {
      const prices = priceSeries(c.id, 4);
      expect(prices, c.id).toHaveLength(5);
      expect(prices[4], c.id).toBe(e.closePrice(c.id));
      expect(prices.slice(0, 4)).toEqual((c.id === hi.id ? pricesBefore : prices).slice(0, 4));
    }
    expect(volumeSeries(hi.id, 4)).toEqual(volumesBefore); // volumes kept
    const composite = compositeSeries(4);
    expect(composite).toHaveLength(5);
    expect(composite[4]).toBe(store.market.get()!.composite.value);

    const lb = store.leaderboard.get()!;
    expect(lb.final!.endedAt).toBe(state.endedAt);
    const late = lb.final!.entries.find((x) => x.teamId === 'late')!;
    const lateInvested = Math.round(5_000 * e.closePrice(mid.id));
    expect(late).toMatchObject({ heldAnyShares: true, researchWeight: lateInvested });
    expect(late.researchScore).toBeCloseTo(mid.q, 12); // graded on its closing holdings
    for (const [teamId, h] of Object.entries(holdings)) {
      const value = h.cash + Math.round(h.shares * e.closePrice(h.id));
      expect(store.crews.get(teamId)!.totalValue).toBe(value);
      const fin = lb.final!.entries.find((x) => x.teamId === teamId)!;
      expect(fin.totalValue).toBe(value);
      expect(fin.prevRank).toBe(startRanks![teamId]);
      const score = weight[teamId]! > 0 ? exposure[teamId]! / weight[teamId]! : 0;
      expect(fin.researchScore).toBeCloseTo(score, 9);
      // COPY §10 noHoldings can rely on these: the time-summed invested value behind the grade, and whether shares were held.
      expect(fin.researchWeight).toBe(weight[teamId]);
      expect(fin.heldAnyShares).toBe(weight[teamId]! > 0);
      expect(fin.researchGrade).toBe(researchGrade(fin.researchScore));
      expect(fin.spark.at(-1)).toBe(value);
    }
    expect(lb.final!.entries.find((x) => x.teamId === 'alpha')!.researchScore).toBeCloseTo(hi.q, 9);
    expect(lb.final!.entries.find((x) => x.teamId === 'bravo')!.researchScore).toBeCloseTo(lo.q, 9);

    store.commits = [];
    await e.endGame();
    await e.tickOnce(Date.now() + 60_000);
    expect(store.commits).toEqual([]);
  });

  it('prevRank is the rank at the start of the current session, so movement arrows persist until the next session', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    addCrew('bravo', 90_000_000);
    await e.startGame();
    store.crews.update('bravo', { cashBalance: 90_000_000 }); // startGame gave every crew the starting cash
    const S = e.state.sessionTicks;
    const standings = () => Object.fromEntries(store.leaderboard.get()!.entries.map((x) => [x.teamId, [x.rank, x.prevRank]]));

    await tickTo(e, 1);
    expect(standings()).toEqual({ alpha: [1, 1], bravo: [2, 2] }); // first standings start the session
    store.crews.update('bravo', { cashBalance: 110_000_000 });
    await tickTo(e, 2);
    expect(standings()).toEqual({ bravo: [1, 2], alpha: [2, 1] });
    await tickTo(e, 3);
    expect(standings()).toEqual({ bravo: [1, 2], alpha: [2, 1] }); // still measured from the session start, not tick 2

    await tickTo(e, S); // a new session opens: movement restarts from here
    expect(standings()).toEqual({ bravo: [1, 1], alpha: [2, 2] });
    store.crews.update('alpha', { cashBalance: 200_000_000 });
    await tickTo(e, S + 1);
    expect(standings()).toEqual({ alpha: [1, 2], bravo: [2, 1] });

    // The session start ranks survive a restart (they are the stored entries' prevRank).
    resetLeaderboardCache();
    const e2 = new GameEngine(store);
    await e2.load();
    await tickTo(e2, S + 2);
    expect(standings()).toEqual({ alpha: [1, 2], bravo: [2, 1] });

    // A catch-up across the next boundary restarts movement at the tick it lands on.
    await tickTo(e2, 2 * S + 5);
    expect(standings()).toEqual({ alpha: [1, 1], bravo: [2, 2] });
    store.crews.update('bravo', { cashBalance: 300_000_000 });
    await tickTo(e2, 2 * S + 6);
    await e2.endGame();
    const final = store.leaderboard.get()!.final!.entries;
    expect(final.map((x) => [x.teamId, x.rank, x.prevRank])).toEqual([
      ['bravo', 1, 2],
      ['alpha', 2, 1],
    ]);
  });

  it('finalizeLeaderboard is idempotent and reads the store, not the engine cache', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.startGame();
    await tickTo(e, 2);
    await e.endGame();
    const first = store.leaderboard.get()!;
    const again = finalizeLeaderboard(store, e);
    expect(again.final!.entries.map((x) => [x.teamId, x.totalValue])).toEqual(first.final!.entries.map((x) => [x.teamId, x.totalValue]));
  });
});

// ─── (e) Realtime fan-out ─────────────────────────────────────────────────────

describe('engine loop: realtime fan-out', () => {
  it('publishes the phase on every transition and a tick payload after each committed tick', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    const ticks: TickPayload[] = [];
    const news: NewsEvent[][] = [];
    const phases: string[] = [];
    /** Phase changes and whole-world resends in the order they were published. */
    const fanout: string[] = [];
    const hub: RealtimeHub = {
      publishTick: (p) => ticks.push(p),
      publishNews: (n) => news.push(n),
      publishPhase: (g) => {
        phases.push(g.phase);
        fanout.push(`phase:${g.phase}`);
      },
      publishSnapshot: () => fanout.push('snapshot'),
    };
    setRealtimeHub(hub);

    await e.startGame();
    expect(phases).toEqual(['live']);
    const cos = secretCompanies();
    await tickTo(e, 1);
    expect(ticks).toHaveLength(1);
    const p = ticks[0]!;
    expect(p.tick).toBe(1);
    expect(p.game.phase).toBe('live');
    expect(p.market.lastTick).toBe(1);
    expect(p.leaderboard.tick).toBe(1);
    expect(p.leaderboard.entries.map((x) => x.teamId)).toEqual(['alpha']);
    for (const c of cos) expect(p.prices[c.id]).toBe(e.getPrice(c.id));
    expect(p.prices).not.toHaveProperty('q');

    // News fans out only on the ticks that fire it.
    await e.queueHostNews({ companyIds: [cos[0]!.id], type: 'discovery', magnitude: 0.1, headline: 'Ahoy', body: '' });
    await tickTo(e, 2);
    expect(news.flat().some((n) => n.headline === 'Ahoy')).toBe(true);
    expect(news.flat().every((n) => !('magnitude' in n) && !('jumps' in n))).toBe(true);

    await e.pauseGame();
    await e.resumeGame();
    await e.endGame();
    expect(phases).toEqual(['live', 'paused', 'live', 'ended']);
    // The reveal becomes public at the end: every connection is resent the world BEFORE the phase
    // event, so the results screen fills in without anyone reconnecting for it.
    expect(fanout.slice(-2)).toEqual(['snapshot', 'phase:ended']);
    expect(fanout.filter((f) => f === 'snapshot')).toHaveLength(1);
    // A hub that throws never fails a tick.
    setRealtimeHub({
      publishTick: () => {
        throw new Error('boom');
      },
      publishNews: () => undefined,
      publishPhase: () => undefined,
    });
    await expect(e.tickOnce(Date.now() + 5_000)).resolves.toBeUndefined();
  });
});

// ─── (f) Hidden data ──────────────────────────────────────────────────────────

const HIDDEN_KEYS = new Set([
  'q',
  'qEff',
  'surprise',
  'quality',
  'grade',
  'pillars',
  'fairValue',
  'jumps',
  'magnitude',
  'idioVol',
  'seed',
  'exposure',
  'weight',
  'researchScore',
  'researchGrade',
  'reveal',
  'final',
  'expectedReturn',
  'actualReturn',
  'luck',
  'events',
  'pending',
  'hM',
]);

function hiddenKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => hiddenKeys(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (HIDDEN_KEYS.has(k)) out.push(`${path}.${k}`);
      hiddenKeys(v, `${path}.${k}`, out);
    }
  }
}

/** Everything a crew may read: never `meta`, `engine_state`, `company_secret`, `news_schedule`, `crew_stats` or `audit_log`. */
function crewReadable(): Record<string, unknown> {
  const t = store.t;
  return {
    game_state: t.game,
    companies: t.companies,
    price_history: t.history,
    market_summary: t.market,
    market_history: t.marketHistory,
    news: t.news,
    leaderboard: t.leaderboard,
    crews: Object.fromEntries(Object.entries(t.crews).map(([id, c]) => [id, { ...c, passwordHash: undefined }])),
    holdings: t.holdings,
    trades: t.trades,
    orders: t.orders,
  };
}

describe('engine loop: nothing hidden reaches a crew-readable table before the end', () => {
  it('lobby, settings, start, host news, ticks, pause and resume leak no quality, surprise, schedule or seed', async () => {
    const e = await newMarket();
    addCrew('alpha', 100_000_000);
    await e.applySettings({ feeBps: 20, researchEdge: 'high' });
    await e.startGame();
    const cos = secretCompanies();
    const target = cos[2]!;
    for (let t = 1; t <= 3; t++) await tickTo(e, t);
    await e.queueHostNews({ companyIds: [target.id], type: 'discovery', magnitude: 0.12, headline: 'Host headline', body: 'Host body' });
    expect(JSON.parse(store.meta.get('news_pending')!)).toHaveLength(1);
    const before = e.getPrice(target.id);
    await tickTo(e, 4);
    const seq = scheduleRows().filter((x) => x.tick === 4 && x.source !== 'host').length;
    const news = newsRows().find((n) => n.id === `host-4-${target.id}-${seq}`)!;
    expect(news.priceAtFire[target.id]).toBe(before);
    expect(JSON.parse(store.meta.get('news_pending')!)).toEqual([]);
    expect(scheduleRows().some((x) => x.source === 'host' && x.tick === 4)).toBe(true);
    await e.pauseGame();
    await e.resumeGame();
    await tickTo(e, 30);

    const leaks: string[] = [];
    hiddenKeys(crewReadable(), '', leaks);
    expect(leaks).toEqual([]);
    expect(JSON.stringify(crewReadable())).not.toContain(SEED);

    await e.endGame();
    const after: string[] = [];
    hiddenKeys(crewReadable(), '', after);
    // After the end only the reveal (companies) and the final standings carry them.
    expect(after.every((x) => /^\.companies\.[^.]+\.reveal/.test(x) || /^\.leaderboard\.final/.test(x))).toBe(true);
    expect(after.some((x) => x.endsWith('.reveal'))).toBe(true);
    expect(JSON.stringify(crewReadable())).not.toContain(SEED);
  });
});
