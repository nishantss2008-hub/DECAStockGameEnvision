/**
 * One company and its research profile. The company is live (it moves every tick); the profile is
 * fixed for the market, so it comes from the shared fundamentals read. Loading stays true until
 * both have answered. Null or empty id → an empty, finished result.
 */

import type { Company, Fundamentals } from '@deca/shared';
import { useLive } from './liveState';
import { useAllFundamentals } from './useAllFundamentals';
import { selectPath, type SnapshotStatus } from './useSnapshot';

export interface UseCompanyResult extends SnapshotStatus {
  company: Company | null;
  fundamentals: Fundamentals | null;
}

export function useCompany(id?: string | null): UseCompanyResult {
  const companyId = id ? id : null;
  const live = useLive();
  const marketKey = (live.game as { marketCreatedAt?: number } | null)?.marketCreatedAt ?? null;
  const fundamentals = useAllFundamentals(marketKey);
  if (companyId === null) {
    return { company: null, fundamentals: null, loading: false, fromCache: false, error: null };
  }
  const company = selectPath<Company>(live, `companies/${companyId}`).data;
  return {
    company,
    fundamentals: fundamentals.byId[companyId] ?? null,
    loading: !live.ready || fundamentals.loading,
    fromCache: live.stale,
    error: live.error ?? fundamentals.error,
  };
}
