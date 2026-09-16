/**
 * Price and volume per tick for one instrument over a tick range, read from
 * `GET /api/companies/{id}/history?from&to` — or `/api/funds/{id}/history` for a fund, which the
 * server stores as the same `price_history` rows, so the two answer the identical shape.
 *
 * One request per range, shared and cached (restCache), so several charts on a screen ask once.
 * While a moved range loads, the previous points stay on screen instead of blanking the chart.
 * `fromTick` null means the start of the game.
 */

import { apiGet } from '../lib/api';
import { normalizeRange } from '../lib/series';
import { useRest } from './restCache';

export interface PricePoint {
  tick: number;
  price: number; // integer cents
  volume: number; // shares
}

export interface UseHistoryResult {
  points: PricePoint[];
  loading: boolean;
}

const NO_POINTS: PricePoint[] = [];

export function historyPath(companyId: string, from: number, to: number, kind: 'company' | 'fund' = 'company'): string {
  const collection = kind === 'fund' ? 'funds' : 'companies';
  return `/api/${collection}/${encodeURIComponent(companyId)}/history?from=${from}&to=${to}`;
}

export function useHistory(
  companyId: string | null | undefined,
  fromTick: number | null,
  toTick: number,
  kind: 'company' | 'fund' = 'company',
): UseHistoryResult {
  const range = normalizeRange(fromTick, toTick);
  const key = companyId && range ? historyPath(companyId, range.from, range.to, kind) : null;
  const { data, loading } = useRest<PricePoint[]>(key, async () => {
    const body = await apiGet<{ points?: PricePoint[] }>(key!);
    return body?.points ?? NO_POINTS;
  });
  return { points: data ?? NO_POINTS, loading: key === null ? false : loading };
}
