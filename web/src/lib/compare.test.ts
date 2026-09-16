import { describe, it, expect } from 'vitest';
import { peerComparisons, explainMetric, metricValue, MIN_SECTOR_COMPANIES } from './compare';
const f = (pe: number, de: number, ni = 100) => ({ peRatio: pe, debtToEquity: de, netIncome: ni, revenue: 1000, netMargin: ni / 1000, history: [{ revenue: 800 }, { revenue: 850 }, { revenue: 900 }, { revenue: 1000 }] } as any);
const c = (id: string, sector: string) => ({ id, sector } as any);
describe('compare', () => {
  // Three per sector, as the 2026-09-16 roster has: a, b and d in Naval Arms, e alone in Banking.
  const fundamentals = { a: f(10, 0.5), b: f(20, 1), d: f(30, 1.5), e: f(40, 2.0) };
  const companies = { a: c('a', 'Naval Arms'), b: c('b', 'Naval Arms'), d: c('d', 'Naval Arms'), e: c('e', 'Treasure Banking') };
  const avg = peerComparisons(fundamentals, companies);
  it('compares a company with its peers, never with itself', () => {
    // The middle company is the regression: a sector median of 3 used to hand b back its own 20.
    expect(avg('peRatio', companies.b)).toMatchObject({ scope: 'sector', value: 20, count: 2 });
    expect(avg('peRatio', companies.a)).toMatchObject({ scope: 'sector', value: 25, count: 2 });
    expect(avg('peRatio', companies.d)).toMatchObject({ scope: 'sector', value: 15, count: 2 });
  });
  it('uses the rest of the market when the sector is too small, still leaving the company out', () => {
    expect(MIN_SECTOR_COMPANIES).toBe(3);
    // e is alone in Treasure Banking: the other three are 10, 20 and 30 → median 20, and e's own 40 is not in it.
    expect(avg('peRatio', companies.e)).toMatchObject({ scope: 'market', value: 20, count: 3 });
  });
  it('explains in everyday numbers', () => {
    const pe = explainMetric('peRatio', 17.8, { scope: 'sector', sector: 'Naval Arms', value: 22.1, count: 2 }, 'Ð');
    expect(pe.sentence).toBe('You pay Ð17.80 for every Ð1 of yearly profit.'); expect(pe.averageText).toBe('Rest of Naval Arms: 22.1');
    expect(explainMetric('netMargin', 0.14, avg('netMargin', companies.a), 'Ð').sentence).toBe('It keeps Ð14 of profit from every Ð100 of sales.');
    expect(explainMetric('peRatio', null, avg('peRatio', companies.a), 'Ð').valueText).toBe('—');
  });
  it('computes revenue growth from history', () => { expect(metricValue('revenueGrowth', f(1, 1), c('a', 'Naval Arms'))).toBeCloseTo((1000 / 800) ** (1 / 3) - 1, 10); });
});
