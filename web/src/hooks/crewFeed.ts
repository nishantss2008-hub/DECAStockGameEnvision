/**
 * Query spec for a crew's newest-first feed in a top-level collection (`trades`, `orders`).
 *
 * Security rules only let a crew read documents whose `teamId` is its own, so the query always
 * filters on it. The ordered query needs a composite index (teamId asc, time desc); when that
 * index is missing or still building, Firestore answers `failed-precondition`, and the feed
 * falls back to the plain teamId filter sorted and limited on the device.
 */

import { collection, limit, orderBy, query, where, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type { QuerySpec } from './useSnapshot';

/** Default number of rows for Activity and order feeds. */
export const DEFAULT_FEED_LIMIT = 100;

export function feedLimit(n: number | undefined): number {
  return n !== undefined && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_FEED_LIMIT;
}

export function crewFeedSpec<T extends { id: string }>(
  collectionName: 'trades' | 'orders',
  teamId: string,
  timeField: 'executedAt' | 'createdAt',
  max: number,
): QuerySpec<T> {
  const time = (item: T) => {
    const v = (item as unknown as Record<string, unknown>)[timeField];
    return typeof v === 'number' ? v : 0;
  };
  return {
    key: `${collectionName}?teamId==${teamId}&orderBy=${timeField}:desc&limit=${max}`,
    build: () => query(collection(db, collectionName), where('teamId', '==', teamId), orderBy(timeField, 'desc'), limit(max)),
    map: (id: string, data: DocumentData) => ({ id, ...data }) as T,
    fallback: {
      build: () => query(collection(db, collectionName), where('teamId', '==', teamId)),
      select: (items) => [...items].sort((a, b) => time(b) - time(a) || b.id.localeCompare(a.id)).slice(0, max),
    },
  };
}
