import { describe, expect, it } from 'vitest';
import type { Company, OrderRecord, Trade } from '@deca/shared';
import { balanceLines, buildActivity, filterActivity, findActivity, groupBySession, orderDetailLines, priceNudgeText } from './activity';

const KRKN = { id: 'krkn', ticker: 'KRKN', name: 'Kraken Naval Works' } as Company;
const SALT = { id: 'salt', ticker: 'SALT', name: 'Saltworks' } as Company;
const BY_ID = { krkn: KRKN, salt: SALT };
const at = (h: number, m: number, s: number) => new Date(2026, 8, 14, h, m, s).getTime();

// BRIEF §7: 500 KRKN fill at Ð84.12 on tick 1,284, fee Ð42.06, cash after Ð206,247.49.
const BUY: Trade = {
  id: 't1', teamId: 'saltwind', companyId: 'krkn', side: 'buy', quantity: 500, price: 8412, lastPrice: 8412, impactBps: 0.4,
  fee: 4206, realizedPnl: 0, executedAt: at(14, 2, 30), tick: 1284, cashAfter: 20_624_749, sharesAfter: 3500, clientOrderId: '7q2f9kAAAAAAAAAAAAAA',
};
const SELL: Trade = {
  id: 't2', teamId: 'saltwind', companyId: 'salt', side: 'sell', quantity: 400, price: 1824, lastPrice: 1826, impactBps: 12.5,
  fee: 730, realizedPnl: 17_600, executedAt: at(13, 21, 0), tick: 1201, cashAfter: 20_000_000, sharesAfter: 2100, clientOrderId: '3m8d1qBBBBBBBBBBBBBB',
};
const ORDERS: OrderRecord[] = [
  { id: 'saltwind_7q2f9kAAAAAAAAAAAAAA', teamId: 'saltwind', clientOrderId: '7q2f9kAAAAAAAAAAAAAA', companyId: 'krkn', side: 'buy', quantity: 500, status: 'filled', tradeId: 't1', createdAt: at(14, 2, 30), tick: 1284 },
  { id: 'saltwind_9k2l4tCCCCCCCCCCCCCC', teamId: 'saltwind', clientOrderId: '9k2l4tCCCCCCCCCCCCCC', companyId: 'krkn', side: 'buy', quantity: 300, status: 'rejected', code: 'price_moved', reason: 'The price moved.', createdAt: at(13, 10, 30), tick: 640 },
];

describe('buildActivity', () => {
  const items = buildActivity(ORDERS, [BUY, SELL], BY_ID, 720);

  it('joins orders with their fills, keeps fills without an order record, newest first', () => {
    expect(items.map((i) => i.title)).toEqual(['Bought 500 KRKN', 'Sold 400 SALT', 'Buy 300 KRKN']);
    expect(items.map((i) => i.orderNumber)).toEqual(['BX-7Q2F9K', 'BX-3M8D1Q', 'BX-9K2L4T']);
  });

  it('shows cash in or out with the fee, and the tick and time', () => {
    expect(items[0]).toMatchObject({ kind: 'buy', net: -4_210_206, status: 'Filled', subtitle: 'Tick 1,284 · 14:02:30', session: 2 });
    expect(items[1]).toMatchObject({ kind: 'sell', net: 728_870, status: 'Filled', subtitle: 'Tick 1,201 · 13:21:00' });
  });

  it('marks rejected orders as not placed, with the COPY §9 title as the reason', () => {
    expect(items[2]).toMatchObject({ kind: 'rejected', net: null, status: 'Not placed', subtitle: 'Price moved · Tick 640', reasonTitle: 'Price moved', session: 1 });
  });

  it('filters and groups by session, newest session first', () => {
    expect(filterActivity(items, 'buys').map((i) => i.orderNumber)).toEqual(['BX-7Q2F9K']);
    expect(filterActivity(items, 'sells').map((i) => i.orderNumber)).toEqual(['BX-3M8D1Q']);
    expect(filterActivity(items, 'attention').map((i) => i.orderNumber)).toEqual(['BX-9K2L4T']);
    expect(filterActivity(items, 'all')).toHaveLength(3);
    expect(groupBySession(items).map((g) => [g.session, g.items.length])).toEqual([[2, 2], [1, 1]]);
  });

  it('finds an order by its order number, case-insensitive', () => {
    expect(findActivity(items, 'bx-7q2f9k')?.title).toBe('Bought 500 KRKN');
    expect(findActivity(items, 'BX-NOPE00')).toBeNull();
  });

  it('falls back to the company id when the company has not loaded', () => {
    expect(buildActivity([], [{ ...BUY, companyId: 'lvth' }], {}, 720)[0]!.title).toBe('Bought 500 LVTH');
  });
});

describe('order detail', () => {
  const [buy, sell, rejected] = buildActivity(ORDERS, [BUY, SELL], BY_ID, 720);

  it('lists the BRIEF §7 fill with a "?" term on every row that has one', () => {
    const lines = orderDetailLines(buy!, 10);
    expect(lines.map((l) => [l.label, l.value, l.termId ?? null])).toEqual([
      ['Time of trade', '14:02:30', null],
      ['Price update number (tick)', '1,284', 'tick'],
      ['Order number', 'BX-7Q2F9K', null],
      ['Action', 'Buy', 'marketOrder'],
      ['Shares', '500', null],
      ['Fill price', 'Ð84.12', 'marketOrder'],
      ['Order value', 'Ð42,060.00', null],
      ['Fee (0.10%)', 'Ð42.06', 'fee'],
      ['Cash in or out', '−Ð42,102.06', null],
      ['Price nudge', 'under 0.01%', 'priceImpact'],
      ['Cash after', 'Ð206,247.49', 'cashAvailable'],
    ]);
  });

  it('adds the locked-in gain for sells and the reason for rejected orders', () => {
    expect(orderDetailLines(sell!, 10).find((l) => l.termId === 'realizedGain')).toMatchObject({ label: 'Locked-in gain/loss', value: '+Ð176.00' });
    expect(orderDetailLines(rejected!, 10).map((l) => l.label)).toEqual(['Time', 'Price update number (tick)', 'Order number', 'Action', 'Shares', 'Status', 'Why it was rejected']);
  });

  it('writes the price nudge', () => {
    expect(priceNudgeText(0)).toBe('under 0.01%');
    expect(priceNudgeText(0.99)).toBe('under 0.01%');
    expect(priceNudgeText(12.5)).toBe('0.13%');
  });
});

describe('balanceLines', () => {
  it('uses the COPY §1.3 display labels with a term for every row but trades', () => {
    const lines = balanceLines({ cash: 24_834_955, invested: 83_587_000, unrealized: 7_417_000, realized: 1_004_955, fees: 124_033, trades: 23 });
    expect(lines.map((l) => [l.label, l.value, l.termId ?? null])).toEqual([
      ['Cash available to trade (buying power)', 'Ð248,349.55', 'cashAvailable'],
      ['Invested (market value of holdings)', 'Ð835,870.00', 'invested'],
      ['Paper gain/loss (unrealized gain)', '+Ð74,170.00', 'unrealizedGain'],
      ['Locked-in gain/loss (realized gain)', '+Ð10,049.55', 'realizedGain'],
      ['Fees paid (commissions)', 'Ð1,240.33', 'feesPaid'],
      ['Trades made (trade count)', '23', null],
    ]);
  });
});
