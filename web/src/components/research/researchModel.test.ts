import { describe, expect, it } from 'vitest';
import type { Company, Fundamentals, NewsEvent } from '@deca/shared';
import {
  allStatsGroups,
  allStatsRows,
  analystSummary,
  companyNews,
  isMarketWideNews,
  newsTag,
  statementSummary,
  statementTable,
  yearLabel,
  KEY_STATS,
  FINANCIAL_QUESTIONS,
  metricShortLabel,
  historyBars,
  keyStatCells,
} from './researchModel';
import type { PeerComparison } from '../../lib/compare';

const B = 100_000_000_000; // Ð1B in cents
const history = [
  { period: 'FY2023', revenue: 7.18 * B, netIncome: 1.03 * B, eps: 426 },
  { period: 'FY2022', revenue: 6.61 * B, netIncome: 0.94 * B, eps: 388 },
  { period: 'FY2024', revenue: 7.74 * B, netIncome: 1.09 * B, eps: 450 },
  { period: 'FY2025', revenue: 8.14 * B, netIncome: 1.14 * B, eps: 473 },
];

const company = {
  id: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  sector: 'Shipping & Salvage',
  currentPrice: 8412,
  sessionVolume: 184_200,
  sharesOutstanding: 242_000_000,
  beta: 1.12,
} as unknown as Company;

const fundamentals = {
  week52Low: 5840,
  week52High: 9120,
  float: 201_300_000,
  forwardPe: 15.9,
  eps: 473,
  dividendYield: 0.019,
  payoutRatio: 0.34,
  beta: 1.12,
  sharesOutstanding: 242_000_000,
  marketCap: 20.36 * B,
  history,
  revenue: 8.14 * B,
  costOfRevenue: 5.5 * B,
  grossProfit: 2.64 * B,
  operatingIncome: 1.6 * B,
  netIncome: 1.14 * B,
  ebitda: 2.03 * B,
  cash: 1.2 * B,
  totalAssets: 12 * B,
  totalDebt: 3.88 * B,
  totalLiabilities: 5.74 * B,
  equity: 6.26 * B,
  operatingCashFlow: 1.5 * B,
  capex: 0.54 * B,
  freeCashFlow: 0.96 * B,
  analyst: { rating: 'Buy', priceTarget: 9600 },
} as unknown as Fundamentals;

describe('research model', () => {
  it('year labels drop the FY prefix', () => {
    expect(yearLabel('FY2025')).toBe('2025');
    expect(yearLabel('2024')).toBe('2024');
  });

  it('statement summary matches COPY §3.2 example', () => {
    expect(statementSummary(history, 'Ð')).toBe('Sales grew from Ð6.61B in 2022 to Ð8.14B in 2025. Profit grew too, from Ð0.94B to Ð1.14B.');
    const down = history.map((h, i) => ({ ...h, revenue: (9 - i) * B, netIncome: i === 1 ? -0.2 * B : h.netIncome }));
    expect(statementSummary(down, 'Ð')).toMatch(/^Sales fell from .* The company lost money in 1 of the 4 years shown\.$/);
    const flat = history.map((h) => ({ ...h, revenue: 8 * B, netIncome: 1 * B }));
    expect(statementSummary(flat, 'Ð')).toBe('Sales stayed about the same from 2022 to 2025, near Ð8.00B. Profit stayed about the same, near Ð1.00B.');
    expect(statementSummary([], 'Ð')).toBeNull();
  });

  it('analyst summary above, below and none', () => {
    expect(analystSummary(fundamentals.analyst, 8412, 'Ð')).toBe('Analyst view: Buy. Their price target of Ð96.00 is 14.1% above the current price.');
    expect(analystSummary({ rating: 'hold', priceTarget: 8000 }, 8412, 'Ð')).toBe('Analyst view: Hold. Their price target of Ð80.00 is 4.9% below the current price.');
    expect(analystSummary(undefined, 8412, 'Ð')).toBe('No analyst view for this company.');
  });

  it('key stats and five question groups use COPY short labels with a glossary term', () => {
    expect(KEY_STATS.map(metricShortLabel)).toEqual(['Company size', 'Sales growth', 'Profit margin', 'Price vs. profit', 'Debt vs. equity']);
    expect(FINANCIAL_QUESTIONS.map((q) => q.question)).toEqual([
      'Is it making money?',
      'Is it growing?',
      'Can it handle its debts?',
      'Is the price reasonable for its profits?',
      'What is the news saying?',
    ]);
    expect(FINANCIAL_QUESTIONS[0]!.metrics).toEqual(['netMargin', 'roe', 'freeCashFlow']);
    expect(FINANCIAL_QUESTIONS[2]!.metrics.map(metricShortLabel)).toEqual(['Debt vs. equity', 'Bill coverage']);
  });

  it('all stats rows (MOBILE §7.7)', () => {
    const rows = allStatsRows(company, fundamentals, 'Ð');
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Past-year range', 'Ð58.40 – Ð91.20'],
      ['Volume', '184,200'],
      ['Shares', '242.0M'],
      ['Float', '201.3M'],
      ['Price vs. future profit', '15.9'],
      ['Profit per share', 'Ð4.73'],
      ['Dividend yield', '1.9%'],
      ['Payout ratio', '34%'],
      ['Swings vs. market', '1.12'],
    ]);
    for (const r of rows) expect(r.termId).toBeTruthy();
  });

  it('statement tables: years across, every row has a term', () => {
    const income = statementTable('income', fundamentals, 'Ð');
    expect(income.years).toEqual(['2022', '2023', '2024', '2025']);
    const sales = income.rows.find((r) => r.label === 'Sales')!;
    expect(sales.values).toEqual(['Ð6.61B', 'Ð7.18B', 'Ð7.74B', 'Ð8.14B']);
    expect(income.rows.find((r) => r.label === 'Gross profit')!.values).toEqual(['—', '—', '—', 'Ð2.64B']);
    const balance = statementTable('balance', fundamentals, 'Ð');
    expect(balance.rows.map((r) => r.label)).toEqual(['Cash', 'Total assets', 'Debt', 'Total owed', 'Owner equity']);
    const cash = statementTable('cashflow', fundamentals, 'Ð');
    expect(cash.rows.find((r) => r.label === 'Free cash flow')!.values.at(-1)).toBe('Ð0.96B');
    for (const t of [income, balance, cash]) for (const r of t.rows) expect(r.termId).toBeTruthy();
  });

  it('key stat cells: the five metrics with a peer caption, then the session range (spec §3)', () => {
    const avg: PeerComparison = { scope: 'sector', sector: 'Shipping & Salvage', value: 22.1, count: 2 };
    const quoted = { ...company, startPrice: 8412, sessionLow: 8190, sessionHigh: 8460 } as Company;
    const cells = keyStatCells(quoted, { ...fundamentals, peRatio: 17.8 } as Fundamentals, () => avg, 'Ð');
    expect(cells.map((c) => c.id)).toEqual([...KEY_STATS, 'sessionRange']);
    const pe = cells.find((c) => c.id === 'peRatio')!;
    expect(pe).toMatchObject({ label: 'Price vs. profit', value: '17.8', termId: 'peRatio', caption: 'Rest of sector 22.1' });
    // The sheet keeps the four-line row's words: sentence and the long comparison line, which has room to name the sector.
    expect(pe.explained).toMatchObject({ sentence: 'You pay Ð17.80 for every Ð1 of yearly profit.', averageText: 'Rest of Shipping & Salvage: 22.1' });
    const range = cells.at(-1)!;
    expect(range).toMatchObject({ label: 'Session range', value: 'Ð81.90 – Ð84.60', termId: 'sessionRange' });
    expect(range.caption).toBeUndefined();
    expect(range.explained).toBeUndefined();
  });

  it('key stat captions use the rest of the market when the sector has too few companies', () => {
    const market: PeerComparison = { scope: 'market', sector: 'Shipping & Salvage', value: 21.4, count: 14 };
    const cells = keyStatCells(company, fundamentals, () => market, 'Ð');
    expect(cells.find((c) => c.id === 'peRatio')!.caption).toBe('Rest of market 21.4');
    const missing: PeerComparison = { scope: 'sector', sector: 'Shipping & Salvage', value: null, count: 0 };
    expect(keyStatCells(company, fundamentals, () => missing, 'Ð')[3]!.caption).toBe('Rest of sector —');
  });

  it('all stats groups keep every field of the flat list, once each (spec §5)', () => {
    const groups = allStatsGroups(company, fundamentals, () => null, 'Ð');
    expect(groups.map((g) => g.label)).toEqual(['Price', 'Value', 'Size', 'Health', 'Payouts']);
    for (const g of groups) expect(g.note.length).toBeGreaterThan(0);
    const flat = allStatsRows(company, fundamentals, 'Ð');
    const cells = groups.flatMap((g) => g.cells);
    expect(cells.map((c) => c.id).sort()).toEqual(flat.map((r) => r.id).sort());
    expect(cells.map((c) => [c.label, c.value]).sort()).toEqual(flat.map((r) => [r.label, r.value]).sort());
    for (const c of cells) expect(c.termId).toBeTruthy();
    // Only the fields with a COPY §3.1 template can be compared with the sector.
    expect(cells.filter((c) => c.explained).map((c) => c.id)).toEqual(['forwardPe', 'eps', 'beta', 'dividendYield']);
  });

  it('history bars sorted by year', () => {
    expect(historyBars(history).map((b) => b.year)).toEqual(['2022', '2023', '2024', '2025']);
  });

  it('company news: this company or the whole market, newest first', () => {
    const ev = (id: string, companyIds: string[], firedAt: number, type = 'storm') =>
      ({ id, companyIds, firedAt, type, source: companyIds.length ? 'scheduled' : 'macro' }) as unknown as NewsEvent;
    const list = [ev('a', ['cutlass'], 5), ev('b', [], 4, 'macro'), ev('c', ['kraken', 'cutlass'], 3), ev('d', ['kraken'], 1)];
    expect(companyNews(list, 'kraken', 2).map((n) => n.id)).toEqual(['b', 'c']);
    expect(newsTag(list[1]!, {})).toBe('Whole market');
    expect(newsTag(list[2]!, { kraken: company, cutlass: { ticker: 'CTLS' } as Company })).toBe('KRKN, CTLS');
  });

  it('a market-wide dispatch reads as one, and names the company whose page you are on', () => {
    const roster = ['abon', 'brth', 'bbrd', 'cjst', 'cnbr', 'cmps', 'kraken'];
    const byId = Object.fromEntries(roster.map((id) => [id, { id, ticker: (id === 'kraken' ? 'krkn' : id.slice(0, 4)).toUpperCase() } as Company]));
    const macro = { id: 'm', type: 'macro', companyIds: roster, firedAt: 1 } as unknown as NewsEvent;
    // The bug: every ticker in the roster, on a row about the company you are reading.
    expect(newsTag(macro, byId, company)).toBe('Whole market, including KRKN');
    expect(newsTag(macro, byId)).toBe('Whole market');
    expect(isMarketWideNews(macro)).toBe(true);
    // A host dispatch with no type of its own, aimed at more companies than a row can list.
    const wide = { id: 'w', type: 'regulatory', companyIds: roster.slice(0, 5), firedAt: 1 } as unknown as NewsEvent;
    expect(isMarketWideNews(wide)).toBe(true);
    expect(newsTag(wide, byId, company)).toBe('Whole market');
    expect(newsTag(wide, byId, byId.abon)).toBe('Whole market, including ABON');
    // Three or fewer still list their tickers, which is the useful thing to show.
    const narrow = { id: 'n', type: 'storm', companyIds: ['kraken', 'abon', 'brth'], firedAt: 1 } as unknown as NewsEvent;
    expect(isMarketWideNews(narrow)).toBe(false);
    expect(newsTag(narrow, byId, company)).toBe('KRKN, ABON, BRTH');
  });
});
