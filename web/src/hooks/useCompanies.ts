/**
 * Realtime subscription to the full `companies` collection.
 *
 * Returns every Company sorted by ticker (ascending), plus a loading flag that
 * flips to false after the first snapshot resolves.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { Company } from '@deca/shared';
import { db } from '../firebase';

export interface UseCompaniesResult {
  companies: Company[];
  loading: boolean;
}

export function useCompanies(): UseCompaniesResult {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'companies'), orderBy('ticker', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCompanies(snap.docs.map((d) => d.data() as Company));
        setLoading(false);
      },
      () => {
        setCompanies([]);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { companies, loading };
}
