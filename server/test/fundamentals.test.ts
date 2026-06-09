import { describe, it, expect } from 'vitest';
import { ROSTER } from '../src/seed/roster';
import { generateCompanyData } from '../src/seed/generateFundamentals';

const SEED = 'test-seed';

describe('generateCompanyData', () => {
  it('is deterministic for the same seed + archetype', () => {
    const entry = ROSTER[0]!;
    expect(generateCompanyData(SEED, entry, 'compounder')).toEqual(
      generateCompanyData(SEED, entry, 'compounder'),
    );
  });

  it('produces internally-consistent financials for every company', () => {
    for (const e of ROSTER) {
      const { company, fundamentals: f } = generateCompanyData(SEED, e, 'steady');
      expect(f.marketCap).toBe(company.currentPrice * company.sharesOutstanding);
      expect(f.grossProfit).toBe(f.revenue - f.costOfRevenue);
      // margin ordering: net <= operating <= gross
      expect(f.netMargin).toBeLessThanOrEqual(f.operatingMargin + 1e-6);
      expect(f.operatingMargin).toBeLessThanOrEqual(f.grossMargin + 1e-6);
      expect(f.netMargin).toBeGreaterThan(-1);
      expect(f.netMargin).toBeLessThan(1);
      expect(f.eps).toBeGreaterThan(0);
      if (f.netIncome > 0) {
        expect(Math.abs(f.peRatio - f.marketCap / f.netIncome)).toBeLessThan(1);
      }
      expect(f.management.length).toBeGreaterThanOrEqual(2);
      expect(f.history).toHaveLength(4);
      expect(['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell']).toContain(f.analyst.rating);
      expect(f.week52Low).toBeLessThan(f.week52High);
    }
  });

  it('rewards research: compounders carry higher avg net margin than decliners', () => {
    let comp = 0;
    let dec = 0;
    for (const e of ROSTER) {
      comp += generateCompanyData(SEED, e, 'compounder').fundamentals.netMargin;
      dec += generateCompanyData(SEED, e, 'decliner').fundamentals.netMargin;
    }
    expect(comp / ROSTER.length).toBeGreaterThan(dec / ROSTER.length);
  });
});
