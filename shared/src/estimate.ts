/**
 * Order estimate math shared by the trade ticket and the authority service
 * (spec §6). All money is integer cents.
 *
 * Fills execute at lastPrice·exp(±I/2) (half-impact slippage against the
 * trader), where I is the square-root-law impact, plus a basis-point fee.
 */

import { MODEL } from './constants.js';
import type { OrderSide } from './types.js';

/** Fee in cents: round(notional·bps/10000). */
export function feeFor(notionalCents: number, feeBps: number): number {
  return Math.round((notionalCents * feeBps) / 10_000);
}

/**
 * Square-root-law impact of trading `shares`:
 *   sigDay = sqrt(beta²·mktVol² + impactVolRef²)/sqrt(252)
 *   adv    = sharesOutstanding/advDivisor
 *   I      = min(maxImpact, impactY·sigDay·sqrt(shares/adv))
 * Uses only public inputs, so estimates never leak hidden quality.
 */
export function marketImpact(shares: number, beta: number, sharesOutstanding: number): number {
  const size = Math.abs(shares);
  if (!(size > 0)) return 0;
  const adv = sharesOutstanding / MODEL.advDivisor;
  if (!(adv > 0)) return MODEL.maxImpact;
  const sigDay =
    Math.sqrt(beta * beta * MODEL.mktVol * MODEL.mktVol + MODEL.impactVolRef * MODEL.impactVolRef) /
    Math.sqrt(MODEL.tradingDaysPerGame);
  return Math.min(MODEL.maxImpact, MODEL.impactY * sigDay * Math.sqrt(size / adv));
}

/** Fill price in cents: max(1, round(last·exp(±impact/2))), + for buys, − for sells. */
export function fillPrice(side: OrderSide, lastPrice: number, impact: number): number {
  const sign = side === 'buy' ? 1 : -1;
  return Math.max(1, Math.round(lastPrice * Math.exp((sign * impact) / 2)));
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
}

export type EstimateError = 'bad_quantity' | 'insufficient_funds' | 'insufficient_shares';

export interface OrderEstimate {
  impact: number;
  impactBps: number;
  price: number;
  notional: number;
  fee: number;
  total: number;
  cashAfter: number;
  sharesAfter: number;
  avgCostAfter: number;
  positionValueAfter: number;
  pctOfAccountAfter: number;
  maxBuyShares: number;
  valid: boolean;
  error?: EstimateError;
  shortfall?: number;
}

/** Total cash a buy of `q` shares costs (notional at the slipped fill price + fee). */
function buyCost(q: number, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number {
  const price = fillPrice('buy', lastPrice, marketImpact(q, beta, sharesOutstanding));
  const notional = q * price;
  return notional + feeFor(notional, feeBps);
}

/**
 * Largest whole share count whose buy cost (slipped notional + fee) fits in
 * `cash`. Binary search on q in [0, floor(cash/minFill)+1]; cost is
 * non-decreasing in q and the upper bound is always unaffordable.
 */
export function maxAffordableShares(
  cash: number,
  lastPrice: number,
  beta: number,
  sharesOutstanding: number,
  feeBps: number,
): number {
  if (!(cash > 0) || !(lastPrice > 0)) return 0;
  // A buy never fills below max(1, round(lastPrice)) (impact ≥ 0 and rounding is
  // monotone), so this bound is unaffordable even when lastPrice is fractional.
  const minFill = Math.max(1, Math.round(lastPrice));
  let lo = 0; // affordable
  let hi = Math.floor(cash / minFill) + 1; // unaffordable
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (buyCost(mid, lastPrice, beta, sharesOutstanding, feeBps) <= cash) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Whole shares a cash amount buys, all-in (slippage and fee included). */
export function sharesForAmount(
  amountCents: number,
  lastPrice: number,
  beta: number,
  sharesOutstanding: number,
  feeBps: number,
): number {
  return maxAffordableShares(amountCents, lastPrice, beta, sharesOutstanding, feeBps);
}

export function estimateOrder(i: EstimateInput): OrderEstimate {
  const { side, quantity, lastPrice, beta, sharesOutstanding, feeBps, cash, sharesOwned, avgCost, totalValue } = i;
  const maxBuyShares = maxAffordableShares(cash, lastPrice, beta, sharesOutstanding, feeBps);
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

  const impact = marketImpact(quantity, beta, sharesOutstanding);
  const impactBps = Math.round(impact * 10_000);
  const price = fillPrice(side, lastPrice, impact);
  const notional = quantity * price;
  const fee = feeFor(notional, feeBps);

  if (side === 'buy') {
    const total = notional + fee;
    const sharesAfter = sharesOwned + quantity;
    const valid = total <= cash;
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
      valid,
      ...(valid ? {} : { error: 'insufficient_funds' as const, shortfall: total - cash }),
    };
  }

  const total = notional - fee;
  const sharesAfter = sharesOwned - quantity;
  const valid = quantity <= sharesOwned;
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
    valid,
    ...(valid ? {} : { error: 'insufficient_shares' as const }),
  };
}
