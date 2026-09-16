/**
 * The SQLite store (plan 2026-09-15-drop-firebase §A1): schema round-trips,
 * transaction rollback, history ranges, and clearDynamic with and without crews.
 *
 * Everything runs against an in-memory database, so the suite needs no fixtures
 * and leaves nothing behind.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Company, Fundamentals, GameState, Leaderboard, MarketSummary, NewsEvent, OrderRecord, Trade } from '@deca/shared';
import { DEFAULT_STARTING_CAPITAL, deriveClock, DEFAULT_GAME_LENGTH_MS } from '@deca/shared';
import { openStore, SCHEMA_VERSION, type Store } from '../src/store';
import type { CompanySecret, EngineStateRow } from '../src/store/types';
import type { ScheduledEvent } from '../src/engine/news';

let store: Store;

beforeEach(() => {
  store = openStore(':memory:');
});
afterEach(() => {
  store.close();
});

// ─── fixtures ────────────────────────────────────────────────────────────────

const CAPITAL = DEFAULT_STARTING_CAPITAL;

function company(id: string, price = 10_000): Company {
  return {
    id,
    name: `${id} Trading Co`,
    ticker: id.toUpperCase().slice(0, 4),
    sector: 'Naval Arms',
    description: 'A company.',
    currentPrice: price,
    startPrice: price,
    sessionOpen: price,
    sessionHigh: price,
    sessionLow: price,
    sessionVolume: 0,
    voyageHigh: price,
    voyageLow: price,
    sessionChange: 0,
    voyageChange: 0,
    sharesOutstanding: 50_000_000,
    marketCap: price * 50_000_000,
    beta: 1.1,
    adv: 333_333,
    lastTick: 0,
  };
}

function secret(id: string): CompanySecret {
  return {
    companyId: id,
    ticker: id.toUpperCase().slice(0, 4),
    name: `${id} Trading Co`,
    sector: 'Naval Arms',
    q: 0.4,
    qEff: 0.35,
    surprise: 0.2,
    quality: 0.55,
    grade: 'B',
    pillars: { prof: 0.2, grow: 0.1, safe: 0.3, val: 0.5 },
    idioVol: 0.31,
    beta: 1.1,
    sharesOutstanding: 50_000_000,
    adv: 333_333,
    startPriceCents: 10_000,
  };
}

function gameState(): GameState {
  const clock = deriveClock(DEFAULT_GAME_LENGTH_MS);
  return {
    gameLengthMs: DEFAULT_GAME_LENGTH_MS,
    startingCapital: CAPITAL,
    feeBps: 10,
    researchEdge: 'normal',
    maxPositionPct: 0.5,
    currency: { name: 'Doubloons', symbol: 'Ð' },
    phase: 'live',
    startAt: 1_000,
    endAt: 1_000 + DEFAULT_GAME_LENGTH_MS,
    pausedAt: null,
    endedAt: null,
    currentTick: 7,
    tickIntervalMs: clock.tickIntervalMs,
    totalTicks: clock.totalTicks,
    sessionTicks: clock.sessionTicks,
    serverTime: 2_000,
    lastTickAt: 1_900,
    marketCreatedAt: 500,
  };
}

function trade(id: string, crewId: string, tick: number, executedAt: number): Trade {
  return {
    id,
    teamId: crewId,
    companyId: 'kraken',
    side: 'buy',
    quantity: 100,
    price: 10_050,
    lastPrice: 10_000,
    impactBps: 50,
    fee: 1_005,
    realizedPnl: 0,
    executedAt,
    tick,
    cashAfter: CAPITAL - 1_006_005,
    sharesAfter: 100,
    clientOrderId: `c-${id}`,
  };
}

function scheduled(tick: number, companyIds: string[]): ScheduledEvent {
  return {
    tick,
    companyIds,
    jumps: Object.fromEntries(companyIds.map((id) => [id, 0.04])),
    type: 'earnings',
    sentiment: 'bullish',
    source: 'scheduled',
    headline: 'A good haul',
    body: 'They came back heavy.',
  };
}

function newsEvent(id: string, tick: number, firedAt: number, companyIds: string[]): NewsEvent {
  return {
    id,
    headline: 'A good haul',
    body: 'They came back heavy.',
    companyIds,
    type: 'earnings',
    sentiment: 'bullish',
    source: 'scheduled',
    tick,
    firedAt,
    priceAtFire: Object.fromEntries(companyIds.map((c) => [c, 10_000])),
  };
}

// ─── schema ──────────────────────────────────────────────────────────────────

describe('schema and migrations', () => {
  it('records the schema version and is idempotent across opens', () => {
    expect(store.meta.get('schema_version')).toBe(String(SCHEMA_VERSION));
    const again = openStore(':memory:');
    expect(again.meta.get('schema_version')).toBe(String(SCHEMA_VERSION));
    again.close();
  });

  it('creates every table the plan lists', () => {
    const names = (store.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name,
    );
    for (const t of [
      'meta',
      'game_state',
      'engine_state',
      'companies',
      'fundamentals',
      'company_secret',
      'price_history',
      'market_summary',
      'market_history',
      'crews',
      'holdings',
      'crew_history',
      'crew_stats',
      'trades',
      'orders',
      'news',
      'news_schedule',
      'leaderboard',
      'audit_log',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('keeps the singleton tables to one row', () => {
    expect(() => store.raw.prepare('INSERT INTO game_state (id, json) VALUES (2, ?)').run('{}')).toThrow();
  });
});

// ─── round-trips ─────────────────────────────────────────────────────────────

describe('round-trips', () => {
  it('stores and reads meta values', () => {
    expect(store.meta.get('seed')).toBeNull();
    store.meta.set('seed', 'abc');
    expect(store.meta.get('seed')).toBe('abc');
    store.meta.set('seed', 'def');
    expect(store.meta.get('seed')).toBe('def');
    store.meta.remove('seed');
    expect(store.meta.get('seed')).toBeNull();
  });

  it('stores the game state and the engine state', () => {
    expect(store.game.get()).toBeNull();
    expect(store.engine.get()).toBeNull();
    const g = gameState();
    store.game.set(g);
    expect(store.game.get()).toEqual(g);

    const e: EngineStateRow = { lastTick: 12, hM: 1.02, companies: { kraken: { v: 9.2, m: 0, f: 0.001, h: 1.1 } } };
    store.engine.set(e);
    expect(store.engine.get()).toEqual(e);
  });

  it('stores companies with their indexed columns and patches them', () => {
    store.companies.upsertMany([company('kraken'), company('siren', 5_000)]);
    expect(store.companies.all().map((c) => c.id)).toEqual(['kraken', 'siren']);
    expect(store.companies.get('siren')?.currentPrice).toBe(5_000);
    expect(store.companies.get('nobody')).toBeNull();

    store.companies.update('kraken', { currentPrice: 11_000, lastTick: 4 });
    const c = store.companies.get('kraken');
    expect(c).toMatchObject({ currentPrice: 11_000, lastTick: 4, startPrice: 10_000 });

    // the search columns track the json
    store.companies.update('kraken', { ticker: 'KRKN' });
    const row = store.raw.prepare('SELECT ticker FROM companies WHERE id = ?').get('kraken') as { ticker: string };
    expect(row.ticker).toBe('KRKN');

    // patching a company that is not there is a no-op, not a crash
    expect(() => store.companies.update('ghost', { currentPrice: 1 })).not.toThrow();
    expect(store.companies.all()).toHaveLength(2);
  });

  it('stores fundamentals and keeps secrets in their own table', () => {
    const f = { marketCap: 1, revenue: 2 } as unknown as Fundamentals;
    store.fundamentals.upsertMany({ kraken: f });
    expect(store.fundamentals.get('kraken')).toEqual(f);
    expect(store.fundamentals.all()).toEqual({ kraken: f });

    store.secrets.upsertMany({ kraken: secret('kraken') });
    expect(store.secrets.get('kraken')?.q).toBe(0.4);
    expect(Object.keys(store.secrets.all())).toEqual(['kraken']);
    // hidden fields live nowhere else
    expect(JSON.stringify(store.fundamentals.all())).not.toContain('qEff');
  });

  it('stores the market summary and its value history', () => {
    const m = {
      lastTick: 3,
      updatedAt: 99,
      composite: { value: 1010, open: 1000, sessionOpen: 1000, change: 0.01, sessionChange: 0.01 },
      sectors: {},
      breadth: {
        advancers: 1,
        decliners: 0,
        unchanged: 0,
        voyageHighs: 0,
        voyageLows: 0,
        sessionVolume: 0,
        advancingVolume: 0,
        decliningVolume: 0,
      },
    } satisfies MarketSummary;
    store.market.set(m);
    expect(store.market.get()).toEqual(m);

    for (let t = 0; t <= 5; t++) store.market.appendHistory(t, 1000 + t);
    store.market.appendHistory(3, 1_003.5); // a replayed tick overwrites
    expect(store.market.historyRange(2, 4)).toEqual([
      { tick: 2, value: 1002 },
      { tick: 3, value: 1003.5 },
      { tick: 4, value: 1004 },
    ]);
  });

  it('stores news and finds it per company', () => {
    store.news.insert([newsEvent('n1', 1, 100, ['kraken']), newsEvent('n2', 2, 200, ['siren', 'kraken'])]);
    expect(store.news.recent(10).map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(store.news.recent(1).map((n) => n.id)).toEqual(['n2']);
    expect(store.news.forCompany('siren', 10).map((n) => n.id)).toEqual(['n2']);
    expect(store.news.forCompany('kraken', 10).map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(store.news.forCompany('nobody', 10)).toEqual([]);
  });

  it('stores the hidden news schedule and marks events fired', () => {
    store.newsSchedule.set([scheduled(4, ['kraken']), scheduled(9, ['siren'])]);
    const all = store.newsSchedule.all();
    expect(all.map((e) => e.tick)).toEqual([4, 9]);
    expect(all.every((e) => !e.fired)).toBe(true);
    expect(all[0]!.jumps).toEqual({ kraken: 0.04 });

    store.newsSchedule.markFired([all[0]!.rowId]);
    expect(store.newsSchedule.all().map((e) => e.fired)).toEqual([true, false]);

    // set() replaces the whole schedule
    store.newsSchedule.set([scheduled(1, ['kraken'])]);
    expect(store.newsSchedule.all().map((e) => e.tick)).toEqual([1]);
  });

  it('stores the leaderboard and the audit log', () => {
    expect(store.leaderboard.get()).toBeNull();
    const l = { updatedAt: 1, tick: 2, entries: [] } satisfies Leaderboard;
    store.leaderboard.set(l);
    expect(store.leaderboard.get()).toEqual(l);

    store.audit.add('game.start', 'admin', { tick: 0 });
    store.audit.add('order.fill', 'sea-dogs', { qty: 10 });
    const recent = store.audit.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]).toMatchObject({ action: 'order.fill', actor: 'sea-dogs', payload: { qty: 10 } });
    expect(typeof recent[0]!.timestamp).toBe('number');
  });
});

// ─── crews, holdings, trades, orders ─────────────────────────────────────────

describe('crews', () => {
  beforeEach(() => {
    store.crews.create({ id: 'sea-dogs', name: 'Sea Dogs', passwordHash: 'salt:hash', startingCapital: CAPITAL, createdAt: 10 });
  });

  it('creates a crew with the starting capital and a token version', () => {
    expect(store.crews.get('sea-dogs')).toEqual({
      id: 'sea-dogs',
      name: 'Sea Dogs',
      cashBalance: CAPITAL,
      totalValue: CAPITAL,
      rank: 0,
      realizedPnl: 0,
      feesPaid: 0,
      tradeCount: 0,
      tradingDisabled: false,
      sessionOpenValue: CAPITAL,
      holdingsCount: 0,
      createdAt: 10,
      sessionStartRank: 0,
    });
    expect(store.crews.passwordHash('sea-dogs')).toBe('salt:hash');
    expect(store.crews.tokenVersion('sea-dogs')).toBe(1);
    expect(store.crews.byName('sea dogs')?.id).toBe('sea-dogs');
    expect(store.crews.byName('nobody')).toBeNull();
  });

  it('patches only the fields given, mapping booleans', () => {
    store.crews.update('sea-dogs', { cashBalance: 42, tradingDisabled: true, sessionStartRank: 3 });
    expect(store.crews.get('sea-dogs')).toMatchObject({
      cashBalance: 42,
      totalValue: CAPITAL,
      tradingDisabled: true,
      sessionStartRank: 3,
    });
    store.crews.update('sea-dogs', {});
    expect(store.crews.get('sea-dogs')?.cashBalance).toBe(42);
  });

  it('bumps the token version to revoke sessions', () => {
    expect(store.crews.bumpTokenVersion('sea-dogs')).toBe(2);
    expect(store.crews.bumpTokenVersion('sea-dogs')).toBe(3);
    expect(store.crews.tokenVersion('sea-dogs')).toBe(3);
    expect(store.crews.tokenVersion('nobody')).toBeNull();
  });

  it('removes a crew with its holdings, history, stats and ledger', () => {
    store.crews.create({ id: 'buccaneers', name: 'Buccaneers', passwordHash: 'x:y', startingCapital: CAPITAL });
    store.holdings.upsert('sea-dogs', { companyId: 'kraken', shares: 10, avgCost: 9_900 });
    store.crewHistory.append([{ crewId: 'sea-dogs', tick: 1, value: CAPITAL }]);
    store.crewStats.add('sea-dogs', 0.4, 1_000);
    store.trades.insert(trade('t1', 'sea-dogs', 1, 100));
    store.trades.insert(trade('t2', 'buccaneers', 1, 101));
    store.orders.insert({
      id: 'sea-dogs_c1',
      teamId: 'sea-dogs',
      clientOrderId: 'c1',
      companyId: 'kraken',
      side: 'buy',
      quantity: 10,
      status: 'filled',
      createdAt: 100,
      tick: 1,
    });

    store.crews.remove('sea-dogs');

    expect(store.crews.all().map((c) => c.id)).toEqual(['buccaneers']);
    expect(store.holdings.forCrew('sea-dogs')).toEqual([]);
    expect(store.crewHistory.series('sea-dogs')).toEqual([]);
    expect(store.crewStats.get('sea-dogs')).toEqual({ exposure: 0, weight: 0 });
    // The ledger goes with the crew: no orphan trade or order can surface in a
    // recent-trades read or block a clientOrderId a later crew of the same name reuses.
    expect(store.trades.forCrew('sea-dogs', 10)).toEqual([]);
    expect(store.orders.forCrew('sea-dogs', 10)).toEqual([]);
    expect(store.orders.byClientId('sea-dogs', 'c1')).toBeNull();
    expect(store.trades.recent(10).map((t) => t.id)).toEqual(['t2']);
  });

  it('stores holdings per crew and company', () => {
    store.crews.create({ id: 'buccaneers', name: 'Buccaneers', passwordHash: 'x:y', startingCapital: CAPITAL });
    store.holdings.upsert('sea-dogs', { companyId: 'kraken', shares: 10, avgCost: 9_900 });
    store.holdings.upsert('sea-dogs', { companyId: 'kraken', shares: 25, avgCost: 10_100 });
    store.holdings.upsert('sea-dogs', { companyId: 'siren', shares: 5, avgCost: 5_000 });
    store.holdings.upsert('buccaneers', { companyId: 'kraken', shares: 1, avgCost: 10_000 });

    expect(store.holdings.get('sea-dogs', 'kraken')).toEqual({ companyId: 'kraken', shares: 25, avgCost: 10_100 });
    expect(store.holdings.forCrew('sea-dogs').map((h) => h.companyId)).toEqual(['kraken', 'siren']);
    expect(store.holdings.all()).toEqual({
      buccaneers: [{ companyId: 'kraken', shares: 1, avgCost: 10_000 }],
      'sea-dogs': [
        { companyId: 'kraken', shares: 25, avgCost: 10_100 },
        { companyId: 'siren', shares: 5, avgCost: 5_000 },
      ],
    });

    store.holdings.remove('sea-dogs', 'siren');
    expect(store.holdings.get('sea-dogs', 'siren')).toBeNull();
    expect(store.holdings.forCrew('sea-dogs')).toHaveLength(1);
  });

  it('accumulates crew research stats', () => {
    store.crewStats.add('sea-dogs', 0.4, 1_000);
    store.crewStats.add('sea-dogs', -0.2, 500);
    const s = store.crewStats.get('sea-dogs');
    expect(s.exposure).toBeCloseTo(0.2, 10);
    expect(s.weight).toBe(1_500);
  });

  it('stores trades newest-first per crew, oldest-first from a tick', () => {
    store.trades.insert(trade('t1', 'sea-dogs', 1, 100));
    store.trades.insert(trade('t2', 'sea-dogs', 4, 400));
    store.trades.insert(trade('t3', 'buccaneers', 5, 500));
    store.trades.insert(trade('t1', 'sea-dogs', 1, 100)); // retried commit: same id, no duplicate

    expect(store.trades.forCrew('sea-dogs', 10).map((t) => t.id)).toEqual(['t2', 't1']);
    expect(store.trades.forCrew('sea-dogs', 1).map((t) => t.id)).toEqual(['t2']);
    expect(store.trades.recent(10).map((t) => t.id)).toEqual(['t3', 't2', 't1']);
    expect(store.trades.sinceTick(4).map((t) => t.id)).toEqual(['t2', 't3']);
    expect(store.trades.sinceTick(99)).toEqual([]);
    expect(store.trades.forCrew('sea-dogs', 10)[0]).toEqual(trade('t2', 'sea-dogs', 4, 400));
  });

  it('stores orders and finds them by client order id', () => {
    const order: OrderRecord = {
      id: 'sea-dogs_c1',
      teamId: 'sea-dogs',
      clientOrderId: 'c1',
      companyId: 'kraken',
      side: 'buy',
      quantity: 10,
      status: 'filled',
      tradeId: 't1',
      createdAt: 100,
      tick: 1,
    };
    store.orders.insert(order);
    expect(store.orders.byClientId('sea-dogs', 'c1')).toEqual(order);
    expect(store.orders.byClientId('sea-dogs', 'nope')).toBeNull();

    const rejected: OrderRecord = {
      id: 'sea-dogs_c2',
      teamId: 'sea-dogs',
      clientOrderId: 'c2',
      companyId: 'kraken',
      side: 'sell',
      quantity: 5,
      status: 'rejected',
      code: 'insufficient_shares',
      reason: 'You do not have 5 shares.',
      createdAt: 200,
      tick: 2,
    };
    store.orders.insert(rejected);
    expect(store.orders.byClientId('sea-dogs', 'c2')).toEqual(rejected);
    expect(store.orders.forCrew('sea-dogs', 10).map((o) => o.id)).toEqual(['sea-dogs_c2', 'sea-dogs_c1']);
    // one row per (crew, clientOrderId): a replay updates it
    store.orders.insert({ ...order, status: 'rejected', code: 'market_closed' });
    expect(store.orders.forCrew('sea-dogs', 10)).toHaveLength(2);
    expect(store.orders.byClientId('sea-dogs', 'c1')?.code).toBe('market_closed');
  });
});

// ─── history ranges ──────────────────────────────────────────────────────────

describe('history ranges', () => {
  beforeEach(() => {
    const rows = [];
    for (let t = 0; t <= 20; t++) rows.push({ companyId: 'kraken', tick: t, price: 10_000 + t, volume: t });
    for (let t = 0; t <= 5; t++) rows.push({ companyId: 'siren', tick: t, price: 5_000 + t, volume: 0 });
    store.history.append(rows);
  });

  it('returns an inclusive tick range in order, per company', () => {
    expect(store.history.range('kraken', 3, 5)).toEqual([
      { tick: 3, price: 10_003, volume: 3 },
      { tick: 4, price: 10_004, volume: 4 },
      { tick: 5, price: 10_005, volume: 5 },
    ]);
    expect(store.history.range('kraken', 0, 0)).toEqual([{ tick: 0, price: 10_000, volume: 0 }]);
    expect(store.history.range('siren', 4, 100)).toHaveLength(2);
    expect(store.history.range('kraken', 50, 60)).toEqual([]);
    expect(store.history.range('kraken', 5, 3)).toEqual([]);
    expect(store.history.range('nobody', 0, 10)).toEqual([]);
  });

  it('reports the latest tick, and -1 for a company with no history', () => {
    expect(store.history.latestTick('kraken')).toBe(20);
    expect(store.history.latestTick('siren')).toBe(5);
    expect(store.history.latestTick('nobody')).toBe(-1);
  });

  it('overwrites a re-recorded tick instead of duplicating it', () => {
    store.history.append([{ companyId: 'kraken', tick: 5, price: 12_345, volume: 99 }]);
    expect(store.history.range('kraken', 5, 5)).toEqual([{ tick: 5, price: 12_345, volume: 99 }]);
    expect(store.history.latestTick('kraken')).toBe(20);
  });

  it('returns crew value ranges and the full series for sparks', () => {
    store.crews.create({ id: 'sea-dogs', name: 'Sea Dogs', passwordHash: 'x:y', startingCapital: CAPITAL });
    store.crewHistory.append([
      { crewId: 'sea-dogs', tick: 0, value: CAPITAL },
      { crewId: 'sea-dogs', tick: 1, value: CAPITAL + 100 },
      { crewId: 'sea-dogs', tick: 2, value: CAPITAL + 250 },
    ]);
    expect(store.crewHistory.range('sea-dogs', 1, 2)).toEqual([
      { tick: 1, value: CAPITAL + 100 },
      { tick: 2, value: CAPITAL + 250 },
    ]);
    expect(store.crewHistory.series('sea-dogs')).toEqual([CAPITAL, CAPITAL + 100, CAPITAL + 250]);
    expect(store.crewHistory.series('nobody')).toEqual([]);
  });
});

// ─── transactions ────────────────────────────────────────────────────────────

describe('transactions', () => {
  it('commits everything in one go and returns the value', () => {
    const out = store.tx(() => {
      store.companies.upsertMany([company('kraken')]);
      store.meta.set('seed', 'abc');
      return 42;
    });
    expect(out).toBe(42);
    expect(store.companies.all()).toHaveLength(1);
    expect(store.meta.get('seed')).toBe('abc');
  });

  it('rolls every write back when the body throws', () => {
    store.companies.upsertMany([company('kraken')]);
    expect(() =>
      store.tx(() => {
        store.companies.upsertMany([company('siren', 5_000)]);
        store.meta.set('seed', 'abc');
        store.crews.create({ id: 'sea-dogs', name: 'Sea Dogs', passwordHash: 'x:y', startingCapital: CAPITAL });
        throw new Error('tick failed');
      }),
    ).toThrow('tick failed');

    expect(store.companies.all().map((c) => c.id)).toEqual(['kraken']);
    expect(store.meta.get('seed')).toBeNull();
    expect(store.crews.all()).toEqual([]);
  });

  it('is nested-safe: an inner failure rolls back to the outer transaction', () => {
    expect(() =>
      store.tx(() => {
        store.meta.set('a', '1');
        store.tx(() => {
          store.meta.set('b', '2');
        });
        store.companies.upsertMany([company('kraken')]); // itself a tx()
        throw new Error('outer failed');
      }),
    ).toThrow('outer failed');
    expect(store.meta.get('a')).toBeNull();
    expect(store.meta.get('b')).toBeNull();
    expect(store.companies.all()).toEqual([]);
  });
});

// ─── clearDynamic ────────────────────────────────────────────────────────────

describe('clearDynamic', () => {
  beforeEach(() => {
    store.meta.set('seed', 'abc');
    store.meta.set('news_pending', '[{"headline":"queued"}]');
    store.meta.set('session_secret', 'keep-me');
    store.meta.set('admin_password_hash', 'salt:hash');
    store.game.set(gameState());
    store.engine.set({ lastTick: 3, hM: 1, companies: {} });
    store.companies.upsertMany([company('kraken')]);
    store.fundamentals.upsertMany({ kraken: { marketCap: 1 } as unknown as Fundamentals });
    store.secrets.upsertMany({ kraken: secret('kraken') });
    store.history.append([{ companyId: 'kraken', tick: 0, price: 10_000, volume: 0 }]);
    store.market.set({
      lastTick: 0,
      updatedAt: 1,
      composite: { value: 1000, open: 1000, sessionOpen: 1000, change: 0, sessionChange: 0 },
      sectors: {},
      breadth: {
        advancers: 0,
        decliners: 0,
        unchanged: 1,
        voyageHighs: 0,
        voyageLows: 0,
        sessionVolume: 0,
        advancingVolume: 0,
        decliningVolume: 0,
      },
    });
    store.market.appendHistory(0, 1000);
    store.newsSchedule.set([scheduled(4, ['kraken'])]);
    store.news.insert([newsEvent('n1', 1, 100, ['kraken'])]);
    store.leaderboard.set({ updatedAt: 1, tick: 1, entries: [] });
    store.audit.add('game.new', 'admin', {});

    store.crews.create({ id: 'sea-dogs', name: 'Sea Dogs', passwordHash: 'salt:hash', startingCapital: CAPITAL });
    store.crews.update('sea-dogs', {
      cashBalance: 10,
      totalValue: 99,
      rank: 2,
      realizedPnl: 5,
      feesPaid: 3,
      tradeCount: 4,
      sessionOpenValue: 77,
      sessionStartRank: 6,
      holdingsCount: 1,
      tradingDisabled: true,
    });
    store.holdings.upsert('sea-dogs', { companyId: 'kraken', shares: 10, avgCost: 9_900 });
    store.crewHistory.append([{ crewId: 'sea-dogs', tick: 1, value: 99 }]);
    store.crewStats.add('sea-dogs', 0.4, 1_000);
    store.trades.insert(trade('t1', 'sea-dogs', 1, 100));
    store.orders.insert({
      id: 'sea-dogs_c1',
      teamId: 'sea-dogs',
      clientOrderId: 'c1',
      companyId: 'kraken',
      side: 'buy',
      quantity: 10,
      status: 'filled',
      createdAt: 100,
      tick: 1,
    });
  });

  function expectMarketGone(): void {
    expect(store.companies.all()).toEqual([]);
    expect(store.fundamentals.all()).toEqual({});
    expect(store.secrets.all()).toEqual({});
    expect(store.history.range('kraken', 0, 100)).toEqual([]);
    expect(store.market.get()).toBeNull();
    expect(store.market.historyRange(0, 100)).toEqual([]);
    expect(store.engine.get()).toBeNull();
    expect(store.news.recent(10)).toEqual([]);
    expect(store.newsSchedule.all()).toEqual([]);
    expect(store.leaderboard.get()).toBeNull();
    expect(store.trades.recent(10)).toEqual([]);
    expect(store.holdings.all()).toEqual({});
    // the seed and any host news still waiting to fire belong to the market that was just cleared
    expect(store.meta.get('seed')).toBeNull();
    expect(store.meta.get('news_pending')).toBeNull();
    // the session secret, the host login, the game state and the audit log survive
    expect(store.meta.get('session_secret')).toBe('keep-me');
    expect(store.meta.get('admin_password_hash')).toBe('salt:hash');
    expect(store.game.get()).not.toBeNull();
    expect(store.audit.recent(10)).toHaveLength(1);
  }

  it('keepCrews: keeps each crew and its login, reset to the starting capital', () => {
    store.clearDynamic({ keepCrews: true, startingCapital: 250_000 });
    expectMarketGone();
    expect(store.crews.get('sea-dogs')).toMatchObject({
      name: 'Sea Dogs',
      cashBalance: 250_000,
      totalValue: 250_000,
      sessionOpenValue: 250_000,
      rank: 0,
      realizedPnl: 0,
      feesPaid: 0,
      tradeCount: 0,
      holdingsCount: 0,
      sessionStartRank: 0,
    });
    // the login and any revocation survive a new game
    expect(store.crews.passwordHash('sea-dogs')).toBe('salt:hash');
    expect(store.crews.tokenVersion('sea-dogs')).toBe(1);
    expect(store.holdings.forCrew('sea-dogs')).toEqual([]);
    expect(store.crewHistory.series('sea-dogs')).toEqual([]);
    expect(store.crewStats.get('sea-dogs')).toEqual({ exposure: 0, weight: 0 });
    expect(store.orders.forCrew('sea-dogs', 10)).toEqual([]);
  });

  it('keepCrews false: deletes every crew and login', () => {
    store.clearDynamic({ keepCrews: false, startingCapital: CAPITAL });
    expectMarketGone();
    expect(store.crews.all()).toEqual([]);
    expect(store.crews.passwordHash('sea-dogs')).toBeNull();
  });

  it('rejects a non-integer or negative starting capital', () => {
    expect(() => store.clearDynamic({ keepCrews: true, startingCapital: 1.5 })).toThrow(/integer/);
    expect(() => store.clearDynamic({ keepCrews: true, startingCapital: -1 })).toThrow(/integer/);
    expect(store.companies.all()).toHaveLength(1);
  });
});
