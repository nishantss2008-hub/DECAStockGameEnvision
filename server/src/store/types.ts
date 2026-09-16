/**
 * Row shapes the store speaks in. Domain types come from `@deca/shared`; this
 * module only adds the server-only shapes that never appear in a client payload.
 */

import type { Grade, QualityPillars, Team } from '@deca/shared';
import type { EngineState } from '../engine/state';
import type { ScheduledEvent } from '../engine/news';

/** `engine_state` row: {lastTick, hM, companies:{...}} (spec §5.5). */
export type EngineStateRow = EngineState;

/**
 * SERVER-ONLY per-company data (`company_secret`). None of this may reach a crew
 * before `phase === 'ended'`, when the engine turns it into `Company.reveal`.
 */
export interface CompanySecret {
  companyId: string;
  ticker: string;
  name: string;
  sector: string;
  /** Latent health in [-1, 1]. */
  q: number;
  /** surpriseWeight·q + (1 − surpriseWeight)·surprise — the engine's input. */
  qEff: number;
  /** ξ ~ U[−1,1], seeded `surprise:${id}`. */
  surprise: number;
  /** Measured quality score s. */
  quality: number;
  grade: Grade;
  pillars: QualityPillars;
  idioVol: number;
  beta: number;
  sharesOutstanding: number;
  adv: number;
  startPriceCents: number;
}

/**
 * SERVER-ONLY per-fund data (`fund_secret`). A fund has no hidden state of its own: each
 * field is the value-weighted average of its constituents'. None of it may reach a crew
 * before `phase === 'ended'`, when the engine turns it into `Fund.reveal`.
 */
export interface FundSecret {
  fundId: string;
  ticker: string;
  name: string;
  /** Weighted mean of the constituents' q. */
  q: number;
  /** Weighted mean of the constituents' qEff. */
  qEff: number;
  /** Weighted mean of the constituents' measured quality score s. */
  quality: number;
}

/** One stored point of `price_history`. */
export interface PricePoint {
  tick: number;
  /** Integer cents. */
  price: number;
  /** Shares traded during the interval ending at `tick`. */
  volume: number;
}

/** One stored point of a value series (`market_history`, `crew_history`). */
export interface ValuePoint {
  tick: number;
  value: number;
}

/** The persisted crew row: the public `Team` plus the two server-only columns. */
export interface CrewRow extends Team {
  passwordHash: string;
  /** Bumped on password reset and removal; every JWT below it stops verifying. */
  tokenVersion: number;
}

/** What `crews.create` needs; every other column starts at its default. */
export interface NewCrew {
  id: string;
  name: string;
  passwordHash: string;
  /** Integer cents: seeds cash, totalValue and sessionOpenValue. */
  startingCapital: number;
  createdAt?: number;
}

/**
 * A `news_schedule` row. `rowId` is the autoincrement id `markFired` takes; the
 * rest is the `ScheduledEvent` the engine built, magnitudes included.
 */
export interface StoredScheduledEvent extends ScheduledEvent {
  rowId: number;
  fired: boolean;
}

/** An `audit_log` row (append-only; never readable by a crew). */
export interface LogEntry {
  id?: number;
  action: string;
  /** teamId, 'admin', or 'engine'. */
  actor: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
