/**
 * Pure Activity maths (MOBILE §7.5): order records joined with their fills, filters, session groups,
 * Order detail lines and Balances lines. Labels are COPY §1.3 `activity.*` / `portfolio.*`; rejection
 * titles are COPY §9 `ticket-errors.*.title`. Money is integer cents.
 */
import type { Company, OrderRecord, OrderSide, Trade } from '@deca/shared';
import { formatMoney, formatNumber, formatPct, formatTickTime } from '../../lib/format';
import { sessionInfo } from '../../lib/gameTime';
import { orderNumber } from '../../lib/orderId';

export type ActivityKind = 'buy' | 'sell' | 'rejected';
export type ActivityFilter = 'all' | 'buys' | 'sells' | 'attention';

export interface ActivityItem {
  /** Stable key: the order number. */
  orderNumber: string;
  kind: ActivityKind;
  side: OrderSide;
  companyId: string;
  ticker: string;
  quantity: number;
  /** "Bought 500 KRKN" · "Sold 400 SALT" · "Buy 300 KRKN" (not placed). */
  title: string;
  /** "Tick 1,284 · 14:02:30", or "Price moved · Tick 640" when not placed. */
  subtitle: string;
  /** Cash in (+) or out (−) including the fee; null when nothing moved. */
  net: number | null;
  status: 'Filled' | 'Not placed';
  /** COPY §9 title of the rejection code (not placed only). */
  reasonTitle: string | null;
  tick: number;
  time: number;
  session: number;
  trade: Trade | null;
  order: OrderRecord | null;
}

/** COPY §9 `ticket-errors.{code}.title`. */
export const REJECTION_TITLES: Record<string, string> = {
  insufficient_funds: 'Not enough cash',
  insufficient_shares: 'Not enough shares',
  position_limit: 'Over the position limit',
  interval_limit: 'Too many shares for one price update',
  price_moved: 'Price moved',
  market_closed: 'Market not open yet',
  market_closed_ended: 'Game ended',
  paused: 'Trading paused',
  trading_disabled: 'Trading turned off for your crew',
  bad_quantity: 'Check the number of shares',
  amount_too_small: 'Amount too small',
  unknown_company: 'Company not found',
  no_team: 'Crew account not found',
  network: 'Order not sent',
  unknown_error: 'Something went wrong',
};

export function rejectionTitle(code: string | undefined): string {
  return (code && REJECTION_TITLES[code]) || REJECTION_TITLES.unknown_error!;
}

const tickerOf = (companyId: string, byId: Record<string, Company>): string => byId[companyId]?.ticker ?? companyId.toUpperCase();

function tradeNet(t: Pick<Trade, 'side' | 'quantity' | 'price' | 'fee'>): number {
  const notional = t.quantity * t.price;
  return t.side === 'buy' ? -(notional + t.fee) : notional - t.fee;
}

function filledItem(trade: Trade, order: OrderRecord | null, byId: Record<string, Company>, sessionTicks: number): ActivityItem {
  const ticker = tickerOf(trade.companyId, byId);
  return {
    orderNumber: orderNumber(trade.clientOrderId),
    kind: trade.side,
    side: trade.side,
    companyId: trade.companyId,
    ticker,
    quantity: trade.quantity,
    title: `${trade.side === 'buy' ? 'Bought' : 'Sold'} ${formatNumber(trade.quantity)} ${ticker}`,
    subtitle: `Tick ${formatNumber(trade.tick)} · ${formatTickTime(trade.executedAt)}`,
    net: tradeNet(trade),
    status: 'Filled',
    reasonTitle: null,
    tick: trade.tick,
    time: trade.executedAt,
    session: sessionInfo(trade.tick, sessionTicks).session,
    trade,
    order,
  };
}

function orderItem(order: OrderRecord, byId: Record<string, Company>, sessionTicks: number): ActivityItem {
  const ticker = tickerOf(order.companyId, byId);
  const rejected = order.status === 'rejected';
  const reasonTitle = rejected ? rejectionTitle(order.code) : null;
  return {
    orderNumber: orderNumber(order.clientOrderId),
    kind: rejected ? 'rejected' : order.side,
    side: order.side,
    companyId: order.companyId,
    ticker,
    quantity: order.quantity,
    title: rejected
      ? `${order.side === 'buy' ? 'Buy' : 'Sell'} ${formatNumber(order.quantity)} ${ticker}`
      : `${order.side === 'buy' ? 'Bought' : 'Sold'} ${formatNumber(order.quantity)} ${ticker}`,
    subtitle: rejected ? `${reasonTitle} · Tick ${formatNumber(order.tick)}` : `Tick ${formatNumber(order.tick)} · ${formatTickTime(order.createdAt)}`,
    net: null,
    status: rejected ? 'Not placed' : 'Filled',
    reasonTitle,
    tick: order.tick,
    time: order.createdAt,
    session: sessionInfo(order.tick, sessionTicks).session,
    trade: null,
    order,
  };
}

/** Orders joined with their fills (fills without an order record are kept), newest first. */
export function buildActivity(
  orders: readonly OrderRecord[],
  trades: readonly Trade[],
  byId: Record<string, Company>,
  sessionTicks: number,
): ActivityItem[] {
  const tradeById = new Map(trades.map((t) => [t.id, t]));
  const tradeByClient = new Map(trades.map((t) => [t.clientOrderId, t]));
  const used = new Set<string>();
  const items: ActivityItem[] = [];
  for (const o of orders) {
    const trade = o.status === 'filled' ? ((o.tradeId ? tradeById.get(o.tradeId) : undefined) ?? tradeByClient.get(o.clientOrderId)) : undefined;
    if (trade) {
      used.add(trade.id);
      items.push(filledItem(trade, o, byId, sessionTicks));
    } else {
      items.push(orderItem(o, byId, sessionTicks));
    }
  }
  for (const t of trades) if (!used.has(t.id)) items.push(filledItem(t, null, byId, sessionTicks));
  return items.sort((a, b) => b.time - a.time || b.tick - a.tick);
}

export function filterActivity(items: readonly ActivityItem[], filter: ActivityFilter): ActivityItem[] {
  switch (filter) {
    case 'buys':
      return items.filter((i) => i.kind === 'buy');
    case 'sells':
      return items.filter((i) => i.kind === 'sell');
    case 'attention':
      return items.filter((i) => i.kind === 'rejected');
    default:
      return [...items];
  }
}

export interface SessionGroup {
  session: number;
  items: ActivityItem[];
}

/** Items grouped under "Session n" headers, newest session first (input order kept inside a group). */
export function groupBySession(items: readonly ActivityItem[]): SessionGroup[] {
  const groups = new Map<number, ActivityItem[]>();
  for (const i of items) {
    const list = groups.get(i.session);
    if (list) list.push(i);
    else groups.set(i.session, [i]);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([session, list]) => ({ session, items: list }));
}

/** The item for `/portfolio/activity/:orderId` (the order number, case-insensitive). */
export function findActivity(items: readonly ActivityItem[], id: string | undefined): ActivityItem | null {
  if (!id) return null;
  const key = id.toUpperCase();
  return items.find((i) => i.orderNumber === key) ?? null;
}

export interface DetailLine {
  label: string;
  value: string;
  /** Glossary id for the "?" (COPY §1.3 glossary column). */
  termId?: string;
  /** Money rows: the amount in cents, so the page can speak the currency name (MOBILE §10). */
  cents?: number;
}

/** "under 0.01%" below one basis point, else the percentage. */
export function priceNudgeText(bps: number): string {
  if (!Number.isFinite(bps) || Math.abs(bps) < 1) return 'under 0.01%';
  return formatPct(Math.abs(bps) / 10_000);
}

/** Order detail rows (MOBILE §7.5; COPY §1.3 `activity.*`). */
export function orderDetailLines(item: ActivityItem, feeBps: number, symbol?: string): DetailLine[] {
  const money = (cents: number, signed = false) => formatMoney(cents, { symbol, signed });
  const action: DetailLine = { label: 'Action', value: item.side === 'buy' ? 'Buy' : 'Sell', termId: 'marketOrder' };
  const t = item.trade;
  if (!t) {
    const lines: DetailLine[] = [
      { label: item.status === 'Filled' ? 'Time of trade' : 'Time', value: formatTickTime(item.time) },
      { label: 'Price update number (tick)', value: formatNumber(item.tick), termId: 'tick' },
      { label: 'Order number', value: item.orderNumber },
      action,
      { label: 'Shares', value: formatNumber(item.quantity) },
      { label: 'Status', value: item.status },
    ];
    if (item.reasonTitle) lines.push({ label: 'Why it was rejected', value: item.reasonTitle });
    return lines;
  }
  const lines: DetailLine[] = [
    { label: 'Time of trade', value: formatTickTime(t.executedAt) },
    { label: 'Price update number (tick)', value: formatNumber(t.tick), termId: 'tick' },
    { label: 'Order number', value: item.orderNumber },
    action,
    { label: 'Shares', value: formatNumber(t.quantity) },
    { label: 'Fill price', value: money(t.price), termId: 'marketOrder', cents: t.price },
    { label: 'Order value', value: money(t.quantity * t.price), cents: t.quantity * t.price },
    { label: `Fee (${formatPct(feeBps / 10_000)})`, value: money(t.fee), termId: 'fee', cents: t.fee },
    { label: 'Cash in or out', value: money(tradeNet(t), true), cents: tradeNet(t) },
    { label: 'Price nudge', value: priceNudgeText(t.impactBps), termId: 'priceImpact' },
    { label: 'Cash after', value: money(t.cashAfter), termId: 'cashAvailable', cents: t.cashAfter },
  ];
  if (t.side === 'sell') lines.push({ label: 'Locked-in gain/loss', value: money(t.realizedPnl, true), termId: 'realizedGain', cents: t.realizedPnl });
  return lines;
}

export interface BalanceInput {
  cash: number;
  invested: number;
  unrealized: number;
  realized: number;
  fees: number;
  trades: number;
}

/** Balances rows (MOBILE §7.5; COPY §1.3 `portfolio.*` display labels). */
export function balanceLines(b: BalanceInput, symbol?: string): DetailLine[] {
  const money = (cents: number, signed = false) => formatMoney(cents, { symbol, signed });
  return [
    { label: 'Cash available to trade (buying power)', value: money(b.cash), termId: 'cashAvailable', cents: b.cash },
    { label: 'Invested (market value of holdings)', value: money(b.invested), termId: 'invested', cents: b.invested },
    { label: 'Paper gain/loss (unrealized gain)', value: money(b.unrealized, true), termId: 'unrealizedGain', cents: b.unrealized },
    { label: 'Locked-in gain/loss (realized gain)', value: money(b.realized, true), termId: 'realizedGain', cents: b.realized },
    { label: 'Fees paid (commissions)', value: money(b.fees), termId: 'feesPaid', cents: b.fees },
    { label: 'Trades made (trade count)', value: formatNumber(b.trades) },
  ];
}
