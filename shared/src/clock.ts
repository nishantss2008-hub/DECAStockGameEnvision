/**
 * Game clock derivation. Every game length maps to a tick cadence, a total tick
 * count and 8 equal trading sessions (spec §5.1).
 */

import { HISTORY_CHUNK, HOUR_MS, SESSIONS_PER_GAME } from './constants.js';
import { clamp } from './mathx.js';

export interface GameClock {
  gameLengthMs: number;
  tickIntervalMs: number;
  totalTicks: number;
  sessionTicks: number;
  hours: number;
}

/**
 * tickIntervalMs = clamp(round(gameLengthMs/720), 5s, 30s)
 * totalTicks     = floor(gameLengthMs/tickIntervalMs)
 * sessionTicks   = max(1, round(totalTicks/8))
 */
export function deriveClock(gameLengthMs: number): GameClock {
  const tickIntervalMs = clamp(Math.round(gameLengthMs / 720), 5_000, 30_000);
  const totalTicks = Math.floor(gameLengthMs / tickIntervalMs);
  const sessionTicks = Math.max(1, Math.round(totalTicks / SESSIONS_PER_GAME));
  return { gameLengthMs, tickIntervalMs, totalTicks, sessionTicks, hours: gameLengthMs / HOUR_MS };
}

/** Tick number at wall-clock `now`, clamped to [0, totalTicks]. 0 before the game starts. */
export function tickAt(now: number, startAt: number | null, clock: GameClock): number {
  if (startAt === null) return 0;
  const t = Math.floor((now - startAt) / clock.tickIntervalMs);
  return clamp(t, 0, clock.totalTicks);
}

/** First tick of the session containing `tick`. */
export function sessionStartTick(tick: number, sessionTicks: number): number {
  return Math.floor(tick / sessionTicks) * sessionTicks;
}

/** 1-based session number containing `tick`, capped at SESSIONS_PER_GAME. */
export function sessionNumber(tick: number, sessionTicks: number): number {
  return Math.min(SESSIONS_PER_GAME, Math.floor(tick / sessionTicks) + 1);
}

/** History chunk index holding `tick`. */
export function chunkOf(tick: number): number {
  return Math.floor(tick / HISTORY_CHUNK);
}

export interface RangeTab {
  key: string;
  label: string;
  /** Ticks covered by the tab; null = whole game. */
  ticks: number | null;
}

const MINUTE_MS = 60_000;
const RANGE_CANDIDATES: { key: string; label: string; ms: number }[] = [
  { key: '5m', label: '5M', ms: 5 * MINUTE_MS },
  { key: '15m', label: '15M', ms: 15 * MINUTE_MS },
  { key: '1h', label: '1H', ms: HOUR_MS },
  { key: '6h', label: '6H', ms: 6 * HOUR_MS },
  { key: '24h', label: '24H', ms: 24 * HOUR_MS },
];

/**
 * Chart range tabs scaled to the game length: candidates no longer than half the
 * game, the last (longest) three of them, then "All".
 */
export function rangeTabs(clock: GameClock): RangeTab[] {
  const fitting = RANGE_CANDIDATES.filter((c) => c.ms <= clock.gameLengthMs / 2).slice(-3);
  return [
    ...fitting.map((c) => ({
      key: c.key,
      label: c.label,
      ticks: Math.max(1, Math.round(c.ms / clock.tickIntervalMs)),
    })),
    { key: 'all', label: 'All', ticks: null },
  ];
}
