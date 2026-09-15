/**
 * GameEngine IO layer (loop.ts), leaderboard.ts and market.ts against an in-memory
 * Firestore fake (test/helpers/fakeFirestore.ts). No emulator, no network, no
 * credentials: `../src/firebase` is replaced before anything imports it.
 *
 * Prices are checked against an independent replay built from the pure model
 * primitives (marketStep/companyStep), so the loop's orchestration — flow drain,
 * news, catch-up, chunking, resume — is verified tick by tick.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', async () => {
  const { FakeFirestore } = await import('./helpers/fakeFirestore');
  return { db: new FakeFirestore(), adminAuth: {}, emulatorMode: true, EMULATOR_PROJECT_ID: 'demo-deca' };
});
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (operand: number) => ({ __fake: 'increment', operand }) },
}));

import {
  EDGE_SPREAD,
  HISTORY_CHUNK,
  HOUR_MS,
  MODEL,
  chunkOf,
  deriveClock,
  impactLambda,
  intervalShareCap,
  type Company,
  type GameState,
  type HistoryChunk,
  type Leaderboard,
  type MarketSummary,
  type NewsEvent,
  type Team,
  type ValueChunk,
} from '@deca/shared';
import { db as mockedDb } from '../src/firebase';
import type { FakeFirestore } from './helpers/fakeFirestore';
import { EngineError, GameEngine } from '../src/engine/loop';
import { compositeValue, researchGrade, revealLabel, sampleSpark } from '../src/engine/loopHelpers';
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
import { resetLeaderboardCache } from '../src/services/leaderboard';
import { clearDynamicData, createMarket } from '../src/services/market';

const db = mockedDb as unknown as FakeFirestore;
const SEED = 'engine-loop-test-seed';
const T0 = Date.UTC(2026, 8, 14, 12, 0, 0);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterAll(() => {
  vi.useRealTimers();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type Doc = Record<string, unknown>;

function get<T = Doc>(path: string): T {
  const d = db.docs.get(path);
  if (!d) throw new Error(`missing doc ${path}`);
  return structuredClone(d) as T;
}

interface RefCompany extends ModelCompany {
  name: string;
  ticker: string;
  sector: string;
  q: number;
  startPriceCents: number;
}

function scheduleCompanies(): RefCompany[] {
  const out: RefCompany[] = [];
  for (const [path, d] of db.docs) {
    const m = /^_schedule\/([^_/][^/]*)$/.exec(path);
    if (!m) continue;
    const id = m[1]!;
    const q = d.q as number;
    const beta = d.beta as number;
    const sharesOutstanding = d.sharesOutstanding as number;
    out.push({
      id,
      name: d.name as string,
      ticker: d.ticker as string,
      sector: d.sector as string,
      q,
      qEff: effectiveQuality(q, surpriseFor(SEED, id)),
      beta,
      idioVol: d.idioVol as number,
      sharesOutstanding,
      lambda: impactLambda(beta, sharesOutstanding),
      startPriceCents: d.startPriceCents as number,
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
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

async function newMarket(gameLengthMs = HOUR_MS): Promise<GameEngine> {
  db.reset();
  resetLeaderboardCache();
  vi.setSystemTime(T0);
  await createMarket({ seed: SEED, keepCrews: true, adminPassword: 'host-pass', settings: { gameLengthMs } });
  const e = new GameEngine();
  await e.load();
  return e;
}

async function addCrew(id: string, cash: number, holdings: Record<string, number> = {}): Promise<void> {
  const team: Team = {
    id,
    name: id.toUpperCase(),
    cashBalance: cash,
    totalValue: cash,
    rank: 0,
    realizedPnl: 0,
    feesPaid: 0,
    tradeCount: Object.keys(holdings).length, // a crew that holds shares has traded
    tradingDisabled: false,
    sessionOpenValue: cash,
    holdingsCount: Object.keys(holdings).length,
    createdAt: Date.now(),
  };
  await db.doc(`teams/${id}`).set(team as unknown as Doc);
  for (const [companyId, shares] of Object.entries(holdings)) {
    await db.doc(`teams/${id}/holdings/${companyId}`).set({ companyId, shares, avgCost: 1000 });
  }
}

async function tickTo(e: GameEngine, t: number): Promise<void> {
  const now = e.state.startAt! + t * e.state.tickIntervalMs;
  vi.setSystemTime(now);
  await e.tickOnce(now);
}

/**
 * Reserves flow like executeOrder, then records the trade doc: executedAt is `advanceMs` after the
 * reservation, and tick is the tick the order was priced at (what the pending-flow rebuild reads).
 */
async function trade(e: GameEngine, teamId: string, companyId: string, side: 'buy' | 'sell', quantity: number, advanceMs = 1): Promise<void> {
  const r = e.reserveFlow(teamId, companyId, side, quantity);
  vi.setSystemTime(Date.now() + advanceMs);
  await db.collection('trades').add({ teamId, companyId, side, quantity, price: Math.round(r.fillPrice), executedAt: Date.now(), tick: r.tick });
}

function scheduleEvents(): ScheduledEvent[] {
  return (get('_schedule/_news').events as ScheduledEvent[]) ?? [];
}

function historyDocs(): Record<string, HistoryChunk> {
  const out: Record<string, HistoryChunk> = {};
  for (const [path, d] of db.docs) if (/^companies\/[^/]+\/history\/\d+$/.test(path)) out[path] = structuredClone(d) as unknown as HistoryChunk;
  return out;
}

const TICK_PATHS = [
  /^companies\/[^/]+$/,
  /^companies\/[^/]+\/history\/\d+$/,
  /^market\/summary$/,
  /^market\/summary\/history\/\d+$/,
  /^news\/(scheduled|macro|host)-\d+-[^/]+-\d+$/,
  /^game\/state$/,
  /^_engine\/state$/,
  /^_schedule\/_news$/,
  /^leaderboard\/current$/,
  /^teams\/[^/]+$/,
  /^teams\/[^/]+\/history\/\d+$/,
  /^_teamStats\/[^/]+$/,
  /^logs\/[^/]+$/,
];

// ─── (a) Tick writes ──────────────────────────────────────────────────────────

describe('engine loop: tick writes (spec §7/§9)', () => {
  it('startGame persists the schedule, engine state and tick-0 docs', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = scheduleCompanies();
    expect(cos).toHaveLength(25);
    const clock = deriveClock(HOUR_MS);
    const state = get<GameState>('game/state');
    expect(state).toMatchObject({ phase: 'live', currentTick: 0, tickIntervalMs: 5000, totalTicks: 720, sessionTicks: 90 });
    expect(state.endAt! - state.startAt!).toBe(720 * 5000);
    // The stored schedule is exactly buildSchedule of the seed, clock and hidden companies.
    expect(scheduleEvents()).toEqual(buildSchedule(SEED, clock, cos, derive(clock, EDGE_SPREAD.normal)));
    const es = get<{ lastTick: number; hM: number; companies: Record<string, CompanyState> }>('_engine/state');
    expect(es.lastTick).toBe(0);
    for (const c of cos) {
      expect(es.companies[c.id]).toEqual(initialState(c.startPriceCents));
      expect(get(`companies/${c.id}/history/0`)).toEqual({ chunk: 0, startTick: 0, prices: [c.startPriceCents], volumes: [0] });
    }
    const summary = get<MarketSummary>('market/summary');
    expect(summary.composite.value).toBe(1000);
    expect(Object.values(summary.sectors).every((s) => s.value === 1000)).toBe(true);
    expect(get('market/summary/history/0')).toEqual({ chunk: 0, startTick: 0, values: [1000] });
  });

  it('ticks and a catch-up across a chunk boundary match the pure model, chunk math, sessions, indexes and breadth', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = scheduleCompanies();
    const events = scheduleEvents();
    db.writes = [];
    for (let t = 1; t <= 3; t++) await tickTo(e, t);
    await tickTo(e, 125); // one call: ticks 4..125
    const ref = reference(HOUR_MS, cos, events, 125);

    for (const c of cos) {
      const h0 = get<HistoryChunk>(`companies/${c.id}/history/0`);
      const h1 = get<HistoryChunk>(`companies/${c.id}/history/1`);
      expect(h0).toEqual({ chunk: 0, startTick: 0, prices: ref.prices[c.id]!.slice(0, 120), volumes: new Array(120).fill(0) });
      expect(h1).toEqual({ chunk: 1, startTick: 120, prices: ref.prices[c.id]!.slice(120, 126), volumes: new Array(6).fill(0) });
      // tick t lives at chunk floor(t/120), index t % 120
      expect(h1.prices[125 % HISTORY_CHUNK]).toBe(ref.prices[c.id]![125]);

      const p = ref.prices[c.id]!;
      const session = p.slice(90, 126);
      const doc = get<Company>(`companies/${c.id}`);
      expect(doc).toMatchObject({
        currentPrice: p[125],
        sessionOpen: p[90],
        sessionHigh: Math.max(...session),
        sessionLow: Math.min(...session),
        sessionVolume: 0,
        voyageHigh: Math.max(...p),
        voyageLow: Math.min(...p),
        marketCap: p[125]! * c.sharesOutstanding,
        lastTick: 125,
        startPrice: c.startPriceCents,
      });
      expect(doc.sessionChange).toBeCloseTo(p[125]! / p[90]! - 1, 12);
      expect(doc.voyageChange).toBeCloseTo(p[125]! / c.startPriceCents - 1, 12);
    }

    // Engine state is the exact model state (no flow → f = 0).
    const es = get<{ lastTick: number; hM: number; companies: Record<string, CompanyState> }>('_engine/state');
    expect(es.lastTick).toBe(125);
    expect(es.hM).toBe(ref.hM);
    for (const c of cos) expect(es.companies[c.id]).toEqual(ref.companies[c.id]);
    expect(get<GameState>('game/state').currentTick).toBe(125);

    // Composite and sector indexes: 1000·Σ(price·shares)/Σ(start·shares), session open at tick 90.
    const starts = Object.fromEntries(cos.map((c) => [c.id, c.startPriceCents]));
    const shares = Object.fromEntries(cos.map((c) => [c.id, c.sharesOutstanding]));
    const at = (t: number) => Object.fromEntries(cos.map((c) => [c.id, ref.prices[c.id]![t]!]));
    const ids = cos.map((c) => c.id);
    const summary = get<MarketSummary>('market/summary');
    expect(summary.lastTick).toBe(125);
    expect(summary.composite.value).toBe(compositeValue(at(125), starts, shares, ids));
    expect(summary.composite.sessionOpen).toBe(compositeValue(at(90), starts, shares, ids));
    for (const sector of new Set(cos.map((c) => c.sector))) {
      const sIds = cos.filter((c) => c.sector === sector).map((c) => c.id);
      expect(summary.sectors[sector]!.value).toBe(compositeValue(at(125), starts, shares, sIds));
      expect(summary.sectors[sector]!.sessionOpen).toBe(compositeValue(at(90), starts, shares, sIds));
    }
    const adv = cos.filter((c) => ref.prices[c.id]![125]! > ref.prices[c.id]![90]!).length;
    const dec = cos.filter((c) => ref.prices[c.id]![125]! < ref.prices[c.id]![90]!).length;
    expect(summary.breadth).toMatchObject({ advancers: adv, decliners: dec, unchanged: 25 - adv - dec, sessionVolume: 0 });
    const sh0 = get<ValueChunk>('market/summary/history/0');
    const sh1 = get<ValueChunk>('market/summary/history/1');
    expect(sh0.values).toHaveLength(120);
    expect(sh1).toMatchObject({ chunk: 1, startTick: 120 });
    expect(sh1.values).toHaveLength(6);
    for (let t = 0; t <= 125; t++) {
      const v = t < 120 ? sh0.values[t] : sh1.values[t - 120];
      expect(v).toBe(compositeValue(at(t), starts, shares, ids));
    }

    // News: every event up to tick 125 fired once, priceAtFire = price at the end of t−1, no hidden fields.
    const fired = events.filter((ev) => ev.tick <= 125);
    const byTick = jumpsAtTick(fired);
    const newsDocs = [...db.docs.entries()].filter(([p]) => p.startsWith('news/'));
    expect(newsDocs).toHaveLength(fired.length);
    for (const [t, evs] of byTick) {
      evs.forEach((ev, seq) => {
        const n = get<NewsEvent>(`news/${ev.source}-${t}-${ev.companyIds[0]}-${seq}`);
        expect(n).toMatchObject({ headline: ev.headline, body: ev.body, type: ev.type, sentiment: ev.sentiment, tick: t, companyIds: ev.companyIds });
        for (const id of ev.companyIds) expect(n.priceAtFire[id]).toBe(ref.prices[id]![t - 1]);
        expect(Object.keys(n).sort()).toEqual(['body', 'companyIds', 'firedAt', 'headline', 'id', 'priceAtFire', 'sentiment', 'source', 'tick', 'type']);
      });
    }

    for (const w of db.writes) expect(TICK_PATHS.some((re) => re.test(w.path)), w.path).toBe(true);
  });

  it('a full 48h catch-up splits its writes into batches of at most 450 and ends on a chunk boundary', async () => {
    const e = await newMarket(48 * HOUR_MS);
    await addCrew('alpha', 100_000_000);
    await e.startGame();
    expect(e.state).toMatchObject({ tickIntervalMs: 30_000, totalTicks: 5760, sessionTicks: 720 });
    const cos = scheduleCompanies();
    const events = scheduleEvents();
    db.batchSizes = [];
    await tickTo(e, 5760);
    expect(Math.max(...db.batchSizes)).toBe(450);
    expect(db.batchSizes.every((n) => n <= 450)).toBe(true);
    expect(e.state.phase).toBe('ended');
    const ref = reference(48 * HOUR_MS, cos, events, 5760);
    for (const c of cos) {
      expect(get<HistoryChunk>(`companies/${c.id}/history/47`).prices).toEqual(ref.prices[c.id]!.slice(5640, 5760));
      expect(get<HistoryChunk>(`companies/${c.id}/history/48`)).toEqual({ chunk: 48, startTick: 5760, prices: [ref.prices[c.id]![5760]], volumes: [0] });
    }
    expect([...db.docs.keys()].filter((p) => p.startsWith('news/'))).toHaveLength(events.length);
    expect(get<Leaderboard>('leaderboard/current').final?.entries).toHaveLength(1);
  });
});

// ─── (b) Resume ───────────────────────────────────────────────────────────────

describe('engine loop: resume after a crash', () => {
  it('a fresh load continues with byte-identical prices, rebuilt pending flow and interval caps', async () => {
    const e = await newMarket();
    await addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = scheduleCompanies();
    const [a, b] = [cos[3]!, cos[7]!];
    for (let t = 1; t <= 5; t++) await tickTo(e, t);
    vi.setSystemTime(Date.now() + 1_000);
    await trade(e, 'alpha', a.id, 'buy', 20_000);
    await trade(e, 'alpha', b.id, 'sell', 5_000);
    const quote = e.quote(a.id, 'buy', 1_000, 'alpha');
    const crashedAt = Date.now();
    const snapshot = db.dump();

    for (let t = 6; t <= 10; t++) await tickTo(e, t);
    const expectedHistory = historyDocs();
    const expectedEngine = get('_engine/state');
    const ref = reference(HOUR_MS, cos, scheduleEvents(), 10, { 6: { [a.id]: 20_000, [b.id]: -5_000 } });
    for (const c of cos) expect(expectedHistory[`companies/${c.id}/history/0`]!.prices).toEqual(ref.prices[c.id]);
    expect(expectedHistory[`companies/${a.id}/history/0`]!.volumes[6]).toBe(20_000);
    expect(expectedHistory[`companies/${b.id}/history/0`]!.volumes[6]).toBe(5_000);

    // Restart from the crash snapshot.
    db.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const e2 = new GameEngine();
    await e2.load();
    expect(e2.state.currentTick).toBe(5);
    expect(e2.quote(a.id, 'buy', 1_000, 'alpha')).toEqual(quote);
    expect(() => e2.reserveFlow('alpha', a.id, 'buy', intervalShareCap(a.sharesOutstanding) - 20_000 + 1)).toThrow(EngineError);
    for (let t = 6; t <= 10; t++) await tickTo(e2, t);
    expect(historyDocs()).toEqual(expectedHistory);
    expect(get('_engine/state')).toEqual(expectedEngine);
  });

  it('pending flow is rebuilt by tick, not time: trades priced in the same millisecond as a drain land on the right side of it', async () => {
    const e = await newMarket();
    await addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = scheduleCompanies();
    const [a, b] = [cos[2]!, cos[4]!];
    for (let t = 1; t <= 4; t++) await tickTo(e, t);
    const drainAt = e.state.startAt! + 5 * e.state.tickIntervalMs;
    vi.setSystemTime(drainAt);
    await trade(e, 'alpha', b.id, 'sell', 7_000, 0); // priced at drainAt just BEFORE tick 5 drains: part of tick 5
    await e.tickOnce(drainAt);
    expect(e.state.lastTickAt).toBe(drainAt);
    await trade(e, 'alpha', a.id, 'buy', 25_000, 0); // priced at drainAt just AFTER the drain: waits for tick 6
    expect(Date.now()).toBe(drainAt);
    const trades = [...db.docs.entries()].filter(([p]) => p.startsWith('trades/')).map(([, d]) => d);
    expect(trades.map((t) => [t.companyId, t.executedAt, t.tick])).toEqual([[b.id, drainAt, 4], [a.id, drainAt, 5]]);
    expect(get<GameState>('game/state')).toMatchObject({ currentTick: 5, lastTickAt: drainAt });
    const quoteA = e.quote(a.id, 'buy', 1_000, 'alpha');
    const quoteB = e.quote(b.id, 'sell', 1_000, 'alpha');
    const snapshot = db.dump();

    for (let t = 6; t <= 9; t++) await tickTo(e, t);
    const expectedHistory = historyDocs();
    const expectedEngine = get('_engine/state');
    const ref = reference(HOUR_MS, cos, scheduleEvents(), 9, { 5: { [b.id]: -7_000 }, 6: { [a.id]: 25_000 } });
    for (const c of cos) expect(expectedHistory[`companies/${c.id}/history/0`]!.prices).toEqual(ref.prices[c.id]);

    // Restart from the snapshot taken in that same millisecond.
    db.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(drainAt);
    const e2 = new GameEngine();
    await e2.load();
    expect(e2.state.currentTick).toBe(5);
    expect(e2.quote(a.id, 'buy', 1_000, 'alpha')).toEqual(quoteA); // the post-drain buy is pending again (and counts toward the cap)
    expect(e2.quote(b.id, 'sell', 1_000, 'alpha')).toEqual(quoteB); // the pre-drain sell is not pending twice
    for (let t = 6; t <= 9; t++) await tickTo(e2, t);
    expect(historyDocs()).toEqual(expectedHistory);
    expect(get('_engine/state')).toEqual(expectedEngine);
  });

  it('without _engine/state it replays fair value and recovers impact from prices', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = scheduleCompanies();
    for (let t = 1; t <= 5; t++) await tickTo(e, t);
    await addCrew('alpha', 100_000_000);
    vi.setSystemTime(Date.now() + 1_000);
    await trade(e, 'alpha', cos[0]!.id, 'buy', 30_000);
    const crashedAt = Date.now();
    const snapshot = db.dump();
    for (let t = 6; t <= 12; t++) await tickTo(e, t);
    const expectedHistory = historyDocs();
    const expectedEngine = get<{ hM: number; companies: Record<string, CompanyState> }>('_engine/state');

    db.restore(snapshot);
    db.docs.delete('_engine/state');
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const e3 = new GameEngine();
    await e3.load();
    for (let t = 6; t <= 12; t++) await tickTo(e3, t);
    const es = get<{ hM: number; companies: Record<string, CompanyState> }>('_engine/state');
    expect(es.hM).toBe(expectedEngine.hM);
    for (const c of cos) {
      const got = es.companies[c.id]!;
      const want = expectedEngine.companies[c.id]!;
      expect(got.v).toBe(want.v);
      expect(got.h).toBe(want.h);
      expect(Math.abs(got.f - want.f)).toBeLessThan(1e-3);
      const gotPrices = historyDocs()[`companies/${c.id}/history/0`]!.prices;
      const wantPrices = expectedHistory[`companies/${c.id}/history/0`]!.prices;
      gotPrices.forEach((p, i) => expect(Math.abs(p - wantPrices[i]!)).toBeLessThanOrEqual(1));
    }
  });
});

describe('engine loop: resilience', () => {
  it('a failed tick commit is retried by the next tick with nothing lost', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = scheduleCompanies();
    const events = scheduleEvents();
    for (let t = 1; t <= 2; t++) await tickTo(e, t);
    db.failNextCommitMatching = /^_engine\/state$/;
    await expect(tickTo(e, 3)).rejects.toThrow(/injected/);
    expect(get<GameState>('game/state').currentTick).toBe(2);
    await tickTo(e, 5);
    const ref = reference(HOUR_MS, cos, events, 5);
    for (const c of cos) expect(get<HistoryChunk>(`companies/${c.id}/history/0`).prices).toEqual(ref.prices[c.id]);
    expect([...db.docs.keys()].filter((p) => p.startsWith('news/'))).toHaveLength(events.filter((x) => x.tick <= 5).length);
    expect(get<{ lastTick: number }>('_engine/state').lastTick).toBe(5);
  });

  it('a catch-up over 450 writes commits _engine/state only in its last batch, so a failed batch never leaves it ahead of game/state', async () => {
    const e = await newMarket(48 * HOUR_MS);
    await e.startGame();
    const cos = scheduleCompanies();
    const events = scheduleEvents();
    // Writes of one commit for ticks 1..L with H host news firing at L: 25 company docs, 26 chunk docs per chunk
    // touched (25 companies + the composite), one doc per fired news, the market summary, the news schedule (when
    // host news fired), then the engine state and the game state.
    const opsFor = (L: number, H: number) =>
      25 + 26 * (chunkOf(L) + 1) + events.filter((x) => x.tick >= 1 && x.tick <= L).length + H + 1 + (H > 0 ? 1 : 0) + 2;
    // Pick the catch-up that needs the fewest host news to make the total one past a multiple of 450: splitting every
    // 450 writes would then end one batch with _engine/state and send game/state alone in the next.
    let best = { L: 0, H: 451 };
    for (let L = 2_600; L < 5_700; L++) {
      const H = (((1 - (opsFor(L, 1) - 1)) % 450) + 450) % 450 || 450;
      if (H < best.H) best = { L, H };
    }
    for (let i = 0; i < best.H; i++) {
      await e.queueHostNews({ companyIds: [cos[i % cos.length]!.id], type: 'earnings', magnitude: i % 2 ? 0.001 : -0.001, headline: `Host ${i}`, body: '' });
    }

    // 1. The batch holding game/state fails.
    db.attemptedBatches = [];
    db.failNextCommitMatching = /^game\/state$/;
    await expect(tickTo(e, best.L)).rejects.toThrow(/injected/);
    const attempted = db.attemptedBatches;
    expect(attempted.flat()).toHaveLength(opsFor(best.L, best.H));
    expect(attempted.flat().length % 450).toBe(1);
    expect(attempted.at(-1)).toEqual(expect.arrayContaining(['_engine/state', 'game/state', 'market/summary', ...cos.map((c) => `companies/${c.id}`)]));
    expect(attempted.slice(0, -1).flat()).not.toContain('_engine/state');
    expect(attempted.slice(0, -1).flat().filter((p) => /^companies\/[^/]+$/.test(p) || p === 'market/summary')).toEqual([]);
    expect(get<{ lastTick: number }>('_engine/state').lastTick).toBe(0);
    expect(get<GameState>('game/state').currentTick).toBe(0);

    // 2. A batch in the middle (a history chunk) fails: nothing after it is written either.
    db.attemptedBatches = [];
    db.failNextCommitMatching = /^companies\/[^/]+\/history\/20$/;
    await expect(tickTo(e, best.L + 1)).rejects.toThrow(/injected/);
    expect(db.attemptedBatches.length).toBeGreaterThan(1);
    expect(db.attemptedBatches.at(-1)).not.toContain('_engine/state');
    expect(get<{ lastTick: number }>('_engine/state').lastTick).toBe(0);
    expect(get<GameState>('game/state').currentTick).toBe(0);

    // 3. The next tick commits everything, engine and game state together in the final batch.
    db.batches = [];
    await tickTo(e, best.L + 2);
    expect(get<{ lastTick: number }>('_engine/state').lastTick).toBe(best.L + 2);
    expect(get<GameState>('game/state').currentTick).toBe(best.L + 2);
    const engineBatch = db.batches.find((b) => b.includes('_engine/state'))!;
    expect(engineBatch).toContain('game/state');
    expect(engineBatch.slice(-2)).toEqual(['_engine/state', 'game/state']);
    for (const c of cos) expect(get<HistoryChunk>(`companies/${c.id}/history/${chunkOf(best.L + 2)}`).prices.at(-1)).toBe(e.getPrice(c.id));
    expect([...db.docs.keys()].filter((p) => p.startsWith('news/host-'))).toHaveLength(best.H);
  });

  it('a crash in the last batch of a long catch-up leaves company docs and the summary at the committed tick; the restart publishes each host news once and counts volume once', async () => {
    const e = await newMarket();
    await addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = scheduleCompanies();
    const a = cos[0]!;
    await trade(e, 'alpha', a.id, 'buy', 5_000);
    for (let i = 0; i < 460; i++) {
      await e.queueHostNews({ companyIds: [cos[i % cos.length]!.id], type: 'earnings', magnitude: i % 2 ? 0.001 : -0.001, headline: `Host ${i}`, body: '' });
    }

    db.attemptedBatches = [];
    db.failNextCommitMatching = /^game\/state$/;
    await expect(tickTo(e, 10)).rejects.toThrow(/injected/);
    const attempted = db.attemptedBatches;
    expect(attempted.length).toBeGreaterThan(1);
    const last = attempted.at(-1)!;
    const earlier = attempted.slice(0, -1).flat();
    // Everything that says where the game is now is in the batch that failed, and only there.
    for (const path of [...cos.map((c) => `companies/${c.id}`), 'market/summary', '_engine/state', 'game/state']) {
      expect(last, path).toContain(path);
      expect(earlier, path).not.toContain(path);
    }
    // The news schedule is written before any news doc it fires.
    const flat = attempted.flat();
    expect(flat.indexOf('_schedule/_news')).toBeLessThan(flat.findIndex((p) => p.startsWith('news/host-')));
    expect(earlier).toContain('_schedule/_news');
    for (const c of cos) expect(get<Company>(`companies/${c.id}`)).toMatchObject({ lastTick: 0, currentPrice: c.startPriceCents, sessionVolume: 0 });
    expect(get<MarketSummary>('market/summary').lastTick).toBe(0);
    expect([...db.docs.keys()].filter((p) => p.startsWith('news/host-')).length).toBeGreaterThan(0); // an earlier batch landed

    resetLeaderboardCache();
    const e2 = new GameEngine();
    await e2.load();
    expect(e2.state.currentTick).toBe(0);
    await tickTo(e2, 13);
    const host = [...db.docs.entries()].filter(([p]) => p.startsWith('news/host-')).map(([, d]) => d as unknown as NewsEvent);
    expect(host).toHaveLength(460);
    expect(new Set(host.map((n) => n.tick))).toEqual(new Set([10]));
    expect(get<Company>(`companies/${a.id}`).sessionVolume).toBe(5_000);
    const chunk = get<HistoryChunk>(`companies/${a.id}/history/0`);
    expect(chunk.volumes.reduce((x, v) => x + v, 0)).toBe(5_000);
    expect(chunk.prices).toHaveLength(14);
    for (const c of cos) expect(get<Company>(`companies/${c.id}`).currentPrice).toBe(get<HistoryChunk>(`companies/${c.id}/history/0`).prices[13]);
  });

  it('releasing a reservation after a tick drained it takes its (decayed) impact back out of the price', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = scheduleCompanies();
    const [a, b] = [cos[1]!, cos[9]!];
    const events = scheduleEvents();
    const clean = reference(HOUR_MS, cos, events, 12);
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
    const es = get<{ companies: Record<string, CompanyState> }>('_engine/state');
    expect(Math.abs(es.companies[a.id]!.f)).toBeLessThan(1e-15);
    expect(Math.abs(es.companies[b.id]!.f)).toBeLessThan(1e-15);
  });

  it('host news queued before a restart still fires at the next tick after it', async () => {
    const e = await newMarket();
    await e.startGame();
    const cos = scheduleCompanies();
    const target = cos[5]!;
    for (let t = 1; t <= 3; t++) await tickTo(e, t);
    await e.queueHostNews({ companyIds: [target.id], type: 'scandal', magnitude: -0.2, headline: 'Host bad news', body: '' });
    const snapshot = db.dump();
    const crashedAt = Date.now();
    await tickTo(e, 4);
    const expectedHistory = historyDocs();
    const expectedNews = [...db.docs.entries()].filter(([p]) => p.startsWith('news/host-'));
    expect(expectedNews).toHaveLength(1);

    db.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const e2 = new GameEngine();
    await e2.load();
    expect(e2.scheduledNews().filter((x) => x.source === 'host' && !x.fired)).toHaveLength(1);
    await tickTo(e2, 4);
    expect(historyDocs()).toEqual(expectedHistory);
    expect([...db.docs.entries()].filter(([p]) => p.startsWith('news/host-'))).toEqual(expectedNews);
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
    const e2 = new GameEngine();
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
    await addCrew('early', e.state.startingCapital); // created before the host changed the setting
    await e.applySettings({ startingCapital: 50_000_000 });
    await addCrew('late', 50_000_000);
    await e.startGame();
    for (const id of ['early', 'late']) {
      expect(get<Team>(`teams/${id}`)).toMatchObject({ cashBalance: 50_000_000, totalValue: 50_000_000, sessionOpenValue: 50_000_000 });
    }
    await tickTo(e, 1);
    const lb = get<Leaderboard>('leaderboard/current');
    for (const entry of lb.entries) {
      expect(entry.returnPct).toBe(0);
      expect(entry.spark).toEqual([50_000_000, 50_000_000]);
    }
    // Team value history starts at tick 0 with the starting cash, like the composite starts at 1000.
    for (const id of ['early', 'late']) expect(get(`teams/${id}/history/0`)).toEqual({ chunk: 0, startTick: 0, values: [50_000_000, 50_000_000] });
  });

  it("a crew's tick-0 history point is its starting cash, not a copy of tick 1", async () => {
    const e = await newMarket();
    await addCrew('alpha', e.state.startingCapital);
    await e.startGame();
    expect(get('teams/alpha/history/0')).toEqual({ chunk: 0, startTick: 0, values: [e.state.startingCapital] });
    const cos = scheduleCompanies();
    vi.setSystemTime(Date.now() + 500);
    await trade(e, 'alpha', cos[0]!.id, 'buy', 10_000);
    // Simulate the fill's effect on the crew (T5 writes this in the order transaction).
    await db.doc('teams/alpha').update({ cashBalance: e.state.startingCapital - 1_500_000, tradeCount: 1, holdingsCount: 1 });
    await db.doc(`teams/alpha/holdings/${cos[0]!.id}`).set({ companyId: cos[0]!.id, shares: 10_000, avgCost: 150 });
    await tickTo(e, 1);
    const v1 = e.state.startingCapital - 1_500_000 + Math.round(10_000 * e.getPrice(cos[0]!.id));
    expect(get<ValueChunk>('teams/alpha/history/0').values).toEqual([e.state.startingCapital, v1]);
    expect(get<Leaderboard>('leaderboard/current').entries[0]!.spark).toEqual([e.state.startingCapital, v1]);
  });
});

// ─── (c) Pause/resume and catch-up ────────────────────────────────────────────

describe('engine loop: pause, resume and downtime catch-up', () => {
  it('pause stops the clock and resume shifts startAt/endAt by the pause length', async () => {
    const e = await newMarket();
    await e.startGame();
    const { startAt, endAt, tickIntervalMs } = e.state;
    const cos = scheduleCompanies();
    await tickTo(e, 4);
    const pausedAt = startAt! + 4.5 * tickIntervalMs;
    vi.setSystemTime(pausedAt);
    await e.pauseGame();
    expect(get<GameState>('game/state')).toMatchObject({ phase: 'paused', pausedAt });
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
    const doc = get<GameState>('game/state');
    expect(doc).toMatchObject({ phase: 'live', pausedAt: null, startAt: startAt! + 600_000, endAt: endAt! + 600_000 });
    expect(e.state).toMatchObject({ startAt: startAt! + 600_000, endAt: endAt! + 600_000 });
    expect(e.health(resumedAt).ticksBehind).toBe(0);
    await e.tickOnce(resumedAt);
    expect(e.state.currentTick).toBe(4);
    await tickTo(e, 5);
    const ref = reference(HOUR_MS, cos, scheduleEvents(), 5);
    for (const c of cos) expect(e.getPrice(c.id)).toBe(ref.prices[c.id]![5]);
  });

  it('a catch-up after downtime equals ticking one by one: flow only on the first tick, chunk docs only', async () => {
    const e = await newMarket();
    await addCrew('alpha', 100_000_000);
    await e.startGame();
    const cos = scheduleCompanies();
    const a = cos[11]!;
    await tickTo(e, 1);
    await tickTo(e, 2);
    vi.setSystemTime(Date.now() + 2_000);
    await trade(e, 'alpha', a.id, 'buy', 30_000);
    const crashedAt = Date.now();
    const snapshot = db.dump();
    for (let t = 3; t <= 12; t++) await tickTo(e, t);
    const expectedHistory = historyDocs();
    const expectedEngine = get('_engine/state');
    const expectedSummaryHistory = get('market/summary/history/0');

    db.restore(snapshot);
    resetLeaderboardCache();
    vi.setSystemTime(crashedAt);
    const y = new GameEngine();
    await y.load();
    db.writes = [];
    await tickTo(y, 12);
    expect(historyDocs()).toEqual(expectedHistory);
    expect(get('_engine/state')).toEqual(expectedEngine);
    expect(get('market/summary/history/0')).toEqual(expectedSummaryHistory);
    const vol = expectedHistory[`companies/${a.id}/history/0`]!.volumes;
    expect(vol[3]).toBe(30_000);
    expect(vol.filter((v, i) => i !== 3 && v !== 0)).toEqual([]);
    const ref = reference(HOUR_MS, cos, scheduleEvents(), 12, { 3: { [a.id]: 30_000 } });
    for (const c of cos) expect(expectedHistory[`companies/${c.id}/history/0`]!.prices).toEqual(ref.prices[c.id]);
    // One write per chunk doc for the whole catch-up; nothing per tick.
    const historyWrites = db.writes.filter((w) => /\/history\/\d+$/.test(w.path));
    expect(historyWrites.filter((w) => w.path.startsWith('companies/'))).toHaveLength(25);
    expect(historyWrites.filter((w) => w.path.startsWith('market/'))).toHaveLength(1);
    expect(historyWrites.filter((w) => w.path.startsWith('teams/'))).toHaveLength(1);
    for (const w of db.writes) expect(TICK_PATHS.some((re) => re.test(w.path)), w.path).toBe(true);
    expect(db.writes.filter((w) => w.path === '_engine/state')).toHaveLength(1);
  });
});

// ─── (d) Leaderboard, closing mark and reveal ─────────────────────────────────

describe('engine loop: leaderboard, closing mark and reveal', () => {
  it('ranks, prevRank, sparks and research stats per tick; endGame marks at the close and reveals', async () => {
    const e = await newMarket();
    const cos = scheduleCompanies();
    const byQ = [...cos].sort((x, y) => y.q - x.q);
    const hi = byQ[0]!;
    const lo = byQ[24]!;
    await addCrew('alpha', 40_000_000, { [hi.id]: 20_000 });
    await addCrew('bravo', 70_000_000, { [lo.id]: 10_000 });
    await addCrew('cash-only', 100_000_000);
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
    let prevRanks: Record<string, number> | null = null;
    let startRanks: Record<string, number> | null = null;

    for (let t = 1; t <= 4; t++) {
      if (t === 4) {
        vi.setSystemTime(Date.now() + 1_000);
        await trade(e, 'alpha', hi.id, 'buy', intervalShareCap(hi.sharesOutstanding)); // pumps the last price
      }
      await tickTo(e, t);
      const lb = get<Leaderboard>('leaderboard/current');
      expect(lb.tick).toBe(t);
      for (const [teamId, h] of Object.entries(holdings)) {
        const invested = Math.round(h.shares * e.getPrice(h.id));
        const value = h.cash + invested;
        series[teamId]!.push(value);
        exposure[teamId]! += invested * h.q;
        weight[teamId]! += invested;
        expect(get<Team>(`teams/${teamId}`).totalValue).toBe(value);
        const entry = lb.entries.find((x) => x.teamId === teamId)!;
        expect(entry.totalValue).toBe(value);
        expect(entry.returnPct).toBeCloseTo(value / startingCapital - 1, 12);
        expect(entry.cashPct).toBeCloseTo(h.cash / value, 12);
        // Movement is measured from the start of the session (here: the first standings, tick 1), not the last tick.
        expect(entry.prevRank).toBe(startRanks?.[teamId] ?? entry.rank);
        expect(get<Team>(`teams/${teamId}`).sessionStartRank).toBe(startRanks?.[teamId] ?? entry.rank);
        // Series starts at the chunk start (tick 0 takes the first value).
        expect(entry.spark).toEqual(sampleSpark([series[teamId]![0]!, ...series[teamId]!]));
        const stats = get<{ exposure: number; weight: number }>(`_teamStats/${teamId}`);
        expect(stats.exposure).toBeCloseTo(exposure[teamId]!, 3);
        expect(stats.weight).toBe(weight[teamId]);
      }
      const sorted = [...lb.entries].sort((x, y) => y.totalValue - x.totalValue);
      expect(lb.entries.map((x) => x.teamId)).toEqual(sorted.map((x) => x.teamId));
      expect(lb.entries.map((x) => x.rank)).toEqual([1, 2, 3]);
      prevRanks = Object.fromEntries(lb.entries.map((x) => [x.teamId, x.rank]));
      startRanks ??= prevRanks;
    }

    const es = get<{ companies: Record<string, CompanyState> }>('_engine/state');
    const lastTraded = e.getPrice(hi.id);
    const closeHi = Math.max(1, Math.round(Math.exp(es.companies[hi.id]!.v + es.companies[hi.id]!.m)));
    expect(lastTraded).toBeGreaterThan(closeHi); // impact is in the last price, not in the close

    // A crew that bought only after the last price update holds shares at the close but has no time-weighted exposure.
    const mid = byQ[12]!;
    await addCrew('late', 90_000_000, { [mid.id]: 5_000 });
    const chunkBefore = get<HistoryChunk>(`companies/${hi.id}/history/0`);
    expect(chunkBefore.prices).toHaveLength(5);
    expect(chunkBefore.volumes[4]).toBe(intervalShareCap(hi.sharesOutstanding));

    vi.setSystemTime(Date.now() + 1_500);
    await e.endGame();
    const state = get<GameState>('game/state');
    expect(state).toMatchObject({ phase: 'ended', endedAt: T0 + 4 * 5000 + 1_500 });
    const d = derive(deriveClock(HOUR_MS), EDGE_SPREAD.normal);
    expect(d.spread).toBe(0.3);
    for (const c of cos) {
      const s = es.companies[c.id]!;
      const close = Math.max(1, Math.round(Math.exp(s.v + s.m)));
      expect(e.closePrice(c.id)).toBe(close);
      const doc = get<Company>(`companies/${c.id}`);
      const sched = get(`_schedule/${c.id}`);
      expect(doc.currentPrice).toBe(close);
      const r = doc.reveal!;
      const expectedReturn = 0.3 * c.qEff + c.beta * MODEL.mktDrift;
      const actualReturn = Math.log(close / c.startPriceCents);
      expect(r).toMatchObject({ q: c.q, quality: sched.quality, grade: sched.grade, pillars: sched.pillars, surprise: surpriseFor(SEED, c.id) });
      expect(r.qEff).toBe(c.qEff);
      expect(r.fairValue).toBe(Math.max(1, Math.round(Math.exp(s.v))));
      expect(r.expectedReturn).toBeCloseTo(expectedReturn, 12);
      expect(r.actualReturn).toBeCloseTo(actualReturn, 12);
      expect(r.luck).toBeCloseTo(actualReturn - expectedReturn, 12);
      expect(r.label).toBe(revealLabel(c.q, r.luck));
    }

    // The closing mark is the last point of every price chart and of the composite, like the final team values.
    for (const c of cos) {
      const chunk = get<HistoryChunk>(`companies/${c.id}/history/0`);
      expect(chunk.prices, c.id).toHaveLength(5);
      expect(chunk.prices[4], c.id).toBe(e.closePrice(c.id));
      expect(chunk.prices.slice(0, 4)).toEqual((c.id === hi.id ? chunkBefore : chunk).prices.slice(0, 4));
    }
    expect(get<HistoryChunk>(`companies/${hi.id}/history/0`).volumes).toEqual(chunkBefore.volumes); // volumes kept
    const summaryHistory = get<ValueChunk>('market/summary/history/0');
    expect(summaryHistory.values).toHaveLength(5);
    expect(summaryHistory.values[4]).toBe(get<MarketSummary>('market/summary').composite.value);

    const lb = get<Leaderboard>('leaderboard/current');
    expect(lb.final!.endedAt).toBe(state.endedAt);
    const late = lb.final!.entries.find((x) => x.teamId === 'late')!;
    const lateInvested = Math.round(5_000 * e.closePrice(mid.id));
    expect(late).toMatchObject({ heldAnyShares: true, researchWeight: lateInvested });
    expect(late.researchScore).toBeCloseTo(mid.q, 12); // graded on its closing holdings
    for (const [teamId, h] of Object.entries(holdings)) {
      const value = h.cash + Math.round(h.shares * e.closePrice(h.id));
      expect(get<Team>(`teams/${teamId}`).totalValue).toBe(value);
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

    const writes = db.writes.length;
    await e.endGame();
    await e.tickOnce(Date.now() + 60_000);
    expect(db.writes.length).toBe(writes);
  });

  it('prevRank is the rank at the start of the current session, so movement arrows persist until the next session', async () => {
    const e = await newMarket(); // 1 hour: sessions of 90 ticks
    await addCrew('alpha', 100_000_000);
    await addCrew('bravo', 90_000_000);
    await e.startGame();
    await db.doc('teams/bravo').update({ cashBalance: 90_000_000 }); // startGame gave every crew the starting cash
    const standings = () => Object.fromEntries(get<Leaderboard>('leaderboard/current').entries.map((x) => [x.teamId, [x.rank, x.prevRank]]));
    const startRank = (id: string) => get<Team>(`teams/${id}`).sessionStartRank;

    await tickTo(e, 1);
    expect(standings()).toEqual({ alpha: [1, 1], bravo: [2, 2] }); // first standings start the session
    await db.doc('teams/bravo').update({ cashBalance: 110_000_000 });
    await tickTo(e, 2);
    expect(standings()).toEqual({ bravo: [1, 2], alpha: [2, 1] });
    await tickTo(e, 3);
    expect(standings()).toEqual({ bravo: [1, 2], alpha: [2, 1] }); // still measured from the session start, not tick 2
    expect([startRank('alpha'), startRank('bravo')]).toEqual([1, 2]);

    await tickTo(e, 90); // a new session opens: movement restarts from here
    expect(standings()).toEqual({ bravo: [1, 1], alpha: [2, 2] });
    expect([startRank('alpha'), startRank('bravo')]).toEqual([2, 1]);
    await db.doc('teams/alpha').update({ cashBalance: 200_000_000 });
    await tickTo(e, 91);
    expect(standings()).toEqual({ alpha: [1, 2], bravo: [2, 1] });

    // The session start ranks survive a restart (they are stored on the crew docs).
    resetLeaderboardCache();
    const e2 = new GameEngine();
    await e2.load();
    await tickTo(e2, 92);
    expect(standings()).toEqual({ alpha: [1, 2], bravo: [2, 1] });

    // A catch-up across the next boundary (180) restarts movement at the tick it lands on.
    await tickTo(e2, 185);
    expect(standings()).toEqual({ alpha: [1, 1], bravo: [2, 2] });
    await db.doc('teams/bravo').update({ cashBalance: 300_000_000 });
    await tickTo(e2, 186);
    await e2.endGame();
    const final = get<Leaderboard>('leaderboard/current').final!.entries;
    expect(final.map((x) => [x.teamId, x.rank, x.prevRank])).toEqual([['bravo', 1, 2], ['alpha', 2, 1]]);
  });
});

// ─── (e) createMarket / clearDynamicData ──────────────────────────────────────

describe('market service: exactly the documented paths are wiped', () => {
  async function seedEverything(): Promise<void> {
    db.reset();
    const docs: Record<string, Doc> = {
      'game/state': { phase: 'ended', gameLengthMs: 2 * HOUR_MS, startingCapital: 50_000_000 },
      '_auth/_admin': { passwordHash: 'admin-hash', role: 'admin' },
      '_auth/alpha': { passwordHash: 'x', role: 'team', teamId: 'alpha' },
      'logs/l1': { action: 'x' },
      'teams/alpha': { id: 'alpha', name: 'Alpha', cashBalance: 1, totalValue: 2, rank: 3, realizedPnl: 4, feesPaid: 5, tradeCount: 6, sessionOpenValue: 7, holdingsCount: 1, tradingDisabled: true, createdAt: 1 },
      'teams/alpha/holdings/kraken': { shares: 1 },
      'teams/alpha/history/0': { values: [1] },
      'trades/t1': { teamId: 'alpha' },
      'orders/o1': { teamId: 'alpha' },
      'news/n1': { tick: 1 },
      'leaderboard/current': { entries: [] },
      'market/summary': { lastTick: 1 },
      'market/summary/history/0': { values: [1] },
      '_engine/state': { lastTick: 1 },
      '_teamStats/alpha': { exposure: 1 },
      '_schedule/_meta': { seed: 'old' },
      '_schedule/_news': { events: [] },
      '_schedule/kraken': { q: 0.5 },
      'companies/kraken': { id: 'kraken' },
      'companies/kraken/history/0': { prices: [1] },
      'companies/kraken/fundamentals/data': { revenue: 1 },
      'companies/ghost/history/0': { prices: [1] }, // history under a company doc that no longer exists
    };
    for (const [p, d] of Object.entries(docs)) db.docs.set(p, d);
  }

  it('keepCrews=true resets crews and keeps logins, the admin, logs and game/state', async () => {
    await seedEverything();
    await clearDynamicData({ keepCrews: true, startingCapital: 50_000_000 });
    expect([...db.docs.keys()].sort()).toEqual(['_auth/_admin', '_auth/alpha', 'game/state', 'logs/l1', 'teams/alpha']);
    expect(get('_auth/_admin')).toEqual({ passwordHash: 'admin-hash', role: 'admin' });
    expect(get('teams/alpha')).toMatchObject({ cashBalance: 50_000_000, totalValue: 50_000_000, rank: 0, realizedPnl: 0, feesPaid: 0, tradeCount: 0, sessionOpenValue: 50_000_000, holdingsCount: 0 });
  });

  it('keepCrews=false deletes crews and crew logins but never the admin', async () => {
    await seedEverything();
    await clearDynamicData({ keepCrews: false, startingCapital: 50_000_000 });
    expect([...db.docs.keys()].sort()).toEqual(['_auth/_admin', 'game/state', 'logs/l1']);
    expect(get('_auth/_admin')).toEqual({ passwordHash: 'admin-hash', role: 'admin' });
  });

  it('createMarket keeps the stored settings, writes the lobby market and leaves an existing admin alone', async () => {
    await seedEverything();
    const res = await createMarket({ seed: SEED, keepCrews: true });
    expect(res).toEqual({ seed: SEED, companies: 25, adminPasswordSet: false });
    expect(get('_auth/_admin')).toEqual({ passwordHash: 'admin-hash', role: 'admin' });
    expect(get<GameState>('game/state')).toMatchObject({ phase: 'lobby', gameLengthMs: 2 * HOUR_MS, startingCapital: 50_000_000, currentTick: 0, startAt: null, totalTicks: 720 });
    expect(get('_schedule/_meta')).toMatchObject({ seed: SEED });
    expect(db.docs.has('_schedule/_news')).toBe(false);
    expect(db.docs.has('companies/ghost/history/0')).toBe(false);
    const cos = scheduleCompanies();
    expect(cos).toHaveLength(25);
    for (const c of cos) {
      expect(get(`companies/${c.id}/history/0`)).toEqual({ chunk: 0, startTick: 0, prices: [c.startPriceCents], volumes: [0] });
      expect(db.docs.has(`companies/${c.id}/fundamentals/data`)).toBe(true);
      expect(Object.keys(get(`_schedule/${c.id}`)).sort()).toEqual(['adv', 'beta', 'grade', 'idioVol', 'name', 'pillars', 'q', 'quality', 'sector', 'sharesOutstanding', 'startPriceCents', 'ticker']);
    }
    expect(get<MarketSummary>('market/summary').composite).toMatchObject({ value: 1000, open: 1000, sessionOpen: 1000 });

    db.docs.delete('_auth/_admin');
    const res2 = await createMarket({ seed: SEED, keepCrews: false });
    expect(res2.adminPasswordSet).toBe(true);
    expect(res2.generatedAdminPassword).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(db.docs.has('_auth/_admin')).toBe(true);
    expect(db.docs.has('teams/alpha')).toBe(false);
  });
});

// ─── (g) Hidden data ──────────────────────────────────────────────────────────

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

/** Client-readable docs: every top-level collection except server-only `_*` and `logs`. */
function clientDocs(): [string, Doc][] {
  return [...db.docs.entries()].filter(([p]) => !p.startsWith('_') && !p.startsWith('logs/'));
}

describe('engine loop: nothing hidden reaches a client-readable path before the end', () => {
  it('lobby, settings, start, host news, ticks, pause and resume leak no quality, surprise, schedule or seed', async () => {
    const e = await newMarket();
    await addCrew('alpha', 100_000_000);
    await e.applySettings({ feeBps: 20, researchEdge: 'high' });
    await e.startGame();
    const cos = scheduleCompanies();
    const target = cos[2]!;
    for (let t = 1; t <= 3; t++) await tickTo(e, t);
    await e.queueHostNews({ companyIds: [target.id], type: 'discovery', magnitude: 0.12, headline: 'Host headline', body: 'Host body' });
    expect((get('_schedule/_news').pending as unknown[]).length).toBe(1);
    const before = e.getPrice(target.id);
    await tickTo(e, 4);
    const news = get<NewsEvent>(`news/host-4-${target.id}-${scheduleEvents().filter((x) => x.tick === 4 && x.source !== 'host').length}`);
    expect(news.priceAtFire[target.id]).toBe(before);
    expect(get('_schedule/_news').pending).toEqual([]);
    expect(scheduleEvents().some((x) => x.source === 'host' && x.tick === 4)).toBe(true);
    await e.pauseGame();
    await e.resumeGame();
    await tickTo(e, 30);

    const leaks: string[] = [];
    for (const [p, d] of clientDocs()) hiddenKeys(d, p, leaks);
    expect(leaks).toEqual([]);
    const json = JSON.stringify(clientDocs());
    expect(json).not.toContain(SEED);

    await e.endGame();
    const after: string[] = [];
    for (const [p, d] of clientDocs()) hiddenKeys(d, p, after);
    // After the end only the reveal (companies) and the final standings carry them.
    expect(after.every((x) => /^companies\/[^/.]+\.reveal/.test(x) || /^leaderboard\/current\.final/.test(x))).toBe(true);
    expect(after.some((x) => x.endsWith('.reveal'))).toBe(true);
    expect(JSON.stringify(clientDocs())).not.toContain(SEED);
  });
});
