import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAX_POSITION_PCT, DEFAULT_STARTING_CAPITAL } from '@deca/shared';
import { extractBlocks } from '../../../scripts/build-glossary.mjs';
import { GLOSSARY } from '../../lib/glossary';
import { GLOSSARY_SEARCH_EMPTY, GUIDE_COPY, TRADING_BASICS } from './learnCopy';

const md = readFileSync(fileURLToPath(new URL('../../../../docs/design/COPY.md', import.meta.url)), 'utf8');
const blocks = extractBlocks(md);
const of = (kind: string) => blocks.filter((b) => b.kind === kind).map((b) => b.data);

describe('Learn copy matches COPY.md verbatim', () => {
  it('guide (§7)', () => {
    expect(GUIDE_COPY).toEqual(of('guide')[0]);
  });

  it('trading basics (§8), in order, each linked to a real glossary term', () => {
    expect(TRADING_BASICS).toEqual(of('trading-basics'));
    expect(TRADING_BASICS.map((t) => t.id)).toEqual(['marketOrder', 'fee', 'priceImpact', 'avgCost', 'gains', 'diversification']);
    for (const t of TRADING_BASICS) expect(GLOSSARY[t.glossary], t.id).toBeDefined();
  });

  it('teaches positions a real crew could actually hold (§8)', () => {
    // The chest is Ð250,000 and one company may be at most `maxPositionPct` of the account, so a
    // worked example built on a 3,000-share KRKN position (Ð262,560 of cost) teaches an order the
    // game would reject. Every figure below comes from BRIEF §7's own sample crew.
    const chest = DEFAULT_STARTING_CAPITAL / 100;
    const perCompany = chest * DEFAULT_MAX_POSITION_PCT;
    /** Examples that describe money in ONE company, so the position limit binds as well. */
    const singleCompany = new Set(['marketOrder', 'fee', 'priceImpact', 'avgCost', 'gains']);
    let amounts = 0;
    for (const t of TRADING_BASICS) {
      const cap = singleCompany.has(t.id) ? perCompany : chest;
      for (const line of t.example) {
        for (const [, raw] of line.matchAll(/Ð([\d,]+(?:\.\d+)?)/g)) {
          amounts++;
          expect(Number(raw!.replace(/,/g, '')), `${t.id}: ${line}`).toBeLessThanOrEqual(cap);
        }
      }
    }
    expect(amounts).toBeGreaterThan(20);
  });

  it('glossary search empty state (§12 empty.glossarySearch)', () => {
    const states = of('states')[0] as { empty: { glossarySearch: unknown } };
    expect(GLOSSARY_SEARCH_EMPTY).toEqual(states.empty.glossarySearch);
  });
});
