import { describe, it, expect } from 'vitest';
import {
  feeFor,
  impactLambda,
  intervalShareCap,
  estFillPrice,
  notionalFor,
  estimateOrder,
  maxAffordableShares,
  maxSharesUnderLimit,
  sharesForAmount,
} from '@deca/shared';
const base = { lastPrice: 8412, beta: 1, sharesOutstanding: 242_000_000, feeBps: 10, cash: 31_240_018, sharesOwned: 3000, avgCost: 7350, totalValue: 108_421_955 };
describe('estimate', () => {
  it('fee is round-half-up bps', () => { expect(feeFor(4_206_000, 10)).toBe(4206); });
  it('linear impact: 1 ADV moves price ~2.42% (beta 1)', () => {
    const so = 8_000_000; expect(impactLambda(1, so) * (so / 150)).toBeCloseTo(0.02424, 4);
  });
  // Path-exact average fill: the order walks the price from pending p to p+σ; its average price is
  // last·(e^{λ(p+σ)} − e^{λp})/(λσ). Splitting is then exactly equal to one order, and a within-interval
  // round trip is exactly break-even before fees (no zero-fee micro-arbitrage).
  const avgFill = (last: number, lam: number, p: number, sigma: number) => (sigma === 0 ? last * Math.exp(lam * p) : (last * (Math.exp(lam * (p + sigma)) - Math.exp(lam * p))) / (lam * sigma));
  it('fill is the exact path average price and notional uses the unrounded price', () => {
    const lam = impactLambda(1, 8_000_000); const px = estFillPrice('buy', 1_200, lam, 10_000);
    expect(px).toBeCloseTo(avgFill(1_200, lam, 0, 10_000), 9);
    expect(px).toBeCloseTo(1_200 * Math.exp(lam * 5_000), 1); // ≈ half the order's impact to first order
    expect(estFillPrice('sell', 1_200, lam, 10_000)).toBeCloseTo(avgFill(1_200, lam, 0, -10_000), 9);
    expect(notionalFor(10_000, px)).toBe(Math.round(10_000 * px));
  });
  it('splitting an order costs exactly the same as one order (pending flow priced in)', () => {
    const lam = impactLambda(1, 8_000_000); const q = 5_000;
    const one = q * estFillPrice('buy', 1_200, lam, q);
    let pending = 0; let split = 0;
    for (let k = 0; k < 50; k++) { split += (q / 50) * estFillPrice('buy', 1_200, lam, q / 50, pending); pending += q / 50; }
    expect(Math.abs(split - one)).toBeLessThan(1e-6 * one);
  });
  it('a within-interval round trip (buy a block, sell in 50 pieces) is break-even before fees', () => {
    const lam = impactLambda(1, 8_000_000); const q = 26_667;
    const cost = q * estFillPrice('buy', 1_200, lam, q);
    let pending = q; let proceeds = 0;
    for (let k = 0; k < 50; k++) { const piece = q / 50; proceeds += piece * estFillPrice('sell', 1_200, lam, piece, pending); pending -= piece; }
    expect(Math.abs(proceeds - cost)).toBeLessThan(1e-6 * cost);
  });
  it('flags more than one ADV per interval', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: intervalShareCap(base.sharesOutstanding) + 1, cash: 1e15, totalValue: 1e15 });
    expect(e.error).toBe('interval_limit');
  });
  it('estimates a buy', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 500 });
    expect(e.valid).toBe(true);
    const fill = estFillPrice('buy', base.lastPrice, impactLambda(base.beta, base.sharesOutstanding), 500);
    expect(e.price).toBe(Math.round(fill));
    expect(e.notional).toBe(notionalFor(500, fill));
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
  it('flags a buy over the host position limit', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 1000, maxPositionPct: 0.25 });
    expect(e.valid).toBe(false); expect(e.error).toBe('position_limit');
  });
  it('the same buy is valid with the limit off when cash allows', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 1000, maxPositionPct: 1 });
    expect(e.valid).toBe(true); expect(e.error).toBeUndefined();
  });
  it('maxBuyShares respects the position limit', () => {
    const i = { ...base, side: 'buy' as const, quantity: 1, maxPositionPct: 0.25 };
    const lim = maxSharesUnderLimit(i);
    expect(estimateOrder({ ...i, quantity: lim }).valid).toBe(true);
    expect(estimateOrder({ ...i, quantity: lim + 1 }).error).toBe('position_limit');
    expect(estimateOrder(i).maxBuyShares).toBeLessThanOrEqual(lim);
  });
});
