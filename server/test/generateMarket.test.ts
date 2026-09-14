import { describe, it, expect } from 'vitest';
import { spearman, GRADES, SECTORS } from '@deca/shared';
import { generateMarket } from '../src/seed/generateMarket';
import { ROSTER } from '../src/seed/roster';
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * tol);
describe('generateMarket', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(generateMarket('x')).toEqual(generateMarket('x'));
    expect(generateMarket('x').companies[0]!.company.currentPrice).not.toBe(generateMarket('y').companies[0]!.company.currentPrice);
  });
  it('holds accounting identities for 50 seeds', () => {
    for (let s = 0; s < 50; s++) for (const { company: c, fundamentals: f } of generateMarket(`id${s}`).companies) {
      expect(f.grossProfit).toBe(f.revenue - f.costOfRevenue);
      expect(near(f.totalAssets, f.equity + f.totalLiabilities)).toBe(true);
      expect(near(f.totalDebt, f.debtToEquity * f.equity, 0.02)).toBe(true);
      expect(f.freeCashFlow).toBe(f.operatingCashFlow - f.capex);
      expect(c.marketCap).toBe(c.currentPrice * c.sharesOutstanding);
      expect(f.marketCap).toBe(c.marketCap);
      if (f.netIncome > 0) expect(near(f.peRatio, f.marketCap / f.netIncome, 0.02)).toBe(true);
      expect(c.startPrice).toBeGreaterThanOrEqual(1200); expect(c.startPrice).toBeLessThanOrEqual(52000);
      expect(f.history).toHaveLength(4); expect(c.beta).toBeGreaterThanOrEqual(0.7); expect(c.beta).toBeLessThanOrEqual(1.4);
      expect(f.beta).toBe(c.beta);
    }
  });
  it('spreads quality: all grades present, q spans, some loss-makers overall', () => {
    let losses = 0; let total = 0;
    for (let s = 0; s < 20; s++) {
      const m = generateMarket(`g${s}`); const grades = new Set(m.companies.map((g) => g.quality.grade));
      for (const g of GRADES) expect(grades.has(g)).toBe(true);
      const qs = m.companies.map((g) => g.quality.q); expect(Math.min(...qs)).toBeLessThan(-0.9); expect(Math.max(...qs)).toBeGreaterThan(0.9);
      losses += m.companies.filter((g) => g.fundamentals.netIncome <= 0).length; total += 25;
    }
    expect(losses / total).toBeGreaterThan(0.02); expect(losses / total).toBeLessThan(0.2);
  });
  it('analyst view is only a noisy hint of quality', () => {
    let rho = 0;
    for (let s = 0; s < 20; s++) { const m = generateMarket(`a${s}`).companies; rho += spearman(m.map((g) => g.quality.score), m.map((g) => g.fundamentals.analyst.priceTarget / g.company.startPrice)); }
    expect(rho / 20).toBeGreaterThan(0.2); expect(rho / 20).toBeLessThan(0.8);
  });
  it('uses the renamed roster entry', () => {
    const m = generateMarket('r'); expect(m.companies.some((g) => g.company.ticker === 'BRTH')).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/barbossa/i);
  });
});

describe('generateMarket text', () => {
  // Roster company and sector names are data and may contain these words; generated text may not.
  const strip = (text: string) => {
    let out = text;
    for (const name of [...ROSTER.map((r) => r.name), ...SECTORS].sort((a, b) => b.length - a.length)) {
      out = out.split(name).join('').split(name.toLowerCase()).join('');
    }
    return out;
  };
  it('keeps every qualitative field populated', () => {
    for (let s = 0; s < 10; s++) for (const { company: c, fundamentals: f } of generateMarket(`t${s}`).companies) {
      expect(c.description).toBe(`${c.name} — ${c.sector}.`);
      expect(f.businessOverview.length).toBeGreaterThan(20);
      expect(f.management.length).toBeGreaterThanOrEqual(2); expect(f.management.length).toBeLessThanOrEqual(4);
      for (const p of f.management) { expect(p.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/); expect(p.role.length).toBeGreaterThan(0); expect(p.bio.length).toBeGreaterThan(0); expect(p.tenureYears).toBeGreaterThanOrEqual(1); }
      expect(new Set(f.management.map((p) => p.name)).size).toBe(f.management.length);
      expect(f.industry.sector).toBe(c.sector); expect(f.industry.competitivePosition.length).toBeGreaterThan(0); expect(f.industry.notes.length).toBeGreaterThan(0);
      expect(f.marketingStrategy.length).toBeGreaterThan(0);
      expect(f.riskFactors.length).toBeGreaterThanOrEqual(3); expect(f.recentDevelopments.length).toBeGreaterThanOrEqual(2);
      expect(f.riskFactors.includes('Heavy debt load')).toBe(f.debtToEquity > 1.8);
      expect(f.riskFactors.includes('Thin cash cushion')).toBe(f.currentRatio < 0.9);
      expect(['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell']).toContain(f.analyst.rating);
    }
  });
  it('generated text has no alcohol words and no film character names', () => {
    for (let s = 0; s < 30; s++) {
      for (const { company: c, fundamentals: f } of generateMarket(`w${s}`).companies) {
        const text = strip([
          c.description, f.businessOverview, f.marketingStrategy, f.industry.competitivePosition, f.industry.notes,
          ...f.riskFactors, ...f.recentDevelopments, f.analyst.rating,
          ...f.management.flatMap((p) => [p.name, p.role, p.bio]),
        ].join(' | '));
        expect(text).not.toMatch(/rum|grog|ale|beer|wine|tavern|drunk|brew|distill|liquor|cask/i);
        expect(text).not.toMatch(/sparrow|barbossa|turner|swann|norrington|gibbs|beckett|salazar|teague|black pearl/i);
      }
    }
  });
});
