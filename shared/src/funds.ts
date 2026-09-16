/**
 * Fund math, shared by the authority service and the web client (spec 2026-09-16 §2).
 *
 * A fund is a BASKET, not a security:
 *
 *     price_fund(t) = (Σ wᵢ · priceᵢ(t)) / divisor
 *
 * `wᵢ` are fixed at seed time and sum to 1; `divisor` is chosen at seed so the fund opens
 * at FUND_OPEN_PRICE. Nothing else enters the quote — no idiosyncratic shock, no GARCH
 * state, no hidden q, no news. One fund share therefore always contains exactly
 * `wᵢ / divisor` shares of company i, which is what makes every property below true:
 *
 *   - buying N fund shares is buying N·wᵢ/divisor shares of each constituent, so it costs
 *     the same as buying the constituents in the same proportions (no arbitrage);
 *   - the demand a fund order creates is real demand on each constituent, so the linear
 *     transient impact applies to each of them pro-rata and the fund quote is then simply
 *     recomputed from the moved constituent prices (no separate impact term on the fund);
 *   - the fund's volatility is the volatility of the basket, which is below the average
 *     volatility of its holdings whenever they are less than perfectly correlated.
 */

import { FUND_OPEN_PRICE } from './constants.js';
import type { Company, Fund, FundHolding } from './types.js';

/** The part of a fund the math needs: its basket and its divisor. */
export type Basket = Pick<Fund, 'holdings' | 'divisor'>;

/** Unrounded fund quote in cents: (Σ wᵢ·pᵢ)/divisor. A missing price counts as 0. */
export function fundQuote(fund: Basket, priceOf: (companyId: string) => number): number {
  if (!(fund.divisor > 0)) return 0;
  let sum = 0;
  for (const h of fund.holdings) sum += h.weight * (priceOf(h.companyId) || 0);
  return sum / fund.divisor;
}

/** The fund quote as an integer-cent price, the way a company price is stored. */
export function fundPrice(fund: Basket, priceOf: (companyId: string) => number): number {
  return Math.max(1, Math.round(fundQuote(fund, priceOf)));
}

/**
 * The divisor that makes a basket open at FUND_OPEN_PRICE: (Σ wᵢ·pᵢ(0))/FUND_OPEN_PRICE.
 * Returns 0 for a basket with no value, which `fundQuote` then reads as a zero quote.
 */
export function fundDivisorFor(holdings: FundHolding[], startPriceOf: (companyId: string) => number): number {
  let sum = 0;
  for (const h of holdings) sum += h.weight * (startPriceOf(h.companyId) || 0);
  return sum > 0 ? sum / FUND_OPEN_PRICE : 0;
}

/** Shares of each constituent behind `fundShares` fund shares: fundShares·wᵢ/divisor. Fractional. */
export function fundConstituentShares(fund: Basket, fundShares: number): { companyId: string; shares: number }[] {
  if (!(fund.divisor > 0)) return [];
  return fund.holdings.map((h) => ({ companyId: h.companyId, shares: (fundShares * h.weight) / fund.divisor }));
}

/**
 * The share of the fund's VALUE each constituent carries at `priceOf`, summing to 1.
 * This is what a student sees ("KRKN is 34% of this fund") and what a fund order is split
 * by: wᵢ·pᵢ / Σ wⱼ·pⱼ is exactly `notional × the constituent's weight`.
 */
export function fundValueWeights(fund: Basket, priceOf: (companyId: string) => number): { companyId: string; weight: number }[] {
  const values = fund.holdings.map((h) => ({ companyId: h.companyId, value: h.weight * (priceOf(h.companyId) || 0) }));
  const total = values.reduce((a, v) => a + v.value, 0);
  if (!(total > 0)) return values.map((v) => ({ companyId: v.companyId, weight: 0 }));
  return values.map((v) => ({ companyId: v.companyId, weight: v.value / total }));
}

/**
 * A fund's ADV, in FUND shares: the value-weighted sum of its constituents' ADV, each
 * converted to the fund shares that carry it (company i's ADV is `advᵢ ÷ (wᵢ/divisor)`
 * fund shares). For a basket whose members are all equally liquid per fund share this is
 * exactly that common figure.
 */
export function fundAdv(fund: Basket, advOf: (companyId: string) => number, priceOf: (companyId: string) => number): number {
  const perUnit = new Map(fundConstituentShares(fund, 1).map((c) => [c.companyId, c.shares]));
  let adv = 0;
  for (const v of fundValueWeights(fund, priceOf)) {
    const shares = perUnit.get(v.companyId) ?? 0;
    if (shares > 0) adv += v.weight * ((advOf(v.companyId) || 0) / shares);
  }
  return Math.round(adv);
}

/**
 * THE POSITION-LIMIT EXEMPTION, in one place.
 *
 * The host's per-instrument limit ("no more than 25% of your account in one thing") is a
 * lesson about concentration. Applying it to the broad fund would teach the opposite —
 * "you may not put more than 25% in the entire market" is not a risk rule, it is a bug —
 * so the broad fund is exempt (effectively 100%) and everything else, sector funds
 * included, is limited normally.
 */
export function positionLimitFor(
  instrument: Pick<Fund, 'positionLimitExempt'> | Company | null | undefined,
  hostLimit: number,
): number {
  return (instrument as Partial<Fund> | null | undefined)?.positionLimitExempt ? 1 : hostLimit;
}
