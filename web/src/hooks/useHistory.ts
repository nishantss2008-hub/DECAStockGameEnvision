/**
 * Price and volume per tick for one company over a tick range, read from the 120-tick chunk
 * documents `companies/{id}/history/{chunk}`.
 *
 * Only the chunks that cover the range are listened to (MOBILE §9.7). When the range moves,
 * chunks that stay covered keep their listener; the rest subscribe or unsubscribe.
 * `fromTick` null means the start of the game.
 */

import { useMemo } from 'react';
import type { HistoryChunk } from '@deca/shared';
import { assemblePricePoints, chunkIndexes, normalizeRange } from '../lib/series';
import { useDocSet } from './useSnapshot';

export interface PricePoint {
  tick: number;
  price: number; // integer cents
  volume: number; // shares
}

export interface UseHistoryResult {
  points: PricePoint[];
  loading: boolean;
}

const NO_PATHS: string[] = [];
const NO_POINTS: PricePoint[] = [];

export function useHistory(companyId: string | null | undefined, fromTick: number | null, toTick: number): UseHistoryResult {
  const range = normalizeRange(fromTick, toTick);
  const from = range?.from ?? 0;
  const to = range?.to ?? -1;
  const paths = useMemo(
    () => (companyId && to >= from ? chunkIndexes({ from, to }).map((c) => `companies/${companyId}/history/${c}`) : NO_PATHS),
    [companyId, from, to],
  );
  const { chunks, loading } = useDocSet<HistoryChunk>(paths);
  const points = useMemo(() => (paths.length ? assemblePricePoints(chunks, { from, to }) : NO_POINTS), [chunks, from, to, paths.length]);
  return { points, loading };
}
