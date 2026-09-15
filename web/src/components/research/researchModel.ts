/**
 * Pure words and numbers for the Company, Financials and All stats pages (MOBILE §7.7–§7.8).
 * Labels are COPY §1.2 `short`; sentences are COPY §3.2 / §6. Money in integer cents.
 */
import type { Company, FinancialPeriod, Fundamentals, NewsEvent } from '@deca/shared';
import { COPY_DATA } from '../../lib/glossary';
import { formatMetricValue, metricValue, type MetricId } from '../../lib/compare';
import { formatCompact, formatMoney, formatNumber, formatPct } from '../../lib/format';

const NULL_TEXT = '—';

/** COPY §1.2 `short` labels (and §1.1 for company fields) with their glossary term. */
export const SHORT_LABELS: Record<string, { label: string; termId: string }> = {
  marketCap: { label: 'Company size', termId: 'marketCap' },
  sharesOutstanding: { label: 'Shares', termId: 'sharesOutstanding' },
  float: { label: 'Float', termId: 'float' },
  week52Range: { label: 'Past-year range', termId: 'week52Range' },
  peRatio: { label: 'Price vs. profit', termId: 'peRatio' },
  forwardPe: { label: 'Price vs. future profit', termId: 'forwardPe' },
  psRatio: { label: 'Price vs. sales', termId: 'psRatio' },
  pbRatio: { label: 'Price vs. equity', termId: 'pbRatio' },
  evToEbitda: { label: 'Price vs. core profit', termId: 'evToEbitda' },
  dividendYield: { label: 'Dividend yield', termId: 'dividendYield' },
  payoutRatio: { label: 'Payout ratio', termId: 'payoutRatio' },
  revenue: { label: 'Sales', termId: 'revenue' },
  revenueGrowth: { label: 'Sales growth', termId: 'revenueGrowth' },
  costOfRevenue: { label: 'Direct costs', termId: 'costOfRevenue' },
  grossProfit: { label: 'Gross profit', termId: 'grossProfit' },
  operatingIncome: { label: 'Operating profit', termId: 'operatingIncome' },
  netIncome: { label: 'Profit', termId: 'netIncome' },
  eps: { label: 'Profit per share', termId: 'eps' },
  ebitda: { label: 'Core profit', termId: 'ebitda' },
  grossMargin: { label: 'Gross margin', termId: 'grossMargin' },
  netMargin: { label: 'Profit margin', termId: 'netMargin' },
  cash: { label: 'Cash', termId: 'cash' },
  totalAssets: { label: 'Total assets', termId: 'totalAssets' },
  totalDebt: { label: 'Debt', termId: 'totalDebt' },
  totalLiabilities: { label: 'Total owed', termId: 'totalLiabilities' },
  equity: { label: 'Owner equity', termId: 'equity' },
  currentRatio: { label: 'Bill coverage', termId: 'currentRatio' },
  debtToEquity: { label: 'Debt vs. equity', termId: 'debtToEquity' },
  operatingCashFlow: { label: 'Operating cash', termId: 'operatingCashFlow' },
  capex: { label: 'Capital spending', termId: 'capex' },
  freeCashFlow: { label: 'Free cash flow', termId: 'freeCashFlow' },
  roe: { label: 'Return on equity', termId: 'roe' },
  roa: { label: 'Return on assets', termId: 'roa' },
  beta: { label: 'Swings vs. market', termId: 'beta' },
  sessionVolume: { label: 'Volume', termId: 'volume' },
  sessionRange: { label: 'Session range', termId: 'sessionRange' },
  analystRating: { label: 'Analyst view', termId: 'analystRating' },
  priceTarget: { label: 'Price target', termId: 'priceTarget' },
};

export function metricShortLabel(id: string): string {
  return SHORT_LABELS[id]?.label ?? id;
}

/** Company page "Key stats" (MOBILE §7.7 row 4). */
export const KEY_STATS: readonly MetricId[] = ['marketCap', 'revenueGrowth', 'netMargin', 'peRatio', 'debtToEquity'];

export interface FinancialQuestion {
  id: 'profit' | 'growth' | 'debt' | 'price' | 'news';
  /** COPY §6 `question`. */
  question: string;
  /** COPY §6 `tip` (shown as the group footer). */
  tip: string;
  metrics: readonly MetricId[];
}

/** MOBILE §7.8 groups: COPY §6 questions with the metrics each one reads. */
export const FINANCIAL_QUESTIONS: readonly FinancialQuestion[] = [
  { id: 'profit', question: 'Is it making money?', tip: 'One year can mislead, so check whether profit held up across all 4 years.', metrics: ['netMargin', 'roe', 'freeCashFlow'] },
  { id: 'growth', question: 'Is it growing?', tip: 'Fast sales growth means less if the losses grow along with it.', metrics: ['revenueGrowth'] },
  {
    id: 'debt',
    question: 'Can it handle its debts?',
    tip: 'Normal debt levels differ by industry, so compare with the sector average rather than with every company.',
    metrics: ['debtToEquity', 'currentRatio'],
  },
  {
    id: 'price',
    question: 'Is the price reasonable for its profits?',
    tip: 'A low price vs. profit can signal trouble ahead, so read it together with your answers about profit, growth and debt.',
    metrics: ['peRatio', 'evToEbitda'],
  },
  { id: 'news', question: 'What is the news saying?', tip: 'News moves prices at once, so by the time you read it, the price has already moved.', metrics: [] },
];

export function yearLabel(period: string): string {
  const m = /(\d{4})/.exec(period);
  return m ? m[1]! : period;
}

function sortedHistory(history: readonly FinancialPeriod[] | undefined): FinancialPeriod[] {
  return [...(history ?? [])].sort((a, b) => yearLabel(a.period).localeCompare(yearLabel(b.period)));
}

const fill = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const compact = (cents: number, symbol: string) => formatMoney(cents, { symbol, compact: true });

/** COPY §3.2 `statementSummaries`: sales sentence, profit sentence, and loss years when any. */
export function statementSummary(history: readonly FinancialPeriod[] | undefined, symbol: string): string | null {
  const h = sortedHistory(history);
  if (h.length < 2) return null;
  const s = COPY_DATA.explainExtra.statementSummaries;
  const first = h[0]!;
  const last = h[h.length - 1]!;
  const firstYear = yearLabel(first.period);
  const lastYear = yearLabel(last.period);
  const move = (a: number, b: number): 'up' | 'down' | 'flat' => {
    const base = Math.abs(a);
    if (base === 0) return b > 0 ? 'up' : b < 0 ? 'down' : 'flat';
    const rel = (b - a) / base;
    return Math.abs(rel) < s.flatBelow ? 'flat' : rel > 0 ? 'up' : 'down';
  };
  const sales = move(first.revenue, last.revenue);
  const salesVars = { first: compact(first.revenue, symbol), last: compact(last.revenue, symbol), firstYear, lastYear };
  const parts = [fill(sales === 'up' ? s.salesUp : sales === 'down' ? s.salesDown : s.salesFlat, salesVars)];
  const profit = move(first.netIncome, last.netIncome);
  const profitVars = { first: compact(first.netIncome, symbol), last: compact(last.netIncome, symbol) };
  parts.push(
    fill(
      profit === 'up' ? (sales === 'down' ? s.profitUpSalesDown : s.profitUp) : profit === 'down' ? s.profitDown : s.profitFlat,
      profitVars,
    ),
  );
  const losses = h.filter((p) => p.netIncome < 0).length;
  if (losses > 0) parts.push(fill(s.lossYears, { n: losses }));
  return parts.join(' ');
}

/** COPY §3.2 `analystCard` summary. */
export function analystSummary(analyst: { rating: string; priceTarget: number } | null | undefined, price: number, symbol: string): string {
  const a = COPY_DATA.explainExtra.analystCard;
  if (!analyst || !analyst.rating || !(analyst.priceTarget > 0) || !(price > 0)) return a.summaryNone;
  const rating = analyst.rating.charAt(0).toUpperCase() + analyst.rating.slice(1);
  const pct = (analyst.priceTarget - price) / price;
  return fill(pct >= 0 ? a.summaryAbove : a.summaryBelow, {
    rating,
    target: formatMoney(analyst.priceTarget, { symbol }),
    pct: formatPct(Math.abs(pct), { digits: 1 }),
  });
}

export interface StatRow {
  label: string;
  value: string;
  termId: string;
}

const metricText = (id: MetricId, f: Fundamentals, c: Company, symbol: string) => formatMetricValue(id, metricValue(id, f, c), symbol);

/** All stats (MOBILE §7.7): key-value rows, each with a "?". */
export function allStatsRows(c: Company, f: Fundamentals, symbol: string): StatRow[] {
  const money = (cents: number) => formatMoney(cents, { symbol });
  const row = (id: string, value: string): StatRow => ({ label: SHORT_LABELS[id]!.label, value, termId: SHORT_LABELS[id]!.termId });
  const has = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  return [
    row('week52Range', has(f.week52Low) && has(f.week52High) ? `${money(f.week52Low)} – ${money(f.week52High)}` : NULL_TEXT),
    row('sessionVolume', has(c.sessionVolume) ? formatNumber(c.sessionVolume) : NULL_TEXT),
    row('sharesOutstanding', has(c.sharesOutstanding) ? formatCompact(c.sharesOutstanding) : NULL_TEXT),
    row('float', has(f.float) ? formatCompact(f.float) : NULL_TEXT),
    row('forwardPe', metricText('forwardPe', f, c, symbol)),
    row('eps', metricText('eps', f, c, symbol)),
    row('dividendYield', metricText('dividendYield', f, c, symbol)),
    row('payoutRatio', has(f.payoutRatio) ? `${Math.round(f.payoutRatio * 100)}%` : NULL_TEXT),
    row('beta', metricText('beta', f, c, symbol)),
  ];
}

export type StatementKind = 'income' | 'balance' | 'cashflow';

export interface StatementTableModel {
  kind: StatementKind;
  years: string[];
  rows: { label: string; termId: string; values: string[] }[];
}

const STATEMENT_LATEST: Record<StatementKind, (keyof Fundamentals)[]> = {
  income: ['costOfRevenue', 'grossProfit', 'operatingIncome', 'ebitda'],
  balance: ['cash', 'totalAssets', 'totalDebt', 'totalLiabilities', 'equity'],
  cashflow: ['operatingCashFlow', 'capex', 'freeCashFlow'],
};

/**
 * Statement tables (MOBILE §7.8): the 4-year history gives Sales, Profit and Profit per share per
 * year; the other lines are the latest period only, so earlier years show "—".
 */
export function statementTable(kind: StatementKind, f: Fundamentals, symbol: string): StatementTableModel {
  const h = sortedHistory(f.history);
  const years = h.length ? h.map((p) => yearLabel(p.period)) : ['—'];
  const latestOnly = (value: unknown, format: (n: number) => string) =>
    years.map((_, i) => (i === years.length - 1 && typeof value === 'number' && Number.isFinite(value) ? format(value) : NULL_TEXT));
  const money = (n: number) => compact(n, symbol);
  const line = (key: string, values: string[]) => ({ label: SHORT_LABELS[key]!.label, termId: SHORT_LABELS[key]!.termId, values });
  if (kind === 'income') {
    const rows = [
      line('revenue', h.length ? h.map((p) => money(p.revenue)) : latestOnly(f.revenue, money)),
      ...STATEMENT_LATEST.income.slice(0, 3).map((k) => line(k, latestOnly(f[k], money))),
      line('netIncome', h.length ? h.map((p) => money(p.netIncome)) : latestOnly(f.netIncome, money)),
      line('ebitda', latestOnly(f.ebitda, money)),
      line('eps', h.length ? h.map((p) => formatMoney(p.eps, { symbol })) : latestOnly(f.eps, (n) => formatMoney(n, { symbol }))),
    ];
    return { kind, years, rows };
  }
  return { kind, years, rows: STATEMENT_LATEST[kind].map((k) => line(k, latestOnly(f[k], money))) };
}

export interface HistoryBar {
  year: string;
  revenue: number;
  netIncome: number;
}

export function historyBars(history: readonly FinancialPeriod[] | undefined): HistoryBar[] {
  return sortedHistory(history).map((p) => ({ year: yearLabel(p.period), revenue: p.revenue, netIncome: p.netIncome }));
}

/** Dispatches about this company, or about the whole market (no companies named), newest first. */
export function companyNews(news: readonly NewsEvent[], companyId: string, limit = 3): NewsEvent[] {
  return news
    .filter((n) => (n.companyIds ?? []).length === 0 || n.companyIds.includes(companyId))
    .sort((a, b) => b.firedAt - a.firedAt)
    .slice(0, limit);
}

/** Row tag: "Whole market" for market-wide dispatches, else the named tickers. */
export function newsTag(event: NewsEvent, byId: Record<string, Company>): string {
  const ids = event.companyIds ?? [];
  if (ids.length === 0) return 'Whole market';
  return ids.map((id) => byId[id]?.ticker ?? id.toUpperCase()).join(', ');
}
