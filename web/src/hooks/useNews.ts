/**
 * Fired dispatches, newest first, at most `limit` (default 100). The stream pushes each dispatch
 * as it fires; scheduled, unfired news lives on the server and has no route outside `/admin/*`.
 */

import { useMemo } from 'react';
import type { NewsEvent } from '@deca/shared';
import { feedLimit, newestFirst } from './crewFeed';
import { useLive } from './liveState';
import { liveStatus, type SnapshotStatus } from './useSnapshot';

export interface UseNewsResult extends SnapshotStatus {
  news: NewsEvent[];
}

export function useNews(limit?: number): UseNewsResult {
  const live = useLive();
  const max = feedLimit(limit);
  const news = useMemo(() => newestFirst(live.news, 'firedAt', max), [live.news, max]);
  return { news, ...liveStatus(live) };
}
