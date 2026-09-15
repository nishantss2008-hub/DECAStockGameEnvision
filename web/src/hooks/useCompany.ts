/**
 * One company and its research profile: `companies/{id}` and `companies/{id}/fundamentals/data`.
 * Loading stays true until both documents have answered. Null or empty id → no listeners.
 */

import type { Company, Fundamentals } from '@deca/shared';
import { useDocSnapshot, type SnapshotStatus } from './useSnapshot';

export interface UseCompanyResult extends SnapshotStatus {
  company: Company | null;
  fundamentals: Fundamentals | null;
}

export function useCompany(id?: string | null): UseCompanyResult {
  const companyId = id ? id : null;
  const company = useDocSnapshot<Company>(companyId && `companies/${companyId}`);
  const fundamentals = useDocSnapshot<Fundamentals>(companyId && `companies/${companyId}/fundamentals/data`);
  return {
    company: company.data,
    fundamentals: fundamentals.data,
    loading: company.loading || fundamentals.loading,
    fromCache: company.fromCache || fundamentals.fromCache,
    error: company.error ?? fundamentals.error,
  };
}
