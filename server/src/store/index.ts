/**
 * The ONLY module that touches SQLite (plan 2026-09-15-drop-firebase §A1).
 *
 * Everything the authority server persists goes through the `Store` interface:
 * the game and engine state, companies and their hidden secrets, price and value
 * history, crews, holdings, trades, orders, news and the audit log. Nothing else
 * in the server may import `better-sqlite3`.
 *
 * Money is INTEGER cents everywhere. Writes that must land together go through
 * `tx()` — one IMMEDIATE transaction, nested-safe (a nested call uses a
 * SAVEPOINT), so an engine tick is a single commit.
 *
 * HIDDEN DATA: `secrets`, `newsSchedule` and `meta` (the seed, the session
 * secret, the host password hash) are server-only. No route may return them to a
 * crew before `phase === 'ended'`.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type {
  Company,
  Fundamentals,
  GameState,
  Holding,
  Leaderboard,
  MarketSummary,
  NewsEvent,
  OrderRecord,
  Team,
  Trade,
} from '@deca/shared';
import type { ScheduledEvent } from '../engine/news';
import { config } from '../config';
import { migrate } from './migrate';
import type {
  CompanySecret,
  CrewRow,
  EngineStateRow,
  LogEntry,
  NewCrew,
  PricePoint,
  StoredScheduledEvent,
  ValuePoint,
} from './types';

export type {
  CompanySecret,
  CrewRow,
  EngineStateRow,
  LogEntry,
  NewCrew,
  PricePoint,
  StoredScheduledEvent,
  ValuePoint,
} from './types';
export { migrate, SCHEMA_VERSION } from './migrate';

type Db = Database.Database;

export interface Store {
  /** better-sqlite3 handle. Tests and migrations only — never in game code. */
  raw: Db;
  /** Runs `fn` in one IMMEDIATE transaction; a nested call joins it via SAVEPOINT. */
  tx<T>(fn: () => T): T;
  meta: { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void };
  game: { get(): GameState | null; set(s: GameState): void };
  engine: { get(): EngineStateRow | null; set(s: EngineStateRow): void };
  companies: {
    all(): Company[];
    get(id: string): Company | null;
    upsertMany(c: Company[]): void;
    update(id: string, patch: Partial<Company>): void;
  };
  fundamentals: {
    all(): Record<string, Fundamentals>;
    get(id: string): Fundamentals | null;
    upsertMany(f: Record<string, Fundamentals>): void;
  };
  secrets: {
    all(): Record<string, CompanySecret>;
    get(id: string): CompanySecret | null;
    upsertMany(s: Record<string, CompanySecret>): void;
  };
  history: {
    append(rows: { companyId: string; tick: number; price: number; volume: number }[]): void;
    range(companyId: string, from: number, to: number): PricePoint[];
    /** Latest recorded tick for the company, or -1 when it has no history. */
    latestTick(companyId: string): number;
  };
  market: {
    get(): MarketSummary | null;
    set(m: MarketSummary): void;
    appendHistory(tick: number, value: number): void;
    historyRange(from: number, to: number): ValuePoint[];
  };
  crews: {
    all(): Team[];
    get(id: string): Team | null;
    byName(name: string): Team | null;
    create(row: NewCrew): void;
    update(id: string, patch: Partial<CrewRow>): void;
    /** Deletes the crew and everything keyed by it: holdings, history, stats, trades and orders. */
    remove(id: string): void;
    passwordHash(id: string): string | null;
    tokenVersion(id: string): number | null;
    bumpTokenVersion(id: string): number;
  };
  holdings: {
    forCrew(id: string): Holding[];
    get(crewId: string, companyId: string): Holding | null;
    upsert(crewId: string, h: Holding): void;
    remove(crewId: string, companyId: string): void;
    all(): Record<string, Holding[]>;
  };
  crewHistory: {
    append(rows: { crewId: string; tick: number; value: number }[]): void;
    range(crewId: string, from: number, to: number): ValuePoint[];
    series(crewId: string): number[];
  };
  crewStats: {
    add(crewId: string, exposure: number, weight: number): void;
    get(crewId: string): { exposure: number; weight: number };
  };
  trades: {
    insert(t: Trade): void;
    forCrew(id: string, limit: number): Trade[];
    /** Every trade from `tick` onwards, oldest first (pending-flow rebuild on resume). */
    sinceTick(tick: number): Trade[];
    recent(limit: number): Trade[];
  };
  orders: {
    insert(o: OrderRecord): void;
    byClientId(crewId: string, clientOrderId: string): OrderRecord | null;
    forCrew(id: string, limit: number): OrderRecord[];
  };
  news: {
    insert(n: NewsEvent[]): void;
    recent(limit: number): NewsEvent[];
    forCompany(id: string, limit: number): NewsEvent[];
  };
  newsSchedule: { set(events: ScheduledEvent[]): void; all(): StoredScheduledEvent[]; markFired(ids: number[]): void };
  leaderboard: { get(): Leaderboard | null; set(l: Leaderboard): void };
  audit: { add(action: string, actor: string, payload: unknown): void; recent(limit: number): LogEntry[] };
  /** Wipes one market. Crews are reset to `startingCapital` or deleted outright. */
  clearDynamic(opts: { keepCrews: boolean; startingCapital: number }): void;
  close(): void;
}

// ─── row shapes ──────────────────────────────────────────────────────────────

interface JsonRow {
  json: string;
}
interface CrewSqlRow {
  id: string;
  name: string;
  password_hash: string;
  cash: number;
  total_value: number;
  rank: number;
  realized_pnl: number;
  fees_paid: number;
  trade_count: number;
  trading_disabled: number;
  session_open_value: number;
  session_start_rank: number;
  holdings_count: number;
  token_version: number;
  created_at: number;
}
interface TradeSqlRow {
  id: string;
  crew_id: string;
  company_id: string;
  side: string;
  quantity: number;
  price: number;
  last_price: number;
  impact_bps: number;
  fee: number;
  realized_pnl: number;
  executed_at: number;
  tick: number;
  cash_after: number;
  shares_after: number;
  client_order_id: string;
}
interface OrderSqlRow {
  id: string;
  crew_id: string;
  client_order_id: string;
  company_id: string;
  side: string;
  quantity: number;
  status: string;
  code: string | null;
  reason: string | null;
  trade_id: string | null;
  created_at: number;
  tick: number;
}

const parse = <T>(s: string): T => JSON.parse(s) as T;

function toTeam(r: CrewSqlRow): Team {
  return {
    id: r.id,
    name: r.name,
    cashBalance: r.cash,
    totalValue: r.total_value,
    rank: r.rank,
    realizedPnl: r.realized_pnl,
    feesPaid: r.fees_paid,
    tradeCount: r.trade_count,
    tradingDisabled: r.trading_disabled === 1,
    sessionOpenValue: r.session_open_value,
    holdingsCount: r.holdings_count,
    createdAt: r.created_at,
    sessionStartRank: r.session_start_rank,
  };
}

function toTrade(r: TradeSqlRow): Trade {
  return {
    id: r.id,
    teamId: r.crew_id,
    companyId: r.company_id,
    side: r.side as Trade['side'],
    quantity: r.quantity,
    price: r.price,
    lastPrice: r.last_price,
    impactBps: r.impact_bps,
    fee: r.fee,
    realizedPnl: r.realized_pnl,
    executedAt: r.executed_at,
    tick: r.tick,
    cashAfter: r.cash_after,
    sharesAfter: r.shares_after,
    clientOrderId: r.client_order_id,
  };
}

function toOrder(r: OrderSqlRow): OrderRecord {
  return {
    id: r.id,
    teamId: r.crew_id,
    clientOrderId: r.client_order_id,
    companyId: r.company_id,
    side: r.side as OrderRecord['side'],
    quantity: r.quantity,
    status: r.status as OrderRecord['status'],
    ...(r.code === null ? {} : { code: r.code }),
    ...(r.reason === null ? {} : { reason: r.reason }),
    ...(r.trade_id === null ? {} : { tradeId: r.trade_id }),
    createdAt: r.created_at,
    tick: r.tick,
  };
}

/** `CrewRow` field → `crews` column. Anything absent here is not patchable. */
const CREW_COLUMNS: Partial<Record<keyof CrewRow, string>> = {
  name: 'name',
  cashBalance: 'cash',
  totalValue: 'total_value',
  rank: 'rank',
  realizedPnl: 'realized_pnl',
  feesPaid: 'fees_paid',
  tradeCount: 'trade_count',
  tradingDisabled: 'trading_disabled',
  sessionOpenValue: 'session_open_value',
  sessionStartRank: 'session_start_rank',
  holdingsCount: 'holdings_count',
  passwordHash: 'password_hash',
  tokenVersion: 'token_version',
  createdAt: 'created_at',
};

/** Tables emptied by `clearDynamic` (crews are handled separately). */
const DYNAMIC_TABLES = [
  'companies',
  'fundamentals',
  'company_secret',
  'price_history',
  'market_summary',
  'market_history',
  'engine_state',
  'holdings',
  'crew_history',
  'crew_stats',
  'trades',
  'orders',
  'news',
  'news_schedule',
  'leaderboard',
] as const;

/**
 * `meta` keys that belong to one market; the rest (secrets, schema) survive a reset.
 * `news_pending` is host news queued for a tick of the market being cleared — it must
 * never fire into the next one (the engine also guards, but the row would leak).
 */
const MARKET_META_KEYS = ['seed', 'market_created_at', 'news_pending'] as const;

// ─── open ────────────────────────────────────────────────────────────────────

/**
 * Opens (creating if needed) the SQLite database and applies the schema.
 * `file` defaults to `DB_FILE` (see config.ts); ':memory:' is allowed in tests.
 */
export function openStore(file?: string): Store {
  const target = file ?? config.dbFile;
  if (target !== ':memory:' && !target.startsWith('file:')) mkdirSync(dirname(target), { recursive: true });
  const db = new Database(target);
  db.pragma('journal_mode = WAL'); // a :memory: database reports "memory" and carries on
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return buildStore(db);
}

function buildStore(db: Db): Store {
  const cache = new Map<string, Database.Statement>();
  /** Prepared-statement cache: every query is compiled once per process. */
  const S = (sql: string): Database.Statement => {
    let st = cache.get(sql);
    if (!st) {
      st = db.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  const singleton = (table: string) => ({
    read: <T>(): T | null => {
      const row = S(`SELECT json FROM ${table} WHERE id = 1`).get() as JsonRow | undefined;
      return row ? parse<T>(row.json) : null;
    },
    write: (value: unknown): void => {
      S(`INSERT INTO ${table} (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`).run(
        JSON.stringify(value),
      );
    },
  });
  const gameDoc = singleton('game_state');
  const engineDoc = singleton('engine_state');
  const marketDoc = singleton('market_summary');
  const leaderboardDoc = singleton('leaderboard');

  const tx = <T>(fn: () => T): T => db.transaction(fn).immediate() as T;

  const store: Store = {
    raw: db,
    tx,

    meta: {
      get(k) {
        const row = S('SELECT value FROM meta WHERE key = ?').get(k) as { value: string } | undefined;
        return row ? row.value : null;
      },
      set(k, v) {
        S('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
      },
      remove(k) {
        S('DELETE FROM meta WHERE key = ?').run(k);
      },
    },

    game: { get: () => gameDoc.read<GameState>(), set: (s) => gameDoc.write(s) },
    engine: { get: () => engineDoc.read<EngineStateRow>(), set: (s) => engineDoc.write(s) },

    companies: {
      all() {
        const rows = S('SELECT json FROM companies ORDER BY id').all() as JsonRow[];
        return rows.map((r) => parse<Company>(r.json));
      },
      get(id) {
        const row = S('SELECT json FROM companies WHERE id = ?').get(id) as JsonRow | undefined;
        return row ? parse<Company>(row.json) : null;
      },
      upsertMany(list) {
        const st = S(
          `INSERT INTO companies (id, ticker, name, sector, json) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET ticker = excluded.ticker, name = excluded.name,
             sector = excluded.sector, json = excluded.json`,
        );
        tx(() => {
          for (const c of list) st.run(c.id, c.ticker, c.name, c.sector, JSON.stringify(c));
        });
      },
      update(id, patch) {
        tx(() => {
          const row = S('SELECT json FROM companies WHERE id = ?').get(id) as JsonRow | undefined;
          if (!row) return;
          const next = { ...parse<Company>(row.json), ...patch };
          S('UPDATE companies SET ticker = ?, name = ?, sector = ?, json = ? WHERE id = ?').run(
            next.ticker,
            next.name,
            next.sector,
            JSON.stringify(next),
            id,
          );
        });
      },
    },

    fundamentals: {
      all() {
        const rows = S('SELECT company_id, json FROM fundamentals').all() as ({ company_id: string } & JsonRow)[];
        const out: Record<string, Fundamentals> = {};
        for (const r of rows) out[r.company_id] = parse<Fundamentals>(r.json);
        return out;
      },
      get(id) {
        const row = S('SELECT json FROM fundamentals WHERE company_id = ?').get(id) as JsonRow | undefined;
        return row ? parse<Fundamentals>(row.json) : null;
      },
      upsertMany(map) {
        const st = S(
          'INSERT INTO fundamentals (company_id, json) VALUES (?, ?) ON CONFLICT(company_id) DO UPDATE SET json = excluded.json',
        );
        tx(() => {
          for (const [id, f] of Object.entries(map)) st.run(id, JSON.stringify(f));
        });
      },
    },

    secrets: {
      all() {
        const rows = S('SELECT company_id, json FROM company_secret').all() as ({ company_id: string } & JsonRow)[];
        const out: Record<string, CompanySecret> = {};
        for (const r of rows) out[r.company_id] = parse<CompanySecret>(r.json);
        return out;
      },
      get(id) {
        const row = S('SELECT json FROM company_secret WHERE company_id = ?').get(id) as JsonRow | undefined;
        return row ? parse<CompanySecret>(row.json) : null;
      },
      upsertMany(map) {
        const st = S(
          'INSERT INTO company_secret (company_id, json) VALUES (?, ?) ON CONFLICT(company_id) DO UPDATE SET json = excluded.json',
        );
        tx(() => {
          for (const [id, s] of Object.entries(map)) st.run(id, JSON.stringify(s));
        });
      },
    },

    history: {
      append(rows) {
        const st = S(
          `INSERT INTO price_history (company_id, tick, price, volume) VALUES (?, ?, ?, ?)
           ON CONFLICT(company_id, tick) DO UPDATE SET price = excluded.price, volume = excluded.volume`,
        );
        tx(() => {
          for (const r of rows) st.run(r.companyId, r.tick, r.price, r.volume);
        });
      },
      range(companyId, from, to) {
        return S(
          'SELECT tick, price, volume FROM price_history WHERE company_id = ? AND tick BETWEEN ? AND ? ORDER BY tick',
        ).all(companyId, from, to) as PricePoint[];
      },
      latestTick(companyId) {
        const row = S('SELECT MAX(tick) AS t FROM price_history WHERE company_id = ?').get(companyId) as
          | { t: number | null }
          | undefined;
        return row?.t ?? -1;
      },
    },

    market: {
      get: () => marketDoc.read<MarketSummary>(),
      set: (m) => marketDoc.write(m),
      appendHistory(tick, value) {
        S('INSERT INTO market_history (tick, value) VALUES (?, ?) ON CONFLICT(tick) DO UPDATE SET value = excluded.value').run(
          tick,
          value,
        );
      },
      historyRange(from, to) {
        return S('SELECT tick, value FROM market_history WHERE tick BETWEEN ? AND ? ORDER BY tick').all(
          from,
          to,
        ) as ValuePoint[];
      },
    },

    crews: {
      all() {
        return (S('SELECT * FROM crews ORDER BY name, id').all() as CrewSqlRow[]).map(toTeam);
      },
      get(id) {
        const row = S('SELECT * FROM crews WHERE id = ?').get(id) as CrewSqlRow | undefined;
        return row ? toTeam(row) : null;
      },
      byName(name) {
        const row = S('SELECT * FROM crews WHERE name = ? COLLATE NOCASE').get(name) as CrewSqlRow | undefined;
        return row ? toTeam(row) : null;
      },
      create(row) {
        const capital = row.startingCapital;
        S(
          `INSERT INTO crews (id, name, password_hash, cash, total_value, rank, realized_pnl, fees_paid,
             trade_count, trading_disabled, session_open_value, session_start_rank, holdings_count,
             token_version, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, 0, 0, 1, ?)`,
        ).run(row.id, row.name, row.passwordHash, capital, capital, capital, row.createdAt ?? Date.now());
      },
      update(id, patch) {
        const sets: string[] = [];
        const values: (string | number)[] = [];
        for (const [key, value] of Object.entries(patch)) {
          const column = CREW_COLUMNS[key as keyof CrewRow];
          if (!column || value === undefined) continue;
          sets.push(`${column} = ?`);
          values.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number));
        }
        if (sets.length === 0) return;
        values.push(id);
        S(`UPDATE crews SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      },
      remove(id) {
        // Everything keyed by the crew goes in one transaction: a half-removed crew would leave
        // an orphan holding in the standings, or an order whose clientOrderId blocks a later one.
        tx(() => {
          S('DELETE FROM holdings WHERE crew_id = ?').run(id);
          S('DELETE FROM crew_history WHERE crew_id = ?').run(id);
          S('DELETE FROM crew_stats WHERE crew_id = ?').run(id);
          S('DELETE FROM trades WHERE crew_id = ?').run(id);
          S('DELETE FROM orders WHERE crew_id = ?').run(id);
          S('DELETE FROM crews WHERE id = ?').run(id);
        });
      },
      passwordHash(id) {
        const row = S('SELECT password_hash FROM crews WHERE id = ?').get(id) as { password_hash: string } | undefined;
        return row ? row.password_hash : null;
      },
      tokenVersion(id) {
        const row = S('SELECT token_version FROM crews WHERE id = ?').get(id) as { token_version: number } | undefined;
        return row ? row.token_version : null;
      },
      bumpTokenVersion(id) {
        return tx(() => {
          S('UPDATE crews SET token_version = token_version + 1 WHERE id = ?').run(id);
          const row = S('SELECT token_version FROM crews WHERE id = ?').get(id) as { token_version: number } | undefined;
          return row ? row.token_version : 0;
        });
      },
    },

    holdings: {
      forCrew(id) {
        return S('SELECT company_id AS companyId, shares, avg_cost AS avgCost FROM holdings WHERE crew_id = ? ORDER BY company_id').all(
          id,
        ) as Holding[];
      },
      get(crewId, companyId) {
        const row = S(
          'SELECT company_id AS companyId, shares, avg_cost AS avgCost FROM holdings WHERE crew_id = ? AND company_id = ?',
        ).get(crewId, companyId) as Holding | undefined;
        return row ?? null;
      },
      upsert(crewId, h) {
        S(
          `INSERT INTO holdings (crew_id, company_id, shares, avg_cost) VALUES (?, ?, ?, ?)
           ON CONFLICT(crew_id, company_id) DO UPDATE SET shares = excluded.shares, avg_cost = excluded.avg_cost`,
        ).run(crewId, h.companyId, h.shares, h.avgCost);
      },
      remove(crewId, companyId) {
        S('DELETE FROM holdings WHERE crew_id = ? AND company_id = ?').run(crewId, companyId);
      },
      all() {
        const rows = S(
          'SELECT crew_id AS crewId, company_id AS companyId, shares, avg_cost AS avgCost FROM holdings ORDER BY crew_id, company_id',
        ).all() as ({ crewId: string } & Holding)[];
        const out: Record<string, Holding[]> = {};
        for (const { crewId, ...h } of rows) (out[crewId] ??= []).push(h);
        return out;
      },
    },

    crewHistory: {
      append(rows) {
        const st = S(
          `INSERT INTO crew_history (crew_id, tick, value) VALUES (?, ?, ?)
           ON CONFLICT(crew_id, tick) DO UPDATE SET value = excluded.value`,
        );
        tx(() => {
          for (const r of rows) st.run(r.crewId, r.tick, r.value);
        });
      },
      range(crewId, from, to) {
        return S('SELECT tick, value FROM crew_history WHERE crew_id = ? AND tick BETWEEN ? AND ? ORDER BY tick').all(
          crewId,
          from,
          to,
        ) as ValuePoint[];
      },
      series(crewId) {
        const rows = S('SELECT value FROM crew_history WHERE crew_id = ? ORDER BY tick').all(crewId) as {
          value: number;
        }[];
        return rows.map((r) => r.value);
      },
    },

    crewStats: {
      add(crewId, exposure, weight) {
        S(
          `INSERT INTO crew_stats (crew_id, exposure, weight) VALUES (?, ?, ?)
           ON CONFLICT(crew_id) DO UPDATE SET exposure = crew_stats.exposure + excluded.exposure,
             weight = crew_stats.weight + excluded.weight`,
        ).run(crewId, exposure, weight);
      },
      get(crewId) {
        const row = S('SELECT exposure, weight FROM crew_stats WHERE crew_id = ?').get(crewId) as
          | { exposure: number; weight: number }
          | undefined;
        return row ?? { exposure: 0, weight: 0 };
      },
    },

    trades: {
      insert(t) {
        S(
          `INSERT INTO trades (id, crew_id, company_id, side, quantity, price, last_price, impact_bps, fee,
             realized_pnl, executed_at, tick, cash_after, shares_after, client_order_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        ).run(
          t.id,
          t.teamId,
          t.companyId,
          t.side,
          t.quantity,
          t.price,
          t.lastPrice,
          t.impactBps,
          t.fee,
          t.realizedPnl,
          t.executedAt,
          t.tick,
          t.cashAfter,
          t.sharesAfter,
          t.clientOrderId,
        );
      },
      forCrew(id, limit) {
        return (
          S('SELECT * FROM trades WHERE crew_id = ? ORDER BY executed_at DESC, id DESC LIMIT ?').all(
            id,
            limit,
          ) as TradeSqlRow[]
        ).map(toTrade);
      },
      sinceTick(tick) {
        return (
          S('SELECT * FROM trades WHERE tick >= ? ORDER BY executed_at, id').all(tick) as TradeSqlRow[]
        ).map(toTrade);
      },
      recent(limit) {
        return (
          S('SELECT * FROM trades ORDER BY executed_at DESC, id DESC LIMIT ?').all(limit) as TradeSqlRow[]
        ).map(toTrade);
      },
    },

    orders: {
      insert(o) {
        S(
          `INSERT INTO orders (id, crew_id, client_order_id, company_id, side, quantity, status, code, reason,
             trade_id, created_at, tick)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET status = excluded.status, code = excluded.code, reason = excluded.reason,
             trade_id = excluded.trade_id, created_at = excluded.created_at, tick = excluded.tick`,
        ).run(
          o.id,
          o.teamId,
          o.clientOrderId,
          o.companyId,
          o.side,
          o.quantity,
          o.status,
          o.code ?? null,
          o.reason ?? null,
          o.tradeId ?? null,
          o.createdAt,
          o.tick,
        );
      },
      byClientId(crewId, clientOrderId) {
        const row = S('SELECT * FROM orders WHERE crew_id = ? AND client_order_id = ?').get(crewId, clientOrderId) as
          | OrderSqlRow
          | undefined;
        return row ? toOrder(row) : null;
      },
      forCrew(id, limit) {
        return (
          S('SELECT * FROM orders WHERE crew_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(
            id,
            limit,
          ) as OrderSqlRow[]
        ).map(toOrder);
      },
    },

    news: {
      insert(events) {
        const st = S(
          `INSERT INTO news (id, tick, fired_at, json) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET tick = excluded.tick, fired_at = excluded.fired_at, json = excluded.json`,
        );
        tx(() => {
          for (const n of events) st.run(n.id, n.tick, n.firedAt, JSON.stringify(n));
        });
      },
      recent(limit) {
        const rows = S('SELECT json FROM news ORDER BY fired_at DESC, id DESC LIMIT ?').all(limit) as JsonRow[];
        return rows.map((r) => parse<NewsEvent>(r.json));
      },
      forCompany(id, limit) {
        const rows = S(
          `SELECT json FROM news n
           WHERE EXISTS (SELECT 1 FROM json_each(n.json, '$.companyIds') WHERE json_each.value = ?)
           ORDER BY fired_at DESC, id DESC LIMIT ?`,
        ).all(id, limit) as JsonRow[];
        return rows.map((r) => parse<NewsEvent>(r.json));
      },
    },

    newsSchedule: {
      set(events) {
        const st = S('INSERT INTO news_schedule (json, fired) VALUES (?, 0)');
        tx(() => {
          S('DELETE FROM news_schedule').run();
          for (const e of events) st.run(JSON.stringify(e));
        });
      },
      all() {
        const rows = S('SELECT id, json, fired FROM news_schedule ORDER BY id').all() as ({
          id: number;
          fired: number;
        } & JsonRow)[];
        return rows.map((r) => ({
          ...parse<Omit<StoredScheduledEvent, 'rowId' | 'fired'>>(r.json),
          rowId: r.id,
          fired: r.fired === 1,
        }));
      },
      markFired(ids) {
        const st = S('UPDATE news_schedule SET fired = 1 WHERE id = ?');
        tx(() => {
          for (const id of ids) st.run(id);
        });
      },
    },

    leaderboard: { get: () => leaderboardDoc.read<Leaderboard>(), set: (l) => leaderboardDoc.write(l) },

    audit: {
      add(action, actor, payload) {
        try {
          S('INSERT INTO audit_log (action, actor, payload, timestamp) VALUES (?, ?, ?, ?)').run(
            action,
            actor,
            JSON.stringify(payload ?? {}),
            Date.now(),
          );
        } catch (err) {
          // Logging must never break gameplay.
          console.error('[audit] failed to write log', action, err);
        }
      },
      recent(limit) {
        const rows = S('SELECT id, action, actor, payload, timestamp FROM audit_log ORDER BY timestamp DESC, id DESC LIMIT ?').all(
          limit,
        ) as { id: number; action: string; actor: string; payload: string; timestamp: number }[];
        return rows.map((r) => ({
          id: r.id,
          action: r.action,
          actor: r.actor,
          payload: parse<Record<string, unknown>>(r.payload),
          timestamp: r.timestamp,
        }));
      },
    },

    clearDynamic(opts) {
      if (!Number.isInteger(opts.startingCapital) || opts.startingCapital < 0) {
        throw new Error(`clearDynamic: startingCapital must be a non-negative integer (got ${opts.startingCapital})`);
      }
      tx(() => {
        for (const table of DYNAMIC_TABLES) S(`DELETE FROM ${table}`).run();
        for (const key of MARKET_META_KEYS) S('DELETE FROM meta WHERE key = ?').run(key);
        if (opts.keepCrews) {
          S(
            `UPDATE crews SET cash = ?, total_value = ?, session_open_value = ?, rank = 0, realized_pnl = 0,
               fees_paid = 0, trade_count = 0, holdings_count = 0, session_start_rank = 0`,
          ).run(opts.startingCapital, opts.startingCapital, opts.startingCapital);
        } else {
          S('DELETE FROM crews').run();
        }
      });
    },

    close() {
      cache.clear();
      db.close();
    },
  };

  return store;
}

// ─── process singleton ───────────────────────────────────────────────────────

let current: Store | null = null;

/** The process-wide store, opened on first use. */
export function getStore(): Store {
  return (current ??= openStore());
}

/**
 * Replaces the process store (tests: `useStore(openStore(':memory:'))`).
 * Passing null drops the reference so the next `getStore()` opens a fresh one.
 * The previous store is NOT closed — the caller owns it.
 */
export function useStore(next: Store | null): void {
  current = next;
}

/** Closes and drops the process store, if one is open. */
export function closeStore(): void {
  current?.close();
  current = null;
}

/**
 * The process store as a plain object. Every property access resolves through
 * `getStore()`, so importing this module never opens a database — the first
 * actual use does.
 */
export const store: Store = new Proxy({} as Store, {
  get(_target, prop: string | symbol) {
    const value = (getStore() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(getStore()) : value;
  },
  set(_target, prop: string | symbol, value: unknown) {
    (getStore() as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
  has(_target, prop: string | symbol) {
    return prop in (getStore() as unknown as object);
  },
});
