/**
 * Engine state (spec §5.5): the persisted, server-only `_engine/state` shape,
 * plus disaster recovery when that doc is missing.
 *
 * v, h (and m) never depend on player flow, so they can be replayed from the
 * seed with zero flow; only the impact term f must come from persisted prices.
 */

import type { GameClock } from '@deca/shared';
import { companyStep, derive, initialState, marketStep, type CompanyState, type ModelCompany } from './model';
import { jumpsAtTick, type ScheduledEvent } from './news';

export interface EngineState {
  lastTick: number;
  hM: number;
  companies: Record<string, CompanyState>;
}

/** Deep plain (JSON-safe) copy. */
export function serializeState(s: EngineState): EngineState {
  const companies: Record<string, CompanyState> = {};
  for (const [id, c] of Object.entries(s.companies)) companies[id] = { v: c.v, m: c.m, f: c.f, h: c.h };
  return { lastTick: s.lastTick, hM: s.hM, companies };
}

/**
 * Replays the model from tick 0 to `toTick` with zero player flow, so f stays 0.
 * Scheduled, macro and any host events in `events` are applied at their ticks.
 */
export function replayFairValue(
  seed: string,
  clock: GameClock,
  spread: number,
  companies: ModelCompany[],
  startPrices: Record<string, number>,
  events: ScheduledEvent[],
  toTick: number,
): EngineState {
  const d = derive(clock, spread);
  const byTick = jumpsAtTick(events);
  const mk = { hM: 1 };
  const states: Record<string, CompanyState> = {};
  for (const c of companies) {
    const start = startPrices[c.id];
    if (start === undefined) throw new Error(`replayFairValue: missing start price for ${c.id}`);
    states[c.id] = initialState(start);
  }
  const end = Math.min(toTick, clock.totalTicks);
  for (let t = 1; t <= end; t++) {
    const rM = marketStep(seed, t, mk, d);
    const evs = byTick.get(t);
    for (const c of companies) {
      let jump = 0;
      if (evs) for (const e of evs) jump += e.jumps[c.id] ?? 0;
      companyStep(seed, t, c, states[c.id]!, rM, jump, 0, d);
    }
  }
  return { lastTick: Math.max(0, end), hM: mk.hM, companies: states };
}

/** Sets f = ln(price) − v − m for every company with a persisted price. Returns a new state. */
export function recoverImpact(state: EngineState, prices: Record<string, number>): EngineState {
  const out = serializeState(state);
  for (const [id, c] of Object.entries(out.companies)) {
    const price = prices[id];
    if (price !== undefined && price > 0) c.f = Math.log(price) - c.v - c.m;
  }
  return out;
}
