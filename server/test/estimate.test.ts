import { describe, it, expect } from 'vitest';
import { feeFor, marketImpact, fillPrice, estimateOrder, maxAffordableShares, sharesForAmount } from '@deca/shared';
const base = { lastPrice: 8412, beta: 1, sharesOutstanding: 242_000_000, feeBps: 10, cash: 31_240_018, sharesOwned: 3000, avgCost: 7350, totalValue: 108_421_955 };
describe('estimate', () => {
  it('fee is round-half-up bps', () => { expect(feeFor(4_206_000, 10)).toBe(4206); });
  it('impact follows the square-root law and caps at 5%', () => {
    const small = marketImpact(83_000, 1, 8_000_000);
    expect(small).toBeGreaterThan(0.02); expect(small).toBeLessThan(0.035);
    expect(marketImpact(1e9, 1, 8_000_000)).toBe(0.05);
    expect(marketImpact(0, 1, 8_000_000)).toBe(0);
  });
  it('fill price applies half the impact against the trader', () => {
    expect(fillPrice('buy', 10_000, 0.02)).toBe(Math.round(10_000 * Math.exp(0.01)));
    expect(fillPrice('sell', 10_000, 0.02)).toBe(Math.round(10_000 * Math.exp(-0.01)));
  });
  it('estimates a buy', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 500 });
    expect(e.valid).toBe(true);
    expect(e.notional).toBe(500 * e.price);
    expect(e.total).toBe(e.notional + e.fee);
    expect(e.cashAfter).toBe(base.cash - e.total);
    expect(e.sharesAfter).toBe(3500);
  });
  it('flags insufficient funds with shortfall and max', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 4000 });
    expect(e.valid).toBe(false); expect(e.error).toBe('insufficient_funds');
    expect(e.shortfall).toBe(e.total - base.cash);
    const max = maxAffordableShares(base.cash, base.lastPrice, 1, base.sharesOutstanding, 10);
    expect(estimateOrder({ ...base, side: 'buy', quantity: max }).valid).toBe(true);
    expect(estimateOrder({ ...base, side: 'buy', quantity: max + 1 }).valid).toBe(false);
  });
  it('rejects overselling and bad quantity; sells credit notional minus fee', () => {
    expect(estimateOrder({ ...base, side: 'sell', quantity: 3001 }).error).toBe('insufficient_shares');
    expect(estimateOrder({ ...base, side: 'sell', quantity: 0 }).error).toBe('bad_quantity');
    const s = estimateOrder({ ...base, side: 'sell', quantity: 3000 });
    expect(s.total).toBe(s.notional - s.fee); expect(s.avgCostAfter).toBe(0);
  });
  it('converts an amount to whole affordable shares', () => {
    const n = sharesForAmount(500_000, 8412, 1, 242_000_000, 10);
    expect(n).toBe(59);
  });
});
