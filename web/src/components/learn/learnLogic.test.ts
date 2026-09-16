import { describe, it, expect } from 'vitest';
import { DEFAULT_STARTING_CAPITAL, DEFAULT_TICK_INTERVAL_MS, type Company } from '@deca/shared';
import { GLOSSARY, GLOSSARY_LIST } from '../../lib/glossary';
import {
  chapterSubtitles,
  exampleCompany,
  glossarySections,
  guideParagraphs,
  learnCompanyPath,
  metricForTerm,
  metricShortLabel,
  phoneWhere,
  relatedEntries,
  searchTermsPlaceholder,
  termFitsBeside,
} from './learnLogic';

describe('glossarySections', () => {
  const sections = glossarySections(GLOSSARY_LIST);

  it('groups every term once under the first letter of its label, A to Z', () => {
    expect(sections.flatMap((s) => s.entries)).toHaveLength(GLOSSARY_LIST.length);
    const letters = sections.map((s) => s.letter);
    expect(letters).toEqual([...letters].sort());
    expect(new Set(letters).size).toBe(letters.length);
    for (const s of sections) for (const e of s.entries) expect(e.label[0]!.toUpperCase()).toBe(s.letter);
  });

  it('sorts by label inside a section, like the artboard (A: Account value, Analyst price guess, Analyst view, Average price paid)', () => {
    const a = sections.find((s) => s.letter === 'A')!;
    expect(a.entries.slice(0, 4).map((e) => e.label)).toEqual(['Account value', 'Analyst price guess', 'Analyst view', 'Average price paid']);
    const b = sections.find((s) => s.letter === 'B')!;
    expect(b.entries.map((e) => e.label).slice(0, 3)).toEqual(['Borrowed money', 'Business price vs. core profit', 'Buy or sell now']);
  });
});

describe('termFitsBeside (term as detail vs. under the label)', () => {
  it('matches the artboard rows', () => {
    expect(termFitsBeside('Account value', 'total account value')).toBe(true);
    expect(termFitsBeside('Cash available to trade', 'buying power')).toBe(true);
    expect(termFitsBeside('Cash left after investing', 'free cash flow')).toBe(true);
    expect(termFitsBeside('Cash on hand', 'cash and equivalents')).toBe(true);
    expect(termFitsBeside('Business price vs. core profit', 'EV/EBITDA')).toBe(false);
    expect(termFitsBeside('Cash from running the business', 'operating cash flow')).toBe(false);
    expect(termFitsBeside('Change since the game began', 'total change')).toBe(false);
    expect(termFitsBeside('Core profit', 'earnings before interest, taxes, depreciation and amortization')).toBe(false);
  });

  it('never fits at large text sizes', () => {
    expect(termFitsBeside('Account value', 'total account value', true)).toBe(false);
  });
});

describe('searchTermsPlaceholder', () => {
  it('fills mobile.searchTerms with the glossary size', () => {
    expect(searchTermsPlaceholder(73)).toBe('Search 73 terms');
  });
});

describe('chapterSubtitles', () => {
  it('uses the chapter copy the artboard shows', () => {
    expect(chapterSubtitles()).toEqual({
      howToPlay: 'Your first trade in 3 steps',
      meetTheMarket: 'The 15 companies, the five sectors and the three funds, in about a minute.',
      guide: 'The rules of the voyage, in plain words.',
      fiveQuestions: 'Is it making money? Is it growing?',
      basics: 'Market orders · Fees · Price impact',
    });
  });
});

describe('guideParagraphs', () => {
  // A real game a host can start: Ð250,000 chest, the 5-second tick every supported length lands on.
  const game = { startingCapital: DEFAULT_STARTING_CAPITAL, tickIntervalMs: DEFAULT_TICK_INTERVAL_MS, feeBps: 10, maxPositionPct: 0.25, currency: { name: 'doubloons', symbol: 'Ð' } };

  it('fills settings from game/state', () => {
    const p = guideParagraphs(game);
    expect(p.map((x) => x.id)).toEqual(['start', 'ticks', 'prices', 'fees', 'impact', 'limit', 'health', 'end']);
    expect(p[0]!.body).toBe(
      'Every crew starts with Ð250,000.00 in cash and no shares; Ð stands for doubloons, the game\'s money. The crew with the highest account value (cash plus shares) at the end wins.',
    );
    expect(p[1]!.body).toContain('every 5 seconds');
    expect(p[3]!.body).toContain('a fee of 0.10% of the order value');
    expect(p[5]!.body).toContain('more than 25% of your account value');
  });

  it('uses bodyWhenOff when the position limit is off, and a renamed currency', () => {
    const p = guideParagraphs({ ...game, maxPositionPct: 1, currency: { name: 'pieces of eight', symbol: '8' } });
    expect(p[5]!.body).toBe('This game has no position limit, so you can put as much of your account into one company as your cash allows.');
    expect(p[0]!.body).toContain('8 stands for pieces of eight');
  });

  it('falls back to defaults before game/state loads', () => {
    // The placeholder is the cadence every supported game length actually runs at, not a stale 30s.
    const p = guideParagraphs(null);
    expect(p[1]!.body).toContain(`every ${DEFAULT_TICK_INTERVAL_MS / 1000} seconds`);
    expect(p[0]!.body).toContain('Every crew starts with Ð250,000.00');
  });
});

describe('phoneWhere (COPY §6 where → phone paths, MOBILE §7.0)', () => {
  it('splits locations and maps desktop screens to phone screens', () => {
    expect(phoneWhere('Research → Basics view (Profit margin column) · Trade → Financials → Income statement and Cash flow · Trade → Snapshot → Key facts')).toEqual([
      'Markets › All companies › Basics (Profit margin column)',
      'Company page › Financials › Income statement and Cash flow',
      'Company page › Key stats',
    ]);
    expect(phoneWhere('Research → Basics view (Debt vs. equity column) or Financial health view · Trade → Financials → Balance sheet')).toEqual([
      'Markets › All companies › Basics (Debt vs. equity column) or Health',
      'Company page › Financials › Balance sheet',
    ]);
    expect(phoneWhere('Research → Basics view (Price vs. profit column) or Valuation view · Trade → Snapshot → Key statistics · Trade → Financials → Valuation')).toEqual([
      'Markets › All companies › Basics (Price vs. profit column) or Value',
      'Company page › All stats',
      'Company page › Financials › Valuation',
    ]);
    expect(phoneWhere('Dispatches (read the What this means line) · Trade → Dispatches · Trade → Analysts')).toEqual([
      'News (read the What this means line)',
      'Company page › News',
      'Company page › Analyst view',
    ]);
  });
});

describe('related terms, metrics and the example company', () => {
  it('relatedEntries resolves ids and skips unknown ones', () => {
    expect(relatedEntries({ ...GLOSSARY.peRatio!, related: ['forwardPe', 'nope', 'eps'] }).map((e) => e.id)).toEqual(['forwardPe', 'eps']);
  });

  it('metricForTerm maps glossary ids that are company metrics', () => {
    expect(metricForTerm('peRatio')).toBe('peRatio');
    expect(metricForTerm('debtToEquity')).toBe('debtToEquity');
    expect(metricForTerm('fee')).toBeNull();
  });

  it('metricShortLabel uses the COPY §1.2 short text', () => {
    expect(metricShortLabel('peRatio')).toBe('Price vs. profit');
    expect(metricShortLabel('currentRatio')).toBe('Bill coverage');
  });

  it('exampleCompany prefers KRKN, else the first by ticker', () => {
    const c = (id: string, ticker: string) => ({ id, ticker }) as Company;
    expect(exampleCompany([c('a', 'ABC'), c('kraken', 'KRKN')])?.ticker).toBe('KRKN');
    expect(exampleCompany([c('z', 'ZED'), c('a', 'ABC')])?.ticker).toBe('ABC');
    expect(exampleCompany([])).toBeNull();
  });

  it('learnCompanyPath builds the Learn-stack deep link with the highlight', () => {
    expect(learnCompanyPath('KRKN', 'peRatio')).toBe('/learn/company/KRKN?highlight=peRatio');
  });
});
