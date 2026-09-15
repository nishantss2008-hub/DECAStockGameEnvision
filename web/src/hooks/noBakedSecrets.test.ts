/**
 * Guard: the web client ships to every student's phone, so no Firebase web API key, real project
 * id, service-account material or other credential may be written into its sources. Real config
 * comes only from VITE_* environment variables at build time (web/.env is git-ignored).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FORBIDDEN: Array<[string, RegExp]> = [
  ['Firebase web API key', /AIza[0-9A-Za-z_-]{35}/],
  ['real Firebase project id', /decastockenvision/i],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['service-account field', /["']private_key(_id)?["']\s*:/],
  ['service-account email', /[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/i],
];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|tsx|js|mjs|mts|css|html|json)$/.test(e.name) ? [p] : [];
  });
}

describe('no credentials or real project ids in the web client sources', () => {
  const web = fileURLToPath(new URL('../..', import.meta.url));
  const sources = [
    ...files(join(web, 'src')),
    ...files(join(web, 'scripts')),
    ...['index.html', 'kit.html', 'vite.config.ts', 'vitest.config.ts', 'package.json'].map((f) => join(web, f)).filter((f) => existsSync(f)),
  ];

  it('scans the sources', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  for (const [name, pattern] of FORBIDDEN) {
    it(`contains no ${name}`, () => {
      const offenders = sources.filter((file) => !file.endsWith('noBakedSecrets.test.ts') && pattern.test(readFileSync(file, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});
