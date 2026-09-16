import { describe, expect, it } from 'vitest';
import { DEFAULT_STARTING_CAPITAL, type Company, type Holding, type Team } from '@deca/shared';
import {
  accountTotals,
  allocationItems,
  buildPositions,
  rankText,
  rebaseSeries,
  showMetricValue,
  sortPositions,
  tickEpoch,
  vsCompositePoints,
} from './derive';

const co = (id: string, last: number, open: number, sector = 'Shipping'): Company =>
  ({ id, ticker: id.toUpperCase(), name: `${id} Co`, sector, currentPrice: last, sessionOpen: open, startPrice: open }) as unknown as Company;

// BRIEF §7 Saltwind Traders (cents): cash Ð248,349.55, value Ð1,084,219.55.
const HOLDINGS: Holding[] = [
  { companyId: 'krkn', shares: 3000, avgCost: 7350 },
  { companyId: 'crsd', shares: 1000, avgCost: 3800 },
  { companyId: 'salt', shares: 2500, avgCost: 1780 },
];
const BY_ID = { krkn: co('krkn', 8412, 8222), crsd: co('crsd', 3107, 3218, 'Spices'), salt: co('salt', 1700, 1690) };
const TEAM = { cashBalance: 24_834_955, totalValue: 108_421_955, sessionOpenValue: 107_570_955, realizedPnl: 1_004_955, feesPaid: 124_033, tradeCount: 23 } as unknown as Team;

describe('buildPositions', () => {
  it('sorts by value, largest first', () => {
    const rows = buildPositions(HOLDINGS, BY_ID, TEAM.totalValue);
    expect(rows.map((r) => r.ticker)).toEqual(['KRKN', 'SALT', 'CRSD']);
  });

  it('computes a losing position with negative gains', () => {
    const crsd = buildPositions(HOLDINGS, BY_ID, TEAM.totalValue).find((r) => r.ticker === 'CRSD')!;
    expect(crsd.totalGain).toBe(-693_000);
    expect(crsd.totalPct).toBeCloseTo(-0.18237, 4);
    expect(crsd.sessionGain).toBe(-111_000);
    expect(crsd.sessionChangePerShare).toBe(-111);
    expect(crsd.sessionPct).toBeCloseTo(-111 / 3218, 6);
  });

  it('falls back to the average price when the company has not loaded', () => {
    const [row] = buildPositions([{ companyId: 'gone', shares: 10, avgCost: 500 }], {}, 10_000);
    expect(row).toMatchObject({ ticker: 'GONE', last: 500, value: 5_000, totalGain: 0, sessionGain: 0 });
  });

  it('never divides by zero', () => {
    const [row] = buildPositions([{ companyId: 'a', shares: 0, avgCost: 0 }], { a: co('a', 0, 0) }, 0);
    expect(row!.totalPct).toBe(0);
    expect(row!.sessionPct).toBe(0);
    expect(row!.pctOfAccount).toBe(0);
  });
});

describe('accountTotals', () => {
  it('measures total gain against starting cash and session change against the session-open value', () => {
    const rows = buildPositions(HOLDINGS, BY_ID, TEAM.totalValue);
    const t = accountTotals(TEAM, rows, 100_000_000);
    expect(t.startingCapital).toBe(100_000_000);
    expect(t.totalGain).toBe(8_421_955);
    expect(t.totalPct).toBeCloseTo(0.0842, 4);
    expect(t.sessionValueChange).toBe(851_000);
    expect(t.sessionPct).toBeCloseTo(851_000 / 107_570_955, 8);
    expect(t.unrealized).toBe(rows.reduce((s, r) => s + r.totalGain, 0));
  });

  it('defaults starting cash to the game default and handles a zero session-open value', () => {
    const t = accountTotals({ cashBalance: 100, totalValue: 100, sessionOpenValue: 0 } as unknown as Team, []);
    expect(t.startingCapital).toBe(DEFAULT_STARTING_CAPITAL);
    expect(t.sessionPct).toBe(0);
    expect(t.cashPct).toBe(1);
  });
});

describe('sortPositions', () => {
  const rows = buildPositions(HOLDINGS, BY_ID, TEAM.totalValue);
  it('sorts by each menu choice without changing the input', () => {
    expect(sortPositions(rows, 'totalPct').map((r) => r.ticker)).toEqual(['KRKN', 'SALT', 'CRSD']);
    expect(sortPositions(rows, 'session').map((r) => r.ticker)).toEqual(['KRKN', 'SALT', 'CRSD']);
    expect(sortPositions(rows, 'name').map((r) => r.ticker)).toEqual(['CRSD', 'KRKN', 'SALT']);
    expect(sortPositions(rows, 'value')).toEqual(rows);
    expect(rows.map((r) => r.ticker)).toEqual(['KRKN', 'SALT', 'CRSD']);
  });
});

describe('showMetricValue', () => {
  const [krkn] = buildPositions(HOLDINGS, BY_ID, TEAM.totalValue);
  it('returns the figure and glossary term for the chosen metric', () => {
    expect(showMetricValue(krkn!, 'totalGain')).toEqual({ kind: 'money', value: 3_186_000, pct: krkn!.totalPct, termId: 'totalGain' });
    expect(showMetricValue(krkn!, 'session')).toEqual({ kind: 'money', value: 570_000, pct: krkn!.sessionPct, termId: 'sessionChange' });
    expect(showMetricValue(krkn!, 'pctOfAccount')).toEqual({ kind: 'share', value: krkn!.pctOfAccount, pct: null, termId: 'pctOfAccount' });
  });
});

describe('chart helpers', () => {
  it('compares the crew with the composite in percentage points', () => {
    expect(vsCompositePoints(0.0842, 0.0486)).toBeCloseTo(3.56, 6);
    expect(vsCompositePoints(0.01, 0.02)).toBeCloseTo(-1, 6);
  });

  it('rebases the composite to starting cash', () => {
    const pts = rebaseSeries([{ tick: 0, value: 1000 }, { tick: 5, value: 1100 }], 1000, 100_000_000);
    expect(pts).toEqual([{ x: 0, y: 100_000_000 }, { x: 5, y: 110_000_000 }]);
    expect(rebaseSeries([{ tick: 0, value: 5 }], 0, 1)).toEqual([]);
  });

  it('estimates a tick time from the last price update', () => {
    const at = tickEpoch({ currentTick: 10, lastTickAt: 1_000_000, tickIntervalMs: 30_000 } as never);
    expect(at(10)).toBe(1_000_000);
    expect(at(8)).toBe(940_000);
    expect(tickEpoch(null)(3)).toBeNull();
  });
});

describe('allocationItems and rankText', () => {
  it('lists holdings in value order, then cash', () => {
    const items = allocationItems(buildPositions(HOLDINGS, BY_ID, TEAM.totalValue), TEAM.cashBalance);
    expect(items.map((i) => i.label)).toEqual(['KRKN', 'SALT', 'CRSD', 'Cash']);
    expect(items.at(-1)).toMatchObject({ kind: 'cash', value: 24_834_955 });
    expect(items[0]).toMatchObject({ kind: 'holding', sector: 'Shipping', value: 25_236_000 });
  });

  it('writes the rank as "3 of 14", or a dash before standings exist', () => {
    expect(rankText(3, 14)).toBe('3 of 14');
    expect(rankText(0, 14)).toBe('—');
    expect(rankText(2, 0)).toBe('—');
  });
});
