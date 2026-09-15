/**
 * Every company (`companies`), sorted by ticker, indexed by id and by ticker.
 * Routes use tickers (`/markets/company/KRKN`); documents use ids ('kraken').
 */

import { useMemo } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import type { Company } from '@deca/shared';
import { db } from '../firebase';
import { useQuerySnapshot, type QuerySpec, type SnapshotStatus } from './useSnapshot';

export interface UseCompaniesResult extends SnapshotStatus {
  companies: Company[];
  byId: Record<string, Company>;
  byTicker: Record<string, Company>;
}

const COMPANIES: QuerySpec<Company> = {
  key: 'companies?orderBy=ticker:asc',
  build: () => query(collection(db, 'companies'), orderBy('ticker', 'asc')),
  map: (id, data) => ({ ...(data as Company), id: (data as Partial<Company>).id ?? id }),
};

export function useCompanies(): UseCompaniesResult {
  const { items: companies, loading, fromCache, error } = useQuerySnapshot(COMPANIES);
  const { byId, byTicker } = useMemo(() => {
    const ids: Record<string, Company> = {};
    const tickers: Record<string, Company> = {};
    for (const c of companies) {
      ids[c.id] = c;
      if (c.ticker) tickers[c.ticker.toUpperCase()] = c;
    }
    return { byId: ids, byTicker: tickers };
  }, [companies]);
  return { companies, byId, byTicker, loading, fromCache, error };
}
