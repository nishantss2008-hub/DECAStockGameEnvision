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
export const SCHEMA_VERSION = 1;

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

let cachedSchema: string | undefined;

/** The DDL text (read once per process). */
export function schemaSql(): string {
  return (cachedSchema ??= readFileSync(SCHEMA_PATH, 'utf8'));
}

/** Row-rewriting steps, keyed by the version they upgrade TO. Empty at v1. */
const MIGRATIONS: Record<number, (db: Database) => void> = {};

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
