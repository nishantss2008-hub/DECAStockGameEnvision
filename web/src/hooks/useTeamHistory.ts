/**
 * A crew's total account value per tick from `teams/{teamId}/history/{chunk}` (readable by that
 * crew and the host). Null team → no listeners. `fromTick` null means the start of the game.
 */

import { useValueHistory, type UseValueHistoryResult } from './useMarket';

export function useTeamHistory(teamId: string | null, fromTick: number | null, toTick: number): UseValueHistoryResult {
  return useValueHistory(teamId ? `teams/${teamId}/history` : null, fromTick, toTick);
}
