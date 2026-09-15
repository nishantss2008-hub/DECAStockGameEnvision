/**
 * metricValue → explainMetric on the COPY.md §3 example company (KRKN), built from the parsed
 * `example-company` block, so every MetricId example is reproduced from company data through the
 * live-valuation formulas of COPY §0.6 — not only from the example value itself.
 * Also: every COPY §3 format token rounds half-up exactly like lib/format.
 */
import { describe, it, expect } from 'vitest';
import type { Company, Fundamentals } from '@deca/shared';
import { COPY_DATA } from './glossary.data';
import { explainMetric, formatMetricValue, metricValue, METRIC_IDS, MONEY_METRICS, type MetricId, type SectorAverage } from './compare';
import { formatMoney, formatNumber, formatPct } from './format';

const ex = COPY_DATA.exampleCompany;
const num = (key: string) => ex.values[key]!.value as number;
const list = (key: string) => ex.values[key]!.value as number[];
const cents = (units: number) => Math.round(units * 100);

/** KRKN as the engine stores it: money in integer cents, valuation fields at the starting price. */
const krknF = {
  marketCap: cents(num('marketCap')),
  sharesOutstanding: num('sharesOutstanding'),
  peRatio: num('peRatio'),
  forwardPe: num('forwardPe'),
  psRatio: num('psRatio'),
  pbRatio: num('pbRatio'),
  evToEbitda: num('evToEbitda'),
  dividendYield: num('dividendYield'),
  payoutRatio: num('payoutRatio'),
  revenue: cents(num('revenue')),
  costOfRevenue: cents(num('costOfRevenue')),
  grossProfit: cents(num('grossProfit')),
  operatingIncome: cents(num('operatingIncome')),
  netIncome: cents(num('netIncome')),
  eps: cents(num('eps')),
  ebitda: cents(num('ebitda')),
  grossMargin: num('grossMargin'),
  operatingMargin: num('operatingMargin'),
  netMargin: num('netMargin'),
  cash: cents(num('cash')),
  totalAssets: cents(num('totalAssets')),
  totalDebt: cents(num('totalDebt')),
  totalLiabilities: cents(num('totalLiabilities')),
  equity: cents(num('equity')),
  currentRatio: num('currentRatio'),
  debtToEquity: num('debtToEquity'),
  operatingCashFlow: cents(num('operatingCashFlow')),
  capex: cents(num('capex')),
  freeCashFlow: cents(num('freeCashFlow')),
  roe: num('roe'),
  roa: num('roa'),
  beta: num('beta'),
  history: list('revenueByYear').map((revenue, i) => ({
    period: `FY${2022 + i}`,
    revenue: cents(revenue),
    netIncome: cents(list('netIncomeByYear')[i]!),
    eps: 0,
  })),
} as unknown as Fundamentals;

const startPrice = cents(num('price'));
const krknC = {
  id: 'kraken',
  ticker: ex.ticker,
  name: ex.name,
  sector: ex.sector,
  currentPrice: startPrice,
  startPrice,
  sharesOutstanding: num('sharesOutstanding'),
  marketCap: startPrice * num('sharesOutstanding'),
  beta: num('beta'),
} as unknown as Company;

const avgFor = (id: MetricId): SectorAverage => {
  const v = ex.sectorAverages[id];
  const value = v === undefined ? null : MONEY_METRICS.has(id) ? cents(v) : v;
  return { scope: 'sector', sector: ex.sector as Company['sector'], value, count: 5 };
};

/**
 * EV/EBITDA: COPY §0.6 recomputes it from live size + debt − cash, and the example's inputs are
 * rounded mockup figures ((20.36B + 3.88B − 1.42B) ÷ 2.28B = 10.009), so its money phrase reads
 * Ð10.01 where the illustrative sentence says Ð10.00. The shown value, 10.0, still matches.
 */
const SENTENCE_FROM_MOCKUP_ROUNDING = new Set<MetricId>(['evToEbitda']);

describe('COPY §3 examples reproduced from the KRKN company data (live valuation, COPY §0.6)', () => {
  for (const id of METRIC_IDS) {
    const template = COPY_DATA.explain.find((t) => t.id === id)!;
    it(`${id}: ${template.example!.valueText}`, () => {
      const value = metricValue(id, krknF, krknC);
      const out = explainMetric(id, value, avgFor(id), 'Ð');
      expect(out.valueText).toBe(template.example!.valueText);
      expect(formatMetricValue(id, value, 'Ð')).toBe(template.example!.valueText);
      if (template.example!.averageText) expect(out.averageText).toBe(template.example!.averageText);
      if (!SENTENCE_FROM_MOCKUP_ROUNDING.has(id)) expect(out.sentence).toBe(template.example!.sentence);
    });
  }

  it('P/E, forward P/E, P/S and P/B scale the stored start values by currentPrice ÷ startPrice', () => {
    const up = { ...krknC, currentPrice: Math.round(startPrice * 1.25) } as Company;
    const scale = up.currentPrice / startPrice;
    expect(metricValue('peRatio', krknF, up)).toBeCloseTo(17.8 * scale, 10);
    expect(metricValue('forwardPe', krknF, up)).toBeCloseTo(15.9 * scale, 10);
    expect(metricValue('psRatio', krknF, up)).toBeCloseTo(2.5 * scale, 10);
    expect(metricValue('pbRatio', krknF, up)).toBeCloseTo(3.25 * scale, 10);
    expect(metricValue('dividendYield', krknF, up)).toBeCloseTo(0.019 / scale, 10);
    const liveCap = up.currentPrice * 242_000_000;
    expect(metricValue('marketCap', krknF, up)).toBe(liveCap);
    expect(metricValue('evToEbitda', krknF, up)).toBeCloseTo((liveCap + krknF.totalDebt - krknF.cash) / krknF.ebitda, 10);
  });

  it('recomputes a multiple from the live size when its start value is not stored', () => {
    const bare = { ...krknF, peRatio: undefined, psRatio: undefined, pbRatio: undefined } as unknown as Fundamentals;
    const liveCap = startPrice * 242_000_000;
    expect(metricValue('peRatio', bare, krknC)).toBeCloseTo(liveCap / krknF.netIncome, 10);
    expect(metricValue('psRatio', bare, krknC)).toBeCloseTo(liveCap / krknF.revenue, 10);
    expect(metricValue('pbRatio', bare, krknC)).toBeCloseTo(liveCap / krknF.equity, 10);
  });
});

describe('COPY §3 format tokens round half-up like lib/format', () => {
  const avg: SectorAverage = { scope: 'sector', sector: 'Naval Arms', value: null, count: 0 };

  it('pct1 rounds negative halves away from zero and has no binary drift', () => {
    expect(formatMetricValue('netMargin', -0.0355, 'Ð')).toBe(formatPct(-0.0355, { digits: 1 }));
    expect(formatMetricValue('netMargin', -0.0355, 'Ð')).toBe('−3.6%');
    expect(formatMetricValue('netMargin', 0.0055, 'Ð')).toBe('0.6%');
  });

  it('ratio2 and ratioMoney match formatNumber and formatMoney', () => {
    expect(formatMetricValue('debtToEquity', 0.145, 'Ð')).toBe(formatNumber(0.145, 2));
    expect(formatMetricValue('debtToEquity', 1.005, 'Ð')).toBe('1.01');
    expect(explainMetric('debtToEquity', 0.145, avg, 'Ð').sentence).toBe(
      `It has ${formatMoney(15)} of debt for every Ð1 of owner equity (what it owns minus what it owes).`,
    );
  });

  it('pctWhole rounds 14.5% to 15%', () => {
    expect(explainMetric('revenueGrowth', 0.145, avg, 'Ð').sentence).toBe('Sales grew about 15% a year over the last 3 years.');
    expect(explainMetric('revenueGrowth', -0.285, avg, 'Ð').sentence).toBe('Sales shrank about 29% a year over the last 3 years.');
  });

  it('per100 rounds half a cent up', () => {
    expect(explainMetric('netMargin', 0.00145, avg, 'Ð').sentence).toBe('It keeps Ð0.15 of profit from every Ð100 of sales.');
    expect(explainMetric('roe', -0.00035, avg, 'Ð').sentence).toBe('It lost Ð0.04 for every Ð100 of owner equity.');
  });

  it('averages use the same rounding', () => {
    expect(explainMetric('debtToEquity', 1, { ...avg, value: 0.145 }, 'Ð').averageText).toBe('Sector average: 0.15');
  });
});
