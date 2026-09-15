/**
 * Guard: client hooks and libs must never reference server-only Firestore paths
 * (`_engine`, `_schedule`, `_teamStats`, `_auth`, `logs`). Rules deny them anyway; this
 * keeps a listener from ever being written against them.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FORBIDDEN = /['"`/](_engine|_schedule|_teamStats|_auth)\b|['"`]logs['"`/]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.|testutil/.test(e.name) ? [p] : [];
  });
}

describe('server-only paths', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const dir of ['hooks', 'lib', 'components', 'dev', 'theme']) {
    it(`src/${dir} never references them`, () => {
      const offenders = sources(join(root, dir)).filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }

  // Every Firestore read goes through the audited hooks in src/hooks, so a component or lib can
  // never open its own listener on a path these checks have not seen.
  for (const dir of ['lib', 'components', 'dev', 'theme']) {
    it(`src/${dir} does not import firebase/firestore directly`, () => {
      const offenders = sources(join(root, dir)).filter((file) => /from\s+['"]firebase\/firestore['"]/.test(readFileSync(file, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});
