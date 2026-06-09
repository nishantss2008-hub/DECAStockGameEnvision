/**
 * Hidden intrinsic-value path generation.
 *
 * `generateIntrinsicPath` returns V(t) as fractional MULTIPLIERS of the company's
 * starting price (V[0] = 1.0). The realized price (see engine.ts) mean-reverts
 * toward `startPrice * V(t)`. The path is smooth: a drift term shaped by the
 * archetype plus a few low-frequency sine "waves" enveloped to vanish at the
 * endpoints — so V[0] = 1 and V[ticks] = 1 + totalDrift exactly, while the middle
 * wanders. Deterministic from (seed, companyId).
 */

import type { Archetype } from '@deca/shared';
import { TOTAL_TICKS } from '@deca/shared';
import { Prng, deriveSeed } from '../lib/prng';
import { ARCHETYPE_PROFILES, type PathShape } from './archetypes';

/** Base (drift) component of the path at normalized time x in [0,1]. */
function shapeBase(shape: PathShape, x: number, drift: number): number {
  switch (shape) {
    case 'up':
    case 'down':
    case 'flat':
      return drift * x;
    case 'u':
      // turnaround: dips through the middle, recovers to +drift at the end
      return drift * x - 0.2 * Math.sin(Math.PI * x);
    case 'invu':
      // value trap: looks great mid-game, ends at the (negative) drift
      return drift * x + 0.2 * Math.sin(Math.PI * x);
  }
}

export function generateIntrinsicPath(
  seed: number | string,
  companyId: string,
  archetype: Archetype,
  ticks: number = TOTAL_TICKS,
): number[] {
  const rng = new Prng(deriveSeed(seed, `intrinsic:${companyId}`));
  const profile = ARCHETYPE_PROFILES[archetype];
  const drift = rng.range(profile.totalDrift[0], profile.totalDrift[1]);

  const waves = Array.from({ length: 3 }, () => ({
    amp: rng.range(0.02, 0.08),
    freq: rng.range(1, 4) * Math.PI,
    phase: rng.range(0, Math.PI * 2),
  }));

  const path = new Array<number>(ticks + 1);
  for (let t = 0; t <= ticks; t++) {
    const x = t / ticks;
    const envelope = Math.sin(Math.PI * x); // 0 at both ends, 1 at mid
    let wave = 0;
    for (const w of waves) wave += w.amp * Math.sin(w.freq * x + w.phase);
    const value = 1 + shapeBase(profile.shape, x, drift) + envelope * wave;
    path[t] = Math.max(0.05, value);
  }
  return path;
}

/** Effective per-tick volatility fraction for a company. Deterministic. */
export function companySigma(
  seed: number | string,
  companyId: string,
  archetype: Archetype,
  sigmaBase: number,
): number {
  const rng = new Prng(deriveSeed(seed, `sigma:${companyId}`));
  const [lo, hi] = ARCHETYPE_PROFILES[archetype].vol;
  return sigmaBase * rng.range(lo, hi);
}
