import { describe, it, expect } from 'vitest';
import {
  GLOSSARY,
  GLOSSARY_LIST,
  NEWS_BADGE,
  NEWS_EXPLAIN,
  NEWS_EXTRA,
  glossarySearch,
  glossaryTitle,
  infoTipAriaLabel,
  usuallyGoodSentence,
  withCurrency,
} from './glossary';

describe('glossary helpers', () => {
  it('keeps COPY order and indexes by id', () => {
    expect(GLOSSARY_LIST[0]!.id).toBe('stock');
    expect(GLOSSARY_LIST).toHaveLength(Object.keys(GLOSSARY).length);
    expect(GLOSSARY.peRatio!.label).toBe('Price vs. profit');
  });

  it('renders the InfoTip title, aria-label and lead-in sentence (COPY §0.4, MOBILE §5.9)', () => {
    const pe = GLOSSARY.peRatio!;
    expect(glossaryTitle(pe)).toBe('Price vs. profit (P/E ratio)');
    expect(infoTipAriaLabel(pe)).toBe('What is Price vs. profit (P/E ratio)?');
    expect(usuallyGoodSentence(pe)).toBe(
      'Usually a good sign when it is lower than similar companies, but a very low P/E can mean investors expect trouble.',
    );
  });

  it('search is case-insensitive, ranks label/term matches first and returns everything for a blank query', () => {
    expect(glossarySearch('')).toHaveLength(GLOSSARY_LIST.length);
    expect(glossarySearch('   ')).toHaveLength(GLOSSARY_LIST.length);
    expect(glossarySearch('PROFIT MARGIN')[0]!.id).toBe('netMargin');
    const debt = glossarySearch('debt').map((e) => e.id);
    expect(debt[0]).toBe('debtToEquity');
    expect(debt).toContain('totalDebt');
    expect(glossarySearch('pe ratio').map((e) => e.id)).toContain('peRatio');
    expect(glossarySearch('zzzz-no-match')).toEqual([]);
  });

  it('has a badge and both explanations for every news type', () => {
    expect(NEWS_BADGE.macro).toBe('Whole market');
    expect(NEWS_EXPLAIN.earnings.bullish.startsWith('Earnings beat forecasts')).toBe(true);
    expect(NEWS_EXTRA.whatThisMeans).toBe('What this means');
  });

  it('swaps the currency symbol and plural name without touching company names', () => {
    const text = 'You pay Ð17.80 for every Ð1. Doubloons and doubloons. Cursed Doubloon Relics.';
    expect(withCurrency(text, { name: 'Coins', symbol: '¢' })).toBe(
      'You pay ¢17.80 for every ¢1. Coins and coins. Cursed Doubloon Relics.',
    );
    expect(withCurrency(text, { name: 'Doubloons', symbol: 'Ð' })).toBe(text);
  });
});
