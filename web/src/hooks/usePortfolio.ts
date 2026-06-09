/**
 * Realtime subscription to the current team's portfolio: the `teams/{teamId}`
 * document plus its `teams/{teamId}/holdings` subcollection.
 *
 * The team id comes from useAuth(). For an admin (or any signed-in user with no
 * teamId) this returns nulls/empties and is never loading. Re-subscribes when
 * the authenticated teamId changes.
 */

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import type { Holding, Team } from '@deca/shared';
import { db } from '../firebase';
import { useAuth } from '../lib/auth';

export interface UsePortfolioResult {
  team: Team | null;
  holdings: Holding[];
  loading: boolean;
}

export function usePortfolio(): UsePortfolioResult {
  const { teamId } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTeam(null);
    setHoldings([]);

    if (!teamId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let teamLoaded = false;
    let holdingsLoaded = false;
    const settle = () => {
      if (teamLoaded && holdingsLoaded) setLoading(false);
    };

    const teamRef = doc(db, 'teams', teamId);
    const unsubTeam = onSnapshot(
      teamRef,
      (snap) => {
        setTeam(snap.exists() ? (snap.data() as Team) : null);
        teamLoaded = true;
        settle();
      },
      () => {
        setTeam(null);
        teamLoaded = true;
        settle();
      },
    );

    const holdingsRef = collection(db, 'teams', teamId, 'holdings');
    const unsubHoldings = onSnapshot(
      holdingsRef,
      (snap) => {
        setHoldings(snap.docs.map((d) => d.data() as Holding));
        holdingsLoaded = true;
        settle();
      },
      () => {
        setHoldings([]);
        holdingsLoaded = true;
        settle();
      },
    );

    return () => {
      unsubTeam();
      unsubHoldings();
    };
  }, [teamId]);

  return { team, holdings, loading };
}
