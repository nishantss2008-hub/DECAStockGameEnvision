/**
 * The three tradeable funds (spec 2026-09-16 §1, §2). Names and descriptions are
 * docs/design/COPY.md §13 verbatim (`test/copySync.test.ts` checks that).
 *
 * A fund is a basket of the roster, not a company: it has no fundamentals, no news and
 * no hidden quality of its own. Everything below that is not a name comes from what it
 * holds, computed once at seed time from the generated market:
 *
 *   - `weight` wᵢ: fixed basket coefficients summing to 1. EVERY fund is equal weight
 *     (wᵢ ∝ 1/startPriceᵢ), so each holding carries the same share of the fund's value at the
 *     opening bell — a fifteenth in the broad fund, a third in a sector fund. See `holdingsFor`
 *     for why the broad fund is not cap-weighted; that choice is deliberate.
 *   - `divisor`: chosen so `Σ wᵢ·pᵢ(0) / divisor` is exactly FUND_OPEN_PRICE (Ð100.00).
 *   - `adv`: the value-weighted sum of the constituents' ADV, in fund shares.
 *   - the server-only `FundSecret`: the value-weighted average of the constituents'
 *     q / qEff / measured quality, so the broad fund reads as "did not pick".
 */

import {
  FUND_OPEN_PRICE,
  fundAdv,
  fundDivisorFor,
  fundValueWeights,
  type Fund,
  type FundHolding,
  type FundStyle,
  type Sector,
} from '@deca/shared';
import type { FundSecret } from '../store/types';

/** The one fund that holds the whole market. Its id is referenced by the limit exemption. */
export const BROAD_FUND_ID = 'grand-fleet';

export interface FundDefinition {
  id: string;
  name: string;
  ticker: string;
  style: FundStyle;
  /** The sector a sector fund holds; absent on the broad fund. */
  sector?: Sector;
  description: string;
  /**
   * The broad fund alone is exempt from the host's per-instrument position limit — see
   * `positionLimitFor` in `shared/src/funds.ts`, which is the only place the rule is applied.
   */
  positionLimitExempt: boolean;
}

export const FUND_DEFS: readonly FundDefinition[] = [
  {
    id: BROAD_FUND_ID,
    name: 'Grand Fleet Fund',
    ticker: 'FLEET',
    style: 'broad',
    description: 'The same amount of all 15 companies.',
    positionLimitExempt: true,
  },
  {
    id: 'shipping-lanes',
    name: 'Shipping Lanes Fund',
    ticker: 'SHIPS',
    style: 'sector',
    sector: 'Shipping & Salvage',
    description: 'An equal slice of the three Shipping & Salvage companies.',
    positionLimitExempt: false,
  },
  {
    id: 'powder-and-shot',
    name: 'Powder and Shot Fund',
    ticker: 'ARMS',
    style: 'sector',
    sector: 'Naval Arms',
    description: 'An equal slice of the three Naval Arms companies.',
    positionLimitExempt: false,
  },
];

/** Everything a fund needs to know about one company at seed time. */
export interface FundConstituent {
  id: string;
  ticker: string;
  sector: Sector;
  startPriceCents: number;
  sharesOutstanding: number;
  adv: number;
  q: number;
  qEff: number;
  quality: number;
}

export interface BuiltFund {
  fund: Fund;
  secret: FundSecret;
}

/** wᵢ ∝ `raw`, normalized to sum to 1 (equal weights when every raw value is 0). */
function normalized(members: FundConstituent[], raw: (c: FundConstituent) => number): FundHolding[] {
  const values = members.map(raw).map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = values.reduce((a, v) => a + v, 0);
  return members.map((c, i) => ({
    companyId: c.id,
    ticker: c.ticker,
    weight: total > 0 ? values[i]! / total : 1 / members.length,
  }));
}

/**
 * EVERY fund is EQUAL WEIGHT, the broad one included.
 *
 * DELIBERATE, DO NOT "CORRECT" THIS TO MARKET-CAP WEIGHTING. Real broad index funds are
 * cap-weighted, and we are knowingly giving that realism up, for two reasons measured on this
 * generator (2026-09-16):
 *   1. Cap weighting is not neutral here. The generator makes quality and size correlate
 *      (corr(q, ln marketCap) = +0.31: a better company earns a higher margin AND a higher
 *      multiple, so it is bigger), so a cap-weighted broad fund's averaged q came out at +0.14
 *      and it graded B in 37% of seeds. In a game whose premise is that reading the statements
 *      is what pays, "buy everything and read nothing" must score NEUTRAL, not as a soft B.
 *      The roster's q is rank-stratified, so the EQUAL-weighted mean is exactly 0 every seed.
 *   2. Cap weighting concentrates. A seed that handed one company a very large cap made the
 *      broad fund nearly a one-stock fund, and it then beat both sector funds in only 85% of
 *      seeds — weakening the one thing the feature exists to show.
 * It is also the version a 15-year-old can hold in their head: "the same amount of all fifteen".
 *
 * wᵢ ∝ 1/pᵢ(0), so the VALUE weight of company i is (1/pᵢ)·pᵢ / Σ (1/pⱼ)·pⱼ = 1/n at the open.
 */
function holdingsFor(def: FundDefinition, companies: FundConstituent[]): FundHolding[] {
  const members = def.style === 'broad' ? companies : companies.filter((c) => c.sector === def.sector);
  return normalized(members, (c) => 1 / c.startPriceCents);
}

/**
 * The funds for one generated market. Pure and deterministic: the same companies always
 * give the same weights, divisors and ADVs, so the whole market stays a function of the seed.
 */
export function buildFunds(companies: FundConstituent[]): BuiltFund[] {
  const byId = new Map(companies.map((c) => [c.id, c]));
  const startPriceOf = (id: string) => byId.get(id)?.startPriceCents ?? 0;
  const advOf = (id: string) => byId.get(id)?.adv ?? 0;

  return FUND_DEFS.map((def) => {
    const holdings = holdingsFor(def, companies);
    const divisor = fundDivisorFor(holdings, startPriceOf);
    const basket = { holdings, divisor };
    const value = fundValueWeights(basket, startPriceOf);
    const weighted = (pick: (c: FundConstituent) => number): number =>
      value.reduce((a, v) => a + v.weight * (pick(byId.get(v.companyId)!) ?? 0), 0);

    const fund: Fund = {
      kind: 'fund',
      id: def.id,
      name: def.name,
      ticker: def.ticker,
      style: def.style,
      ...(def.sector ? { sector: def.sector } : {}),
      description: def.description,
      holdings,
      divisor,
      positionLimitExempt: def.positionLimitExempt,
      currentPrice: FUND_OPEN_PRICE,
      startPrice: FUND_OPEN_PRICE,
      sessionOpen: FUND_OPEN_PRICE,
      sessionHigh: FUND_OPEN_PRICE,
      sessionLow: FUND_OPEN_PRICE,
      sessionVolume: 0,
      voyageHigh: FUND_OPEN_PRICE,
      voyageLow: FUND_OPEN_PRICE,
      sessionChange: 0,
      voyageChange: 0,
      adv: fundAdv(basket, advOf, startPriceOf),
      lastTick: 0,
    };

    const secret: FundSecret = {
      fundId: def.id,
      ticker: def.ticker,
      name: def.name,
      q: weighted((c) => c.q),
      qEff: weighted((c) => c.qEff),
      quality: weighted((c) => c.quality),
    };

    return { fund, secret };
  });
}
