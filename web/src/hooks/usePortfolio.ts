/**
 * The signed-in crew's account: its row and its positions (shares > 0), pushed by the server on
 * the `portfolio` event. The crew comes from the session token, so one crew can never see
 * another's cash or holdings. The host (no teamId) gets an empty, non-loading result; while the
 * session is still being restored the result is loading.
 */

import { useMemo } from 'react';
import type { Holding, Team } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { useLive } from './liveState';
import { type SnapshotStatus } from './useSnapshot';

export interface UsePortfolioResult extends SnapshotStatus {
  team: Team | null;
  holdings: Holding[];
}

const NO_HOLDINGS: Holding[] = [];

export function usePortfolio(): UsePortfolioResult {
  const { teamId, loading: authLoading } = useAuth();
  const live = useLive();
  const holdings = useMemo(
    () => live.portfolio.holdings.filter((h) => Number.isFinite(h.shares) && h.shares > 0),
    [live.portfolio],
  );
  if (!teamId) {
    // While the session is being restored the crew is unknown: loading, not an empty account.
    return { team: null, holdings: NO_HOLDINGS, loading: Boolean(authLoading), fromCache: false, error: null };
  }
  return {
    team: live.portfolio.team,
    holdings,
    loading: !live.ready,
    fromCache: live.stale,
    error: live.error,
  };
}
