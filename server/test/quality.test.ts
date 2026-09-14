import { describe, it, expect } from 'vitest';
import { rankZ, computeQualityScores, gradeFor, spearman, invNormCdf, normCdf, type QualityInput } from '@deca/shared';
const mk = (id: string, k: number): QualityInput => ({
  id, sector: 'Naval Arms', grossProfit: 400 * k, totalAssets: 1000, roe: 0.05 * k, operatingCashFlow: 90 * k, netIncome: 60 * k,
  debtToEquity: 2.5 / k, currentRatio: 0.5 * k, operatingIncome: 80 * k, marketCap: 5000, totalLiabilities: 600, revenue: 900 + 50 * k,
  peRatio: 30 - k, evToEbitda: 20 - k, psRatio: 5 - 0.3 * k, industryGrowthRate: 0.01 * k,
  history: [0, 1, 2, 3].map((y) => ({ revenue: 800 * (1 + 0.02 * k) ** y, netIncome: 50 * k * (1 + 0.02 * k) ** y, eps: 100 * k * (1 + 0.02 * k) ** y })),
});
describe('mathx', () => {
  it('rankZ is mean 0 sd 1 and spans ±1.664 for N=25', () => {
    const z = rankZ(Array.from({ length: 25 }, (_, i) => i));
    expect(Math.max(...z)).toBeCloseTo(1.664, 3); expect(Math.min(...z)).toBeCloseTo(-1.664, 3);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
  });
  it('rankZ averages ties and ranks undefined worst', () => {
    const z = rankZ([5, 5, undefined, 9]);
    expect(z[0]).toBeCloseTo(z[1]!, 12); expect(z[2]).toBeLessThan(z[0]!); expect(z[3]).toBeGreaterThan(z[0]!);
  });
  it('normal cdf helpers invert each other', () => {
    for (const p of [0.01, 0.2, 0.5, 0.9, 0.999]) expect(normCdf(invNormCdf(p))).toBeCloseTo(p, 5);
  });
  it('spearman of identical order is 1', () => { expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12); });
});
describe('quality score', () => {
  const inputs = Array.from({ length: 10 }, (_, i) => mk(`c${i}`, i + 1));
  const refs = { 'Naval Arms': { pe: 18, evEbitda: 12, ps: 2.5 } };
  const res = computeQualityScores(inputs, refs);
  it('keeps input order and maps q into (-1,1)', () => {
    expect(res.map((r) => r.id)).toEqual(inputs.map((i) => i.id));
    for (const r of res) { expect(r.q).toBeGreaterThan(-1); expect(r.q).toBeLessThan(1); }
  });
  it('better fundamentals score higher', () => {
    expect(res[9]!.score).toBeGreaterThan(res[0]!.score);
    expect(res[9]!.grade).toBe('A'); expect(res[0]!.grade).toBe('F');
  });
  it('grades by quintile', () => { expect(gradeFor(0, 25)).toBe('A'); expect(gradeFor(24, 25)).toBe('F'); expect(gradeFor(12, 25)).toBe('C'); });
});
