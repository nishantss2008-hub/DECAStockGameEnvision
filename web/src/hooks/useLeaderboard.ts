/**
 * Standings from the public `leaderboard/current` document (ranked totals, sparks, and the
 * `final` block once the game has ended).
 */

import type { Leaderboard } from '@deca/shared';
import { useDocSnapshot, type SnapshotStatus } from './useSnapshot';

export interface UseLeaderboardResult extends SnapshotStatus {
  leaderboard: Leaderboard | null;
}

export function useLeaderboard(): UseLeaderboardResult {
  const { data: leaderboard, loading, fromCache, error } = useDocSnapshot<Leaderboard>('leaderboard/current');
  return { leaderboard, loading, fromCache, error };
}
