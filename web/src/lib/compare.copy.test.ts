/**
 * explainMetric against every worked example in COPY.md §3.1 (parsed at build time into
 * glossary.data.ts), plus the live-valuation and "n/m" rules.
 */
import { describe, it, expect } from 'vitest';
import type { Company, Fundamentals } from '@deca/shared';
import { COPY_DATA } from './glossary.data';
import {
  METRIC_IDS,
  MONEY_METRICS,
  explainMetric,
  formatMetricValue,
  isNotMeaningful,
  metricValue,
  peerComparisons,
  type MetricId,
  type PeerComparison,
} from './compare';

const toInternal = (id: MetricId, v: number | null) => (v === null ? null : MONEY_METRICS.has(id) ? Math.round(v * 100) : v);

describe('explainMetric reproduces every COPY §3.1 example', () => {
  it('covers exactly the MetricIds', () => {
    expect(COPY_DATA.explain.map((e) => e.id).sort()).toEqual([...METRIC_IDS].sort());
  });

  for (const template of COPY_DATA.explain) {
    const id = template.id as MetricId;
    const sectorAvg = COPY_DATA.exampleCompany.sectorAverages[id];
    const avg: PeerComparison = { scope: 'sector', sector: 'Shipping & Salvage', value: toInternal(id, sectorAvg ?? null), count: 2 };
    for (const key of ['example', 'lossExample', 'nullExample', 'zeroExample'] as const) {
      const ex = template[key];
      if (!ex) continue;
      it(`${id}.${key}`, () => {
        const out = explainMetric(id, toInternal(id, ex.value), avg, 'Ð');
        expect(out.valueText).toBe(ex.valueText);
        expect(out.sentence).toBe(ex.sentence);
        if (ex.averageText) expect(out.averageText).toBe(ex.averageText);
        if (template.compareNote) expect(out.note).toBe(template.compareNote);
        else expect(out.note).toBeUndefined();
      });
    }
  }
});

describe('explainMetric details', () => {
  const sector: PeerComparison = { scope: 'sector', sector: 'Naval Arms', value: 22.1, count: 2 };

  it('names the sector, and uses the market line and a dash when there is no sector comparison', () => {
    expect(explainMetric('peRatio', 17.8, sector, 'Ð').averageText).toBe('Rest of Naval Arms: 22.1');
    expect(explainMetric('peRatio', 17.8, { ...sector, scope: 'market', value: 21.4 }, 'Ð').averageText).toBe('Rest of the market: 21.4');
    expect(explainMetric('peRatio', 17.8, { ...sector, value: null }, 'Ð').averageText).toBe('Rest of Naval Arms: —');
  });

  it('fills a renamed currency symbol', () => {
    expect(explainMetric('peRatio', 17.8, sector, '$').sentence).toBe('You pay $17.80 for every $1 of yearly profit.');
    expect(explainMetric('marketCap', 2_036_000_000_000, { ...sector, value: 984_000_000_000 }, '$')).toMatchObject({
      valueText: '$20.36B',
      averageText: 'Rest of Naval Arms: $9.84B',
    });
  });

  it('marks P/E, forward P/E and EV/EBITDA above 200 or at/below zero as n/m', () => {
    expect(isNotMeaningful('peRatio', 250)).toBe(true);
    expect(isNotMeaningful('evToEbitda', 0)).toBe(true);
    expect(isNotMeaningful('forwardPe', -3)).toBe(true);
    expect(isNotMeaningful('peRatio', 200)).toBe(false);
    expect(isNotMeaningful('psRatio', 250)).toBe(false);
    expect(isNotMeaningful('peRatio', null)).toBe(false);

    const high = explainMetric('peRatio', 250, sector, 'Ð');
    expect(high.valueText).toBe('n/m');
    expect(high.sentence).toBe('You pay Ð250.00 for every Ð1 of yearly profit.');
    const zero = explainMetric('evToEbitda', 0, sector, 'Ð');
    expect(zero.valueText).toBe('n/m');
    expect(zero.sentence).toBe(COPY_DATA.explain.find((e) => e.id === 'evToEbitda')!.whenNull);
    expect(explainMetric('peRatio', null, sector, 'Ð').valueText).toBe('—');
  });

  it('formats list cells the same way as ExplainRow values', () => {
    expect(formatMetricValue('peRatio', 17.78, 'Ð')).toBe('17.8');
    expect(formatMetricValue('peRatio', 900, 'Ð')).toBe('n/m');
    expect(formatMetricValue('netMargin', 0.14, 'Ð')).toBe('14.0%');
    expect(formatMetricValue('revenue', 814_000_000_000, 'Ð')).toBe('Ð8.14B');
    expect(formatMetricValue('debtToEquity', null, 'Ð')).toBe('—');
  });
});

// KRKN from BRIEF §7, in integer cents.
const krknF = {
  marketCap: 2_035_704_000_000,
  sharesOutstanding: 242_000_000,
  peRatio: 17.86,
  forwardPe: 15.9,
  psRatio: 2.5,
  pbRatio: 3.25,
  evToEbitda: 10.0,
  dividendYield: 0.019,
  revenue: 814_000_000_000,
  netIncome: 114_000_000_000,
  netMargin: 0.14,
  grossMargin: 0.378,
  eps: 473,
  ebitda: 228_000_000_000,
  cash: 142_000_000_000,
  totalDebt: 388_000_000_000,
  equity: 626_000_000_000,
  debtToEquity: 0.62,
  currentRatio: 1.84,
  freeCashFlow: 96_000_000_000,
  roe: 0.182,
  roa: 0.089,
  beta: 1.12,
  history: [
    { period: 'FY2022', revenue: 661_000_000_000, netIncome: 94_000_000_000, eps: 388 },
    { period: 'FY2023', revenue: 718_000_000_000, netIncome: 103_000_000_000, eps: 426 },
    { period: 'FY2024', revenue: 774_000_000_000, netIncome: 109_000_000_000, eps: 450 },
    { period: 'FY2025', revenue: 814_000_000_000, netIncome: 114_000_000_000, eps: 471 },
  ],
} as unknown as Fundamentals;
const krknC = { id: 'kraken', sector: 'Shipping & Salvage', currentPrice: 8412, startPrice: 8412, sharesOutstanding: 242_000_000, beta: 1.15 } as unknown as Company;

describe('metricValue: live valuation (COPY §0.6)', () => {
  it('recomputes size and multiples from the current price', () => {
    const up = { ...krknC, currentPrice: 8412 * 1.1 } as Company;
    expect(metricValue('marketCap', krknF, up)).toBeCloseTo(8412 * 1.1 * 242_000_000, 0);
    // COPY §0.6: P/E, forward P/E, P/S and P/B scale the stored start values by currentPrice ÷ startPrice.
    expect(metricValue('peRatio', krknF, up)).toBeCloseTo(17.86 * 1.1, 10);
    expect(metricValue('forwardPe', krknF, up)).toBeCloseTo(15.9 * 1.1, 10);
    expect(metricValue('psRatio', krknF, up)).toBeCloseTo(2.5 * 1.1, 10);
    expect(metricValue('pbRatio', krknF, up)).toBeCloseTo(3.25 * 1.1, 10);
    expect(metricValue('evToEbitda', krknF, up)).toBeCloseTo((8412 * 1.1 * 242_000_000 + 388_000_000_000 - 142_000_000_000) / 228_000_000_000, 10);
    expect(metricValue('dividendYield', krknF, up)).toBeCloseTo(0.019 / 1.1, 10);
  });

  it('keeps operating figures as stored and prefers the live company beta', () => {
    expect(metricValue('revenue', krknF, krknC)).toBe(814_000_000_000);
    expect(metricValue('netMargin', krknF, krknC)).toBe(0.14);
    expect(metricValue('eps', krknF, krknC)).toBe(473);
    expect(metricValue('debtToEquity', krknF, krknC)).toBe(0.62);
    expect(metricValue('beta', krknF, krknC)).toBe(1.15);
    expect(metricValue('revenueGrowth', krknF, krknC)).toBeCloseTo((8.14 / 6.61) ** (1 / 3) - 1, 10);
  });

  it('returns null where COPY says the number is not meaningful', () => {
    const loss = { ...krknF, netIncome: -5_000_000_000, peRatio: 0, forwardPe: 0 } as Fundamentals;
    expect(metricValue('peRatio', loss, krknC)).toBeNull();
    expect(metricValue('forwardPe', loss, krknC)).toBeNull();
    const underwater = { ...krknF, equity: -1 } as Fundamentals;
    expect(metricValue('pbRatio', underwater, krknC)).toBeNull();
    expect(metricValue('debtToEquity', underwater, krknC)).toBeNull();
    expect(metricValue('roe', underwater, krknC)).toBeNull();
    expect(metricValue('psRatio', { ...krknF, revenue: 0 } as Fundamentals, krknC)).toBeNull();
    expect(metricValue('evToEbitda', { ...krknF, ebitda: 0 } as Fundamentals, krknC)).toBeNull();
    expect(metricValue('evToEbitda', { ...krknF, cash: 10_000_000_000_000 } as Fundamentals, krknC)).toBeNull();
    expect(metricValue('revenueGrowth', { ...krknF, history: [krknF.history[0]!] } as Fundamentals, krknC)).toBeNull();
  });
});

describe('peerComparisons details', () => {
  const f = (pe: number, ni = 100) => ({ peRatio: pe, netIncome: ni, revenue: 1000, netMargin: ni / 1000 }) as unknown as Fundamentals;
  const c = (id: string, sector: string) => ({ id, sector }) as unknown as Company;
  const arms = ['a', 'b', 'd', 'e'].map((id) => c(id, 'Naval Arms'));
  const bank = c('g', 'Treasure Banking');
  const all = Object.fromEntries([...arms, bank].map((x) => [x.id, x]));

  it('leaves n/m and missing values out, and leaves the company itself out', () => {
    // d is n/m (900) and e has no P/E (a loss), so a's peers are just b (20); b's are just a (10).
    const avg = peerComparisons({ a: f(10), b: f(20), d: f(900), e: f(0, -50), g: f(30) }, all);
    expect(avg('peRatio', arms[0]!)).toEqual({ scope: 'sector', sector: 'Naval Arms', value: 20, count: 1 });
    expect(avg('peRatio', arms[1]!)).toEqual({ scope: 'sector', sector: 'Naval Arms', value: 10, count: 1 });
    // d's own 900 is n/m, so it is out of every pool; d still reads its two peers, 10 and 20.
    expect(avg('peRatio', arms[2]!)).toEqual({ scope: 'sector', sector: 'Naval Arms', value: 15, count: 2 });
    // g is alone in its sector, so it falls back to every OTHER company: 10, 20 (30 is its own).
    expect(avg('peRatio', bank)).toEqual({ scope: 'market', sector: 'Treasure Banking', value: 15, count: 2 });
  });

  it('falls back to the market when no peer in the sector has the number', () => {
    // Only a has a P/E in Naval Arms, so a itself has no sector peer and reads the market instead.
    const avg = peerComparisons({ a: f(10), b: f(0, -50), d: f(0, -50), g: f(30) }, all);
    expect(avg('peRatio', arms[0]!)).toEqual({ scope: 'market', sector: 'Naval Arms', value: 30, count: 1 });
    expect(avg('peRatio', arms[1]!)).toEqual({ scope: 'sector', sector: 'Naval Arms', value: 10, count: 1 });
  });

  it('ignores companies without fundamentals and reports null when nothing is usable', () => {
    const avg = peerComparisons({}, { a: c('a', 'Naval Arms') });
    expect(avg('peRatio', c('a', 'Naval Arms'))).toEqual({ scope: 'market', sector: 'Naval Arms', value: null, count: 0 });
  });
});
