/**
 * Market-wide data: the `market/summary` document (composite index, sector indexes, breadth)
 * and the composite value per tick from `market/summary/history/{chunk}`.
 */

import { useMemo } from 'react';
import type { MarketSummary, ValueChunk } from '@deca/shared';
import { assembleValuePoints, chunkIndexes, normalizeRange } from '../lib/series';
import { useDocSet, useDocSnapshot, type SnapshotStatus } from './useSnapshot';

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

export function useMarket(): UseMarketResult {
  const { data: market, loading, fromCache, error } = useDocSnapshot<MarketSummary>(MARKET_SUMMARY_PATH);
  return { market, loading, fromCache, error };
}

const NO_PATHS: string[] = [];
const NO_POINTS: ValuePoint[] = [];

/**
 * Value per tick from the chunk documents under `basePath` (`market/summary/history`,
 * `teams/{id}/history`) over a tick range. Null base path → no listeners.
 * Shared by useCompositeHistory and useTeamHistory.
 */
export function useValueHistory(basePath: string | null, fromTick: number | null, toTick: number): UseValueHistoryResult {
  const range = normalizeRange(fromTick, toTick);
  const from = range?.from ?? 0;
  const to = range?.to ?? -1;
  const paths = useMemo(
    () => (basePath && to >= from ? chunkIndexes({ from, to }).map((c) => `${basePath}/${c}`) : NO_PATHS),
    [basePath, from, to],
  );
  const { chunks, loading } = useDocSet<ValueChunk>(paths);
  const points = useMemo(() => (paths.length ? assembleValuePoints(chunks, { from, to }) : NO_POINTS), [chunks, from, to, paths.length]);
  return { points, loading };
}

/** Composite market index per tick. `fromTick` null means the start of the game. */
export function useCompositeHistory(fromTick: number | null, toTick: number): UseValueHistoryResult {
  return useValueHistory(`${MARKET_SUMMARY_PATH}/history`, fromTick, toTick);
}
