/**
 * Trade sheet state (plan Task 10, MOBILE §5.16, §7.10): a pure reducer over the ticket's steps
 * Entry → Preview → Placing → Filled | Needs attention ('rejected').
 *
 * - `input` is the keypad text: whole shares in Shares mode, doubloons with up to 2 decimals in Doubloons mode.
 * - `clientOrderId` is kept through retries (the server stores orders by it, so a retry never charges twice)
 *   and only replaced by `reset` after a fill or when the student starts a new order.
 * - `quotedPrice` / `previewTick` are the price and tick the Preview was built on; POST /orders sends the quote.
 */
import { useReducer } from 'react';
import { estFillPrice, feeFor, impactLambda, MODEL, notionalFor, sharesForAmount, type OrderSide, type Trade } from '@deca/shared';

export type TicketStage = 'entry' | 'preview' | 'placing' | 'filled' | 'rejected';
export type TicketMode = 'shares' | 'amount';

export interface TicketError {
  code: string;
  message: string;
}

export interface TicketState {
  stage: TicketStage;
  side: OrderSide;
  mode: TicketMode;
  input: string;
  companyId: string | null;
  clientOrderId: string;
  quotedPrice: number | null;
  previewTick: number | null;
  trade: Trade | null;
  error: TicketError | null;
}

export type TicketAction =
  | { type: 'setSide'; side: OrderSide }
  | { type: 'setMode'; mode: TicketMode }
  | { type: 'setInput'; input: string }
  | { type: 'setCompany'; companyId: string }
  | { type: 'preview'; price: number; tick: number }
  | { type: 'edit' }
  | { type: 'placing' }
  | { type: 'filled'; trade: Trade }
  | { type: 'rejected'; code: string; message: string }
  | { type: 'reset'; clientOrderId: string };

export function initialTicket(clientOrderId: string, companyId: string | null, side: OrderSide = 'buy'): TicketState {
  return {
    stage: 'entry',
    side,
    mode: 'shares',
    input: '',
    companyId,
    clientOrderId,
    quotedPrice: null,
    previewTick: null,
    trade: null,
    error: null,
  };
}

/** Input can only change while the student is entering the order (never while placing or after a fill). */
const editable = (s: TicketState): boolean => s.stage === 'entry' || s.stage === 'preview' || s.stage === 'rejected';

export function ticketReducer(s: TicketState, a: TicketAction): TicketState {
  switch (a.type) {
    case 'setSide':
      return editable(s) && s.side !== a.side ? { ...s, side: a.side, input: '', stage: 'entry', error: null } : s;
    case 'setMode':
      return editable(s) && s.mode !== a.mode ? { ...s, mode: a.mode, input: '', stage: 'entry', error: null } : s;
    case 'setInput':
      return editable(s) ? { ...s, input: a.input, stage: 'entry', error: null } : s;
    case 'setCompany':
      return s.stage === 'placing' ? s : { ...s, companyId: a.companyId, input: '', stage: 'entry', error: null, quotedPrice: null, previewTick: null };
    case 'preview':
      return s.stage === 'placing' || s.stage === 'filled'
        ? s
        : { ...s, stage: 'preview', quotedPrice: a.price, previewTick: a.tick, error: null };
    case 'edit':
      return s.stage === 'placing' ? s : { ...s, stage: 'entry', error: null };
    case 'placing':
      return s.stage === 'preview' || s.stage === 'rejected' ? { ...s, stage: 'placing', error: null } : s;
    case 'filled':
      return { ...s, stage: 'filled', trade: a.trade, error: null };
    case 'rejected':
      return { ...s, stage: 'rejected', error: { code: a.code, message: a.message } };
    case 'reset':
      return { ...initialTicket(a.clientOrderId, s.companyId, s.side), mode: s.mode };
    default:
      return s;
  }
}

export function useTicketState(clientOrderId: string, companyId: string | null, side: OrderSide) {
  return useReducer(ticketReducer, undefined, () => initialTicket(clientOrderId, companyId, side));
}

const SHARES_TEXT = /^\d+$/;
const AMOUNT_TEXT = /^\d+(\.\d{0,2})?$/;

/** Doubloons text ("5000", "5000.5") → integer cents; null when it is not an amount. */
export function amountCents(input: string): number | null {
  if (!AMOUNT_TEXT.test(input)) return null;
  const [whole = '0', frac = ''] = input.split('.');
  return Number.parseInt(whole, 10) * 100 + (frac === '' ? 0 : Number.parseInt(frac.padEnd(2, '0'), 10));
}

/** Cash a sell of q shares brings in after the fee (no pending flow). */
export function sellProceeds(q: number, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number {
  if (q <= 0) return 0;
  const notional = notionalFor(q, estFillPrice('sell', lastPrice, impactLambda(beta, sharesOutstanding), q));
  return notional - feeFor(notional, feeBps);
}

/** Largest whole share count whose sell proceeds stay at or under `cents`. */
function sharesForProceeds(cents: number, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number {
  if (!(cents > 0) || !(lastPrice > 0)) return 0;
  let lo = 0;
  let hi = Math.max(1, Math.ceil(cents / lastPrice) * 2 + 2);
  const ok = (q: number) => sellProceeds(q, lastPrice, beta, sharesOutstanding, feeBps) <= cents;
  while (ok(hi) && hi < Number.MAX_SAFE_INTEGER / 2) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Shares the ticket would trade. Shares mode: the typed whole number. Doubloons mode: the most shares the amount
 * buys all-in (impact and fee included), or for a sell the most shares whose proceeds stay within the amount.
 */
export function quantityFrom(s: TicketState, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number {
  if (s.mode === 'shares') {
    if (!SHARES_TEXT.test(s.input)) return 0;
    const n = Number.parseInt(s.input, 10);
    return Number.isSafeInteger(n) ? n : 0;
  }
  const cents = amountCents(s.input);
  if (cents === null || cents <= 0) return 0;
  return s.side === 'sell'
    ? sharesForProceeds(cents, lastPrice, beta, sharesOutstanding, feeBps)
    : sharesForAmount(cents, lastPrice, beta, sharesOutstanding, feeBps);
}

/** True when the last price moved past the server's price-protection band from the preview quote. */
export function isStale(s: TicketState, lastPrice: number): boolean {
  if (s.quotedPrice === null || !(s.quotedPrice > 0)) return false;
  return Math.abs(lastPrice - s.quotedPrice) > MODEL.priceProtection * s.quotedPrice;
}
