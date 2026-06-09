import { describe, it, expect } from 'vitest';
import { computeFill, TradeError } from '../src/services/trading';

describe('computeFill (trade math)', () => {
  it('buys reduce cash (incl. fee) and add shares at the fill price', () => {
    const r = computeFill('buy', 100, 2500, 1_000_000, 0, 0); // 100 sh @ Ð25.00
    expect(r.notional).toBe(250_000);
    expect(r.fee).toBe(250); // 0.10%
    expect(r.cashAfter).toBe(1_000_000 - 250_000 - 250);
    expect(r.sharesAfter).toBe(100);
    expect(r.avgCost).toBe(2500);
  });

  it('blends average cost across multiple buys', () => {
    const r = computeFill('buy', 100, 5000, 10_000_000, 100, 2500);
    expect(r.sharesAfter).toBe(200);
    expect(r.avgCost).toBe(Math.round((100 * 2500 + 100 * 5000) / 200)); // 3750
  });

  it('rejects buys without enough cash', () => {
    expect(() => computeFill('buy', 100, 2500, 1000, 0, 0)).toThrow(TradeError);
  });

  it('sells add proceeds (minus fee) and reduce shares', () => {
    const r = computeFill('sell', 50, 4000, 500_000, 100, 3000);
    expect(r.notional).toBe(200_000);
    expect(r.fee).toBe(200);
    expect(r.cashAfter).toBe(500_000 + 200_000 - 200);
    expect(r.sharesAfter).toBe(50);
    expect(r.avgCost).toBe(3000); // unchanged while a position remains
  });

  it('rejects selling more than held and zeroes avg cost when fully sold', () => {
    expect(() => computeFill('sell', 200, 4000, 0, 100, 3000)).toThrow(TradeError);
    const r = computeFill('sell', 100, 4000, 0, 100, 3000);
    expect(r.sharesAfter).toBe(0);
    expect(r.avgCost).toBe(0);
  });
});
