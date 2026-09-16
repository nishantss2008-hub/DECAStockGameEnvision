/**
 * Markets search (MOBILE §7.6, iPhoneSearch): while the field is focused and empty, "Recent"
 * instruments; while typing, ticker or name prefix matches; no match → COPY §12 empty.search.
 * Recents are per crew in localStorage.
 *
 * Search covers FUNDS and companies in one ranked list (spec 2026-09-16 §3): a crew that types
 * "fleet" or "s" must find the basket as readily as the company.
 */
import { useCallback, useState } from 'react';
import type { Instrument } from '@deca/shared';
import { X } from 'lucide-react';
import { EmptyState } from '../ios/EmptyState';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { fill } from '../../shell/copy';
import { InstrumentStockRow } from './MarketSections';
import { MARKETS } from './marketCopy';
import { parseRecents, pushRecent, recentsKey, removeRecent, searchInstruments } from './marketsView';

function read(key: string): string[] {
  try {
    return parseRecents(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function write(key: string, list: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* private mode: recents last for this visit only */
  }
}

export function useRecents(teamId: string | null) {
  const key = recentsKey(teamId);
  const [state, setState] = useState<{ key: string; list: string[] }>(() => ({ key, list: read(key) }));
  const list = state.key === key ? state.list : read(key);
  const update = useCallback(
    (next: (prev: string[]) => string[]) => {
      setState((prev) => {
        const value = next(prev.key === key ? prev.list : read(key));
        write(key, value);
        return { key, list: value };
      });
    },
    [key],
  );
  return {
    list,
    push: useCallback((ticker: string) => update((l) => pushRecent(l, ticker)), [update]),
    remove: useCallback((ticker: string) => update((l) => removeRecent(l, ticker)), [update]),
  };
}

export function searchAnnouncement(query: string, count: number): string {
  if (!query.trim()) return '';
  return count === 1 ? MARKETS.oneResult : fill(MARKETS.results, { n: count });
}

export interface SearchPanelProps {
  query: string;
  /** Funds and companies together — search does not care which is which. */
  instruments: readonly Instrument[];
  byTicker: Record<string, Instrument>;
  recents: ReturnType<typeof useRecents>;
}

export function SearchPanel({ query, instruments, byTicker, recents }: SearchPanelProps) {
  const q = query.trim();
  if (!q) {
    const recent = recents.list.map((t) => byTicker[t]).filter((c): c is Instrument => Boolean(c));
    if (recent.length === 0) return null;
    return (
      <InsetGroupedList header={MARKETS.recent} className="bx-section bx-recents">
        {recent.map((c) => (
          <li key={c.id} className="ios-row-item bx-recent">
            <ul role="list" className="bx-recent__row">
              <InstrumentStockRow instrument={c} onClick={() => recents.push(c.ticker)} />
            </ul>
            <button type="button" className="bx-recent__remove" aria-label={fill(MARKETS.removeRecent, { ticker: c.ticker })} onClick={() => recents.remove(c.ticker)}>
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        ))}
      </InsetGroupedList>
    );
  }
  const results = searchInstruments(instruments, q);
  if (results.length === 0) {
    return <EmptyState title={fill(MARKETS.searchEmpty.title, { query: q })} body={MARKETS.searchEmpty.body} className="bx-section" />;
  }
  return (
    <InsetGroupedList aria-label={searchAnnouncement(q, results.length)} className="bx-section">
      {results.map((c) => (
        <InstrumentStockRow key={c.id} instrument={c} onClick={() => recents.push(c.ticker)} />
      ))}
    </InsetGroupedList>
  );
}
