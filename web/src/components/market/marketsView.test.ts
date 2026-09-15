import { describe, expect, it } from 'vitest';
import type { Company, Fundamentals, MarketSummary } from '@deca/shared';
import {
  biggestMoves,
  breadthText,
  columnCells,
  compositeParts,
  helpColumns,
  parseMarketsQuery,
  parseRecents,
  pushRecent,
  removeRecent,
  searchCompanies,
  sectorChips,
  sectorShortName,
  sortCompanies,
  filterBySector,
  spokenCell,
  VIEW_COLUMNS,
  withMarketsQuery,
} from './marketsView';

function co(p: Partial<Company> & { id: string; ticker: string }): Company {
  return {
    name: p.ticker,
    sector: 'Shipping & Salvage',
    description: '',
    currentPrice: 10_000,
    startPrice: 10_000,
    sessionOpen: 10_000,
    sessionHigh: 10_000,
    sessionLow: 10_000,
    sessionVolume: 0,
    voyageHigh: 10_000,
    voyageLow: 10_000,
    sessionChange: 0,
    voyageChange: 0,
    sharesOutstanding: 1,
    marketCap: 1,
    beta: 1,
    adv: 1,
    lastTick: 0,
    ...p,
  } as Company;
}

const KRKN = co({
  id: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  currentPrice: 8_412,
  startPrice: 8_412,
  sessionChange: 0.0231,
  marketCap: 2_036_000_000_000,
  sharesOutstanding: 242_000_000,
});
const CNBR = co({ id: 'cannonbright', ticker: 'CNBR', name: 'Cannonbright Foundries', sector: 'Naval Arms', currentPrice: 10_266, sessionChange: 0.0612, marketCap: 5, voyageChange: -0.1 });
const CRSD = co({ id: 'cursed-doubloon', ticker: 'CRSD', name: 'Cursed Doubloon Relics', sector: 'Cursed Relics', currentPrice: 3_107, sessionChange: -0.0346, marketCap: 9, voyageChange: 0.2 });
const KIDD = co({ id: 'kidd', ticker: 'KIDD', name: 'Kidd Treasure Trust', sector: 'Treasure Banking', currentPrice: 18_890, sessionChange: 0, marketCap: 7 });
const ALL = [KRKN, CNBR, CRSD, KIDD];

const KRKN_F = {
  marketCap: 2_036_000_000_000,
  sharesOutstanding: 242_000_000,
  netIncome: 114_000_000_000,
  revenue: 814_000_000_000,
  netMargin: 0.14,
  peRatio: 17.8,
  debtToEquity: 0.62,
  equity: 1,
  history: [
    { period: 'FY2022', revenue: 661_000_000_000, netIncome: 1, eps: 1 },
    { period: 'FY2023', revenue: 700_000_000_000, netIncome: 1, eps: 1 },
    { period: 'FY2024', revenue: 760_000_000_000, netIncome: 1, eps: 1 },
    { period: 'FY2025', revenue: 814_000_000_000, netIncome: 1, eps: 1 },
  ],
  analyst: { rating: 'Buy', priceTarget: 9_600 },
  cash: 150_000_000_000,
  totalDebt: 300_000_000_000,
  currentRatio: 1.4,
  freeCashFlow: 90_000_000_000,
} as unknown as Fundamentals;

describe('markets query (MOBILE §6.5 ?view=&sort=&sector=)', () => {
  it('defaults to Basics, sorted by company size, every sector', () => {
    expect(parseMarketsQuery('')).toEqual({ view: 'basics', sort: 'size', sector: null });
  });
  it('reads a known view, sort and sector slug and ignores junk', () => {
    expect(parseMarketsQuery('?view=health&sort=session&sector=naval-arms')).toEqual({ view: 'health', sort: 'session', sector: 'Naval Arms' });
    expect(parseMarketsQuery('?view=bogus&sort=nope&sector=atlantis')).toEqual({ view: 'basics', sort: 'size', sector: null });
  });
  it('writes only non-default values and keeps other params', () => {
    expect(withMarketsQuery('?sheet=term&id=index', { view: 'value' })).toBe('?sheet=term&id=index&view=value');
    expect(withMarketsQuery('?view=value&sort=price', { view: 'basics', sort: 'size' })).toBe('');
    expect(withMarketsQuery('', { sector: 'Letters of Marque (Insurance)' })).toBe('?sector=letters-of-marque-insurance');
    expect(withMarketsQuery('?sector=naval-arms', { sector: null })).toBe('');
  });
});

describe('sectorShortName', () => {
  it('uses the artboard short names', () => {
    expect(sectorShortName('Provisions & Spice')).toBe('Provisions');
    expect(sectorShortName('Letters of Marque (Insurance)')).toBe('Letters of Marque');
    expect(sectorShortName('Naval Arms')).toBe('Naval Arms');
  });
});

describe('columns per view', () => {
  it('Basics uses the COPY §1.2 short labels in order', () => {
    expect(VIEW_COLUMNS.basics.map((c) => c.label)).toEqual(['Company size', 'Sales growth', 'Profit margin', 'Price vs. profit', 'Debt vs. equity']);
  });
  it('every column has a glossary term, and every help set adds price and session change', () => {
    for (const view of Object.keys(VIEW_COLUMNS) as (keyof typeof VIEW_COLUMNS)[]) {
      for (const c of VIEW_COLUMNS[view]) expect(c.termId).toMatch(/^[a-zA-Z]+$/);
      const ids = helpColumns(view).map((c) => c.termId);
      expect(ids).toContain('price');
      expect(ids).toContain('sessionChange');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('formats KRKN Basics like the artboard', () => {
    expect(columnCells('basics', KRKN, KRKN_F)).toEqual(['Ð20.36B', '7.2%', '14.0%', '17.8', '0.62']);
  });
  it('shows a dash for every cell while fundamentals are missing', () => {
    expect(columnCells('basics', KRKN, undefined)).toEqual(['—', '—', '—', '—', '—']);
  });
  it('formats Analysts with the rating, the target and the gap to the price', () => {
    expect(columnCells('analysts', KRKN, KRKN_F)).toEqual(['Buy', 'Ð96.00', '+14.12%']);
  });
  it('formats Health money compactly', () => {
    expect(columnCells('health', KRKN, KRKN_F)).toEqual(['0.62', '1.40', 'Ð1.50B', 'Ð3.00B', 'Ð0.90B']);
  });
});

describe('spokenCell', () => {
  it('spells out money units, dashes and minus signs', () => {
    expect(spokenCell('Ð20.36B')).toBe('20.36 billion doubloons');
    expect(spokenCell('−Ð900M')).toBe('minus 900 million doubloons');
    expect(spokenCell('—')).toBe('not available');
    expect(spokenCell('n/m')).toBe('not meaningful');
    expect(spokenCell('7.2%')).toBe('7.2%');
  });
});

describe('sorting and filtering', () => {
  it('sorts by size, session change, total change, price and symbol', () => {
    expect(sortCompanies(ALL, 'size').map((c) => c.ticker)).toEqual(['KRKN', 'CRSD', 'KIDD', 'CNBR']);
    expect(sortCompanies(ALL, 'session').map((c) => c.ticker)).toEqual(['CNBR', 'KRKN', 'KIDD', 'CRSD']);
    expect(sortCompanies(ALL, 'total').map((c) => c.ticker)).toEqual(['CRSD', 'KIDD', 'KRKN', 'CNBR']);
    expect(sortCompanies(ALL, 'price').map((c) => c.ticker)).toEqual(['KIDD', 'CNBR', 'KRKN', 'CRSD']);
    expect(sortCompanies(ALL, 'symbol').map((c) => c.ticker)).toEqual(['CNBR', 'CRSD', 'KIDD', 'KRKN']);
  });
  it('filters by sector, or keeps all', () => {
    expect(filterBySector(ALL, 'Naval Arms').map((c) => c.ticker)).toEqual(['CNBR']);
    expect(filterBySector(ALL, null)).toHaveLength(4);
  });
});

describe('searchCompanies (MOBILE §7.6 search)', () => {
  it('matches ticker or name prefixes: "kra" finds only KRKN', () => {
    expect(searchCompanies(ALL, 'kra').map((c) => c.ticker)).toEqual(['KRKN']);
  });
  it('matches a later word of the name and ranks ticker matches first', () => {
    expect(searchCompanies(ALL, 'relics').map((c) => c.ticker)).toEqual(['CRSD']);
    expect(searchCompanies(ALL, 'k').map((c) => c.ticker)).toEqual(['KIDD', 'KRKN']);
    expect(searchCompanies(ALL, ' KRKN ').map((c) => c.ticker)).toEqual(['KRKN']);
  });
  it('returns nothing for an empty query or no match', () => {
    expect(searchCompanies(ALL, '   ')).toEqual([]);
    expect(searchCompanies(ALL, 'zzz')).toEqual([]);
  });
});

describe('recent searches', () => {
  it('puts the newest first, removes duplicates and keeps five', () => {
    expect(pushRecent(['CNBR', 'KRKN'], 'KRKN')).toEqual(['KRKN', 'CNBR']);
    expect(pushRecent(['A', 'B', 'C', 'D', 'E'], 'F')).toEqual(['F', 'A', 'B', 'C', 'D']);
    expect(removeRecent(['KRKN', 'CNBR'], 'KRKN')).toEqual(['CNBR']);
  });
  it('parses stored JSON defensively', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('not json')).toEqual([]);
    expect(parseRecents('["KRKN", 3, "", "CNBR", "KRKN"]')).toEqual(['KRKN', 'CNBR']);
  });
});

describe('market sections', () => {
  it('splits biggest moves into rising and falling companies only', () => {
    const { up, down } = biggestMoves(ALL, 3);
    expect(up.map((c) => c.ticker)).toEqual(['CNBR', 'KRKN']);
    expect(down.map((c) => c.ticker)).toEqual(['CRSD']);
  });
  it('writes the breadth line', () => {
    expect(breadthText({ advancers: 14, decliners: 11, unchanged: 0 })).toBe('14 rising · 11 falling · 0 unchanged');
  });
  it('orders sector chips by session change, from the market summary when present', () => {
    const market = {
      sectors: {
        'Naval Arms': { value: 1, open: 1, sessionOpen: 1, change: 0.1, sessionChange: 0.0205 },
        'Cursed Relics': { value: 1, open: 1, sessionOpen: 1, change: 0, sessionChange: -0.0346 },
        'Parrot & Livestock': { value: 1, open: 1, sessionOpen: 1, change: 0, sessionChange: 0.0305 },
      },
    } as unknown as MarketSummary;
    const chips = sectorChips(market, ALL);
    expect(chips.map((c) => c.name)).toEqual(['Parrot & Livestock', 'Naval Arms', 'Cursed Relics']);
    expect(chips[0]).toMatchObject({ slug: 'parrot-livestock', sessionChange: 0.0305 });
  });
  it('falls back to cap-weighted sector summaries without a market summary', () => {
    const chips = sectorChips(null, ALL);
    expect(chips.map((c) => c.sector)).toEqual(['Naval Arms', 'Shipping & Salvage', 'Treasure Banking', 'Cursed Relics']);
  });
  it('derives composite points and percentages', () => {
    const parts = compositeParts({ value: 1048.62, open: 1000, sessionOpen: 1039.91, change: 0.0486, sessionChange: 0.0084 });
    expect(parts.valueText).toBe('1,048.62');
    expect(parts.points).toBeCloseTo(8.71, 2);
    expect(parts.sessionPct).toBe(0.0084);
    expect(parts.totalPct).toBe(0.0486);
  });
});
