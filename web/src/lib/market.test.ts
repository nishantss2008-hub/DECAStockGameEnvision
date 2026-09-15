import { describe, it, expect } from 'vitest';
import { movers, sectorSummaries, sinceReport } from './market';
const c = (id: string, sc: number, vol: number, cap: number, sector = 'Naval Arms') => ({ id, sessionChange: sc, sessionVolume: vol, marketCap: cap, voyageChange: sc, sector, currentPrice: 110 } as any);
describe('movers', () => {
  const cs = [c('a', 0.05, 10, 100), c('b', -0.03, 50, 300), c('d', 0.01, 5, 100, 'Cursed Relics')];
  it('orders gainers, losers, active', () => {
    expect(movers(cs, 'gainers').map((x) => x.id)).toEqual(['a', 'd', 'b']);
    expect(movers(cs, 'losers', 1).map((x) => x.id)).toEqual(['b']);
    expect(movers(cs, 'active').map((x) => x.id)).toEqual(['b', 'a', 'd']);
  });
  it('cap-weights sector change', () => {
    const naval = sectorSummaries(cs).find((s) => s.sector === 'Naval Arms')!;
    expect(naval.sessionChange).toBeCloseTo((0.05 * 100 - 0.03 * 300) / 400, 10);
  });
  it('since report', () => { expect(sinceReport({ companyIds: ['a'], priceAtFire: { a: 100 } } as any, { a: cs[0]! })[0]!.pct).toBeCloseTo(0.1, 10); });
});
