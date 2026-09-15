/**
 * Game clock helpers: the GameClock for a game document, the countdown, sessions, and a
 * server clock-skew estimate so "time left" and "last price update … ago" stay right on
 * devices whose clocks are off (school Chromebooks often are).
 */

import { HOUR_MS, SESSIONS_PER_GAME, deriveClock, type GameClock, type GameState } from '@deca/shared';

/** The server-written cadence from `game/state`, falling back to deriveClock for missing fields. */
export function clockFromGame(game: GameState | null): GameClock | null {
  if (!game || !(game.gameLengthMs > 0)) return null;
  const derived = deriveClock(game.gameLengthMs);
  return {
    gameLengthMs: game.gameLengthMs,
    tickIntervalMs: game.tickIntervalMs > 0 ? game.tickIntervalMs : derived.tickIntervalMs,
    totalTicks: game.totalTicks > 0 ? game.totalTicks : derived.totalTicks,
    sessionTicks: game.sessionTicks > 0 ? game.sessionTicks : derived.sessionTicks,
    hours: game.gameLengthMs / HOUR_MS,
  };
}

/**
 * Milliseconds left in the game at server time `now`.
 * lobby → full length · live → endAt − now · paused → frozen at endAt − pausedAt · ended → 0.
 */
export function countdownRemaining(game: GameState | null, now: number): number {
  if (!game) return 0;
  switch (game.phase) {
    case 'lobby':
      return Math.max(0, game.gameLengthMs || 0);
    case 'live':
      return game.endAt === null ? Math.max(0, game.gameLengthMs || 0) : Math.max(0, game.endAt - now);
    case 'paused':
      if (game.endAt === null) return Math.max(0, game.gameLengthMs || 0);
      return Math.max(0, game.endAt - (game.pausedAt ?? now));
    case 'ended':
    default:
      return 0;
  }
}

export interface SessionInfo {
  /** 1-based session number. */
  session: number;
  sessions: number;
  startTick: number;
  isFinal: boolean;
}

/** Session containing `tick` (COPY §12 "Session {n} of 8", "Final session"). */
export function sessionInfo(tick: number, sessionTicks: number): SessionInfo {
  const per = Math.max(1, sessionTicks);
  const session = Math.min(SESSIONS_PER_GAME, Math.floor(Math.max(0, tick) / per) + 1);
  return { session, sessions: SESSIONS_PER_GAME, startTick: (session - 1) * per, isFinal: session === SESSIONS_PER_GAME };
}

const MAX_PLAUSIBLE_SKEW_MS = 86_400_000;

/**
 * Estimates serverClock − localClock from `game/state.serverTime` heartbeats.
 * Each sample (serverTime − local receive time) underestimates the true offset by the
 * delivery delay, so the estimate is the largest of the last `window` samples. Repeated
 * serverTime values are ignored; so are samples more than a day off.
 */
export class ClockSkew {
  private samples: number[] = [];
  private lastServerTime: number | null = null;

  constructor(private readonly window = 5) {}

  observe(serverTime: number, localNow: number): void {
    if (!Number.isFinite(serverTime) || serverTime === this.lastServerTime) return;
    this.lastServerTime = serverTime;
    const sample = serverTime - localNow;
    if (Math.abs(sample) > MAX_PLAUSIBLE_SKEW_MS) return;
    this.samples.push(sample);
    if (this.samples.length > this.window) this.samples.shift();
  }

  /** Forgets every sample (tests, or after the device clock is known to have jumped). */
  reset(): void {
    this.samples = [];
    this.lastServerTime = null;
  }

  get offsetMs(): number {
    return this.samples.length ? Math.max(...this.samples) : 0;
  }

  now(localNow: number = Date.now()): number {
    return localNow + this.offsetMs;
  }
}

/** App-wide skew estimate, fed by useGame from live heartbeats. */
export const serverClock = new ClockSkew();

/** Best estimate of the server's current epoch ms. */
export function serverNow(): number {
  return serverClock.now(Date.now());
}
