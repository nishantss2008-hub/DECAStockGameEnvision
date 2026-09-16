/**
 * Every company on the stream, sorted by ticker, indexed by id and by ticker.
 * Routes use tickers (`/markets/company/KRKN`); records use ids ('kraken').
 */

import { useMemo } from 'react';
import type { Company } from '@deca/shared';
import { useLive } from './liveState';
import { liveStatus, type SnapshotStatus } from './useSnapshot';

export interface UseCompaniesResult extends SnapshotStatus {
  companies: Company[];
  byId: Record<string, Company>;
  byTicker: Record<string, Company>;
}

export function useCompanies(): UseCompaniesResult {
  const live = useLive();
  const { companies, byId, byTicker } = useMemo(() => {
    const sorted = [...live.companies].sort((a, b) => (a.ticker ?? '').localeCompare(b.ticker ?? '') || a.id.localeCompare(b.id));
    const ids: Record<string, Company> = {};
    const tickers: Record<string, Company> = {};
    for (const c of sorted) {
      ids[c.id] = c;
      if (c.ticker) tickers[c.ticker.toUpperCase()] = c;
    }
    return { companies: sorted, byId: ids, byTicker: tickers };
  }, [live.companies]);
  return { companies, byId, byTicker, ...liveStatus(live) };
}
