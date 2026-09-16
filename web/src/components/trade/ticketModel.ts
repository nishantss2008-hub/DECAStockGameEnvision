/**
 * Pure words and numbers for the Trade sheet (MOBILE §7.10, COPY §9). Money in integer cents.
 * Estimates come from the shared `estimateOrder`, the same maths the server prices with.
 */
import {
  estimateOrder,
  feeFor,
  intervalShareCap,
  maxAffordableShares,
  maxSharesUnderLimit,
  type EstimateInput,
  type OrderEstimate,
  type Phase,
  type Trade,
} from '@deca/shared';
import { formatMoney, formatNumber, formatPct } from '../../lib/format';
import { INTRO_PATH } from '../learn/introFlow';
import { orderNumber } from '../../lib/orderId';
import { TICKET, TICKET_ERRORS, fillText } from './ticketCopy';
import { amountCents, quantityFrom, sellProceeds, type TicketState } from './useTicketState';

export interface TicketContext {
  companyId: string;
  ticker: string;
  name: string;
  /** Last price, cents. */
  price: number;
  /**
   * Impact inputs. For a FUND these are the equivalent pair `fundTicketInputs` derives from the
   * basket, not fields the fund owns — a fund has no beta and no shares outstanding.
   */
  beta: number;
  sharesOutstanding: number;
  /** True when this ticket is buying or selling a basket (COPY §13 `trading`). */
  isFund?: boolean;
  tick: number;
  timeText: string;
  /** Cash available to trade, cents. */
  cash: number;
  owned: number;
  avgCost: number;
  /** Account value, cents. */
  totalValue: number;
  feeBps: number;
  /** Host position limit as a fraction (1 = no limit). */
  maxPositionPct: number;
  currency: { symbol: string; name: string };
  /** Seconds until the next price update (interval_limit message). */
  secondsToNextTick: number;
}

export type FixAction =
  | { kind: 'shares'; shares: number }
  | { kind: 'input'; input: string }
  | { kind: 'clear' }
  | { kind: 'repreview' }
  | { kind: 'place' }
  | { kind: 'navigate'; to: string }
  | { kind: 'signOut' };

export interface TicketFix {
  label: string;
  action: FixAction;
}

export interface TicketProblem {
  code: string;
  title: string;
  message: string;
  fix: TicketFix | null;
}

export interface TicketRow {
  label: string;
  value: string;
}

export interface PreviewRow extends TicketRow {
  /** Glossary id for the row's inline "?". */
  termId: string;
  /** Always-visible Footnote explanation (BRIEF §9.8). */
  note?: string;
  emphasized?: boolean;
}

const money = (cents: number, c: TicketContext) => formatMoney(cents, { symbol: c.currency.symbol });
const count = (n: number) => formatNumber(n);
const limitPctText = (pct: number) => `${Math.round(pct * 100)}%`;
const limitOn = (pct: number) => typeof pct === 'number' && pct < 1;

function estimateInput(side: TicketState['side'], quantity: number, c: TicketContext): EstimateInput {
  return {
    side,
    quantity,
    lastPrice: c.price,
    beta: c.beta,
    sharesOutstanding: c.sharesOutstanding,
    feeBps: c.feeBps,
    cash: c.cash,
    sharesOwned: c.owned,
    avgCost: c.avgCost,
    totalValue: c.totalValue,
    maxPositionPct: c.maxPositionPct,
  };
}

/** Shares the ticket trades and the shared estimate for them (null while nothing tradable is typed). */
export function estimateTicket(s: TicketState, c: TicketContext): { quantity: number; estimate: OrderEstimate | null } {
  const quantity = quantityFrom(s, c.price, c.beta, c.sharesOutstanding, c.feeBps);
  if (quantity <= 0) return { quantity: 0, estimate: null };
  return { quantity, estimate: estimateOrder(estimateInput(s.side, quantity, c)) };
}

/** Line under the amount: "≈ Ð42,102.06 with fee", "≈ 59 shares · Ð31.96 stays as cash", "You own 3,000 shares". */
export function helperLine(s: TicketState, c: TicketContext, quantity: number, est: OrderEstimate | null): string | null {
  const ownedLine = () =>
    c.owned > 0 ? fillText(TICKET.lines.youOwn, { owned: count(c.owned) }) : fillText(TICKET.lines.youOwnNone, { ticker: c.ticker });
  if (s.mode === 'shares') {
    if (s.side === 'sell') return ownedLine();
    return est ? fillText(TICKET.lines.withFee, { total: money(est.total, c) }) : null;
  }
  const cents = amountCents(s.input);
  if (s.side === 'sell') {
    if (cents === null || cents <= 0) return ownedLine();
    return oneShare(fillText(TICKET.lines.amountModeSell, { shares: count(quantity), owned: count(c.owned) }), quantity);
  }
  if (cents === null || cents <= 0) return null;
  const leftover = cents - (est ? est.total : 0);
  return oneShare(fillText(TICKET.lines.amountModeBuy, { shares: count(quantity), leftover: money(Math.max(0, leftover), c) }), quantity);
}

/** Entry summary box: Total cost (or You receive) and Cash after. */
export function summaryRows(s: TicketState, c: TicketContext, est: OrderEstimate): TicketRow[] {
  return [
    { label: s.side === 'buy' ? TICKET.labels.estTotalBuy : TICKET.labels.estTotalSell, value: money(est.total, c) },
    { label: TICKET.labels.cashAfter, value: money(est.cashAfter, c) },
  ];
}

export function shareOfAccountLine(c: TicketContext, est: OrderEstimate): string {
  return fillText(TICKET.lines.shareOfAccount, { ticker: c.ticker, pct: formatPct(est.pctOfAccountAfter, { digits: 1 }) });
}

/** Explanation behind the share-of-account "?" (COPY §9 `explain.positionLimit`). */
export function positionLimitExplain(c: TicketContext): string {
  return limitOn(c.maxPositionPct)
    ? fillText(TICKET.explain.positionLimit, { limitPct: limitPctText(c.maxPositionPct) })
    : TICKET.explain.positionLimitOff;
}

/** Text the amount field needs so the ticket trades `shares` (Doubloons mode: that order's cost or proceeds). */
export function inputForShares(s: TicketState, c: TicketContext, shares: number): string {
  if (!(shares > 0)) return '';
  if (s.mode === 'shares') return String(shares);
  const cents =
    s.side === 'buy'
      ? estimateOrder({ ...estimateInput('buy', shares, c), cash: Number.MAX_SAFE_INTEGER, maxPositionPct: 1 }).total
      : sellProceeds(shares, c.price, c.beta, c.sharesOutstanding, c.feeBps);
  return centsText(cents);
}

function centsText(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

/** Quick chips (COPY §9 `chips`): the share count each one fills in. */
export function chipShares(chip: string, side: TicketState['side'], c: TicketContext): number {
  if (side === 'sell') {
    if (chip === 'All') return c.owned;
    const pct = Number.parseInt(chip, 10);
    return Number.isFinite(pct) ? Math.floor((c.owned * pct) / 100) : 0;
  }
  if (chip === 'Max') return estimateOrder(estimateInput('buy', 0, c)).maxBuyShares;
  const n = Number.parseInt(chip, 10);
  return Number.isFinite(n) ? n : 0;
}

function problem(code: string, vars: Record<string, string>, fix: TicketFix | null, variant?: 'messageNoneOwned' | 'messageAtLimit' | 'messageOneSecond'): TicketProblem {
  const copy = TICKET_ERRORS[code] ?? TICKET_ERRORS.unknown_error!;
  const template = (variant && copy[variant]) || copy.message;
  return { code, title: copy.title, message: fillText(template, vars), fix };
}

function fixFor(code: string, vars: Record<string, string>, action: FixAction): TicketFix {
  return { label: fillText(TICKET_ERRORS[code]!.fix ?? '', vars), action };
}

/** Problems for an estimate error code, with fixes built from local numbers. */
function estimateProblem(code: string, s: TicketState, c: TicketContext, est: OrderEstimate | null): TicketProblem | null {
  switch (code) {
    case 'insufficient_funds': {
      const e = est ?? estimateOrder(estimateInput('buy', 0, c));
      const maxShares = e.maxBuyShares;
      const vars = {
        shortfall: money(Math.max(0, e.shortfall ?? e.total - c.cash), c),
        cash: money(c.cash, c),
        maxShares: count(maxShares),
      };
      return problem(code, vars, maxShares > 0 ? fixFor(code, vars, { kind: 'shares', shares: maxShares }) : null);
    }
    case 'insufficient_shares': {
      const vars = { owned: count(c.owned), ticker: c.ticker };
      if (c.owned <= 0) return problem(code, vars, null, 'messageNoneOwned');
      return problem(code, vars, fixFor(code, vars, { kind: 'shares', shares: c.owned }));
    }
    case 'position_limit': {
      const max = maxSharesUnderLimit(estimateInput('buy', 0, c));
      const vars = { limitPct: limitPctText(c.maxPositionPct), ticker: c.ticker, maxShares: count(Number.isFinite(max) ? max : 0) };
      if (!(max > 0)) return problem(code, vars, null, 'messageAtLimit');
      return problem(code, vars, fixFor(code, vars, { kind: 'shares', shares: max }));
    }
    case 'interval_limit': {
      const cap = intervalShareCap(c.sharesOutstanding);
      const seconds = Math.max(1, Math.ceil(c.secondsToNextTick));
      const vars = { cap: count(cap), ticker: c.ticker, seconds: String(seconds) };
      return problem(code, vars, cap > 0 ? fixFor(code, vars, { kind: 'shares', shares: cap }) : null, seconds === 1 ? 'messageOneSecond' : undefined);
    }
    case 'bad_quantity':
      return problem(code, {}, fixFor(code, {}, { kind: 'clear' }));
    default:
      return null;
  }
}

/** The inline problem that replaces the summary box on Entry (Preview disabled while it shows). */
export function entryProblem(s: TicketState, c: TicketContext, quantity: number, est: OrderEstimate | null): TicketProblem | null {
  if (s.input === '') return null;
  if (quantity <= 0 || !est) {
    const cents = s.mode === 'amount' ? amountCents(s.input) : null;
    if (s.mode === 'amount' && cents !== null && cents > 0) {
      const min =
        s.side === 'buy'
          ? c.price + feeFor(c.price, c.feeBps)
          : sellProceeds(1, c.price, c.beta, c.sharesOutstanding, c.feeBps) + 1;
      const minText = money(min, c);
      const vars = { ticker: c.ticker, price: money(c.price, c), minAmount: minText };
      if (s.side === 'sell' && c.owned <= 0) return estimateProblem('insufficient_shares', s, c, null);
      return problem('amount_too_small', vars, fixFor('amount_too_small', vars, { kind: 'input', input: centsText(min) }));
    }
    return estimateProblem('bad_quantity', s, c, null);
  }
  if (est.valid || !est.error) return null;
  return estimateProblem(est.error, s, c, est);
}

function impactPctText(est: OrderEstimate): string | null {
  return est.impact < 0.0001 ? null : formatPct(est.impact, { digits: 2 });
}

/** COPY writes "{qty} shares"; one share reads "1 share". */
const oneShare = (text: string, quantity: number) => (quantity === 1 ? text.replace(/(^|[^\d,.])1 shares\b/, '$11 share') : text);

export function recapLine(s: TicketState, c: TicketContext, quantity: number): string {
  const text = fillText(s.side === 'buy' ? TICKET.lines.previewRecapBuy : TICKET.lines.previewRecapSell, {
    qty: count(quantity),
    ticker: c.ticker,
    name: c.name,
  });
  return oneShare(text, quantity);
}

export function feePctText(feeBps: number): string {
  return formatPct(feeBps / 10_000, { digits: 2 });
}

/** Preview KeyValue card (MOBILE §7.10): nine rows, four with an always-visible explanation. */
export function previewRows(s: TicketState, c: TicketContext, est: OrderEstimate): PreviewRow[] {
  const buy = s.side === 'buy';
  const impactPct = impactPctText(est);
  const feePct = feePctText(c.feeBps);
  return [
    { label: TICKET.labels.estPrice, value: money(est.price, c), termId: 'price', note: buy ? TICKET.explain.marketOrderBuy : TICKET.explain.marketOrderSell },
    {
      label: TICKET.labels.estImpact,
      value: impactPct ?? 'under 0.01%',
      termId: 'priceImpact',
      note: impactPct
        ? fillText(buy ? TICKET.explain.priceImpactDetailBuy : TICKET.explain.priceImpactDetailSell, { impactPct })
        : fillText(TICKET.explain.priceImpactTiny, { ticker: c.ticker }),
    },
    { label: TICKET.labels.estValue, value: money(est.notional, c), termId: 'marketOrder' },
    { label: `${TICKET.labels.estFee} (${feePct})`, value: money(est.fee, c), termId: 'fee', note: fillText(TICKET.explain.fee, { feePct }) },
    { label: buy ? TICKET.labels.estTotalBuy : TICKET.labels.estTotalSell, value: money(est.total, c), termId: 'fee', emphasized: true },
    { label: TICKET.labels.cashAfter, value: money(est.cashAfter, c), termId: 'cashAvailable' },
    { label: TICKET.labels.sharesAfter, value: count(est.sharesAfter), termId: 'stock' },
    {
      label: TICKET.labels.pctOfAccountAfter,
      value: formatPct(est.pctOfAccountAfter, { digits: 1 }),
      termId: 'pctOfAccount',
      ...(buy ? { note: positionLimitExplain(c) } : {}),
    },
    { label: TICKET.labels.avgCostAfter, value: est.sharesAfter > 0 ? money(est.avgCostAfter, c) : '—', termId: 'avgCost' },
  ];
}

export function pricedAtLine(tick: number, timeText: string): string {
  return fillText(TICKET.lines.pricedAt, { tick: count(tick), time: timeText });
}

export interface FilledSummary {
  headline: string;
  announcement: string;
  rows: TicketRow[];
  vsPreview: string;
  orderLine: string;
}

/** Filled step (MOBILE §7.10): order value = shares × fill price; fee from the game's rate. */
export function filledSummary(trade: Trade, estimatePrice: number | null, c: TicketContext): FilledSummary {
  const buy = trade.side === 'buy';
  const value = trade.quantity * trade.price;
  const fee = Number.isFinite(trade.fee) ? trade.fee : feeFor(value, c.feeBps);
  const total = buy ? value + fee : value - fee;
  const vars = { qty: count(trade.quantity), ticker: c.ticker, price: money(trade.price, c), total: money(value, c) };
  let vsPreview: string = TICKET.lines.filledVsPreviewSame;
  if (estimatePrice !== null && estimatePrice !== trade.price) {
    const diff = trade.price - estimatePrice;
    vsPreview = fillText(diff > 0 ? TICKET.lines.filledVsPreviewAbove : TICKET.lines.filledVsPreviewBelow, {
      diff: money(Math.abs(diff), c),
      est: money(estimatePrice, c),
    });
  }
  return {
    headline: fillText(buy ? TICKET.lines.boughtHeadline : TICKET.lines.soldHeadline, vars),
    announcement: fillText(buy ? TICKET.lines.filledBuy : TICKET.lines.filledSell, vars),
    rows: [
      { label: TICKET.labels.estValue, value: money(value, c) },
      { label: TICKET.labels.estFee, value: money(fee, c) },
      { label: buy ? TICKET.labels.estTotalBuy : TICKET.labels.estTotalSell, value: money(total, c) },
      { label: TICKET.labels.cashAfter, value: money(trade.cashAfter, c) },
    ],
    vsPreview,
    orderLine: fillText(TICKET.lines.orderLine, { number: orderNumber(trade.clientOrderId), tick: count(trade.tick) }),
  };
}

/** Client-side price protection problem (preview older than a 2% move). */
export function priceMovedProblem(c: TicketContext, quoted: number): TicketProblem {
  const vars = { ticker: c.ticker, quoted: money(quoted, c), last: money(c.price, c) };
  return problem('price_moved', vars, fixFor('price_moved', vars, { kind: 'repreview' }));
}

/** Server message without its "Title. " lead (the server sends COPY title then message). */
function stripTitle(message: string, title: string): string {
  const lead = `${title}. `;
  return message.startsWith(lead) ? message.slice(lead.length) : message;
}

/** A failed POST /orders → Needs attention (COPY §9 `ticket-errors`). */
export function apiProblem(
  err: { code: string; status: number; message: string },
  s: TicketState,
  c: TicketContext,
  phase: Phase | null,
): TicketProblem {
  const code = err.code;
  const serverText = (key: string) => {
    const copy = TICKET_ERRORS[key]!;
    const stripped = stripTitle(err.message ?? '', copy.title);
    return stripped && stripped !== err.message ? stripped : null;
  };
  switch (code) {
    case 'price_moved': {
      const p = priceMovedProblem(c, s.quotedPrice ?? c.price);
      return { ...p, message: serverText(code) ?? p.message };
    }
    case 'insufficient_funds':
    case 'insufficient_shares':
    case 'position_limit':
    case 'interval_limit':
    case 'bad_quantity': {
      const quantity = quantityFrom(s, c.price, c.beta, c.sharesOutstanding, c.feeBps);
      const est = quantity > 0 ? estimateOrder(estimateInput(s.side, quantity, c)) : null;
      const local = estimateProblem(code, s, c, est)!;
      return { ...local, message: serverText(code) ?? local.message };
    }
    case 'market_closed': {
      if (phase === 'paused') return problem('paused', {}, null);
      if (phase === 'ended') return problem('market_closed_ended', {}, fixFor('market_closed_ended', {}, { kind: 'navigate', to: '/standings/results' }));
      return problem('market_closed', {}, { label: TICKET.marketClosedFix, action: { kind: 'navigate', to: '/markets' } });
    }
    case 'trading_disabled':
      return problem(code, {}, null);
    // The host cleared this crew's intro mid-session, or it never finished it: route into the flow.
    case 'intro_required':
      return problem(code, {}, fixFor(code, {}, { kind: 'navigate', to: INTRO_PATH }));
    case 'unknown_company':
      return problem(code, {}, fixFor(code, {}, { kind: 'navigate', to: '/markets' }));
    case 'no_team':
    case 'unauthenticated':
      return problem('no_team', {}, fixFor('no_team', {}, { kind: 'signOut' }));
    case 'network':
      return problem(code, {}, fixFor(code, {}, { kind: 'place' }));
    default:
      return problem('unknown_error', {}, fixFor('unknown_error', {}, { kind: 'place' }));
  }
}

/** Largest buy the cash alone allows (used by the Doubloons Max chip). */
export function maxAffordable(c: TicketContext): number {
  return maxAffordableShares(c.cash, c.price, c.beta, c.sharesOutstanding, c.feeBps);
}

export type PlaceBlock = 'offline' | 'paused' | 'lobby' | 'ended' | 'tradingDisabled';

/** Why Place order is disabled (the shell banner shown in the sheet is its visible reason), or null. */
export function placeBlock(input: { phase: Phase | null | undefined; online: boolean; tradingDisabled: boolean }): PlaceBlock | null {
  if (!input.online) return 'offline';
  if (input.phase === 'paused') return 'paused';
  if (input.phase === 'lobby' || !input.phase) return 'lobby';
  if (input.phase === 'ended') return 'ended';
  if (input.tradingDisabled) return 'tradingDisabled';
  return null;
}

/** Preview stays available in every state except a finished game (MOBILE §7.7 preview-only mode). */
export function previewAllowed(block: PlaceBlock | null): boolean {
  return block !== 'ended';
}
