/**
 * Every company's research profile at once, keyed by company id, for sector averages and the
 * All companies views (Value, Health, Analysts).
 *
 * One read, not a subscription: fundamentals are fixed for a market, so every mounted instance
 * shares a single `GET /api/fundamentals` for the page session (restCache de-duplicates it).
 * Pass `game.marketCreatedAt` as `marketKey` to reload after the host creates a new market (or
 * call `invalidateAllFundamentals()`).
 */

import type { Fundamentals } from '@deca/shared';
import { apiGet } from '../lib/api';
import type { FundamentalsResponse } from '../lib/liveStore';
import { invalidateRest, useRest } from './restCache';

export interface UseAllFundamentalsResult {
  byId: Record<string, Fundamentals>;
  loading: boolean;
  error: string | null;
}

type ById = Record<string, Fundamentals>;

export const FUNDAMENTALS_PATH = '/api/fundamentals';

/** Drops the shared result so the next mount or market change reads again. */
export function invalidateAllFundamentals(): void {
  invalidateRest('fundamentals');
}

const EMPTY: ById = {};

export function fundamentalsKey(marketKey: number | null): string {
  return `fundamentals@${marketKey ?? 'current'}`;
}

async function readAll(): Promise<ById> {
  const body = await apiGet<FundamentalsResponse | ById>(FUNDAMENTALS_PATH);
  if (body && typeof body === 'object' && 'fundamentals' in body) return (body as FundamentalsResponse).fundamentals ?? EMPTY;
  return (body as ById) ?? EMPTY;
}

export function useAllFundamentals(marketKey?: number | null): UseAllFundamentalsResult {
  const { data, loading, error } = useRest<ById>(fundamentalsKey(marketKey ?? null), readAll);
  return { byId: data ?? EMPTY, loading, error };
}
