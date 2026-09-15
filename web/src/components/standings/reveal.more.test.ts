import { describe, it, expect } from 'vitest';
import type { Company } from '@deca/shared';
import {
  LABEL_COPY,
  PILLAR_COPY,
  crewHealthScore,
  driversText,
  healthScore,
  holdingsBreakdown,
  luckExtremes,
  movement,
  movementSpoken,
  researchSummary,
  revealLine,
  revealRows,
  scatterPoints,
  sortRevealRows,
} from './reveal';

const reveal = (over: Partial<NonNullable<Company['reveal']>> = {}) => ({
  quality: 0,
  q: 0,
  qEff: 0,
  surprise: 0,
  grade: 'C' as const,
  pillars: { prof: 0.2, grow: -0.9, safe: 0.5, val: 0.1 },
  fairValue: 100,
  expectedReturn: 0,
  actualReturn: 0,
  luck: 0,
  label: 'compounder' as const,
  ...over,
});

const co = (ticker: string, over: Partial<NonNullable<Company['reveal']>> = {}, price = 10_000): Company =>
  ({ id: ticker.toLowerCase(), ticker, name: `${ticker} Co`, sector: 'shipping', currentPrice: price, reveal: reveal(over) }) as unknown as Company;

describe('movement', () => {
  it('reads down moves and a missing session-start rank as no change', () => {
    expect(movement({ rank: 4, prevRank: 2 } as never)).toEqual({ dir: 'down', by: 2 });
    expect(movement({ rank: 4, prevRank: 0 } as never)).toEqual({ dir: 'flat', by: 0 });
  });
  it('speaks places with the right plural', () => {
    expect(movementSpoken({ dir: 'up', by: 1 })).toBe('up 1 place');
    expect(movementSpoken({ dir: 'down', by: 3 })).toBe('down 3 places');
    expect(movementSpoken({ dir: 'flat', by: 0 })).toBe('no change');
  });
});

describe('copy maps', () => {
  it('uses COPY §10 names verbatim', () => {
    expect(LABEL_COPY).toEqual({ compounder: 'Compounder', unlucky_gem: 'Unlucky gem', lucky_turnaround: 'Lucky turnaround', decliner: 'Decliner' });
    expect(PILLAR_COPY.val.high).toBe('Low starting price for its profits');
    expect(PILLAR_COPY.grow.low).toBe('Slow or shrinking business');
  });
});

describe('drivers', () => {
  it('picks the 2 pillars farthest from 0, high at 0 or above, second lowercased', () => {
    expect(driversText({ prof: 0.2, grow: -0.9, safe: 0.5, val: 0.1 })).toBe('Slow or shrinking business, safer finances');
    expect(driversText({ prof: 1.1, grow: 0, safe: 0.4, val: 0 })).toBe('Strong profits, safer finances');
    expect(driversText({ prof: 0, grow: 0, safe: 0, val: 0 })).toBe('Strong profits, growing business');
  });
});

describe('health scores', () => {
  it('maps the rank-z quality score onto 0–100, clamped', () => {
    expect(healthScore(0)).toBe(50);
    expect(healthScore(1.664)).toBe(100);
    expect(healthScore(-1.664)).toBe(0);
    expect(healthScore(5)).toBe(100);
    expect(healthScore(-5)).toBe(0);
  });
  it('maps the value-weighted engine q onto the same 0–100 scale', () => {
    expect(crewHealthScore(0)).toBe(50);
    expect(crewHealthScore(0.42)).toBe(71);
    expect(crewHealthScore(-1)).toBe(0);
  });
});

describe('reveal rows', () => {
  const rows = revealRows([
    co('LOW', { quality: -1.2, q: -0.7, grade: 'D', expectedReturn: Math.log(0.99), actualReturn: Math.log(1.278), luck: 0.2, label: 'lucky_turnaround' }),
    co('TOP', { quality: 1.4, q: 0.9, grade: 'A', expectedReturn: Math.log(1.152), actualReturn: Math.log(1.196), label: 'compounder' }),
    co('MID', { quality: 0.3, q: 0.1, grade: 'B', expectedReturn: Math.log(1.143), actualReturn: Math.log(0.831), label: 'unlucky_gem' }),
    { id: 'none', ticker: 'NONE', name: 'No reveal' } as unknown as Company,
  ]);

  it('skips companies without a reveal and converts log returns to simple percent', () => {
    expect(rows.map((r) => r.ticker)).toEqual(['TOP', 'MID', 'LOW']);
    expect(rows[0]!.expected).toBeCloseTo(0.152, 6);
    expect(rows[0]!.actual).toBeCloseTo(0.196, 6);
    expect(rows[0]!.luck).toBeCloseTo(0.044, 6);
    expect(rows[0]!.label).toBe('compounder');
    expect(rows[0]!.quality).toBe(92);
  });

  it('writes the phone line with points, never pts', () => {
    expect(revealLine(rows[0]!)).toBe('Expected +15.20% · Actual +19.60% · Luck +4.40 points');
    expect(revealLine(rows[1]!)).toBe('Expected +14.30% · Actual −16.90% · Luck −31.20 points');
  });

  it('sorts by health, luck or actual return', () => {
    expect(sortRevealRows(rows, 'luck').map((r) => r.ticker)).toEqual(['LOW', 'TOP', 'MID']);
    expect(sortRevealRows(rows, 'actual').map((r) => r.ticker)).toEqual(['LOW', 'TOP', 'MID']);
    expect(sortRevealRows(rows, 'quality').map((r) => r.ticker)).toEqual(['TOP', 'MID', 'LOW']);
  });

  it('finds the luckiest and unluckiest and builds scatter points with holdings highlighted', () => {
    expect(luckExtremes(rows)).toEqual({ luckiest: 'LOW', unluckiest: 'MID' });
    const points = scatterPoints(rows, new Set(['top']));
    expect(points.find((p) => p.id === 'TOP')).toMatchObject({ x: 92, highlight: true, label: 'TOP' });
    expect(points.find((p) => p.id === 'MID')!.highlight).toBe(false);
    expect(points.find((p) => p.id === 'MID')!.y).toBeCloseTo(-0.169, 6);
    expect(luckExtremes([])).toEqual({ luckiest: null, unluckiest: null });
  });
});

describe('research summary', () => {
  const entries = [
    { teamId: 'w', rank: 1, researchScore: 0.64, researchGrade: 'A', heldAnyShares: true },
    { teamId: 'me', rank: 3, researchScore: 0.42, researchGrade: 'B', heldAnyShares: true },
    { teamId: 'idle', rank: 2, researchScore: 0, researchGrade: 'C', heldAnyShares: false },
  ] as never;

  it('reports your grade, the market average of crews that held shares, and the winner', () => {
    expect(researchSummary(entries, 'me')).toEqual({ held: true, grade: 'B', health: 71, marketAverage: 77, winner: 82 });
  });
  it('says there is no grade when your crew held nothing', () => {
    expect(researchSummary(entries, 'idle')).toMatchObject({ held: false, grade: null, health: null });
    expect(researchSummary(entries, 'missing')).toMatchObject({ held: false, grade: null });
  });
});

describe('holdings breakdown', () => {
  it('weights by closing value and reports the weighted health and B-or-better share', () => {
    const byId = {
      a: co('AAA', { quality: 1.2, grade: 'A' }, 20_000),
      b: co('BBB', { quality: -0.5, grade: 'D' }, 10_000),
    } as Record<string, Company>;
    const out = holdingsBreakdown(
      [
        { companyId: 'a', shares: 30, avgCost: 1 },
        { companyId: 'b', shares: 40, avgCost: 1 },
        { companyId: 'gone', shares: 5, avgCost: 1 },
      ],
      byId,
    );
    expect(out.rows.map((r) => r.ticker)).toEqual(['AAA', 'BBB']);
    expect(out.rows[0]!.weight).toBeCloseTo(0.6, 6);
    expect(out.rows[0]!.quality).toBe(86);
    expect(out.average).toBe(Math.round(0.6 * 86 + 0.4 * 35));
    expect(out.bOrBetter).toBeCloseTo(0.6, 6);
    expect(holdingsBreakdown([], byId)).toEqual({ rows: [], average: null, bOrBetter: 0 });
  });
});
