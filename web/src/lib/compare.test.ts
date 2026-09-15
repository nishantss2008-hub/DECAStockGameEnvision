import { describe, it, expect } from 'vitest';
import { sectorAverages, explainMetric, metricValue } from './compare';
const f = (pe: number, de: number, ni = 100) => ({ peRatio: pe, debtToEquity: de, netIncome: ni, revenue: 1000, netMargin: ni / 1000, history: [{ revenue: 800 }, { revenue: 850 }, { revenue: 900 }, { revenue: 1000 }] } as any);
const c = (id: string, sector: string) => ({ id, sector } as any);
describe('compare', () => {
  const fundamentals = { a: f(10, 0.5), b: f(20, 1), d: f(30, 1.5), e: f(40, 2.0) };
  const companies = { a: c('a', 'Naval Arms'), b: c('b', 'Naval Arms'), d: c('d', 'Naval Arms'), e: c('e', 'Cursed Relics') };
  const avg = sectorAverages(fundamentals, companies);
  it('uses sector median when ≥3 companies, else market median', () => {
    expect(avg('peRatio', 'Naval Arms')).toMatchObject({ scope: 'sector', value: 20, count: 3 });
    expect(avg('peRatio', 'Cursed Relics')).toMatchObject({ scope: 'market', value: 25 });
  });
  it('explains in everyday numbers', () => {
    const pe = explainMetric('peRatio', 17.8, { scope: 'sector', sector: 'Naval Arms', value: 22.1, count: 3 }, 'Ð');
    expect(pe.sentence).toBe('You pay Ð17.80 for every Ð1 of yearly profit.'); expect(pe.averageText).toBe('Sector average: 22.1');
    expect(explainMetric('netMargin', 0.14, avg('netMargin', 'Naval Arms'), 'Ð').sentence).toBe('It keeps Ð14 of profit from every Ð100 of sales.');
    expect(explainMetric('peRatio', null, avg('peRatio', 'Naval Arms'), 'Ð').valueText).toBe('—');
  });
  it('computes revenue growth from history', () => { expect(metricValue('revenueGrowth', f(1, 1), c('a', 'Naval Arms'))).toBeCloseTo((1000 / 800) ** (1 / 3) - 1, 10); });
});
