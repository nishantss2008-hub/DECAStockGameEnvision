import { describe, it, expect } from 'vitest';
import { computeFill, checkPriceProtection, TradeError, marketClosedError, tradeErrorFromEngine } from '../src/services/trading';

const b = { lastPrice: 10_000, fillPrice: 10_003.7, feeBps: 10, cash: 1_000_000, sharesOwned: 0, avgCost: 0, totalValue: 1_000_000, maxPositionPct: 1 };

/** Runs fn and returns the TradeError it throws (fails the test otherwise). */
function tradeErrorOf(fn: () => unknown): TradeError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(TradeError);
    return err as TradeError;
  }
  throw new Error('expected a TradeError');
}

describe('computeFill', () => {
  it('buy pays slippage + fee and updates avg cost', () => {
    const f = computeFill({ ...b, side: 'buy', quantity: 50 });
    expect(f.price).toBe(10_004); expect(f.notional).toBe(Math.round(50 * 10_003.7));
    expect(f.cashAfter).toBe(1_000_000 - f.notional - f.fee); expect(f.avgCostAfter).toBe(Math.round(f.notional / 50)); expect(f.realizedPnl).toBe(0);
  });
  it('sell receives price below last, realizes P&L net of fee', () => {
    const f = computeFill({ ...b, side: 'sell', quantity: 40, sharesOwned: 50, avgCost: 9_000, fillPrice: 9_996.2 });
    expect(f.notional).toBe(Math.round(40 * 9_996.2));
    expect(f.realizedPnl).toBe(f.notional - 9_000 * 40 - f.fee);
    expect(f.sharesAfter).toBe(10); expect(f.avgCostAfter).toBe(9_000);
  });
  it('rejects insufficient funds/shares and bad quantity', () => {
    expect(() => computeFill({ ...b, side: 'buy', quantity: 101 })).toThrow(TradeError);
    expect(() => computeFill({ ...b, side: 'sell', quantity: 1 })).toThrow(/shares/);
    expect(() => computeFill({ ...b, side: 'buy', quantity: 1.5 })).toThrow(TradeError);
  });
  it('enforces the host position limit on buys', () => {
    expect(() => computeFill({ ...b, side: 'buy', quantity: 30, maxPositionPct: 0.25 })).toThrow(/limit/);
    expect(() => computeFill({ ...b, side: 'buy', quantity: 20, maxPositionPct: 0.25 })).not.toThrow();
  });
  it('price protection allows ≤2% moves and rejects larger', () => {
    expect(() => checkPriceProtection(10_200, 10_000)).not.toThrow();
    expect(() => checkPriceProtection(10_201, 10_000)).toThrow(/moved/);
    expect(() => checkPriceProtection(10_500, undefined)).not.toThrow();
  });
});

describe('computeFill edge cases', () => {
  it('blends average cost across buys, excluding the fee', () => {
    const f = computeFill({ ...b, side: 'buy', quantity: 50, sharesOwned: 50, avgCost: 9_000 });
    expect(f.sharesAfter).toBe(100);
    expect(f.avgCostAfter).toBe(Math.round((50 * 9_000 + f.notional) / 100));
    expect(f.fee).toBe(Math.round((f.notional * 10) / 10_000));
  });
  it('a full sell zeroes the average cost and credits notional − fee', () => {
    const f = computeFill({ ...b, side: 'sell', quantity: 50, sharesOwned: 50, avgCost: 9_000, fillPrice: 9_990 });
    expect(f.sharesAfter).toBe(0); expect(f.avgCostAfter).toBe(0);
    expect(f.cashAfter).toBe(1_000_000 + f.notional - f.fee);
    expect(f.realizedPnl).toBe(f.notional - 450_000 - f.fee);
  });
  it('a buy costing exactly the cash on hand fills', () => {
    const f = computeFill({ ...b, side: 'buy', quantity: 10, fillPrice: 10_000, cash: 100_100 });
    expect(f.notional + f.fee).toBe(100_100); expect(f.cashAfter).toBe(0);
  });
  it('sells ignore the position limit', () => {
    expect(() => computeFill({ ...b, side: 'sell', quantity: 10, sharesOwned: 90, maxPositionPct: 0.25 })).not.toThrow();
  });
  it('rejects zero and negative quantities as bad_quantity', () => {
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 0 })).code).toBe('bad_quantity');
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'sell', quantity: -5, sharesOwned: 10 })).code).toBe('bad_quantity');
  });
});

describe('trade error copy (COPY.md §9)', () => {
  it('insufficient_funds states the shortfall and the cash in money', () => {
    const e = tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 101 }));
    expect(e.code).toBe('insufficient_funds');
    const notional = Math.round(101 * 10_003.7);
    const shortfall = notional + Math.round((notional * 10) / 10_000) - 1_000_000;
    expect(e.message).toBe(
      `Not enough cash. This order is Ð${(shortfall / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more than your cash available to trade (Ð10,000.00). Lower the shares or amount, or use the most you can afford.`,
    );
  });
  it('insufficient_shares names the ticker and what is owned', () => {
    const e = tradeErrorOf(() => computeFill({ ...b, side: 'sell', quantity: 3_001, sharesOwned: 3_000, ticker: 'KRKN' }));
    expect(e.code).toBe('insufficient_shares');
    expect(e.message).toBe('Not enough shares. You own 3,000 shares of KRKN, so you can sell up to 3,000. Lower the number of shares or choose All.');
    const none = tradeErrorOf(() => computeFill({ ...b, side: 'sell', quantity: 1, ticker: 'KRKN' }));
    expect(none.message).toBe("Not enough shares. You don't own any KRKN shares, so there is nothing to sell. Switch to Buy or pick a company you own.");
  });
  it('position_limit gives the most shares that still fit', () => {
    const e = tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 30, maxPositionPct: 0.25, ticker: 'KRKN' }));
    expect(e.code).toBe('position_limit');
    expect(e.message).toBe('Over the position limit. This would put more than 25% of your account in KRKN. You can buy up to 24 more shares.');
    // 24 shares fits and 25 does not, so the quoted maximum is exact.
    expect(() => computeFill({ ...b, side: 'buy', quantity: 24, maxPositionPct: 0.25 })).not.toThrow();
    expect(() => computeFill({ ...b, side: 'buy', quantity: 25, maxPositionPct: 0.25 })).toThrow(TradeError);
  });
  it('position_limit at or over the limit uses the at-limit message', () => {
    const e = tradeErrorOf(() =>
      computeFill({ ...b, side: 'buy', quantity: 1, sharesOwned: 30, maxPositionPct: 0.25, ticker: 'KRKN' }),
    );
    expect(e.message).toBe(
      'Over the position limit. KRKN already makes up 25% or more of your account, the most a buy can reach. You can buy more only if that share falls below the limit.',
    );
  });
  it('bad_quantity uses the plain message', () => {
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 1.5 })).message).toBe(
      'Check the number of shares. Enter a whole number of shares that is 1 or more, like 10 or 250.',
    );
  });
  it('price_moved reports the quoted and last prices with the currency symbol', () => {
    const e = tradeErrorOf(() => checkPriceProtection(8_603, 8_412, { ticker: 'KRKN', symbol: 'Ð' }));
    expect(e.code).toBe('price_moved');
    expect(e.message).toBe(
      'Price moved. The price of KRKN moved more than 2% since your preview, from Ð84.12 to Ð86.03. Review the updated estimate, then place the order again.',
    );
    expect(() => checkPriceProtection(9_800, 10_000)).not.toThrow();
    expect(() => checkPriceProtection(9_799, 10_000)).toThrow(/moved/);
  });
});

describe('computeFill money math (review)', () => {
  it('a buy one cent over the cash (fee included) is rejected; exactly the cash fills', () => {
    const q = computeFill({ ...b, side: 'buy', quantity: 10, fillPrice: 10_000, cash: 1e9 });
    const cost = q.notional + q.fee;
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 10, fillPrice: 10_000, cash: cost - 1 })).code).toBe('insufficient_funds');
    expect(computeFill({ ...b, side: 'buy', quantity: 10, fillPrice: 10_000, cash: cost }).cashAfter).toBe(0);
  });
  it('average cost rounds the blended cost to the nearest cent', () => {
    // (1·100 + round(2·150.5)) / 3 = 401 / 3 = 133.67 → 134
    const f = computeFill({ ...b, side: 'buy', quantity: 2, fillPrice: 150.5, sharesOwned: 1, avgCost: 100 });
    expect(f.notional).toBe(301);
    expect(f.avgCostAfter).toBe(134);
  });
  it('a losing sell realizes notional − round(avgCost·q) − fee (negative) and keeps the average cost', () => {
    const f = computeFill({ ...b, side: 'sell', quantity: 7, sharesOwned: 20, avgCost: 12_345, fillPrice: 9_871.37 });
    expect(f.notional).toBe(Math.round(7 * 9_871.37));
    expect(f.fee).toBe(Math.round((f.notional * 10) / 10_000));
    expect(f.realizedPnl).toBe(f.notional - 12_345 * 7 - f.fee);
    expect(f.realizedPnl).toBeLessThan(0);
    expect(f.cashAfter).toBe(b.cash + f.notional - f.fee);
    expect(f.avgCostAfter).toBe(12_345);
    expect(f.sharesAfter).toBe(13);
  });
  it('notional uses the unrounded fill price, while price is rounded for display (never below 1 cent)', () => {
    const f = computeFill({ ...b, side: 'buy', quantity: 1_000, fillPrice: 10_000.4, cash: 1e9, totalValue: 1e9 });
    expect(f.price).toBe(10_000);
    expect(f.notional).toBe(10_000_400);
    expect(computeFill({ ...b, side: 'buy', quantity: 3, fillPrice: 0.4, lastPrice: 1 }).price).toBe(1);
  });
  it('the position limit values the position at the last price, not the impacted fill', () => {
    // 49 shares: 490,000 at last ≤ 50% of the account, though 49 × 12,000 = 588,000 is not.
    expect(() => computeFill({ ...b, side: 'buy', quantity: 49, fillPrice: 12_000, maxPositionPct: 0.5 })).not.toThrow();
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 50, fillPrice: 12_000, maxPositionPct: 0.5 })).code).toBe('position_limit');
  });
  it('the position limit counts shares already owned, net of the fee', () => {
    // 24 × 10,000 = 240,000 ≤ 25% of (1,000,000 − fee); 25 × 10,000 = 250,000 is over once the fee is taken out.
    expect(() => computeFill({ ...b, side: 'buy', quantity: 4, sharesOwned: 20, maxPositionPct: 0.25 })).not.toThrow();
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 4, sharesOwned: 21, maxPositionPct: 0.25 })).code).toBe('position_limit');
  });
  it('a limit of 1 (off) or a missing/NaN limit never blocks a buy, like estimateOrder', () => {
    const big = { ...b, side: 'buy' as const, quantity: 99 };
    expect(() => computeFill({ ...big, maxPositionPct: 1 })).not.toThrow();
    expect(() => computeFill({ ...big, maxPositionPct: Number.NaN })).not.toThrow();
  });
  it('funds are checked before the position limit (same order as estimateOrder)', () => {
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'buy', quantity: 500, maxPositionPct: 0.25 })).code).toBe('insufficient_funds');
  });
  it('a bad quantity is reported before anything else, and bad prices are a server error, not a crew error', () => {
    expect(tradeErrorOf(() => computeFill({ ...b, side: 'sell', quantity: Number.NaN, fillPrice: Number.NaN })).code).toBe('bad_quantity');
    for (const bad of [{ fillPrice: 0 }, { fillPrice: Number.POSITIVE_INFINITY }, { lastPrice: 0 }, { lastPrice: -5 }]) {
      let thrown: unknown;
      try {
        computeFill({ ...b, side: 'buy', quantity: 1, ...bad });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(TradeError);
    }
  });
  it('overselling with a ticker but some shares owned names the count', () => {
    const e = tradeErrorOf(() => computeFill({ ...b, side: 'sell', quantity: 2, sharesOwned: 1, ticker: 'BRTH' }));
    expect(e.message).toBe('Not enough shares. You own 1 shares of BRTH, so you can sell up to 1. Lower the number of shares or choose All.');
  });
});

describe('price protection (review)', () => {
  it('compares the last price with the quote at exactly 2% either way', () => {
    for (const quoted of [50, 8_412, 123_456, 9_999_950]) {
      const edge = Math.floor(quoted * 0.02);
      expect(() => checkPriceProtection(quoted + edge, quoted)).not.toThrow();
      expect(() => checkPriceProtection(quoted - edge, quoted)).not.toThrow();
    }
    expect(() => checkPriceProtection(10_000 + 201, 10_000)).toThrow(TradeError);
    expect(() => checkPriceProtection(10_000 - 201, 10_000)).toThrow(TradeError);
  });
  it('skips the check without a usable quote', () => {
    for (const q of [undefined, 0, -100, Number.NaN]) expect(() => checkPriceProtection(99_999, q as number | undefined)).not.toThrow();
  });
});

describe('engine error mapping (review)', () => {
  const company = { ticker: 'KRKN', sharesOutstanding: 242_000_000 };
  const state = (over: Record<string, unknown> = {}) =>
    ({ state: { phase: 'live', startAt: 1_000_000, currentTick: 2, tickIntervalMs: 10_000, ...over } }) as never;
  const engineError = (code: string, message = '') => Object.assign(new Error(message), { code, name: 'EngineError' });

  it('market_closed follows the phase (COPY §9: market_closed, paused, market_closed_ended)', () => {
    expect(marketClosedError('lobby').message).toBe('Market not open yet. Trading opens when the host starts the game. You can research companies and preview orders now.');
    expect(marketClosedError('paused').message).toBe('Trading paused. The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.');
    expect(marketClosedError('ended').message).toBe("Game ended. The game has ended, so trading is closed. See how every crew finished and what drove each company's price.");
    for (const p of ['lobby', 'paused', 'ended'] as const) expect(marketClosedError(p).code).toBe('market_closed');
    const e = tradeErrorFromEngine(engineError('market_closed', 'closed'), state({ phase: 'paused' }), company)!;
    expect(e.code).toBe('market_closed');
    expect(e.message).toMatch(/^Trading paused\. /);
  });

  it('unknown_company and bad_quantity use the COPY text, not the engine text', () => {
    const u = tradeErrorFromEngine(engineError('unknown_company', 'engine text'), state(), company)!;
    expect(u).toBeInstanceOf(TradeError);
    expect(u.code).toBe('unknown_company');
    expect(u.message).toBe("Company not found. We couldn't find a company with that symbol. Pick one from the search list, like KRKN.");
    expect(tradeErrorFromEngine(engineError('bad_quantity', 'engine text'), state(), company)!.message).toBe(
      'Check the number of shares. Enter a whole number of shares that is 1 or more, like 10 or 250.',
    );
  });

  it('interval_limit keeps the engine COPY message under the COPY title, or builds the cap message itself', () => {
    const used = tradeErrorFromEngine(
      engineError('interval_limit', 'You already traded 600 shares of KRKN in this price update. You can trade 400 more now, or the rest after the next update.'),
      state(),
      company,
    )!;
    expect(used.code).toBe('interval_limit');
    expect(used.message).toBe('Too many shares for one price update. You already traded 600 shares of KRKN in this price update. You can trade 400 more now, or the rest after the next update.');
    // Next tick at 1,000,000 + 3·10,000 = 1,030,000; now is 7 s before it.
    const built = tradeErrorFromEngine(engineError('interval_limit', '  '), state(), company, 1_023_000)!;
    expect(built.message).toBe('Too many shares for one price update. You can trade up to 1,613,333 shares of KRKN per price update. Lower the shares, or place the rest after the next update in about 7 seconds.');
    // 0.5 s before the next tick: COPY §9 messageOneSecond ("about 1 second").
    const oneSecond = tradeErrorFromEngine(engineError('interval_limit', ''), state(), company, 1_029_500)!;
    expect(oneSecond.message).toBe('Too many shares for one price update. You can trade up to 1,613,333 shares of KRKN per price update. Lower the shares, or place the rest after the next update in about 1 second.');
  });

  it('anything that is not an order-level engine error stays unmapped (HTTP 500); a TradeError passes through', () => {
    expect(tradeErrorFromEngine(engineError('not_lobby', 'x'), state(), company)).toBeUndefined();
    expect(tradeErrorFromEngine(engineError('no_market', 'x'), state(), company)).toBeUndefined();
    expect(tradeErrorFromEngine(new Error('boom'), state(), company)).toBeUndefined();
    expect(tradeErrorFromEngine('market_closed', state(), company)).toBeUndefined();
    expect(tradeErrorFromEngine({ code: 'market_closed' }, state(), company)).toBeUndefined();
    const te = new TradeError('price_moved', 'x');
    expect(tradeErrorFromEngine(te, state(), company)).toBe(te);
  });
});
