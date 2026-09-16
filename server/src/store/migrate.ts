/**
 * Schema application. `schema.sql` is written to be idempotent, so `migrate()`
 * runs at every open; the applied version is recorded in `meta.schema_version`.
 *
 * Adding a table or an index: edit `schema.sql` (keep every statement
 * IF NOT EXISTS) and bump SCHEMA_VERSION. A change that rewrites existing rows
 * needs a step in MIGRATIONS, keyed by the version it upgrades TO.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';

/** Current schema version; recorded in `meta.schema_version`. */
export const SCHEMA_VERSION = 3;

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

let cachedSchema: string | undefined;

/** The DDL text (read once per process). */
export function schemaSql(): string {
  return (cachedSchema ??= readFileSync(SCHEMA_PATH, 'utf8'));
}

/** True when `table` already has `column` (CREATE TABLE IF NOT EXISTS never adds one). */
function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/**
 * Row-rewriting steps, keyed by the version they upgrade TO. v2 added the `funds` and
 * `fund_secret` tables; both are created empty by the DDL and filled by the next market,
 * so no row rewrite is needed.
 */
const MIGRATIONS: Record<number, (db: Database) => void> = {
  /**
   * v3: `crews.intro_completed_at` — the "Meet the market" gate (design §6). The DDL only adds
   * it to a crews table it creates, so an existing database gets it here.
   *
   * Back-fill: a crew that has ALREADY TRADED counts as done, everyone else does not. A server
   * restart or redeploy in the middle of a game must never lock a crew out of a competition it
   * is playing; a crew the host created for a session that has not started yet has never seen
   * the intro, and running it in the lobby costs the game nothing. The host can mark any crew
   * complete (POST /api/admin/teams/:id/intro) for whatever this rule gets wrong.
   */
  3: (db) => {
    if (!hasColumn(db, 'crews', 'intro_completed_at')) {
      db.exec('ALTER TABLE crews ADD COLUMN intro_completed_at INTEGER');
    }
    db.prepare('UPDATE crews SET intro_completed_at = ? WHERE intro_completed_at IS NULL AND trade_count > 0').run(
      Date.now(),
    );
  },
};

function readVersion(db: Database): number {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value?: string } | undefined;
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Applies the DDL and any pending row migrations, then stores SCHEMA_VERSION.
 * Everything happens in one transaction, so a half-applied schema is impossible.
 * Returns the version the database was on before this call.
 */
export function migrate(db: Database): number {
  return db.transaction(() => {
    db.exec(schemaSql());
    const from = readVersion(db);
    for (let v = from + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v]?.(db);
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      'schema_version',
      String(SCHEMA_VERSION),
    );
    return from;
  }).immediate();
}
