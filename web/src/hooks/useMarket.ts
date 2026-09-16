/**
 * Market-wide data: the live market summary (composite index, sector indexes, breadth) and the
 * composite value per tick, read as a range from the server.
 */

import type { MarketSummary } from '@deca/shared';
import { apiGet } from '../lib/api';
import { normalizeRange } from '../lib/series';
import { useLive } from './liveState';
import { useRest } from './restCache';
import { liveStatus, type SnapshotStatus } from './useSnapshot';

export interface UseMarketResult extends SnapshotStatus {
  market: MarketSummary | null;
}

export interface ValuePoint {
  tick: number;
  value: number;
}

export interface UseValueHistoryResult {
  points: ValuePoint[];
  loading: boolean;
}

export const MARKET_SUMMARY_PATH = 'market/summary';
export const MARKET_HISTORY_PATH = '/api/market/history';
export const CREW_HISTORY_PATH = '/api/portfolio/history';

export function useMarket(): UseMarketResult {
  const live = useLive();
  return { market: live.market, ...liveStatus(live) };
}

const NO_POINTS: ValuePoint[] = [];

/** `?from&to` on an API path, as the range readers spell it. */
export function rangeQuery(path: string, from: number, to: number): string {
  return `${path}?from=${from}&to=${to}`;
}

/**
 * Value per tick from `apiPath` (`/api/market/history`, `/api/portfolio/history`) over a tick
 * range. Null path or an empty range → no request. Shared by useCompositeHistory and
 * useTeamHistory; the previous range stays on screen while the next one loads.
 */
export function useValueHistory(apiPath: string | null, fromTick: number | null, toTick: number): UseValueHistoryResult {
  const range = normalizeRange(fromTick, toTick);
  const key = apiPath && range ? rangeQuery(apiPath, range.from, range.to) : null;
  const { data, loading } = useRest<ValuePoint[]>(key, async () => {
    const body = await apiGet<{ points?: ValuePoint[] }>(key!);
    return body?.points ?? NO_POINTS;
  });
  return { points: data ?? NO_POINTS, loading: key === null ? false : loading };
}

/** Composite market index per tick. `fromTick` null means the start of the game. */
export function useCompositeHistory(fromTick: number | null, toTick: number): UseValueHistoryResult {
  return useValueHistory(MARKET_HISTORY_PATH, fromTick, toTick);
}
