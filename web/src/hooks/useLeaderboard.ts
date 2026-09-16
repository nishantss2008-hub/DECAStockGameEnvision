/**
 * Standings as the server pushes them: ranked totals, sparks, and the `final` block once the game
 * has ended.
 */

import type { Leaderboard } from '@deca/shared';
import { useLive } from './liveState';
import { liveStatus, type SnapshotStatus } from './useSnapshot';

export interface UseLeaderboardResult extends SnapshotStatus {
  leaderboard: Leaderboard | null;
}

export function useLeaderboard(): UseLeaderboardResult {
  const live = useLive();
  return { leaderboard: live.leaderboard, ...liveStatus(live) };
}
