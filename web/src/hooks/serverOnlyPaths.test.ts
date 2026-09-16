/**
 * Guards on what the phone is allowed to reach.
 *
 * - No Firebase anywhere in the web client: the app talks only to the authority server.
 * - No server-only names (`_engine`, `_schedule`, `_teamStats`, `_auth`) and no `/api/admin/*` route
 *   outside src/hooks: the host reads go through the audited hooks, and a crew screen can never
 *   open its own request against a route the rules would deny.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SERVER_ONLY = /['"`/](_engine|_schedule|_teamStats|_auth)\b/;
const ADMIN_READ = /apiGet\s*(<[^>]*>)?\s*\(\s*[`'"]\/admin\//;
const FIREBASE = /from\s+['"]firebase(\/[\w-]+)?['"]|firebase\/firestore|initializeApp\(/;

function sources(dir: string, withTests = false): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p, withTests);
    if (!/\.(ts|tsx)$/.test(e.name)) return [];
    return withTests || !/\.test\.|testutil/.test(e.name) ? [p] : [];
  });
}

const root = fileURLToPath(new URL('..', import.meta.url));
const ALL = ['hooks', 'lib', 'components', 'pages', 'shell', 'sheets', 'dev', 'theme'];
const dirs = ALL.filter((d) => {
  try {
    return readdirSync(join(root, d)).length > 0;
  } catch {
    return false;
  }
});

describe('no Firebase in the web client', () => {
  it('scans the sources', () => {
    expect(dirs.length).toBeGreaterThan(3);
  });

  for (const dir of dirs) {
    it(`src/${dir} imports no firebase package`, () => {
      const offenders = sources(join(root, dir), true).filter((file) => FIREBASE.test(readFileSync(file, 'utf8')));
      expect(offenders.map((f) => f.slice(root.length))).toEqual([]);
    });
  }
});

describe('server-only surfaces', () => {
  for (const dir of dirs) {
    it(`src/${dir} never names a server-only collection`, () => {
      const offenders = sources(join(root, dir)).filter((file) => SERVER_ONLY.test(readFileSync(file, 'utf8')));
      expect(offenders.map((f) => f.slice(root.length))).toEqual([]);
    });
  }

  it('host list reads live only in src/hooks', () => {
    // Host mutations are posted from the console screens, but the host *reads* (teams, tape,
    // holdings, market, logs) all go through the audited hooks, so there is one place to check.
    const outside = dirs
      .filter((d) => d !== 'hooks')
      .flatMap((d) => sources(join(root, d)))
      .filter((file) => ADMIN_READ.test(readFileSync(file, 'utf8')));
    expect(outside.map((f) => f.slice(root.length))).toEqual([]);
  });
});
