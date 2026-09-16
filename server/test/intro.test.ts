/**
 * The "Meet the market" intro gate (design §6): the crew state, the completion service,
 * the migration that adds the column to an existing database, and the order gate.
 *
 * Browsing is never gated — only `POST /orders` is — so everything here is about one
 * column (`crews.intro_completed_at`) and what trading does when it is null.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, openStore, SCHEMA_VERSION, useStore, type Store } from '../src/store';
import { completeCrewIntro, CrewError, setCrewIntro } from '../src/services/crews';
import { executeOrder, TradeError, type TradingEngine } from '../src/services/trading';
import { CREW_A, CREW_B, KRKN, seedWorld } from './helpers/apiFixtures';

let store: Store;
let reserved = 0;

/** The smallest engine `executeOrder` needs: a live phase, one company and a fixed fill price. */
function stubEngine(): TradingEngine {
  return {
    state: {
      phase: 'live',
      currentTick: 12,
      feeBps: 10,
      maxPositionPct: 1,
      tickIntervalMs: 5000,
      startAt: Date.now() - 60_000,
      currency: { name: 'Doubloon', symbol: '⌬' },
    },
    getInstrument: (id: string) =>
      id === KRKN
        ? { id: KRKN, kind: 'company', name: 'Kraken', ticker: 'KRKN', sharesOutstanding: 1_000_000, positionLimitExempt: false }
        : undefined,
    getPrice: () => 1000,
    reserveFlow: () => {
      reserved += 1;
      return { fillPrice: 1000, lastPrice: 1000, impactBps: 2, tick: 12, release: () => (reserved -= 1) };
    },
  } as unknown as TradingEngine;
}

const order = (clientOrderId: string): never =>
  ({ companyId: KRKN, side: 'buy', quantity: 5, clientOrderId }) as never;

beforeEach(() => {
  reserved = 0;
  store = openStore(':memory:');
  useStore(store);
  seedWorld(store);
});

afterEach(() => {
  useStore(null);
  store.close();
});

describe('the crew row carries the intro state', () => {
  it('a new crew has not met the market', () => {
    store.crews.create({ id: 'new-crew', name: 'New Crew', passwordHash: 'salt:hash', startingCapital: 1000 });
    expect(store.crews.get('new-crew')!.introCompletedAt).toBeNull();
  });

  it('round-trips the completion time and clears back to null', () => {
    store.crews.update(CREW_A, { introCompletedAt: 1_700_000_000_000 });
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBe(1_700_000_000_000);
    expect(store.crews.all().find((c) => c.id === CREW_A)!.introCompletedAt).toBe(1_700_000_000_000);
    store.crews.update(CREW_A, { introCompletedAt: null });
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBeNull();
  });
});

describe('completing the intro', () => {
  beforeEach(() => {
    store.crews.update(CREW_A, { introCompletedAt: null });
  });

  it('stamps the crew and is idempotent: a second call is not an error and keeps the first time', async () => {
    const first = await completeCrewIntro(CREW_A);
    expect(first).toBeGreaterThan(0);
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBe(first);
    expect(await completeCrewIntro(CREW_A)).toBe(first);
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBe(first);
  });

  it('touches only the calling crew', async () => {
    store.crews.update(CREW_B, { introCompletedAt: null });
    await completeCrewIntro(CREW_A);
    expect(store.crews.get(CREW_B)!.introCompletedAt).toBeNull();
  });

  it('refuses an unknown or path-shaped crew id', async () => {
    await expect(completeCrewIntro('nobody')).rejects.toBeInstanceOf(CrewError);
    await expect(completeCrewIntro('../admin')).rejects.toBeInstanceOf(CrewError);
  });

  it('lets the host mark a crew complete, and clear it again', async () => {
    const at = await setCrewIntro(CREW_A, true);
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBe(at);
    expect(await setCrewIntro(CREW_A, false)).toBeNull();
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBeNull();
  });
});

describe('the order gate', () => {
  beforeEach(() => {
    store.crews.update(CREW_A, { introCompletedAt: null });
  });

  it('rejects an order from a crew that has not met the market, and moves no price', async () => {
    const engine = stubEngine();
    await expect(executeOrder(engine, CREW_A, order('intro-1'))).rejects.toMatchObject({ code: 'intro_required' });
    // No flow reserved: an order that cannot fill must not price impact into everyone else's fills.
    expect(reserved).toBe(0);
    expect(store.crews.get(CREW_A)!.tradeCount).toBe(0);
    expect(store.orders.byClientId(CREW_A, 'intro-1')).toMatchObject({ status: 'rejected', code: 'intro_required' });
  });

  it('carries the plain-English COPY message', async () => {
    const err = await executeOrder(stubEngine(), CREW_A, order('intro-2')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TradeError);
    expect((err as TradeError).message).toContain('Meet the market');
  });

  it('lets the same clientOrderId through once the intro is done', async () => {
    const engine = stubEngine();
    await expect(executeOrder(engine, CREW_A, order('intro-3'))).rejects.toMatchObject({ code: 'intro_required' });
    await completeCrewIntro(CREW_A);
    const trade = await executeOrder(engine, CREW_A, order('intro-3'));
    expect(trade.quantity).toBe(5);
    expect(store.orders.byClientId(CREW_A, 'intro-3')).toMatchObject({ status: 'filled', tradeId: trade.id });
    expect(store.trades.forCrew(CREW_A, 50).filter((t) => t.clientOrderId === 'intro-3')).toHaveLength(1);
  });

  it('still answers a retry of a filled order with that trade, even if the intro is cleared afterwards', async () => {
    const engine = stubEngine();
    await completeCrewIntro(CREW_A);
    const trade = await executeOrder(engine, CREW_A, order('intro-4'));
    await setCrewIntro(CREW_A, false);
    const retry = await executeOrder(engine, CREW_A, order('intro-4'));
    expect(retry.id).toBe(trade.id);
    expect(store.trades.forCrew(CREW_A, 50).filter((t) => t.clientOrderId === 'intro-4')).toHaveLength(1);
  });

  it('lets a crew that has met the market trade as before', async () => {
    await completeCrewIntro(CREW_A);
    const trade = await executeOrder(stubEngine(), CREW_A, order('intro-5'));
    expect(trade.teamId).toBe(CREW_A);
  });
});

describe('a new game', () => {
  it('keepCrews: the same crews keep their intro, so nobody meets the market twice', async () => {
    await completeCrewIntro(CREW_A);
    const at = store.crews.get(CREW_A)!.introCompletedAt;
    store.clearDynamic({ keepCrews: true, startingCapital: 250_000 });
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBe(at);
    expect(store.crews.get(CREW_A)!.cashBalance).toBe(250_000);
  });

  it('keepCrews false: the crews are gone, so the next roster starts un-introduced', async () => {
    await completeCrewIntro(CREW_A);
    store.clearDynamic({ keepCrews: false, startingCapital: 250_000 });
    store.crews.create({ id: CREW_A, name: 'Saltwind', passwordHash: 'salt:hash', startingCapital: 250_000 });
    expect(store.crews.get(CREW_A)!.introCompletedAt).toBeNull();
  });
});

describe('an existing database gains the column without losing data', () => {
  /** The `crews` table exactly as SCHEMA_VERSION 2 wrote it (no intro column). */
  const V2_CREWS = `
    CREATE TABLE crews (
      id                 TEXT PRIMARY KEY,
      name               TEXT    NOT NULL,
      password_hash      TEXT    NOT NULL,
      cash               INTEGER NOT NULL,
      total_value        INTEGER NOT NULL,
      rank               INTEGER NOT NULL DEFAULT 0,
      realized_pnl       INTEGER NOT NULL DEFAULT 0,
      fees_paid          INTEGER NOT NULL DEFAULT 0,
      trade_count        INTEGER NOT NULL DEFAULT 0,
      trading_disabled   INTEGER NOT NULL DEFAULT 0,
      session_open_value INTEGER NOT NULL DEFAULT 0,
      session_start_rank INTEGER NOT NULL DEFAULT 0,
      holdings_count     INTEGER NOT NULL DEFAULT 0,
      token_version      INTEGER NOT NULL DEFAULT 1,
      created_at         INTEGER NOT NULL
    );`;

  function v2Database(): Database.Database {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    db.exec(V2_CREWS);
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '2')").run();
    const insert = db.prepare(
      `INSERT INTO crews (id, name, password_hash, cash, total_value, trade_count, session_open_value, created_at)
       VALUES (?, ?, 'salt:hash', 100, 100, ?, 100, 1)`,
    );
    insert.run('mid-game', 'Mid Game', 4);
    insert.run('lobby-crew', 'Lobby Crew', 0);
    return db;
  }

  it('adds the column, keeps every row, and records the new version', () => {
    const db = v2Database();
    expect(migrate(db)).toBe(2);
    const columns = (db.prepare('PRAGMA table_info(crews)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('intro_completed_at');
    expect(db.prepare('SELECT COUNT(*) AS n FROM crews').get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()).toEqual({
      value: String(SCHEMA_VERSION),
    });
    db.close();
  });

  it('counts a crew that has already traded as done, and one that has not as still to come', () => {
    const db = v2Database();
    migrate(db);
    const at = (id: string): number | null =>
      (db.prepare('SELECT intro_completed_at AS a FROM crews WHERE id = ?').get(id) as { a: number | null }).a;
    // Mid-game upgrade: a crew already trading must never be locked out of its own competition.
    expect(at('mid-game')).toBeGreaterThan(0);
    // A crew the host made for a session that has not started meets the market like everyone else.
    expect(at('lobby-crew')).toBeNull();
    db.close();
  });

  it('is safe to run twice', () => {
    const db = v2Database();
    migrate(db);
    db.prepare("UPDATE crews SET intro_completed_at = 77 WHERE id = 'mid-game'").run();
    expect(migrate(db)).toBe(SCHEMA_VERSION);
    expect(db.prepare("SELECT intro_completed_at AS a FROM crews WHERE id = 'mid-game'").get()).toEqual({ a: 77 });
    db.close();
  });
});
