/**
 * The signed-in crew's account: `teams/{teamId}` and its `holdings` (positions with shares > 0).
 * The team id comes from useAuth; the host (no teamId) gets an empty, non-loading result;
 * while the session is still being restored the result is loading.
 */

import { useMemo } from 'react';
import { collection, query } from 'firebase/firestore';
import type { Holding, Team } from '@deca/shared';
import { db } from '../firebase';
import { useAuth } from '../lib/auth';
import { useDocSnapshot, useQuerySnapshot, type QuerySpec, type SnapshotStatus } from './useSnapshot';

export interface UsePortfolioResult extends SnapshotStatus {
  team: Team | null;
  holdings: Holding[];
}

function holdingsSpec(teamId: string): QuerySpec<Holding> {
  return {
    key: `teams/${teamId}/holdings`,
    build: () => query(collection(db, 'teams', teamId, 'holdings')),
    map: (id, data) => ({ ...(data as Holding), companyId: (data as Partial<Holding>).companyId ?? id }),
    select: (items) => items.filter((h) => Number.isFinite(h.shares) && h.shares > 0),
  };
}

export function usePortfolio(): UsePortfolioResult {
  const { teamId, loading: authLoading } = useAuth();
  const team = useDocSnapshot<Team>(teamId ? `teams/${teamId}` : null);
  const spec = useMemo(() => (teamId ? holdingsSpec(teamId) : null), [teamId]);
  const holdings = useQuerySnapshot(spec);
  return {
    team: team.data,
    holdings: holdings.items,
    // While the session is being restored the crew is unknown: loading, not an empty account.
    loading: Boolean(authLoading) || team.loading || holdings.loading,
    fromCache: team.fromCache || holdings.fromCache,
    error: team.error ?? holdings.error,
  };
}
