/**
 * Order estimate math shared by the trade ticket and the authority service
 * (spec §6, v2.1). All money is integer cents.
 *
 * Impact is linear and transient: λ = impactY·sigD/ADV per share, in log
 * units. An order of q shares fills at the UNROUNDED price
 *   last·exp(λ·(pendingNet + s·q/2)),  s = +1 buy / −1 sell,
 * i.e. all flow already traded this interval plus half the order's own impact.
 * Notional is round(q·unroundedPrice), plus a basis-point fee. A crew may
 * trade at most intervalShareCap shares of a company per tick interval, and a
 * host position limit caps how much of the account one company may hold.
 */

import { MODEL } from './constants.js';
import type { OrderSide } from './types.js';

/** Fee in cents: round(notional·bps/10000). */
export function feeFor(notionalCents: number, feeBps: number): number {
  return Math.round((notionalCents * feeBps) / 10_000);
}

/**
 * Linear impact per share, in log units: λ = impactY·sigD/ADV, with
 *   sigD = sqrt(beta²·mktVol² + impactVolRef²)/sqrt(252)
 *   ADV  = sharesOutstanding/advDivisor
 * Uses only public inputs, so estimates never leak hidden quality. Without a
 * positive ADV, λ is 0; intervalShareCap is then 0 too, so no order passes.
 */
export function impactLambda(beta: number, sharesOutstanding: number): number {
  const adv = sharesOutstanding / MODEL.advDivisor;
  if (!(adv > 0)) return 0;
  const sigD =
    Math.sqrt(beta * beta * MODEL.mktVol * MODEL.mktVol + MODEL.impactVolRef * MODEL.impactVolRef) /
    Math.sqrt(MODEL.tradingDaysPerGame);
  return (MODEL.impactY * sigD) / adv;
}

/** Most shares one crew may trade in one company per tick interval: floor(intervalAdvCap·ADV). */
export function intervalShareCap(sharesOutstanding: number): number {
  const cap = Math.floor((MODEL.intervalAdvCap * sharesOutstanding) / MODEL.advDivisor);
  return cap > 0 ? cap : 0;
}

/**
 * Estimated fill in UNROUNDED cents per share: last·exp(λ·(pendingNet + s·q/2)).
 * `pendingNet` is the signed share flow already traded this interval (buys +).
 */
export function estFillPrice(
  side: OrderSide,
  lastPrice: number,
  lambda: number,
  quantity: number,
  pendingNet = 0,
): number {
  // Path-exact average price: the order walks the impact from pendingNet to pendingNet + σ, so its
  // average fill is last·(e^{λ(p+σ)} − e^{λp})/(λσ). Splitting an order then costs exactly the same
  // as one order, and a round trip inside one interval breaks even before fees.
  const sigma = (side === 'buy' ? 1 : -1) * quantity;
  const x = lambda * sigma;
  const base = lastPrice * Math.exp(lambda * pendingNet);
  return Math.abs(x) < 1e-12 ? base : (base * Math.expm1(x)) / x;
}

/** Notional in integer cents: round(|q|·unroundedPrice). Never q·round(price). */
export function notionalFor(quantity: number, unroundedPrice: number): number {
  return Math.round(Math.abs(quantity) * unroundedPrice);
}

export interface EstimateInput {
  side: OrderSide;
  quantity: number;
  lastPrice: number;
  beta: number;
  sharesOutstanding: number;
  feeBps: number;
  cash: number;
  sharesOwned: number;
  avgCost: number;
  totalValue: number;
  /** Host position limit as a fraction of account value; default 1 (no limit). */
  maxPositionPct?: number;
}

export type EstimateError =
  | 'bad_quantity'
  | 'insufficient_funds'
  | 'insufficient_shares'
  | 'position_limit'
  | 'interval_limit';

export interface OrderEstimate {
  /** Half the order's own impact, λ·q/2, in log units (the slippage it pays). */
  impact: number;
  impactBps: number;
  /** round(fill), for display only. */
  price: number;
  notional: number;
  fee: number;
  total: number;
  cashAfter: number;
  sharesAfter: number;
  avgCostAfter: number;
  positionValueAfter: number;
  pctOfAccountAfter: number;
  /** Largest buy that passes the cash, position-limit and interval checks. */
  maxBuyShares: number;
  valid: boolean;
  error?: EstimateError;
  /** total − cash, present whenever a buy costs more than the cash on hand. */
  shortfall?: number;
}

/** Notional and fee of buying q shares with no pending flow. */
function buyQuote(q: number, lastPrice: number, lambda: number, feeBps: number): { notional: number; fee: number } {
  const notional = notionalFor(q, estFillPrice('buy', lastPrice, lambda, q));
  return { notional, fee: feeFor(notional, feeBps) };
}

/** The limit applies only below 1. A missing, null or NaN limit means no limit. */
function limitOn(pct: number | undefined): pct is number {
  return typeof pct === 'number' && pct < 1;
}

/** Position limit check, valued at lastPrice: sharesAfter·last ≤ pct·(totalValue − fee). */
function withinLimit(sharesAfter: number, lastPrice: number, pct: number, totalValue: number, fee: number): boolean {
  return sharesAfter * lastPrice <= pct * (totalValue - fee);
}

/**
 * Largest integer q ≥ 0 with ok(q), for ok true up to some q and false after
 * (0 when ok(1) fails). `hint` is a first guess at a failing q; the bound
 * doubles until ok fails, then a binary search narrows it.
 */
function largestWhere(ok: (q: number) => boolean, hint: number): number {
  const MAX = Number.MAX_SAFE_INTEGER;
  let lo = 0;
  let hi = Number.isFinite(hint) ? Math.min(MAX, Math.max(1, Math.ceil(hint))) : 1;
  while (ok(hi)) {
    lo = hi;
    if (hi >= MAX) return hi;
    hi = Math.min(MAX, hi * 2);
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Largest whole share count whose buy cost (notional at the impacted fill +
 * fee) fits in `cash`. Cost is non-decreasing in q, so a binary search applies.
 */
export function maxAffordableShares(
  cash: number,
  lastPrice: number,
  beta: number,
  sharesOutstanding: number,
  feeBps: number,
): number {
  // cash 0 is not an early exit: below half a cent a share can round to a zero cost.
  if (!(cash >= 0) || !(lastPrice > 0)) return 0;
  const lambda = impactLambda(beta, sharesOutstanding);
  const affordable = (q: number): boolean => {
    const { notional, fee } = buyQuote(q, lastPrice, lambda, feeBps);
    return notional + fee <= cash;
  };
  // A buy never fills below lastPrice, so q·lastPrice ≥ cash + 1 is unaffordable.
  return largestWhere(affordable, Math.floor((cash + 1) / lastPrice) + 1);
}

/** Whole shares a cash amount buys, all-in (impact and fee included). */
export function sharesForAmount(
  amountCents: number,
  lastPrice: number,
  beta: number,
  sharesOutstanding: number,
  feeBps: number,
): number {
  return maxAffordableShares(amountCents, lastPrice, beta, sharesOutstanding, feeBps);
}

/**
 * Most additional shares `i` can buy without the position passing the host
 * limit (net of the order's fee). Infinity when there is no limit; 0 when the
 * position is already at or over it.
 */
export function maxSharesUnderLimit(i: EstimateInput): number {
  const pct = i.maxPositionPct;
  if (!limitOn(pct)) return Infinity;
  if (!(i.lastPrice > 0)) return 0;
  const lambda = impactLambda(i.beta, i.sharesOutstanding);
  const fits = (q: number): boolean =>
    withinLimit(i.sharesOwned + q, i.lastPrice, pct, i.totalValue, buyQuote(q, i.lastPrice, lambda, i.feeBps).fee);
  return largestWhere(fits, (pct * i.totalValue) / i.lastPrice - i.sharesOwned + 1);
}

export function estimateOrder(i: EstimateInput): OrderEstimate {
  const { side, quantity, lastPrice, beta, sharesOutstanding, feeBps, cash, sharesOwned, avgCost, totalValue } = i;
  const pct = i.maxPositionPct;
  const lambda = impactLambda(beta, sharesOutstanding);
  const cap = intervalShareCap(sharesOutstanding);
  const maxBuyShares = Math.min(
    maxAffordableShares(cash, lastPrice, beta, sharesOutstanding, feeBps),
    maxSharesUnderLimit(i),
    cap,
  );
  const pctOf = (sharesAfter: number, fee: number): number => {
    const denom = totalValue - fee;
    return denom > 0 ? (sharesAfter * lastPrice) / denom : 0;
  };

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      impact: 0,
      impactBps: 0,
      price: lastPrice,
      notional: 0,
      fee: 0,
      total: 0,
      cashAfter: cash,
      sharesAfter: sharesOwned,
      avgCostAfter: avgCost,
      positionValueAfter: sharesOwned * lastPrice,
      pctOfAccountAfter: pctOf(sharesOwned, 0),
      maxBuyShares,
      valid: false,
      error: 'bad_quantity',
    };
  }

  const fill = estFillPrice(side, lastPrice, lambda, quantity);
  const impact = (lambda * quantity) / 2;
  const impactBps = Math.round(impact * 10_000);
  const price = Math.max(1, Math.round(fill));
  const notional = notionalFor(quantity, fill);
  const fee = feeFor(notional, feeBps);
  const overInterval = quantity > cap;

  if (side === 'buy') {
    const total = notional + fee;
    const sharesAfter = sharesOwned + quantity;
    const short = total > cash;
    const error: EstimateError | undefined = overInterval
      ? 'interval_limit'
      : short
        ? 'insufficient_funds'
        : limitOn(pct) && !withinLimit(sharesAfter, lastPrice, pct, totalValue, fee)
          ? 'position_limit'
          : undefined;
    return {
      impact,
      impactBps,
      price,
      notional,
      fee,
      total,
      cashAfter: cash - total,
      sharesAfter,
      avgCostAfter: Math.round((sharesOwned * avgCost + notional) / sharesAfter),
      positionValueAfter: sharesAfter * lastPrice,
      pctOfAccountAfter: pctOf(sharesAfter, fee),
      maxBuyShares,
      valid: error === undefined,
      ...(error ? { error } : {}),
      ...(short ? { shortfall: total - cash } : {}),
    };
  }

  const total = notional - fee;
  const sharesAfter = sharesOwned - quantity;
  const error: EstimateError | undefined = overInterval
    ? 'interval_limit'
    : quantity > sharesOwned
      ? 'insufficient_shares'
      : undefined;
  return {
    impact,
    impactBps,
    price,
    notional,
    fee,
    total,
    cashAfter: cash + total,
    sharesAfter,
    avgCostAfter: sharesAfter > 0 ? avgCost : 0,
    positionValueAfter: sharesAfter * lastPrice,
    pctOfAccountAfter: pctOf(sharesAfter, fee),
    maxBuyShares,
    valid: error === undefined,
    ...(error ? { error } : {}),
  };
}
