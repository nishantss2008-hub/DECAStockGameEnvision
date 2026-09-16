/**
 * `fundCopy.ts` is COPY.md §13 `funds-extra`, verbatim. This re-reads COPY.md and fails when the
 * two drift — the same contract `server/test/copySync.test.ts` enforces for the server's strings.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FUNDS_EXTRA, MARKETS_EXTRA } from './fundCopy';

const COPY = readFileSync(fileURLToPath(new URL('../../../docs/design/COPY.md', import.meta.url)), 'utf8');

/** key → field → string, from a ```yaml <kind> block (top-level keys, 2-space quoted fields). */
function block(kind: string): Record<string, Record<string, string>> {
  const m = new RegExp('```yaml ' + kind + '\\n([\\s\\S]*?)\\n```').exec(COPY);
  if (!m) throw new Error(`COPY.md has no yaml ${kind} block`);
  const out: Record<string, Record<string, string>> = {};
  let key = '';
  for (const line of m[1]!.split('\n')) {
    const top = /^([a-z_-]+):\s*$/.exec(line);
    if (top) {
      key = top[1]!;
      out[key] = {};
      continue;
    }
    const field = /^ {2}([A-Za-z]+):\s*(".*")\s*$/.exec(line);
    if (field && key) out[key]![field[1]!] = JSON.parse(field[2]!) as string;
  }
  return out;
}

describe('COPY.md §13 funds-extra', () => {
  const copy = block('funds-extra');

  it('is what the web ships, verbatim', () => {
    expect(FUNDS_EXTRA).toEqual(copy);
  });

  it('covers the three blocks the fund screens use', () => {
    expect(Object.keys(copy).sort()).toEqual(['fund', 'holdings', 'trading']);
  });

  it('never calls a fund safe, safer, better or the right choice (COPY §13 rule)', () => {
    for (const [key, fields] of Object.entries(copy)) {
      for (const [field, text] of Object.entries(fields)) {
        expect(text, `${key}.${field}`).not.toMatch(/\bsafer?\b|\bbetter\b|\bbest\b|\bright choice\b|\bshould buy\b/i);
      }
    }
  });

  it('keeps saying that a fund is a basket whose price is its holdings added together', () => {
    expect(FUNDS_EXTRA.fund.whatItIs).toContain('basket');
    expect(FUNDS_EXTRA.fund.whyItMatters).toContain('added together');
    expect(FUNDS_EXTRA.fund.noNews).toContain('no news of its own');
  });

  it('obeys COPY §0.5 sentence length (≤25 words a sentence, ≤32 a field)', () => {
    for (const [key, fields] of Object.entries(copy)) {
      for (const [field, text] of Object.entries(fields)) {
        expect(text.split(/\s+/).length, `${key}.${field}`).toBeLessThanOrEqual(32);
        for (const sentence of text.split(/(?<=\.)\s+/)) {
          expect(sentence.split(/\s+/).length, `${key}.${field}: ${sentence}`).toBeLessThanOrEqual(25);
        }
      }
    }
  });
});

describe('COPY.md §13.1 markets-extra', () => {
  const copy = block('markets-extra');

  it('is what the Markets list and Compare ship, verbatim', () => {
    expect(MARKETS_EXTRA).toEqual(copy);
  });

  it('keeps the roster count a placeholder, never a literal', () => {
    expect(MARKETS_EXTRA.list.searchPlaceholder).toContain('{n}');
    expect(MARKETS_EXTRA.list.searchPlaceholder).not.toMatch(/\d/);
    expect(MARKETS_EXTRA.list.seeGroup).toContain('{sector}');
  });

  it('names both kinds in the search placeholder, because search covers both', () => {
    expect(MARKETS_EXTRA.list.searchPlaceholder).toMatch(/companies and funds/);
    expect(MARKETS_EXTRA.list.searchEmptyBody).toMatch(/FLEET/);
  });
});
