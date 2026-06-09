/**
 * Hidden "fate" archetypes. Each company is secretly one of these; the archetype
 * drives its intrinsic-value path AND biases its generated fundamentals, which is
 * what makes diligent research pay off over the 48h game.
 */

import type { Archetype } from '@deca/shared';
import { ARCHETYPES } from '@deca/shared';
import type { Prng } from '../lib/prng';

export type PathShape = 'up' | 'down' | 'flat' | 'u' | 'invu';

export interface ArchetypeProfile {
  /** [min, max] total fractional drift of intrinsic value across the whole game. */
  totalDrift: [number, number];
  /** [min, max] per-company volatility multiplier applied to sigmaBase. */
  vol: [number, number];
  /** Quality bias in [-1, 1] applied when generating fundamentals. */
  fundamentalBias: number;
  /** Shape of the intrinsic path over game time. */
  shape: PathShape;
}

export const ARCHETYPE_PROFILES: Record<Archetype, ArchetypeProfile> = {
  compounder: { totalDrift: [0.25, 0.7], vol: [0.8, 1.2], fundamentalBias: 0.7, shape: 'up' },
  turnaround: { totalDrift: [0.1, 0.45], vol: [1.1, 1.7], fundamentalBias: -0.1, shape: 'u' },
  steady: { totalDrift: [-0.03, 0.12], vol: [0.5, 0.9], fundamentalBias: 0.3, shape: 'flat' },
  value_trap: { totalDrift: [-0.45, -0.1], vol: [0.9, 1.4], fundamentalBias: 0.1, shape: 'invu' },
  decliner: { totalDrift: [-0.6, -0.2], vol: [1.0, 1.5], fundamentalBias: -0.6, shape: 'down' },
};

/**
 * Assign archetypes across companies with a balanced spread (round-robin over a
 * shuffled archetype list), so every game has a healthy mix of fates.
 */
export function assignArchetypes(rng: Prng, companyIds: string[]): Record<string, Archetype> {
  const order = rng.shuffle(companyIds);
  const pool = rng.shuffle(ARCHETYPES);
  const result: Record<string, Archetype> = {};
  order.forEach((id, i) => {
    result[id] = pool[i % pool.length] as Archetype;
  });
  return result;
}
