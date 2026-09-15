/**
 * Time left in the game as milliseconds and an HH:MM:SS label.
 *
 * Live: re-renders once a second and reads the server clock estimate (device clock + skew), so
 * the first frame after a resume is already right. Paused: frozen at endAt − pausedAt, with no
 * timer running. Lobby: the full game length. Ended: zero. The timer stops on unmount.
 */

import { useEffect, useState } from 'react';
import type { GameState } from '@deca/shared';
import { formatClock } from '../lib/format';
import { countdownRemaining, serverNow } from '../lib/gameTime';

export interface UseCountdownResult {
  remainingMs: number;
  label: string;
}

export const COUNTDOWN_TICK_MS = 1_000;

export function useCountdown(game: GameState | null): UseCountdownResult {
  const [, setBeat] = useState(0);
  const ticking = game?.phase === 'live' && game.endAt !== null;

  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setBeat((n) => n + 1), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [ticking]);

  const remainingMs = countdownRemaining(game, serverNow());
  return { remainingMs, label: formatClock(remainingMs) };
}
