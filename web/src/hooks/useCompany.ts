/**
 * Realtime subscription to a single company and its fundamentals.
 *
 * Subscribes to both `companies/{id}` and `companies/{id}/fundamentals/data`
 * and returns the typed Company + Fundamentals (each null while loading or if
 * absent). The loading flag flips to false once both documents have reported
 * their first snapshot. Re-subscribes when `id` changes.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Company, Fundamentals } from '@deca/shared';
import { db } from '../firebase';

export interface UseCompanyResult {
  company: Company | null;
  fundamentals: Fundamentals | null;
  loading: boolean;
}

export function useCompany(id: string | null | undefined): UseCompanyResult {
  const [company, setCompany] = useState<Company | null>(null);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCompany(null);
    setFundamentals(null);

    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let companyLoaded = false;
    let fundamentalsLoaded = false;
    const settle = () => {
      if (companyLoaded && fundamentalsLoaded) setLoading(false);
    };

    const companyRef = doc(db, 'companies', id);
    const unsubCompany = onSnapshot(
      companyRef,
      (snap) => {
        setCompany(snap.exists() ? (snap.data() as Company) : null);
        companyLoaded = true;
        settle();
      },
      () => {
        setCompany(null);
        companyLoaded = true;
        settle();
      },
    );

    const fundamentalsRef = doc(db, 'companies', id, 'fundamentals', 'data');
    const unsubFundamentals = onSnapshot(
      fundamentalsRef,
      (snap) => {
        setFundamentals(snap.exists() ? (snap.data() as Fundamentals) : null);
        fundamentalsLoaded = true;
        settle();
      },
      () => {
        setFundamentals(null);
        fundamentalsLoaded = true;
        settle();
      },
    );

    return () => {
      unsubCompany();
      unsubFundamentals();
    };
  }, [id]);

  return { company, fundamentals, loading };
}
