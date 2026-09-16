/**
 * Trade execution (spec §6): the only path by which crew cash and holdings change.
 *
 * An order fills immediately at the engine's path-exact impacted price in
 * UNROUNDED cents (other crews' flow this interval plus half the order's own
 * impact), plus a basis-point fee. `notional = notionalFor(q, fillPrice)`, so
 * splitting an order costs the same as placing it whole.
 *
 * Ordering matters:
 *   0. A duplicate of an order still in flight in this process shares that
 *      order's outcome and reserves nothing (see inFlightOrders).
 *   1. A retry of an already-filled `orders/{teamId}_{clientOrderId}` returns
 *      the original trade, whatever the market is doing now.
 *   2. Phase, company, quantity and price protection are checked.
 *   3. `engine.reserveFlow` adds the signed quantity to pending flow
 *      SYNCHRONOUSLY, before any await, so concurrent orders price in each
 *      other's impact and the per-crew interval cap holds.
 *   4. One SQLite transaction (`store.tx`), queued per crew in-process, re-checks
 *      idempotency and the phase, reads the crew and its holdings, runs
 *      computeFill, and writes crew, holding, trade and order. The trade's time
 *      and tick are the moment it was priced. If the transaction fails for any
 *      reason (or finds a duplicate that already filled) the reservation is released.
 *   5. Rejections are recorded best-effort as `status: 'rejected'` order rows,
 *      never over a filled one, never for a crew whose row does not exist
 *      (checked in the recording transaction, whatever the rejection), and never
 *      while a host rebuild has halted trading (see haltTrading).
 *   6. A fill publishes the crew's portfolio to that crew's own stream connections
 *      (realtime/hub.ts) — never to anyone else's.
 *
 * Error text follows docs/design/COPY.md §9 (ticket-errors): each message is
 * the COPY `title` then the filled-in COPY `message`.
 *
 * The store is a lazily opened singleton, so the pure fill math below imports
 * without touching SQLite (unit tests never open a database).
 */

import { randomUUID } from 'node:crypto';
import {
  CURRENCY,
  MODEL,
  feeFor,
  intervalShareCap,
  notionalFor,
  type Holding,
  type OrderRecord,
  type OrderRequest,
  type OrderSide,
  type Phase,
  type Trade,
} from '@deca/shared';
import { formatMoney } from '../lib/money';
import { auditLog } from '../lib/logger';
import { store } from '../store';
import { publishPortfolio } from '../realtime/hub';
import type { GameEngine } from '../engine/loop';

export type TradeErrorCode =
  | 'market_closed'
  | 'trading_disabled'
  | 'unknown_company'
  | 'bad_quantity'
  | 'price_moved'
  | 'insufficient_funds'
  | 'insufficient_shares'
  | 'position_limit'
  | 'interval_limit'
  | 'no_team';

export class TradeError extends Error {
  constructor(
    public code: TradeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

// ---------------------------------------------------------------------------
// Copy (COPY.md §9 ticket-errors, verbatim)
// ---------------------------------------------------------------------------

const COPY = {
  insufficient_funds: {
    title: 'Not enough cash',
    message:
      'This order is {shortfall} more than your cash available to trade ({cash}). Lower the shares or amount, or use the most you can afford.',
  },
  insufficient_shares: {
    title: 'Not enough shares',
    message: 'You own {owned} shares of {ticker}, so you can sell up to {owned}. Lower the number of shares or choose All.',
    messageNoneOwned:
      "You don't own any {ticker} shares, so there is nothing to sell. Switch to Buy or pick a company you own.",
  },
  position_limit: {
    title: 'Over the position limit',
    message: 'This would put more than {limitPct} of your account in {ticker}. You can buy up to {maxShares} more shares.',
    messageAtLimit:
      '{ticker} already makes up {limitPct} or more of your account, the most a buy can reach. You can buy more only if that share falls below the limit.',
  },
  interval_limit: {
    title: 'Too many shares for one price update',
    message:
      'You can trade up to {cap} shares of {ticker} per price update. Lower the shares, or place the rest after the next update in about {seconds} seconds.',
    messageOneSecond:
      'You can trade up to {cap} shares of {ticker} per price update. Lower the shares, or place the rest after the next update in about 1 second.',
  },
  price_moved: {
    title: 'Price moved',
    message:
      'The price of {ticker} moved more than 2% since your preview, from {quoted} to {last}. Review the updated estimate, then place the order again.',
  },
  market_closed: {
    title: 'Market not open yet',
    message: 'Trading opens when the host starts the game. You can research companies and preview orders now.',
  },
  market_closed_ended: {
    title: 'Game ended',
    message:
      "The game has ended, so trading is closed. See how every crew finished and what drove each company's price.",
  },
  paused: {
    title: 'Trading paused',
    message:
      'The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.',
  },
  trading_disabled: {
    title: 'Trading turned off for your crew',
    message:
      'The host has turned off trading for your crew. Ask your host to turn it back on; you can still research and view your account.',
  },
  bad_quantity: {
    title: 'Check the number of shares',
    message: 'Enter a whole number of shares that is 1 or more, like 10 or 250.',
  },
  unknown_company: {
    title: 'Company not found',
    message: "We couldn't find a company with that symbol. Pick one from the search list, like KRKN.",
  },
  no_team: {
    title: 'Crew account not found',
    message:
      "We couldn't find your crew's account. Sign out, sign back in, and try again; if it keeps happening, tell your host.",
  },
  unknown_error: {
    title: 'Something went wrong',
    message: 'Your order could not be placed. Press Place order to try again; if it keeps failing, tell your host.',
  },
} as const;

/** Fallback for `{ticker}` when a caller has no company context. */
const NO_TICKER = 'this company';

function fill(template: string, vars: Record<string, string>): string {
  const text = template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function text(title: string, message: string, vars: Record<string, string> = {}): string {
  return `${title}. ${fill(message, vars)}`;
}

const shares = (n: number): string => n.toLocaleString('en-US');
const pctLabel = (frac: number): string => `${Math.round(frac * 100)}%`;

type StaticCode = 'bad_quantity' | 'unknown_company' | 'trading_disabled' | 'no_team';

/** A TradeError whose message needs no numbers (COPY title + message). */
export function tradeError(code: StaticCode): TradeError {
  return new TradeError(code, text(COPY[code].title, COPY[code].message));
}

/** Message for a failure that is not a TradeError (HTTP 500). */
export const UNKNOWN_ORDER_ERROR_MESSAGE = text(COPY.unknown_error.title, COPY.unknown_error.message);

/** The server answers `market_closed` whenever the game is not live; the text follows the phase. */
export function marketClosedError(phase: Phase): TradeError {
  const c = phase === 'paused' ? COPY.paused : phase === 'ended' ? COPY.market_closed_ended : COPY.market_closed;
  return new TradeError('market_closed', text(c.title, c.message));
}

// ---------------------------------------------------------------------------
// Pure fill math
// ---------------------------------------------------------------------------

export interface FillInput {
  side: OrderSide;
  quantity: number;
  /** Unrounded cents per share from engine.reserveFlow. */
  fillPrice: number;
  /** Last traded price in cents; values the position for the host limit. */
  lastPrice: number;
  feeBps: number;
  cash: number;
  sharesOwned: number;
  avgCost: number;
  /** Cash plus every holding at its last price, in cents. */
  totalValue: number;
  /** Host position limit as a fraction of account value (1 = off). */
  maxPositionPct: number;
  /** Optional context for error messages. */
  ticker?: string;
  currencySymbol?: string;
}

export interface FillOutcome {
  /** round(fillPrice), for display. */
  price: number;
  /** round(quantity·fillPrice). */
  notional: number;
  fee: number;
  cashAfter: number;
  sharesAfter: number;
  /** Average cost per share after the fill; excludes fees. */
  avgCostAfter: number;
  /** Sells: notional − round(avgCost·quantity) − fee. Buys: 0 (the fee counts in feesPaid). */
  realizedPnl: number;
}

/** The limit applies only below 1, matching estimateOrder. */
function limitApplies(pct: number): boolean {
  return typeof pct === 'number' && pct < 1;
}

/** Position limit, valued at lastPrice: sharesAfter·last ≤ pct·(totalValue − fee). Same rule as estimateOrder. */
function withinLimit(sharesAfter: number, lastPrice: number, pct: number, totalValue: number, fee: number): boolean {
  return sharesAfter * lastPrice <= pct * (totalValue - fee);
}

/** Most more shares that pass the limit, pricing each candidate's fee at this fill price. */
function maxSharesUnderLimit(i: FillInput): number {
  const fits = (q: number): boolean =>
    withinLimit(i.sharesOwned + q, i.lastPrice, i.maxPositionPct, i.totalValue, feeFor(notionalFor(q, i.fillPrice), i.feeBps));
  if (!fits(0)) return 0;
  // Fees are never negative, so this count always breaks the limit.
  let hi = Math.floor((i.maxPositionPct * i.totalValue) / i.lastPrice) - i.sharesOwned + 1;
  let lo = 0;
  if (!(hi > 0)) return 0;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function positionLimitError(i: FillInput): TradeError {
  const vars = { ticker: i.ticker ?? NO_TICKER, limitPct: pctLabel(i.maxPositionPct) };
  const atLimit = i.sharesOwned * i.lastPrice >= i.maxPositionPct * i.totalValue;
  const message = atLimit
    ? text(COPY.position_limit.title, COPY.position_limit.messageAtLimit, vars)
    : text(COPY.position_limit.title, COPY.position_limit.message, { ...vars, maxShares: shares(maxSharesUnderLimit(i)) });
  return new TradeError('position_limit', message);
}

/**
 * Applies one fill to a crew's cash and position. Pure; throws TradeError for a
 * bad quantity, insufficient cash or shares, or a buy over the position limit.
 */
export function computeFill(i: FillInput): FillOutcome {
  const { side, quantity, fillPrice, lastPrice, feeBps, cash, sharesOwned, avgCost, totalValue, maxPositionPct } = i;
  if (!Number.isInteger(quantity) || quantity <= 0) throw tradeError('bad_quantity');
  if (!(Number.isFinite(fillPrice) && fillPrice > 0 && Number.isFinite(lastPrice) && lastPrice > 0)) {
    throw new Error(`computeFill: prices must be positive and finite (fill ${fillPrice}, last ${lastPrice})`);
  }
  const symbol = i.currencySymbol ?? CURRENCY.symbol;
  const ticker = i.ticker ?? NO_TICKER;
  const price = Math.max(1, Math.round(fillPrice));
  const notional = notionalFor(quantity, fillPrice);
  const fee = feeFor(notional, feeBps);

  if (side === 'buy') {
    const cost = notional + fee;
    if (cost > cash) {
      throw new TradeError(
        'insufficient_funds',
        text(COPY.insufficient_funds.title, COPY.insufficient_funds.message, {
          shortfall: formatMoney(cost - cash, symbol),
          cash: formatMoney(cash, symbol),
        }),
      );
    }
    const sharesAfter = sharesOwned + quantity;
    if (limitApplies(maxPositionPct) && !withinLimit(sharesAfter, lastPrice, maxPositionPct, totalValue, fee)) {
      throw positionLimitError(i);
    }
    return {
      price,
      notional,
      fee,
      cashAfter: cash - cost,
      sharesAfter,
      avgCostAfter: Math.round((sharesOwned * avgCost + notional) / sharesAfter),
      realizedPnl: 0,
    };
  }

  if (quantity > sharesOwned) {
    // The "none owned" wording needs a real ticker to read well.
    const message =
      sharesOwned <= 0 && i.ticker
        ? text(COPY.insufficient_shares.title, COPY.insufficient_shares.messageNoneOwned, { ticker })
        : text(COPY.insufficient_shares.title, COPY.insufficient_shares.message, {
            ticker,
            owned: shares(Math.max(0, sharesOwned)),
          });
    throw new TradeError('insufficient_shares', message);
  }
  const sharesAfter = sharesOwned - quantity;
  return {
    price,
    notional,
    fee,
    cashAfter: cash + notional - fee,
    sharesAfter,
    avgCostAfter: sharesAfter > 0 ? avgCost : 0,
    realizedPnl: notional - Math.round(avgCost * quantity) - fee,
  };
}

/**
 * Price protection: rejects with `price_moved` when the last price moved more
 * than MODEL.priceProtection (2%) from the price the client quoted. No quote, no check.
 */
export function checkPriceProtection(
  lastPrice: number,
  quotedPrice: number | undefined,
  ctx: { ticker?: string; symbol?: string } = {},
): void {
  if (quotedPrice === undefined || quotedPrice === null || !(quotedPrice > 0)) return;
  if (Math.abs(lastPrice - quotedPrice) > MODEL.priceProtection * quotedPrice) {
    const symbol = ctx.symbol ?? CURRENCY.symbol;
    throw new TradeError(
      'price_moved',
      text(COPY.price_moved.title, COPY.price_moved.message, {
        ticker: ctx.ticker ?? NO_TICKER,
        quoted: formatMoney(quotedPrice, symbol),
        last: formatMoney(lastPrice, symbol),
      }),
    );
  }
}
// ---------------------------------------------------------------------------
// Execution (IO)
// ---------------------------------------------------------------------------

/** The engine surface trading needs (GameEngine satisfies it). */
export type TradingEngine = Pick<GameEngine, 'state' | 'getCompany' | 'getPrice' | 'reserveFlow'>;

type EngineCompanyInfo = NonNullable<ReturnType<TradingEngine['getCompany']>>;
type CompanyContext = Pick<EngineCompanyInfo, 'ticker' | 'sharesOutstanding'>;

const ENGINE_TRADE_CODES = new Set(['market_closed', 'unknown_company', 'interval_limit', 'bad_quantity']);

/**
 * The engine's interval_limit message already follows COPY §9 and knows how many
 * shares the crew used this interval (message / messageAfterTrades), so it is kept
 * under the COPY title. Without one, the plain cap message is built here.
 */
function intervalLimitError(
  engine: Pick<TradingEngine, 'state'>,
  company: CompanyContext,
  engineMessage: string,
  now: number,
): TradeError {
  if (engineMessage.trim()) {
    return new TradeError('interval_limit', text(COPY.interval_limit.title, engineMessage.trim()));
  }
  const s = engine.state;
  const nextTickAt = s.startAt !== null ? s.startAt + (s.currentTick + 1) * s.tickIntervalMs : now + s.tickIntervalMs;
  const seconds = Math.min(Math.ceil(s.tickIntervalMs / 1000), Math.max(1, Math.ceil((nextTickAt - now) / 1000)));
  const template = seconds === 1 ? COPY.interval_limit.messageOneSecond : COPY.interval_limit.message;
  return new TradeError(
    'interval_limit',
    text(COPY.interval_limit.title, template, {
      cap: shares(intervalShareCap(company.sharesOutstanding)),
      ticker: company.ticker,
      seconds: String(seconds),
    }),
  );
}

/**
 * Maps an error thrown by `engine.reserveFlow` to the TradeError a crew sees. Returns
 * undefined for anything that is not an order-level EngineError (a real failure, HTTP 500).
 * EngineError is recognized by its code, so this module never loads the engine at runtime.
 */
export function tradeErrorFromEngine(
  err: unknown,
  engine: Pick<TradingEngine, 'state'>,
  company: CompanyContext,
  now: number = Date.now(),
): TradeError | undefined {
  if (err instanceof TradeError) return err;
  if (!(err instanceof Error)) return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string' || !ENGINE_TRADE_CODES.has(code)) return undefined;
  if (code === 'market_closed') return marketClosedError(engine.state.phase);
  if (code === 'unknown_company') return tradeError('unknown_company');
  if (code === 'bad_quantity') return tradeError('bad_quantity');
  return intervalLimitError(engine, company, err.message, now);
}

/**
 * Per-crew in-process queue for order writes. SQLite transactions are serial anyway, but the queue
 * keeps a crew's orders in arrival order, lets `settleTeamOrders` wait for them before a removal,
 * and lets a duplicate clientOrderId wait for the first fill and answer with it. Flow is reserved
 * before queueing, so pricing stays synchronous. Every crew-data write of executeOrder runs here.
 */
const teamQueues = new Map<string, Promise<void>>();

async function serialByTeam<T>(teamId: string, fn: () => T | Promise<T>): Promise<T> {
  const prev = teamQueues.get(teamId) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  teamQueues.set(teamId, tail);
  try {
    return await run;
  } finally {
    if (teamQueues.get(teamId) === tail) teamQueues.delete(teamId);
  }
}

/** Resolves once every order write already queued for the crew has finished (used before removing a crew). */
export async function settleTeamOrders(teamId: string): Promise<void> {
  await teamQueues.get(teamId);
}

/**
 * Trading halt for a host rebuild (POST /admin/game/new). The engine keeps its
 * in-memory phase until it reloads, so without a halt orders would keep filling
 * while the market data is being deleted and rewritten. While halted, orders are
 * rejected as market_closed (with no order row), before pricing and again inside
 * the transaction; `haltTrading` resolves once already-queued order writes finish.
 */
let halted = false;

export async function haltTrading(): Promise<void> {
  halted = true;
  await Promise.all([...teamQueues.values()]);
}

export function resumeTrading(): void {
  halted = false;
}

/**
 * How far back a retry looks for its own trade. The Store exposes `trades.forCrew(id, limit)` and
 * no by-id read; a crew cannot place more than a few hundred trades in a 30-minute game, so this
 * covers every retry of a filled order. (Swap to `store.trades.get(id)` if the Store grows one.)
 */
const TRADE_LOOKUP_LIMIT = 1000;

function findTrade(teamId: string, tradeId: string): Trade | null {
  return store.trades.forCrew(teamId, TRADE_LOOKUP_LIMIT).find((t) => t.id === tradeId && t.teamId === teamId) ?? null;
}

/** This crew's trade behind a filled order row, or null. */
function filledTrade(teamId: string, clientOrderId: string): Trade | null {
  const rec = store.orders.byClientId(teamId, clientOrderId);
  if (!rec || rec.status !== 'filled' || !rec.tradeId || rec.teamId !== teamId) return null;
  return findTrade(teamId, rec.tradeId);
}

/** Codes that leave no order row: there is no crew to own it (never recreate data for a removed crew). */
const UNRECORDED: ReadonlySet<TradeErrorCode> = new Set(['no_team']);

/**
 * Best-effort rejection record. Never overwrites a filled order: if a duplicate of this order
 * already filled, returns that trade so the caller can answer idempotently instead of rejecting.
 * Writes nothing for a crew whose account does not exist, whatever the rejection: a removed crew's
 * device can keep sending orders until its token is refused, and each one would otherwise leave an
 * order row behind the removal (shown to a crew re-created under that name).
 */
function recordRejection(
  base: Omit<OrderRecord, 'status' | 'code' | 'reason' | 'tradeId'>,
  err: TradeError,
): Trade | null {
  try {
    return store.tx(() => {
      const rec = store.orders.byClientId(base.teamId, base.clientOrderId);
      if (rec?.status === 'filled' && rec.teamId === base.teamId) {
        return rec.tradeId ? findTrade(base.teamId, rec.tradeId) : null;
      }
      if (halted || UNRECORDED.has(err.code)) return null;
      if (!store.crews.get(base.teamId)) return null;
      const record: OrderRecord = { ...base, status: 'rejected', code: err.code, reason: err.message };
      store.orders.insert(record);
      return null;
    });
  } catch (writeErr) {
    console.error('[trading] failed to record rejected order', base.id, writeErr);
    return null;
  }
}

/**
 * Orders executing right now, by order id (`{teamId}_{clientOrderId}`). The engine is one process, so this is
 * the whole picture: a duplicate that arrives while the first is still in flight (a double tap, a client retry
 * after a timeout) shares its outcome, the same trade or the same rejection, instead of running again. Running
 * again would reserve the flow a second time until the duplicate was found inside the transaction, which prices
 * phantom shares into every other crew's fills meanwhile and can reject the duplicate for the first one's own
 * interval use.
 */
const inFlightOrders = new Map<string, Promise<Trade>>();

export function executeOrder(engine: TradingEngine, teamId: string, order: OrderRequest): Promise<Trade> {
  const key = `${teamId}_${order.clientOrderId}`;
  const running = inFlightOrders.get(key);
  if (running) return running;
  const run = executeOrderOnce(engine, teamId, order);
  inFlightOrders.set(key, run);
  const forget = (): void => {
    if (inFlightOrders.get(key) === run) inFlightOrders.delete(key);
  };
  run.then(forget, forget); // registered first, so a retry right after the outcome starts afresh
  return run;
}

async function executeOrderOnce(engine: TradingEngine, teamId: string, order: OrderRequest): Promise<Trade> {
  const orderId = `${teamId}_${order.clientOrderId}`;

  const prior = filledTrade(teamId, order.clientOrderId);
  if (prior) return prior;

  const base = (): Omit<OrderRecord, 'status' | 'code' | 'reason' | 'tradeId'> => ({
    id: orderId,
    teamId,
    clientOrderId: order.clientOrderId,
    companyId: order.companyId,
    side: order.side,
    quantity: order.quantity,
    createdAt: Date.now(),
    tick: engine.state.currentTick,
  });
  const reject = async (err: TradeError): Promise<Trade> => {
    const record = base();
    const duplicate = await serialByTeam(teamId, () => recordRejection(record, err));
    if (duplicate) return duplicate;
    throw err;
  };

  // --- Validate and reserve flow. Everything from the phase check through reserveFlow is synchronous. ---
  const company = engine.getCompany(order.companyId);
  const symbol = engine.state.currency?.symbol ?? CURRENCY.symbol;
  let reservation: ReturnType<TradingEngine['reserveFlow']>;
  // The moment the order is priced: its trade's time and tick, however long the commit takes. The tick
  // comes from the reservation; the engine's pending-flow rebuild reads it after a restart.
  let pricedAt = 0;
  try {
    if (halted) throw marketClosedError('lobby');
    if (engine.state.phase !== 'live') throw marketClosedError(engine.state.phase);
    if (!company) throw tradeError('unknown_company');
    if (!Number.isInteger(order.quantity) || order.quantity <= 0) throw tradeError('bad_quantity');
    checkPriceProtection(engine.getPrice(order.companyId), order.quotedPrice, { ticker: company.ticker, symbol });
    pricedAt = Date.now();
    try {
      reservation = engine.reserveFlow(teamId, order.companyId, order.side, order.quantity);
    } catch (err) {
      throw tradeErrorFromEngine(err, engine, company, pricedAt) ?? err;
    }
  } catch (err) {
    if (err instanceof TradeError) return reject(err);
    throw err;
  }

  // --- One SQLite transaction. Release the reservation if it fails or turns out to be a duplicate. ---
  const r = reservation;
  let duplicate = false;
  const fillTransaction = (): Trade =>
    store.tx(() => {
      duplicate = false;
      const rec = store.orders.byClientId(teamId, order.clientOrderId);
      if (rec?.status === 'filled' && rec.tradeId && rec.teamId === teamId) {
        const existing = findTrade(teamId, rec.tradeId);
        if (existing) {
          duplicate = true;
          return existing;
        }
      }
      // Re-checked at commit time: the host may have paused, ended or started rebuilding the
      // market while this order waited behind the crew's earlier orders.
      if (halted) throw marketClosedError('lobby');
      if (engine.state.phase !== 'live') throw marketClosedError(engine.state.phase);

      const team = store.crews.get(teamId);
      if (!team) throw tradeError('no_team');
      if (team.tradingDisabled) throw tradeError('trading_disabled');

      const cash = team.cashBalance ?? 0;
      let owned = 0;
      let avgCost = 0;
      let otherValue = 0;
      let otherHoldings = 0;
      for (const h of store.holdings.forCrew(teamId)) {
        if (h.companyId === order.companyId) {
          owned = h.shares ?? 0;
          avgCost = h.avgCost ?? 0;
        } else if ((h.shares ?? 0) > 0) {
          otherHoldings++;
          otherValue += h.shares * engine.getPrice(h.companyId);
        }
      }

      const f = computeFill({
        side: order.side,
        quantity: order.quantity,
        fillPrice: r.fillPrice,
        lastPrice: r.lastPrice,
        feeBps: engine.state.feeBps,
        cash,
        sharesOwned: owned,
        avgCost,
        totalValue: cash + otherValue + owned * r.lastPrice,
        maxPositionPct: engine.state.maxPositionPct,
        ticker: company.ticker,
        currencySymbol: symbol,
      });

      const t: Trade = {
        id: randomUUID(),
        teamId,
        companyId: order.companyId,
        side: order.side,
        quantity: order.quantity,
        price: f.price,
        lastPrice: r.lastPrice,
        impactBps: r.impactBps,
        fee: f.fee,
        realizedPnl: f.realizedPnl,
        executedAt: pricedAt,
        tick: r.tick,
        cashAfter: f.cashAfter,
        sharesAfter: f.sharesAfter,
        clientOrderId: order.clientOrderId,
      };
      const filled: OrderRecord = {
        id: orderId,
        teamId,
        clientOrderId: order.clientOrderId,
        companyId: order.companyId,
        side: order.side,
        quantity: order.quantity,
        status: 'filled',
        tradeId: t.id,
        createdAt: pricedAt,
        tick: r.tick,
      };

      store.crews.update(teamId, {
        cashBalance: f.cashAfter,
        realizedPnl: (team.realizedPnl ?? 0) + f.realizedPnl,
        feesPaid: (team.feesPaid ?? 0) + f.fee,
        tradeCount: (team.tradeCount ?? 0) + 1,
        holdingsCount: otherHoldings + (f.sharesAfter > 0 ? 1 : 0),
      });
      if (f.sharesAfter > 0) {
        const holding: Holding = { companyId: order.companyId, shares: f.sharesAfter, avgCost: f.avgCostAfter };
        store.holdings.upsert(teamId, holding);
      } else {
        store.holdings.remove(teamId, order.companyId);
      }
      store.trades.insert(t);
      store.orders.insert(filled);
      return t;
    });

  let trade: Trade;
  try {
    trade = await serialByTeam(teamId, fillTransaction);
  } catch (err) {
    r.release();
    if (err instanceof TradeError) return reject(err);
    throw err;
  }

  if (duplicate) {
    r.release();
    return trade;
  }

  // The crew's own screens update the moment the money moves; everyone else sees it at the tick.
  publishPortfolio(teamId);

  await auditLog('order.fill', teamId, {
    tradeId: trade.id,
    clientOrderId: trade.clientOrderId,
    companyId: trade.companyId,
    side: trade.side,
    quantity: trade.quantity,
    price: trade.price,
    lastPrice: trade.lastPrice,
    impactBps: trade.impactBps,
    fee: trade.fee,
    realizedPnl: trade.realizedPnl,
  });
  return trade;
}
