/**
 * Order-flow book: tracks net buy/sell pressure per company and converts it into
 * a TEMPORARY price-impact fraction that decays over subsequent ticks.
 *
 * This is what makes "trade volume cause volatility": a burst of buying pushes a
 * stock up this tick, then the impact partially retraces (mean-reverts) over the
 * next few ticks — so you can't trivially pump your own holdings, but being early
 * to a fundamentally strong stock still pays.
 */

import { ENGINE_PARAMS } from '@deca/shared';

export class OrderFlowBook {
  /** Net signed shares accumulated since the last tick (buys +, sells -). */
  private pending = new Map<string, number>();
  /** Current decaying temporary impact (signed fraction of price). */
  private impact = new Map<string, number>();
  /** Gross shares traded since the last tick (for reported volume). */
  private volume = new Map<string, number>();

  /** Record a fill. `shares` is always positive; side sets the sign. */
  record(companyId: string, side: 'buy' | 'sell', shares: number): void {
    const signed = side === 'buy' ? shares : -shares;
    this.pending.set(companyId, (this.pending.get(companyId) ?? 0) + signed);
    this.volume.set(companyId, (this.volume.get(companyId) ?? 0) + shares);
  }

  /**
   * Advance one tick for a company: fold pending net flow into the impact,
   * decay the accumulated impact, reset pending. Returns the new impact fraction.
   */
  step(companyId: string): number {
    const prev = this.impact.get(companyId) ?? 0;
    const flow = this.pending.get(companyId) ?? 0;
    const next = prev * ENGINE_PARAMS.impactDecay + ENGINE_PARAMS.lambda * flow;
    this.impact.set(companyId, next);
    this.pending.set(companyId, 0);
    return next;
  }

  /** Read & reset the gross volume traded since the last tick. */
  drainVolume(companyId: string): number {
    const v = this.volume.get(companyId) ?? 0;
    this.volume.set(companyId, 0);
    return v;
  }

  /** Current impact without advancing (for inspection/tests). */
  peekImpact(companyId: string): number {
    return this.impact.get(companyId) ?? 0;
  }
}
