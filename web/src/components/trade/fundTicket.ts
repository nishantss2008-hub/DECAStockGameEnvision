/**
 * What the trade ticket needs to price a FUND order (spec 2026-09-16 §2).
 *
 * THE PROBLEM. `estimateOrder` — the same maths the server prices with — takes `beta` and
 * `sharesOutstanding` and derives everything else from them: the impact coefficient
 * λ = impactY·sigD/ADV with ADV = sharesOutstanding/advDivisor, and the per-interval cap
 * floor(intervalAdvCap·ADV). A fund has neither field, because a fund is not a security: the
 * server prices a fund order by splitting it into its constituents, impacting each of them
 * pro-rata, and recomputing the basket.
 *
 * THE ANSWER. One fund share always contains exactly `wᵢ / divisor` shares of company i, so the
 * constituent split is public arithmetic the client can do with public data. We do it once here and
 * express the result as the EQUIVALENT (beta, sharesOutstanding) pair — the one that makes
 * `estimateOrder` reproduce the server's two binding numbers:
 *
 *   1. the interval cap, in fund shares — the tightest constituent's remaining 1-ADV cap divided by
 *      the shares of it one fund share carries. This is the number that decides "how many can I
 *      buy", so getting it right is what keeps the preview honest;
 *   2. λ per fund share — the value-weighted sum of each constituent's λᵢ scaled by the shares of it
 *      one fund share carries, which is exactly the server's `priceFundLegs` impact term.
 *
 * WHICH OF THE TWO WINS WHEN THEY CONFLICT, and why. The pair cannot always express both, because
 * `impactLambda` puts a FLOOR under sigD: sigD ≥ impactVolRef/sqrt(252) at beta 0, so λ can be
 * raised by beta but never lowered below that floor. A basket's λ per fund share is small enough to
 * sit under it. We therefore pin the INTERVAL CAP exactly and let λ land on the floor, which
 * overstates the impact slightly. That is the safe direction on both counts: the cap is the number
 * that decides "how many can I buy", so an optimistic one would hand the crew a Max button the
 * server rejects; and the λ error is worth a small fraction of a basis point on a realistic order,
 * which is invisible next to the fee. `fundTicket.test.ts` pins both of those claims.
 *
 * This is an ESTIMATE, as the company path is: the server is authoritative and rejects an order the
 * preview thought was fine. What it must not do is be wrong in a way a student would notice — a
 * "Max" button that always fails, or a preview total off by a visible amount.
 *
 * A caveat worth stating: the cap is measured against a FRESH interval. The server also subtracts
 * whatever the crew already traded in each constituent this interval, however it traded it, and the
 * client does not track that. So the preview can be optimistic right after a direct trade in a
 * company the fund holds; the server then returns `interval_limit`, which the ticket already
 * handles and whose COPY §13 `trading.intervalLimit` line explains why.
 */

import { MODEL, fundConstituentShares, impactLambda, intervalShareCap, type Company, type Fund } from '@deca/shared';

export interface FundTicketInputs {
  /** The beta that makes `impactLambda` reproduce the basket's λ per fund share. */
  beta: number;
  /** The share count that makes `intervalShareCap` reproduce the basket's cap in fund shares. */
  sharesOutstanding: number;
}

/** sigD(beta) = sqrt(beta²·mktVol² + impactVolRef²)/sqrt(tradingDaysPerGame) — `impactLambda`'s inner term. */
function betaForSigD(sigD: number): number {
  const annual = sigD * Math.sqrt(MODEL.tradingDaysPerGame);
  const variance = annual * annual - MODEL.impactVolRef * MODEL.impactVolRef;
  return variance > 0 ? Math.sqrt(variance) / MODEL.mktVol : 0;
}

/**
 * The equivalent inputs for one fund, from its public basket and the live company rows.
 * Returns zeros when a constituent is missing, which reads downstream as "no ADV": the estimate is
 * then invalid and the ticket shows its existing "we could not price this" path rather than a
 * confident wrong number.
 */
export function fundTicketInputs(fund: Fund, byId: Record<string, Company>): FundTicketInputs {
  const perShare = fundConstituentShares(fund, 1);
  if (perShare.length === 0) return { beta: 0, sharesOutstanding: 0 };

  let cap = Infinity;
  let weightedValue = 0;
  const legs: { lambda: number; shares: number; value: number }[] = [];
  for (const leg of perShare) {
    const c = byId[leg.companyId];
    if (!c || !(leg.shares > 0)) return { beta: 0, sharesOutstanding: 0 };
    cap = Math.min(cap, intervalShareCap(c.sharesOutstanding) / leg.shares);
    // Value weight: wᵢ·pᵢ / Σ wⱼ·pⱼ, which is `leg.shares · pᵢ` up to the common divisor.
    const value = leg.shares * c.currentPrice;
    weightedValue += value;
    legs.push({ lambda: impactLambda(c.beta, c.sharesOutstanding), shares: leg.shares, value });
  }
  const capShares = Number.isFinite(cap) ? Math.floor(cap) : 0;
  if (capShares <= 0 || !(weightedValue > 0)) return { beta: 0, sharesOutstanding: 0 };

  const lambda = legs.reduce((sum, leg) => sum + (leg.value / weightedValue) * leg.lambda * leg.shares, 0);
  // Invert ADV = sharesOutstanding/advDivisor and λ = impactY·sigD/ADV.
  const sharesOutstanding = capShares * MODEL.advDivisor;
  const adv = sharesOutstanding / MODEL.advDivisor;
  const beta = lambda > 0 ? betaForSigD((lambda * adv) / MODEL.impactY) : 0;
  return { beta, sharesOutstanding };
}
