/**
 * Every company's research profile at once, keyed by company id, for sector averages and the
 * All companies views (Value, Health, Analysts).
 *
 * One read, not a listener: fundamentals are fixed for a market, so all mounted instances share
 * a single load for the page session. Pass `game.marketCreatedAt` as `marketKey` to reload after
 * the host creates a new market (or call invalidateAllFundamentals()).
 *
 * Reads `collectionGroup('fundamentals')` (documents at `companies/{id}/fundamentals/data`). When
 * security rules do not allow collection-group reads, it falls back to listing `companies` and
 * reading each profile document.
 */

import { useEffect, useState } from 'react';
import { collection, collectionGroup, doc, getDoc, getDocs, type FirestoreError } from 'firebase/firestore';
import type { Fundamentals } from '@deca/shared';
import { db } from '../firebase';

export interface UseAllFundamentalsResult {
  byId: Record<string, Fundamentals>;
  loading: boolean;
  error: string | null;
}

type ById = Record<string, Fundamentals>;

interface Load {
  key: number | null;
  promise: Promise<ById>;
  result?: ById;
}

let current: Load | null = null;

/** Drops the shared result so the next mount or market change reads again. */
export function invalidateAllFundamentals(): void {
  current = null;
}

const codeOf = (err: unknown): string => {
  const code = (err as Partial<FirestoreError> | null)?.code;
  return typeof code === 'string' ? code : err instanceof Error && err.message ? err.message : 'unknown';
};

async function readAll(): Promise<ById> {
  try {
    const snap = await getDocs(collectionGroup(db, 'fundamentals'));
    const byId: ById = {};
    for (const d of snap.docs) {
      // companies/{companyId}/fundamentals/data
      const segments = d.ref.path.split('/');
      if (segments.length === 4 && segments[0] === 'companies' && segments[2] === 'fundamentals') {
        byId[segments[1]!] = d.data() as Fundamentals;
      }
    }
    return byId;
  } catch (err) {
    if (codeOf(err) !== 'permission-denied') throw err;
  }
  const companies = await getDocs(collection(db, 'companies'));
  const ids = companies.docs.map((d) => d.id);
  const docs = await Promise.all(ids.map((id) => getDoc(doc(db, 'companies', id, 'fundamentals', 'data'))));
  const byId: ById = {};
  docs.forEach((snap, i) => {
    if (snap.exists()) byId[ids[i]!] = snap.data() as Fundamentals;
  });
  return byId;
}

function loadFor(key: number | null): Load {
  if (current && current.key === key) return current;
  const load: Load = { key, promise: readAll() };
  load.promise.then(
    (result) => {
      load.result = result;
    },
    () => {
      if (current === load) current = null; // let the next mount retry
    },
  );
  current = load;
  return load;
}

interface State {
  key: number | null;
  byId: ById;
  error: string | null;
}

const EMPTY: ById = {};

export function useAllFundamentals(marketKey?: number | null): UseAllFundamentalsResult {
  const key = marketKey ?? null;
  const [state, setState] = useState<State | null>(() => {
    const ready = current && current.key === key ? current.result : undefined;
    return ready ? { key, byId: ready, error: null } : null;
  });

  useEffect(() => {
    let active = true;
    const load = loadFor(key);
    if (load.result) {
      setState((prev) => (prev?.key === key && prev.byId === load.result ? prev : { key, byId: load.result!, error: null }));
      return undefined;
    }
    load.promise.then(
      (byId) => {
        if (active) setState({ key, byId, error: null });
      },
      (err: unknown) => {
        if (active) setState({ key, byId: EMPTY, error: codeOf(err) });
      },
    );
    return () => {
      active = false;
    };
  }, [key]);

  if (state?.key === key) return { byId: state.byId, loading: false, error: state.error };
  return { byId: EMPTY, loading: true, error: null };
}
