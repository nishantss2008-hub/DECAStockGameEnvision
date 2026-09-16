/**
 * The public game state: phase, settings, tick cadence and the engine heartbeat.
 *
 * Also returns the GameClock for the game and feeds the server's time into the app-wide
 * clock-skew estimate (lib/gameTime), so countdowns stay right on devices whose clock is off.
 * `fromCache` turns true as soon as the stream drops ("Reconnecting…", MOBILE §7.16) and false
 * again when it returns, so a stale heartbeat never moves the estimate.
 */

import { useEffect, useMemo } from 'react';
import type { GameClock, GameState } from '@deca/shared';
import { clockFromGame, serverClock } from '../lib/gameTime';
import { useLive } from './liveState';
import { type SnapshotStatus } from './useSnapshot';

export interface UseGameResult extends SnapshotStatus {
  game: GameState | null;
  clock: GameClock | null;
}

export const GAME_STATE_PATH = 'game/state';

export function useGame(): UseGameResult {
  const live = useLive();
  const heartbeat = live.serverTime || (live.game as { serverTime?: number } | null)?.serverTime || 0;

  useEffect(() => {
    // A heartbeat from a dropped stream is old news: it would make the server look behind the device.
    if (!live.stale && heartbeat) serverClock.observe(heartbeat, Date.now());
  }, [heartbeat, live.stale]);

  const clock = useMemo(() => clockFromGame(live.game), [live.game]);
  return { game: live.game, clock, loading: !live.ready, fromCache: live.stale, error: live.error };
}
