/**
 * The public game document `game/state`: phase, settings, tick cadence and the engine heartbeat.
 *
 * Also returns the GameClock for the game and feeds live `serverTime` heartbeats into the
 * app-wide clock-skew estimate (lib/gameTime), so countdowns stay right on devices whose clock
 * is off. Metadata-only snapshots are delivered, so `fromCache` turns true as soon as the
 * connection drops ("Reconnecting…", MOBILE §7.16) and false again when it returns.
 */

import { useCallback, useMemo } from 'react';
import type { GameClock, GameState } from '@deca/shared';
import { clockFromGame, serverClock } from '../lib/gameTime';
import { useDocSnapshot, type SnapshotStatus } from './useSnapshot';

export interface UseGameResult extends SnapshotStatus {
  game: GameState | null;
  clock: GameClock | null;
}

export const GAME_STATE_PATH = 'game/state';

export function useGame(): UseGameResult {
  const onSnapshotData = useCallback((game: GameState | null, fromCache: boolean) => {
    // A cached heartbeat is old news: it would make the server look behind the device.
    if (!fromCache && game && typeof game.serverTime === 'number') serverClock.observe(game.serverTime, Date.now());
  }, []);
  const { data: game, loading, fromCache, error } = useDocSnapshot<GameState>(GAME_STATE_PATH, {
    includeMetadataChanges: true,
    onSnapshotData,
  });
  const clock = useMemo(() => clockFromGame(game), [game]);
  return { game, clock, loading, fromCache, error };
}
