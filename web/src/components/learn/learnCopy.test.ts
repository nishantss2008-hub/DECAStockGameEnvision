import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

  it('glossary search empty state (§12 empty.glossarySearch)', () => {
    const states = of('states')[0] as { empty: { glossarySearch: unknown } };
    expect(GLOSSARY_SEARCH_EMPTY).toEqual(states.empty.glossarySearch);
  });
});
