import { describe, expect, it } from 'vitest';
import type { Company, Fund, Fundamentals, MarketSummary } from '@deca/shared';
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
  fundHoldingRows,
  searchInstruments,
  sectorChips,
  sectorGroups,
  sectorShortName,
  sortCompanies,
  splitInstruments,
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
const ABON = co({ id: 'anne-bonny', ticker: 'ABON', name: 'Anne Bonny Cartography', sector: 'Cartography & Navigation', currentPrice: 3_107, sessionChange: -0.0346, marketCap: 9, voyageChange: 0.2 });
const KIDD = co({ id: 'kidd', ticker: 'KIDD', name: 'Kidd Treasure Trust', sector: 'Treasure Banking', currentPrice: 18_890, sessionChange: 0, marketCap: 7 });
const ALL = [KRKN, CNBR, ABON, KIDD];

/** The three tradeable baskets, as the wire sends them (broad fund first). */
function fund(p: Partial<Fund> & { id: string; ticker: string; name: string }): Fund {
  return {
    kind: 'fund',
    description: '',
    style: 'broad',
    holdings: [],
    divisor: 1,
    positionLimitExempt: false,
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
    adv: 1,
    lastTick: 0,
    ...p,
  } as Fund;
}

const FLEET = fund({
  id: 'grand-fleet',
  ticker: 'FLEET',
  name: 'Grand Fleet Fund',
  positionLimitExempt: true,
  holdings: [
    { companyId: 'kraken', ticker: 'KRKN', weight: 0.5 },
    { companyId: 'cannonbright', ticker: 'CNBR', weight: 0.5 },
  ],
  divisor: 1,
});
const SHIPS = fund({ id: 'shipping-lanes', ticker: 'SHIPS', name: 'Shipping Lanes Fund', style: 'sector', sector: 'Shipping & Salvage' });

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
    expect(withMarketsQuery('', { sector: 'Cartography & Navigation' })).toBe('?sector=cartography-navigation');
    expect(withMarketsQuery('?sector=naval-arms', { sector: null })).toBe('');
  });
});

describe('sectorShortName', () => {
  it('uses the artboard short names', () => {
    expect(sectorShortName('Provisions & Spice')).toBe('Provisions');
    expect(sectorShortName('Cartography & Navigation')).toBe('Cartography & Navigation');
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
    expect(sortCompanies(ALL, 'size').map((c) => c.ticker)).toEqual(['KRKN', 'ABON', 'KIDD', 'CNBR']);
    expect(sortCompanies(ALL, 'session').map((c) => c.ticker)).toEqual(['CNBR', 'KRKN', 'KIDD', 'ABON']);
    expect(sortCompanies(ALL, 'total').map((c) => c.ticker)).toEqual(['ABON', 'KIDD', 'KRKN', 'CNBR']);
    expect(sortCompanies(ALL, 'price').map((c) => c.ticker)).toEqual(['KIDD', 'CNBR', 'KRKN', 'ABON']);
    expect(sortCompanies(ALL, 'symbol').map((c) => c.ticker)).toEqual(['ABON', 'CNBR', 'KIDD', 'KRKN']);
  });
  it('filters by sector, or keeps all', () => {
    expect(filterBySector(ALL, 'Naval Arms').map((c) => c.ticker)).toEqual(['CNBR']);
    expect(filterBySector(ALL, null)).toHaveLength(4);
  });
});

describe('searchInstruments (MOBILE §7.6 search)', () => {
  it('matches ticker or name prefixes: "kra" finds only KRKN', () => {
    expect(searchInstruments(ALL, 'kra').map((c) => c.ticker)).toEqual(['KRKN']);
  });
  it('matches a later word of the name and ranks ticker matches first', () => {
    expect(searchInstruments(ALL, 'cartography').map((c) => c.ticker)).toEqual(['ABON']);
    expect(searchInstruments(ALL, 'k').map((c) => c.ticker)).toEqual(['KIDD', 'KRKN']);
    expect(searchInstruments(ALL, ' KRKN ').map((c) => c.ticker)).toEqual(['KRKN']);
  });
  it('returns nothing for an empty query or no match', () => {
    expect(searchInstruments(ALL, '   ')).toEqual([]);
    expect(searchInstruments(ALL, 'zzz')).toEqual([]);
  });

  // Spec 2026-09-16 §3: search must find a fund as readily as a company.
  it('finds a fund and a company in one ranked list', () => {
    const all = [FLEET, SHIPS, ...ALL];
    expect(searchInstruments(all, 'fleet').map((i) => i.ticker)).toEqual(['FLEET']);
    expect(searchInstruments(all, 'grand').map((i) => i.ticker)).toEqual(['FLEET']);
    // "s" hits the SHIPS ticker before the Shipping Lanes name and before any company name word.
    expect(searchInstruments(all, 's').map((i) => i.ticker)).toEqual(['SHIPS', 'KRKN']);
    expect(searchInstruments(all, 'ships').map((i) => i.ticker)).toEqual(['SHIPS']);
  });
  it('splits a mixed list back into its two kinds', () => {
    const { funds, companies } = splitInstruments([FLEET, KRKN, SHIPS]);
    expect(funds.map((f) => f.ticker)).toEqual(['FLEET', 'SHIPS']);
    expect(companies.map((c) => c.ticker)).toEqual(['KRKN']);
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
    expect(down.map((c) => c.ticker)).toEqual(['ABON']);
  });
  it('writes the breadth line', () => {
    expect(breadthText({ advancers: 14, decliners: 11, unchanged: 0 })).toBe('14 rising · 11 falling · 0 unchanged');
  });
  it('orders sector chips by session change, from the market summary when present', () => {
    const market = {
      sectors: {
        'Naval Arms': { value: 1, open: 1, sessionOpen: 1, change: 0.1, sessionChange: 0.0205 },
        'Cartography & Navigation': { value: 1, open: 1, sessionOpen: 1, change: 0, sessionChange: -0.0346 },
        'Provisions & Spice': { value: 1, open: 1, sessionOpen: 1, change: 0, sessionChange: 0.0305 },
      },
    } as unknown as MarketSummary;
    const chips = sectorChips(market, ALL);
    expect(chips.map((c) => c.name)).toEqual(['Provisions', 'Naval Arms', 'Cartography & Navigation']);
    expect(chips[0]).toMatchObject({ slug: 'provisions-spice', sessionChange: 0.0305 });
  });
  it('falls back to cap-weighted sector summaries without a market summary', () => {
    const chips = sectorChips(null, ALL);
    expect(chips.map((c) => c.sector)).toEqual(['Naval Arms', 'Shipping & Salvage', 'Treasure Banking', 'Cartography & Navigation']);
  });
  it('derives composite points and percentages', () => {
    const parts = compositeParts({ value: 1048.62, open: 1000, sessionOpen: 1039.91, change: 0.0486, sessionChange: 0.0084 });
    expect(parts.valueText).toBe('1,048.62');
    expect(parts.points).toBeCloseTo(8.71, 2);
    expect(parts.sessionPct).toBe(0.0084);
    expect(parts.totalPct).toBe(0.0486);
  });
});

describe('Markets list shape (spec 2026-09-16 §4)', () => {
  it('groups companies by sector, in SECTORS order, sorted inside each group', () => {
    const second = co({ id: 'flying-dutchman', ticker: 'FDUT', name: 'Flying Dutchman Salvage', currentPrice: 1, marketCap: 500 });
    const groups = sectorGroups([...ALL, second], 'size');
    expect(groups.map((g) => g.sector)).toEqual(['Shipping & Salvage', 'Naval Arms', 'Cartography & Navigation', 'Treasure Banking']);
    expect(groups[0]!.companies.map((c) => c.ticker)).toEqual(['KRKN', 'FDUT']);
    expect(groups[0]!.slug).toBe('shipping-salvage');
  });
  it('leaves out a sector with no companies rather than drawing an empty header', () => {
    expect(sectorGroups([KRKN]).map((g) => g.sector)).toEqual(['Shipping & Salvage']);
    expect(sectorGroups([])).toEqual([]);
  });
  it('respects the chosen sort inside every group', () => {
    const cheap = co({ id: 'leviathan', ticker: 'LVTH', name: 'Leviathan Logistics', currentPrice: 1, marketCap: 1 });
    const groups = sectorGroups([KRKN, cheap], 'symbol');
    expect(groups[0]!.companies.map((c) => c.ticker)).toEqual(['KRKN', 'LVTH']);
  });
});

describe('fundHoldingRows (spec §3 "What this fund holds")', () => {
  const byId = { kraken: KRKN, cannonbright: CNBR };

  it('reports each constituent with its share of the fund VALUE and its session change', () => {
    const rows = fundHoldingRows(FLEET, byId);
    expect(rows.map((r) => r.ticker)).toEqual(['CNBR', 'KRKN']);
    // Equal basket weights, so value shares follow price: CNBR Ð102.66 vs KRKN Ð84.12.
    const total = KRKN.currentPrice + CNBR.currentPrice;
    expect(rows[0]!.weight).toBeCloseTo(CNBR.currentPrice / total, 10);
    expect(rows[1]!.weight).toBeCloseTo(KRKN.currentPrice / total, 10);
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 10);
    expect(rows[1]).toMatchObject({ name: 'Kraken Shipping Lines', sector: 'Shipping & Salvage', sessionChange: 0.0231 });
  });

  it('falls back to the basket ticker and weight when a company has not arrived yet', () => {
    const rows = fundHoldingRows(FLEET, {});
    // No prices means no value weights, so the basket weights tie and the rows sort by ticker.
    expect(rows.map((r) => r.ticker)).toEqual(['CNBR', 'KRKN']);
    expect(rows.every((r) => r.weight === 0.5 && r.price === 0 && r.sector === null)).toBe(true);
  });

  it('never exposes anything hidden: rows carry only public basket and quote fields', () => {
    const keys = Object.keys(fundHoldingRows(FLEET, byId)[0]!).sort();
    expect(keys).toEqual(['companyId', 'name', 'price', 'sector', 'sessionChange', 'ticker', 'weight']);
  });
});
