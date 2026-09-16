/**
 * Server-sent copy stays in step with docs/design/COPY.md (the single source of truth).
 *
 * COPY.md §0.1: data lives in fenced ```yaml <kind> blocks. The blocks read here are flat
 * maps of error codes to quoted strings, so a tiny reader is enough (no YAML dependency).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FUND_DEFS } from '../src/seed/funds';
import { HOST_ERRORS } from '../src/lib/hostCopy';
import { engineMessages } from '../src/engine/loopHelpers';
import { CrewError, crewError } from '../src/services/crews';
import { tradeError, tradeErrorFromEngine } from '../src/services/trading';

const COPY = readFileSync(fileURLToPath(new URL('../../docs/design/COPY.md', import.meta.url)), 'utf8');

/** key → field → string, from a ```yaml <kind> block (top-level keys, 2-space quoted fields). */
function block(kind: string): Record<string, Record<string, string>> {
  const m = new RegExp('```yaml ' + kind + '\\n([\\s\\S]*?)\\n```').exec(COPY);
  if (!m) throw new Error(`COPY.md has no yaml ${kind} block`);
  const out: Record<string, Record<string, string>> = {};
  let code = '';
  for (const line of m[1]!.split('\n')) {
    const top = /^([a-z_-]+):\s*$/.exec(line);
    if (top) {
      code = top[1]!;
      out[code] = {};
      continue;
    }
    const field = /^ {2}([A-Za-z]+):\s*(".*")\s*$/.exec(line);
    if (field && code) out[code]![field[1]!] = JSON.parse(field[2]!) as string;
  }
  return out;
}

describe('COPY.md §11 host-errors', () => {
  const copy = block('host-errors');

  it('has plain wording for every host error the server sends', () => {
    expect(Object.keys(copy).sort()).toEqual(['bad_name', 'bad_request', 'busy', 'exists', 'internal', 'not_found']);
    for (const [code, c] of Object.entries(copy)) {
      expect(c.title, code).toBeTruthy();
      expect(c.message, code).toBeTruthy();
      // COPY §0.5: sentences of at most 25 words, no field over 32 words.
      expect(c.message!.split(/\s+/).length, code).toBeLessThanOrEqual(32);
      for (const sentence of c.message!.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length, `${code}: ${sentence}`).toBeLessThanOrEqual(25);
    }
  });

  it('the server copy module is COPY.md verbatim', () => {
    expect(HOST_ERRORS).toEqual(copy);
  });

  it('crew errors carry the COPY message', () => {
    for (const code of ['exists', 'bad_name', 'not_found'] as const) {
      const err = crewError(code);
      expect(err).toBeInstanceOf(CrewError);
      expect(err.message).toBe(copy[code]!.message);
    }
  });
});

describe('COPY.md §9 interval_limit seconds', () => {
  const copy = block('ticket-errors').interval_limit!;
  const fill = (t: string, seconds: string) => t.replace('{cap}', '1,613,333').replace('{ticker}', 'KRKN').replace('{seconds}', seconds);

  it('has a one-second variant, and the engine and ticket errors use each form', () => {
    expect(copy.messageOneSecond).toBe(copy.message!.replace('about {seconds} seconds', 'about 1 second'));
    expect(engineMessages.intervalLimit({ cap: 1_613_333, used: 0, ticker: 'KRKN', seconds: 1 })).toBe(fill(copy.messageOneSecond!, '1'));
    expect(engineMessages.intervalLimit({ cap: 1_613_333, used: 0, ticker: 'KRKN', seconds: 12 })).toBe(fill(copy.message!, '12'));

    const company = { ticker: 'KRKN', sharesOutstanding: 242_000_000 };
    const engine = { state: { phase: 'live', startAt: 0, currentTick: 0, tickIntervalMs: 10_000 } } as never;
    const err = Object.assign(new Error(''), { code: 'interval_limit' });
    expect(tradeErrorFromEngine(err, engine, company, 9_400)!.message).toBe(`${copy.title}. ${fill(copy.messageOneSecond!, '1')}`);
    expect(tradeErrorFromEngine(err, engine, company, 5_000)!.message).toBe(`${copy.title}. ${fill(copy.message!, '5')}`);
  });
});

describe('COPY.md §9 intro_required', () => {
  const copy = block('ticket-errors').intro_required!;

  it('is the wording the order gate sends, verbatim', () => {
    expect(copy.title).toBeTruthy();
    expect(copy.message).toBeTruthy();
    expect(tradeError('intro_required').message).toBe(`${copy.title}. ${copy.message}`);
  });

  it('stays inside the COPY §0.5 length rules', () => {
    for (const [key, value] of Object.entries(copy)) {
      if (!value) continue;
      expect(value.split(/\s+/).length, key).toBeLessThanOrEqual(32);
      for (const sentence of value.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length, `${key}: ${sentence}`).toBeLessThanOrEqual(25);
      }
    }
  });
});

describe('COPY.md §13 funds', () => {
  const copy = block('funds');
  const extra = block('funds-extra');

  it('names every fund the server ships, verbatim', () => {
    expect(Object.keys(copy).sort()).toEqual(FUND_DEFS.map((f) => f.id).sort());
    for (const def of FUND_DEFS) {
      const c = copy[def.id]!;
      expect(c.name, def.id).toBe(def.name);
      expect(c.ticker, def.id).toBe(def.ticker);
      // The public one-line description IS the COPY "holds" line: one wording, one source.
      expect(c.holds, def.id).toBe(def.description);
    }
  });

  it('keeps the fund copy inside the COPY §0.5 length rules and free of verdicts', () => {
    const fields = [...Object.values(copy), ...Object.values(extra)].flatMap((c) => Object.entries(c));
    expect(fields.length).toBeGreaterThan(20);
    for (const [key, value] of fields) {
      expect(value.split(/\s+/).length, `${key}: ${value}`).toBeLessThanOrEqual(32);
      for (const sentence of value.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length, `${key}: ${sentence}`).toBeLessThanOrEqual(25);
      }
      // COPY §0.5 rule 6: explain and compare only — never tell a crew a fund is the safe choice.
      expect(value.toLowerCase(), key).not.toMatch(/\bsafer?\b|\bbest\b|\byou should\b/);
    }
  });
});
