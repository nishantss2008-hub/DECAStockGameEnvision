/**
 * A crew's total account value per tick, read from `GET /api/portfolio/history?from&to`.
 *
 * The server takes the crew from the session token, never from the argument, so a crew can only
 * ever read its own curve. Null team → no request. `fromTick` null means the start of the game.
 */

import { CREW_HISTORY_PATH, useValueHistory, type UseValueHistoryResult } from './useMarket';

export function useTeamHistory(teamId: string | null, fromTick: number | null, toTick: number): UseValueHistoryResult {
  return useValueHistory(teamId ? CREW_HISTORY_PATH : null, fromTick, toTick);
}
