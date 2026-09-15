import { describe, expect, it } from 'vitest';
import type { Company, Fundamentals, NewsEvent } from '@deca/shared';
import {
  allStatsRows,
  analystSummary,
  companyNews,
  newsTag,
  statementSummary,
  statementTable,
  yearLabel,
  KEY_STATS,
  FINANCIAL_QUESTIONS,
  metricShortLabel,
  historyBars,
} from './researchModel';

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

  it('history bars sorted by year', () => {
    expect(historyBars(history).map((b) => b.year)).toEqual(['2022', '2023', '2024', '2025']);
  });

  it('company news: this company or the whole market, newest first', () => {
    const ev = (id: string, companyIds: string[], firedAt: number) => ({ id, companyIds, firedAt, source: companyIds.length ? 'scheduled' : 'macro' }) as unknown as NewsEvent;
    const list = [ev('a', ['cutlass'], 5), ev('b', [], 4), ev('c', ['kraken', 'cutlass'], 3), ev('d', ['kraken'], 1)];
    expect(companyNews(list, 'kraken', 2).map((n) => n.id)).toEqual(['b', 'c']);
    expect(newsTag(list[1]!, {})).toBe('Whole market');
    expect(newsTag(list[2]!, { kraken: company, cutlass: { ticker: 'CTLS' } as Company })).toBe('KRKN, CTLS');
  });
});
