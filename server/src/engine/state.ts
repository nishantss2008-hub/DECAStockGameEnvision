/**
 * Game-clock helpers used to make the engine resume-safe. The intrinsic path and
 * news schedule are deterministic from the seed; the current tick is a pure
 * function of wall-clock time since `startAt`, so after any restart the engine
 * recomputes exactly where it should be.
 */

import { TOTAL_TICKS } from '@deca/shared';

/** Which tick the game should be on right now, clamped to [0, TOTAL_TICKS]. */
export function resumeTick(now: number, startAt: number | null, tickIntervalMs: number): number {
  if (startAt == null || tickIntervalMs <= 0) return 0;
  const elapsed = Math.floor((now - startAt) / tickIntervalMs);
  return Math.max(0, Math.min(TOTAL_TICKS, elapsed));
}

/** Epoch ms at which the game ends, given a start time. */
export function computeEndAt(startAt: number, tickIntervalMs: number): number {
  return startAt + TOTAL_TICKS * tickIntervalMs;
}
