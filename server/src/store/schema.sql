-- Buccaneer Exchange — server-owned SQLite schema (plan 2026-09-15-drop-firebase §A1).
--
-- Every statement is idempotent (CREATE ... IF NOT EXISTS), so migrate.ts can run
-- it at every boot. Money is INTEGER cents; fractions (index values, exposure
-- weights) are REAL. Anything without a fixed shape lives in a `json` TEXT column.
--
-- HIDDEN DATA: `company_secret`, `news_schedule` and `meta` (the seed) are
-- server-only. No route may return them before phase 'ended'.

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_state (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engine_state (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id     TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name   TEXT NOT NULL,
  sector TEXT NOT NULL,
  json   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fundamentals (
  company_id TEXT PRIMARY KEY,
  json       TEXT NOT NULL
);

-- q, qEff, surprise, quality, grade, pillars, idioVol, beta, adv, startPriceCents.
CREATE TABLE IF NOT EXISTS company_secret (
  company_id TEXT PRIMARY KEY,
  json       TEXT NOT NULL
);

-- Tradeable funds: a basket of companies, priced from what it holds. `json` is the public
-- `Fund` document, holdings and weights included (those are PUBLIC by design).
CREATE TABLE IF NOT EXISTS funds (
  id     TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name   TEXT NOT NULL,
  json   TEXT NOT NULL
);

-- Server-only: a fund's value-weighted q, qEff and quality. Never before phase 'ended'.
CREATE TABLE IF NOT EXISTS fund_secret (
  fund_id TEXT PRIMARY KEY,
  json    TEXT NOT NULL
);

-- Companies AND funds: a fund's quote is a row here like any other instrument's.
CREATE TABLE IF NOT EXISTS price_history (
  company_id TEXT    NOT NULL,
  tick       INTEGER NOT NULL,
  price      INTEGER NOT NULL,
  volume     INTEGER NOT NULL,
  PRIMARY KEY (company_id, tick)
);
CREATE INDEX IF NOT EXISTS price_history_tick ON price_history (tick);

CREATE TABLE IF NOT EXISTS market_summary (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_history (
  tick  INTEGER PRIMARY KEY,
  value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS crews (
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
  created_at         INTEGER NOT NULL,
  -- Epoch ms the crew finished the required-once "Meet the market" intro; NULL until then.
  -- Gates POST /orders only (browsing is always allowed). A crews table created before v3
  -- gains this column through MIGRATIONS[3] in migrate.ts, not through this DDL.
  intro_completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS holdings (
  crew_id    TEXT    NOT NULL,
  company_id TEXT    NOT NULL,
  shares     INTEGER NOT NULL,
  avg_cost   INTEGER NOT NULL,
  PRIMARY KEY (crew_id, company_id)
);

CREATE TABLE IF NOT EXISTS crew_history (
  crew_id TEXT    NOT NULL,
  tick    INTEGER NOT NULL,
  value   INTEGER NOT NULL,
  PRIMARY KEY (crew_id, tick)
);

CREATE TABLE IF NOT EXISTS crew_stats (
  crew_id  TEXT PRIMARY KEY,
  exposure REAL NOT NULL DEFAULT 0,
  weight   REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trades (
  id              TEXT PRIMARY KEY,
  crew_id         TEXT    NOT NULL,
  company_id      TEXT    NOT NULL,
  side            TEXT    NOT NULL,
  quantity        INTEGER NOT NULL,
  price           INTEGER NOT NULL,
  last_price      INTEGER NOT NULL,
  impact_bps      INTEGER NOT NULL,
  fee             INTEGER NOT NULL,
  realized_pnl    INTEGER NOT NULL,
  executed_at     INTEGER NOT NULL,
  tick            INTEGER NOT NULL,
  cash_after      INTEGER NOT NULL,
  shares_after    INTEGER NOT NULL,
  client_order_id TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_crew_executed ON trades (crew_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS trades_tick ON trades (tick);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  crew_id         TEXT    NOT NULL,
  client_order_id TEXT    NOT NULL,
  company_id      TEXT    NOT NULL,
  side            TEXT    NOT NULL,
  quantity        INTEGER NOT NULL,
  status          TEXT    NOT NULL,
  code            TEXT,
  reason          TEXT,
  trade_id        TEXT,
  created_at      INTEGER NOT NULL,
  tick            INTEGER NOT NULL,
  UNIQUE (crew_id, client_order_id)
);
CREATE INDEX IF NOT EXISTS orders_crew_created ON orders (crew_id, created_at DESC);

-- Public news: rows appear only once the event has fired.
CREATE TABLE IF NOT EXISTS news (
  id       TEXT PRIMARY KEY,
  tick     INTEGER NOT NULL,
  fired_at INTEGER NOT NULL,
  json     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS news_fired_at ON news (fired_at DESC);

-- Server-only: the whole future news schedule, magnitudes included.
CREATE TABLE IF NOT EXISTS news_schedule (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  json  TEXT NOT NULL,
  fired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  action    TEXT    NOT NULL,
  actor     TEXT    NOT NULL,
  payload   TEXT    NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_timestamp ON audit_log (timestamp DESC);
