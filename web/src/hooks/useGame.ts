/**
 * Realtime subscription to the public game state document (`game/state`).
 *
 * Returns the current GameState (or null while loading / if the doc is absent)
 * plus a loading flag that flips to false after the first snapshot resolves.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { GameState } from '@deca/shared';
import { db } from '../firebase';

export interface UseGameResult {
  game: GameState | null;
  loading: boolean;
}

export function useGame(): UseGameResult {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'game', 'state');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setGame(snap.exists() ? (snap.data() as GameState) : null);
        setLoading(false);
      },
      () => {
        setGame(null);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { game, loading };
}
