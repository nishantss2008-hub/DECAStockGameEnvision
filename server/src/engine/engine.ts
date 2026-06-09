/**
 * The per-tick price update — the heart of "mirror the real market".
 *
 *   P(t) = P(t-1)
 *        + κ·(V_cents − P(t-1))   mean-reversion toward hidden intrinsic value
 *        + P·σ·ε                  per-company stochastic volatility
 *        + P·flowImpact           decaying order-flow price impact
 *        + P·newsJump             scheduled / host-triggered shocks
 *
 * The "continuous" part (mean-reversion + noise + flow) is clamped to a max
 * per-tick move so prices can't explode; news jumps are applied AFTER the clamp
 * so genuine shocks can gap the price the way real news does.
 */

import { ENGINE_PARAMS } from '@deca/shared';
import type { Prng } from '../lib/prng';
import { clampPositive } from '../lib/money';

export interface StepInput {
  /** Previous price, integer cents. */
  prevCents: number;
  /** Intrinsic target this tick, integer cents (= startPrice * V(t)). */
  intrinsicCents: number;
  /** Effective per-tick volatility fraction for this company. */
  sigma: number;
  /** Decaying order-flow impact fraction (signed). */
  flowImpact: number;
  /** Signed fractional price jump from news this tick (0 if none). */
  newsJumpFrac: number;
  /** Seeded RNG for the stochastic term. */
  rng: Prng;
}

export function stepPrice(input: StepInput): number {
  const { prevCents, intrinsicCents, sigma, flowImpact, newsJumpFrac, rng } = input;

  const meanRev = ENGINE_PARAMS.kappa * (intrinsicCents - prevCents);
  const noise = prevCents * sigma * rng.gauss();
  const flow = prevCents * flowImpact;

  let next = prevCents + meanRev + noise + flow;

  // Clamp the continuous move to ±maxTickMove of the previous price.
  const maxMove = prevCents * ENGINE_PARAMS.maxTickMove;
  if (next - prevCents > maxMove) next = prevCents + maxMove;
  else if (prevCents - next > maxMove) next = prevCents - maxMove;

  // News gaps apply on top of the clamp.
  next += prevCents * newsJumpFrac;

  return clampPositive(next);
}
