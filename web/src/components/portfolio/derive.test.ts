import { describe, it, expect } from 'vitest';
import { buildPositions, accountTotals, liveAccountValue } from './derive';
const co = (id: string, last: number, open: number) => ({ id, ticker: id.toUpperCase(), name: id, sector: 'Naval Arms', currentPrice: last, sessionOpen: open, startPrice: open } as any);
describe('portfolio derive', () => {
  it('computes session and total gains per row', () => {
    const rows = buildPositions([{ companyId: 'krkn', shares: 3000, avgCost: 7350 }], { krkn: co('krkn', 8412, 8222) }, 108_421_955);
    expect(rows[0]).toMatchObject({ value: 25_236_000, sessionGain: 570_000, totalGain: 3_186_000, costBasis: 22_050_000 });
    expect(rows[0]!.totalPct).toBeCloseTo(0.14449, 4); expect(rows[0]!.pctOfAccount).toBeCloseTo(0.2328, 3);
  });
  it('account totals', () => {
    const rows = buildPositions([{ companyId: 'a', shares: 10, avgCost: 100 }], { a: co('a', 120, 110) }, 11_200);
    const t = accountTotals({ cashBalance: 10_000, totalValue: 11_200, sessionOpenValue: 11_100 } as any, rows);
    expect(t.invested).toBe(1_200); expect(t.sessionGain).toBe(100); expect(t.cashPct).toBeCloseTo(10_000 / 11_200, 6);
  });
  it('live account value: cash plus shares at the latest prices, like the server position check', () => {
    const team = { cashBalance: 10_000, totalValue: 9_000 } as any;
    const holdings = [{ companyId: 'a', shares: 10, avgCost: 100 }, { companyId: 'b', shares: 5, avgCost: 50 }] as any;
    expect(liveAccountValue(team, holdings, { a: co('a', 120, 110), b: co('b', 40, 40) })).toBe(10_000 + 1_200 + 200);
    // A price that has not loaded yet: keep the server's last mark instead of guessing.
    expect(liveAccountValue(team, holdings, { a: co('a', 120, 110) })).toBe(9_000);
    // After the game ends the server's final value (closing prices) is the truth.
    expect(liveAccountValue(team, holdings, { a: co('a', 120, 110), b: co('b', 40, 40) }, 'ended')).toBe(9_000);
    expect(liveAccountValue(team, [], {})).toBe(10_000);
  });
});
