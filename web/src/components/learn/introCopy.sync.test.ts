/**
 * `introCopy.ts` is COPY.md §14, verbatim, and the names, tickers and sectors in it are the seed
 * roster's. This re-reads both files and fails when any of the three drift — the contract
 * `fundCopy.sync.test.ts` keeps for the fund strings and `server/test/copySync.test.ts` for the
 * server's. It also holds the §14 copy rules: no verdicts and no hidden data, anywhere.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SECTORS } from '@deca/shared';
import { extractBlocks } from '../../../scripts/build-glossary.mjs';
import { sectorSlug } from '../../lib/sector';
import { INTRO, INTRO_COMPANIES, INTRO_HOST, INTRO_SECTORS, INTRO_STAGES } from './introCopy';

const repoFile = (path: string) => readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');

const BLOCKS = extractBlocks(repoFile('docs/design/COPY.md'));
const block = (kind: string): Record<string, unknown> => {
  const found = BLOCKS.filter((b) => b.kind === kind);
  expect(found, `COPY.md has exactly one yaml ${kind} block`).toHaveLength(1);
  return found[0]!.data as Record<string, unknown>;
};

/** The seed roster, read as text: the web workspace does not depend on the server package. */
const ROSTER = [
  ...repoFile('server/src/seed/roster.ts').matchAll(
    /\{\s*id:\s*'[^']*',\s*name:\s*'([^']*)',\s*ticker:\s*'([A-Z]+)',\s*sector:\s*'([^']*)'\s*\}/g,
  ),
].map(([, name, ticker, sector]) => ({ name: name!, ticker: ticker!, sector: sector! }));

/** Every string §14 ships, as `path → text`, for the rules that apply to all of them. */
function everyField(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(INTRO)) out.push([`intro.${key}`, value]);
  for (const [key, value] of Object.entries(INTRO_HOST)) out.push([`intro-host.${key}`, value]);
  for (const stage of INTRO_STAGES) {
    out.push([`${stage.id}.title`, stage.title], [`${stage.id}.body`, stage.body]);
    stage.points.forEach((p, i) => out.push([`${stage.id}.points[${i}]`, p]));
  }
  for (const [slug, s] of Object.entries(INTRO_SECTORS)) out.push([`${slug}.body`, s.body]);
  for (const [ticker, c] of Object.entries(INTRO_COMPANIES)) out.push([`${ticker}.description`, c.description]);
  return out;
}

describe('COPY.md §14 is what the web ships', () => {
  it('reads the roster file it claims to follow', () => {
    expect(ROSTER).toHaveLength(15);
  });

  it('is verbatim: chrome, host strings, stages, sectors and companies', () => {
    expect(INTRO).toEqual(block('intro'));
    expect(INTRO_HOST).toEqual(block('intro-host'));
    expect(INTRO_SECTORS).toEqual(block('intro-sectors'));
    expect(INTRO_COMPANIES).toEqual(block('intro-companies'));
    expect(INTRO_STAGES).toEqual(BLOCKS.filter((b) => b.kind === 'intro-stage').map((b) => b.data));
  });

  it('has the five non-sector cards design §6 fixes', () => {
    expect(INTRO_STAGES.map((s) => s.id)).toEqual(['goal', 'share', 'composite', 'funds', 'done']);
  });

  it('covers every sector once, keyed by its slug and naming it verbatim', () => {
    expect(Object.keys(INTRO_SECTORS).sort()).toEqual(SECTORS.map(sectorSlug).sort());
    for (const sector of SECTORS) expect(INTRO_SECTORS[sectorSlug(sector)]!.sector).toBe(sector);
  });
});

describe('COPY.md §14 company one-liners follow the seed roster', () => {
  it('names every company, and only those companies, with the roster spelling', () => {
    expect(Object.keys(INTRO_COMPANIES).sort()).toEqual(ROSTER.map((r) => r.ticker).sort());
    for (const entry of ROSTER) {
      const copy = INTRO_COMPANIES[entry.ticker]!;
      expect(copy.name, entry.ticker).toBe(entry.name);
      expect(copy.sector, entry.ticker).toBe(entry.sector);
    }
  });

  it('gives every sector exactly three companies, so every sector card is full', () => {
    for (const sector of SECTORS) {
      const members = Object.values(INTRO_COMPANIES).filter((c) => c.sector === sector);
      expect(members, sector).toHaveLength(3);
    }
  });

  it('writes a real description for each, not the seed placeholder "{name} — {sector}."', () => {
    for (const [ticker, c] of Object.entries(INTRO_COMPANIES)) {
      expect(c.description.length, ticker).toBeGreaterThan(30);
      expect(c.description, ticker).not.toContain(c.name);
      expect(c.description, ticker).not.toContain(c.sector);
      expect(c.description, ticker).not.toContain('—');
    }
  });
});

describe('COPY.md §14 copy rules', () => {
  it('obeys §0.5 sentence length (≤25 words a sentence, ≤32 a field)', () => {
    for (const [key, text] of everyField()) {
      expect(text.split(/\s+/).length, key).toBeLessThanOrEqual(32);
      for (const sentence of text.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length, `${key}: ${sentence}`).toBeLessThanOrEqual(25);
      }
    }
  });

  it('never hints at whether something is worth buying (§0.5 rule 6)', () => {
    const verdict = /\b(best|better|safer?|cheap(er|est)?|strong(er|est)?|leading|winner|should buy|good (buy|bet|choice)|worth buying)\b/i;
    for (const [key, text] of everyField()) expect(text, key).not.toMatch(verdict);
  });

  it('never leaks hidden data: no quality, grade, fair value or health score', () => {
    const hidden = /\b(quality|grade[ds]?|fair value|health score|hidden surprise)\b/i;
    for (const [key, text] of everyField()) expect(text, key).not.toMatch(hidden);
  });

  it('is honest that Skip only postpones the intro, and says what it costs', () => {
    expect(INTRO.skip.toLowerCase()).toContain('later');
    expect(INTRO.skipNote).toMatch(/first trade/);
    expect(INTRO.skipBody).toMatch(/first order/);
    expect(INTRO.skipConfirm.toLowerCase()).not.toMatch(/never|skip forever/);
  });

  it('tells the host why the override exists, and offers an undo', () => {
    expect(INTRO_HOST.note).toMatch(/phone died/);
    expect(INTRO_HOST.undo).toBe('Undo');
  });
});
