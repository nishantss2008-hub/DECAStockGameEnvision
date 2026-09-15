import { describe, expect, it } from 'vitest';
import { estimateOrder, maxSharesUnderLimit } from '@deca/shared';
import { initialTicket, type TicketState } from './useTicketState';
import {
  apiProblem,
  chipShares,
  entryProblem,
  estimateTicket,
  filledSummary,
  helperLine,
  inputForShares,
  previewRows,
  recapLine,
  shareOfAccountLine,
  summaryRows,
  type TicketContext,
} from './ticketModel';

// BRIEF §7 KRKN worked example.
const KRKN: TicketContext = {
  companyId: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  price: 8412,
  beta: 1.12,
  sharesOutstanding: 242_000_000,
  tick: 1284,
  timeText: '14:02:30',
  cash: 24_834_955,
  owned: 3000,
  avgCost: 7350,
  totalValue: 108_421_955,
  feeBps: 10,
  maxPositionPct: 0.5,
  currency: { symbol: 'Ð', name: 'Doubloons' },
  secondsToNextTick: 30,
};

const s0 = initialTicket('abcdefgh12', 'kraken');
const buy = (input: string, mode: TicketState['mode'] = 'shares'): TicketState => ({ ...s0, input, mode });
const sell = (input: string, mode: TicketState['mode'] = 'shares'): TicketState => ({ ...s0, side: 'sell', input, mode });

describe('ticket entry', () => {
  it('shares mode: helper with fee, summary and share of account (MOBILE §7.10)', () => {
    const { quantity, estimate } = estimateTicket(buy('500'), KRKN);
    expect(quantity).toBe(500);
    // BRIEF §7 leaves out KRKN's price impact (Ð0.16 on 500 shares); the shared estimate includes it.
    expect(estimate!.total).toBe(4_210_222);
    expect(helperLine(buy('500'), KRKN, quantity, estimate)).toBe('≈ Ð42,102.22 with fee');
    expect(summaryRows(buy('500'), KRKN, estimate!)).toEqual([
      { label: 'Total cost', value: 'Ð42,102.22' },
      { label: 'Cash after', value: 'Ð206,247.33' },
    ]);
    expect(shareOfAccountLine(KRKN, estimate!)).toBe('This order would make KRKN 27.2% of your account.');
    expect(entryProblem(buy('500'), KRKN, quantity, estimate)).toBeNull();
  });

  it('doubloons mode: shares and leftover cash', () => {
    const s = buy('5000', 'amount');
    const { quantity, estimate } = estimateTicket(s, { ...KRKN, beta: 1 });
    expect(quantity).toBe(59);
    expect(helperLine(s, { ...KRKN, beta: 1 }, quantity, estimate)).toBe('≈ 59 shares · Ð31.96 stays as cash');
  });

  it('sell helpers', () => {
    expect(helperLine(sell(''), KRKN, 0, null)).toBe('You own 3,000 shares');
    expect(helperLine(sell(''), { ...KRKN, owned: 0 }, 0, null)).toBe("You don't own any KRKN yet");
    const s = sell('4000', 'amount');
    const { quantity, estimate } = estimateTicket(s, KRKN);
    expect(helperLine(s, KRKN, quantity, estimate)).toBe(`≈ ${quantity} shares of the 3,000 you own`);
  });

  it('empty input has no problem and no estimate', () => {
    expect(estimateTicket(buy(''), KRKN)).toEqual({ quantity: 0, estimate: null });
    expect(entryProblem(buy(''), KRKN, 0, null)).toBeNull();
  });

  it('not enough cash: shortfall message and Use max fix', () => {
    const s = buy('4000');
    const { quantity, estimate } = estimateTicket(s, KRKN);
    const p = entryProblem(s, KRKN, quantity, estimate)!;
    expect(p.code).toBe('insufficient_funds');
    expect(p.title).toBe('Not enough cash');
    expect(p.message).toMatch(/^This order is Ð88,4\d\d\.\d\d more than your cash available to trade \(Ð248,349\.55\)\./);
    expect(p.fix).toEqual({ label: 'Use max (2,949 shares)', action: { kind: 'shares', shares: 2949 } });
  });

  it('position limit: Use N', () => {
    const ctx = { ...KRKN, maxPositionPct: 0.25 };
    const s = buy('500');
    const { quantity, estimate } = estimateTicket(s, ctx);
    const p = entryProblem(s, ctx, quantity, estimate)!;
    const max = maxSharesUnderLimit({ ...ctx, lastPrice: ctx.price, side: 'buy', quantity: 500, sharesOwned: 3000 });
    expect(max).toBe(222);
    expect(p.message).toBe('This would put more than 25% of your account in KRKN. You can buy up to 222 more shares.');
    expect(p.fix).toEqual({ label: 'Use 222', action: { kind: 'shares', shares: 222 } });
  });

  it('position limit already reached has no fix', () => {
    const ctx = { ...KRKN, maxPositionPct: 0.2, owned: 3000 };
    const { quantity, estimate } = estimateTicket(buy('10'), ctx);
    const p = entryProblem(buy('10'), ctx, quantity, estimate)!;
    expect(p.message).toBe(
      'KRKN already makes up 20% or more of your account, the most a buy can reach. You can buy more only if that share falls below the limit.',
    );
    expect(p.fix).toBeNull();
  });

  it('not enough shares: Sell all, or none owned', () => {
    const { quantity, estimate } = estimateTicket(sell('3500'), KRKN);
    const p = entryProblem(sell('3500'), KRKN, quantity, estimate)!;
    expect(p.message).toBe('You own 3,000 shares of KRKN, so you can sell up to 3,000. Lower the number of shares or choose All.');
    expect(p.fix).toEqual({ label: 'Sell all 3,000', action: { kind: 'shares', shares: 3000 } });
    const none = { ...KRKN, owned: 0 };
    const e2 = estimateTicket(sell('5'), none);
    const p2 = entryProblem(sell('5'), none, e2.quantity, e2.estimate)!;
    expect(p2.message).toBe("You don't own any KRKN shares, so there is nothing to sell. Switch to Buy or pick a company you own.");
    expect(p2.fix).toBeNull();
  });

  it('interval limit uses the per-update cap and seconds', () => {
    const rich = { ...KRKN, cash: 1e15, totalValue: 1e15, maxPositionPct: 1 };
    const { quantity, estimate } = estimateTicket(buy('2000000'), rich);
    const p = entryProblem(buy('2000000'), rich, quantity, estimate)!;
    expect(p.message).toBe(
      'You can trade up to 1,613,333 shares of KRKN per price update. Lower the shares, or place the rest after the next update in about 30 seconds.',
    );
    expect(p.fix).toEqual({ label: 'Use 1,613,333', action: { kind: 'shares', shares: 1_613_333 } });
    const one = entryProblem(buy('2000000'), { ...rich, secondsToNextTick: 1 }, quantity, estimate)!;
    expect(one.message).toMatch(/in about 1 second\.$/);
  });

  it('bad quantity and amount too small', () => {
    const zero = entryProblem(buy('0'), KRKN, 0, null)!;
    expect(zero.code).toBe('bad_quantity');
    expect(zero.fix).toEqual({ label: 'Clear', action: { kind: 'clear' } });
    const small = entryProblem(buy('50', 'amount'), KRKN, 0, null)!;
    expect(small.message).toBe('That amount is less than 1 share of KRKN at Ð84.12. Enter at least Ð84.20, which includes the fee.');
    expect(small.fix).toEqual({ label: 'Use Ð84.20', action: { kind: 'input', input: '84.20' } });
  });

  it('chips: buy counts and Max, sell fractions and All', () => {
    const est = estimateOrder({ side: 'buy', quantity: 0, lastPrice: 8412, beta: 1.12, sharesOutstanding: 242e6, feeBps: 10, cash: KRKN.cash, sharesOwned: 3000, avgCost: 7350, totalValue: KRKN.totalValue, maxPositionPct: 0.5 });
    expect(chipShares('10', 'buy', KRKN)).toBe(10);
    expect(chipShares('Max', 'buy', KRKN)).toBe(est.maxBuyShares);
    expect(chipShares('25%', 'sell', KRKN)).toBe(750);
    expect(chipShares('50%', 'sell', { ...KRKN, owned: 5 })).toBe(2);
    expect(chipShares('All', 'sell', KRKN)).toBe(3000);
  });

  it('inputForShares keeps doubloons mode near the share count', () => {
    expect(inputForShares(buy(''), KRKN, 222)).toBe('222');
    const text = inputForShares(buy('', 'amount'), KRKN, 59);
    expect(estimateTicket(buy(text, 'amount'), KRKN).quantity).toBe(59);
    const sellText = inputForShares(sell('', 'amount'), KRKN, 100);
    expect(estimateTicket(sell(sellText, 'amount'), KRKN).quantity).toBe(100);
    expect(inputForShares(buy('', 'amount'), KRKN, 0)).toBe('');
  });
});

describe('ticket preview', () => {
  it('recap and rows with always-visible explanations', () => {
    expect(recapLine(buy('500'), KRKN, 500)).toBe('Buy 500 shares of KRKN (Kraken Shipping Lines) at about the current price.');
    const est = estimateTicket(buy('500'), KRKN).estimate!;
    const rows = previewRows(buy('500'), KRKN, est);
    expect(rows.map((r) => r.label)).toEqual([
      'Est. price',
      'Price impact',
      'Order value',
      'Fee (0.10%)',
      'Total cost',
      'Cash after',
      'Shares after',
      '% after',
      'Avg. price after',
    ]);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['Est. price']).toMatchObject({ value: 'Ð84.12', note: 'Buys right away at about the current price.', termId: 'price' });
    expect(byLabel['Price impact']).toMatchObject({ value: 'under 0.01%', note: 'This order is small for KRKN, so the nudge is under 0.01%.' });
    expect(byLabel['Order value']!.value).toBe('Ð42,060.16');
    expect(byLabel['Fee (0.10%)']).toMatchObject({ value: 'Ð42.06', note: '0.10% charged on every trade.' });
    expect(byLabel['Total cost']).toMatchObject({ value: 'Ð42,102.22', emphasized: true });
    expect(byLabel['Shares after']!.value).toBe('3,500');
    expect(byLabel['% after']).toMatchObject({ value: '27.2%', note: "A buy can't put more than 50% of your account into one company." });
    expect(byLabel['Avg. price after']!.value).toBe('Ð75.02');
    for (const r of rows) expect(r.termId).toBeTruthy();
  });

  it('sell preview says You receive and big orders explain the nudge', () => {
    const rich = { ...KRKN, owned: 1_000_000 };
    const est = estimateTicket(sell('1000000'), rich).estimate!;
    const rows = previewRows(sell('1000000'), rich, est);
    expect(rows.map((r) => r.label)).toContain('You receive');
    const impact = rows.find((r) => r.label === 'Price impact')!;
    expect(impact.note).toMatch(/^Because of its size, this order gets about \d+\.\d\d% less per share\.$/);
    expect(recapLine(sell('10'), KRKN, 10)).toBe('Sell 10 shares of KRKN (Kraken Shipping Lines) at about the current price.');
    // One share reads as plain English, not "1 shares".
    expect(recapLine(buy('1'), KRKN, 1)).toBe('Buy 1 share of KRKN (Kraken Shipping Lines) at about the current price.');
    expect(recapLine(sell('1'), KRKN, 1)).toBe('Sell 1 share of KRKN (Kraken Shipping Lines) at about the current price.');
  });
});

describe('ticket outcomes', () => {
  const trade = { id: 't1', teamId: 'crew', companyId: 'kraken', side: 'buy' as const, quantity: 500, price: 8412, lastPrice: 8412, impactBps: 0, fee: 4206, realizedPnl: 0, executedAt: 0, tick: 1284, cashAfter: 20_624_749, sharesAfter: 3500, clientOrderId: '7q2f9kabcd' };

  it('filled summary (BRIEF §7 fill)', () => {
    const f = filledSummary(trade, 8412, KRKN);
    expect(f.headline).toBe('Bought 500 KRKN at Ð84.12');
    expect(f.announcement).toBe('Order filled: Bought 500 KRKN at Ð84.12 (Ð42,060.00).');
    expect(f.rows).toEqual([
      { label: 'Order value', value: 'Ð42,060.00' },
      { label: 'Fee', value: 'Ð42.06' },
      { label: 'Total cost', value: 'Ð42,102.06' },
      { label: 'Cash after', value: 'Ð206,247.49' },
    ]);
    expect(f.vsPreview).toBe('Same as the preview estimate');
    expect(f.orderLine).toBe('Order # BX-7Q2F9K · tick 1,284');
    expect(filledSummary(trade, 8409, KRKN).vsPreview).toBe('Ð0.03 above the preview estimate of Ð84.09');
    expect(filledSummary({ ...trade, side: 'sell' }, 8415, KRKN).announcement).toBe('Order filled: Sold 500 KRKN at Ð84.12 (Ð42,060.00).');
    expect(filledSummary(trade, 8415, KRKN).vsPreview).toBe('Ð0.03 below the preview estimate of Ð84.15');
  });

  it('maps every server error code to COPY title, message and fix', () => {
    const moved = apiProblem(
      { code: 'price_moved', status: 409, message: 'Price moved. The price of KRKN moved more than 2% since your preview, from Ð84.12 to Ð86.03. Review the updated estimate, then place the order again.' },
      buy('500'),
      KRKN,
      'live',
    );
    expect(moved).toEqual({
      code: 'price_moved',
      title: 'Price moved',
      message: 'The price of KRKN moved more than 2% since your preview, from Ð84.12 to Ð86.03. Review the updated estimate, then place the order again.',
      fix: { label: 'Review updated order', action: { kind: 'repreview' } },
    });
    const closed = (phase: 'lobby' | 'paused' | 'ended') => apiProblem({ code: 'market_closed', status: 400, message: 'x' }, buy('5'), KRKN, phase);
    expect(closed('lobby')).toMatchObject({ title: 'Market not open yet', fix: { label: 'Open Markets', action: { kind: 'navigate', to: '/markets' } } });
    expect(closed('paused')).toMatchObject({ title: 'Trading paused', fix: null });
    expect(closed('ended')).toMatchObject({ title: 'Game ended', fix: { label: 'See final standings', action: { kind: 'navigate', to: '/standings/results' } } });
    expect(apiProblem({ code: 'network', status: 0, message: 'Failed to fetch' }, buy('5'), KRKN, 'live')).toMatchObject({
      title: 'Order not sent',
      fix: { label: 'Place order again', action: { kind: 'place' } },
    });
    expect(apiProblem({ code: 'internal', status: 500, message: 'x' }, buy('5'), KRKN, 'live')).toMatchObject({ title: 'Something went wrong', fix: { label: 'Try again', action: { kind: 'place' } } });
    expect(apiProblem({ code: 'trading_disabled', status: 400, message: 'x' }, buy('5'), KRKN, 'live')).toMatchObject({ title: 'Trading turned off for your crew', fix: null });
    expect(apiProblem({ code: 'no_team', status: 400, message: 'x' }, buy('5'), KRKN, 'live')).toMatchObject({ fix: { label: 'Sign out', action: { kind: 'signOut' } } });
    expect(apiProblem({ code: 'unknown_company', status: 400, message: 'x' }, buy('5'), KRKN, 'live')).toMatchObject({ fix: { label: 'Search companies', action: { kind: 'navigate', to: '/markets' } } });
    expect(apiProblem({ code: 'bad_quantity', status: 400, message: 'x' }, buy('5'), KRKN, 'live')).toMatchObject({ fix: { label: 'Clear', action: { kind: 'clear' } } });
    const funds = apiProblem(
      { code: 'insufficient_funds', status: 400, message: 'Not enough cash. This order is Ð1.00 more than your cash available to trade (Ð2.00). Lower the shares or amount, or use the most you can afford.' },
      buy('4000'),
      KRKN,
      'live',
    );
    expect(funds.message).toBe('This order is Ð1.00 more than your cash available to trade (Ð2.00). Lower the shares or amount, or use the most you can afford.');
    expect(funds.fix?.label).toBe('Use max (2,949 shares)');
    const interval = apiProblem({ code: 'interval_limit', status: 400, message: 'Too many shares for one price update. You already traded 5 shares of KRKN in this price update. You can trade 3 more now, or the rest after the next update.' }, buy('8'), KRKN, 'live');
    expect(interval.message).toBe('You already traded 5 shares of KRKN in this price update. You can trade 3 more now, or the rest after the next update.');
    expect(interval.fix?.label).toBe('Use 1,613,333');
    const limit = apiProblem({ code: 'position_limit', status: 400, message: 'Over the position limit. This would put more than 25% of your account in KRKN. You can buy up to 222 more shares.' }, buy('500'), { ...KRKN, maxPositionPct: 0.25 }, 'live');
    expect(limit.fix).toEqual({ label: 'Use 222', action: { kind: 'shares', shares: 222 } });
  });
});

describe('disabled states by phase', () => {
  it('Place is blocked unless live, online and trading on; Preview only closes when the game ended', async () => {
    const { placeBlock, previewAllowed } = await import('./ticketModel');
    expect(placeBlock({ phase: 'live', online: true, tradingDisabled: false })).toBeNull();
    expect(placeBlock({ phase: 'live', online: false, tradingDisabled: false })).toBe('offline');
    expect(placeBlock({ phase: 'paused', online: true, tradingDisabled: false })).toBe('paused');
    expect(placeBlock({ phase: 'lobby', online: true, tradingDisabled: false })).toBe('lobby');
    expect(placeBlock({ phase: 'ended', online: true, tradingDisabled: false })).toBe('ended');
    expect(placeBlock({ phase: 'live', online: true, tradingDisabled: true })).toBe('tradingDisabled');
    expect(previewAllowed('paused')).toBe(true);
    expect(previewAllowed('ended')).toBe(false);
  });
});
