/**
 * Funds, and "whatever the crew picked" (spec 2026-09-16 §1–§2).
 *
 * `useCompanies` stays exactly what it was — a list of companies — because most of the app only
 * ever means companies: sector groups, fundamentals, news, the research score. The screens that
 * price, trade, search or list ANY tradeable thing use `useInstruments` instead and narrow with
 * `isFund` where the two differ.
 *
 * Routes use tickers (`/markets/company/FLEET`); records use ids ('grand-fleet'), so both indexes
 * are built once here and shared by every caller.
 */

import { useMemo } from 'react';
import type { Fund, Instrument } from '@deca/shared';
import { useLive } from './liveState';
import { liveStatus, type SnapshotStatus } from './useSnapshot';
import { useCompanies } from './useCompanies';

export interface UseFundsResult extends SnapshotStatus {
  /** Server order: the broad fund first, then the sector funds. */
  funds: Fund[];
  byId: Record<string, Fund>;
  byTicker: Record<string, Fund>;
}

export function useFunds(): UseFundsResult {
  const live = useLive();
  const { funds, byId, byTicker } = useMemo(() => {
    const ids: Record<string, Fund> = {};
    const tickers: Record<string, Fund> = {};
    for (const f of live.funds) {
      ids[f.id] = f;
      if (f.ticker) tickers[f.ticker.toUpperCase()] = f;
    }
    return { funds: live.funds, byId: ids, byTicker: tickers };
  }, [live.funds]);
  return { funds, byId, byTicker, ...liveStatus(live) };
}

export interface UseInstrumentsResult extends SnapshotStatus {
  /** Funds first, then companies by ticker — the Markets order (spec §4). */
  instruments: Instrument[];
  companies: Instrument[];
  funds: Fund[];
  byId: Record<string, Instrument>;
  byTicker: Record<string, Instrument>;
}

/** Every tradeable thing: the three funds followed by the roster. */
export function useInstruments(): UseInstrumentsResult {
  const companies = useCompanies();
  const funds = useFunds();
  return useMemo(() => {
    const instruments: Instrument[] = [...funds.funds, ...companies.companies];
    const byId: Record<string, Instrument> = { ...companies.byId, ...funds.byId };
    const byTicker: Record<string, Instrument> = { ...companies.byTicker, ...funds.byTicker };
    return {
      instruments,
      companies: companies.companies,
      funds: funds.funds,
      byId,
      byTicker,
      loading: companies.loading || funds.loading,
      fromCache: companies.fromCache,
      error: companies.error ?? funds.error,
    };
  }, [companies, funds]);
}
