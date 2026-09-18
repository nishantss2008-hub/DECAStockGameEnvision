/**
 * useWelcome(): has this crew answered the Welcome sheet on this device? (MOBILE §7.2)
 *
 * Replaces `useWalkthrough` (deleted 2026-09-18 with the 3-step card). One boolean and one setter is
 * everything the shell ever asked that hook for: the 3-step machinery — step, next/back, show, undo —
 * had no caller left once the card went.
 *
 * The provider lives in AppShell, keyed by teamId, so a different crew signing in on the same device
 * reads its own answer rather than inheriting the last crew's.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localStore } from './storage';
import { markWelcomeSeen, migrateWelcomeSeen, readWelcomeSeen } from './welcomeSeen';

export interface WelcomeApi {
  /** First sign-in on this device: the Welcome sheet has not been answered yet. */
  pending: boolean;
  /** Any dismissal counts as an answer, so the sheet never opens by itself again. */
  markSeen: () => void;
}

const Ctx = createContext<WelcomeApi | null>(null);

export function WelcomeProvider({ teamId, children }: { teamId: string | null; children: ReactNode }) {
  // No crew yet (signed out, or still loading): nothing to welcome, so nothing is pending.
  const [seen, setSeen] = useState(() => (teamId ? readWelcomeSeen(localStore(), teamId) : true));

  // Clean up the walkthrough's `bx.walkthrough.{teamId}` once, off the render path.
  useEffect(() => {
    if (teamId) migrateWelcomeSeen(localStore(), teamId);
  }, [teamId]);

  const markSeen = useCallback(() => {
    setSeen(true);
    if (teamId) markWelcomeSeen(localStore(), teamId);
  }, [teamId]);

  const value = useMemo<WelcomeApi>(() => ({ pending: !seen, markSeen }), [seen, markSeen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK: WelcomeApi = { pending: false, markSeen: () => {} };

/** Outside the provider (a sheet rendered on its own in a test) nothing is pending. */
export function useWelcome(): WelcomeApi {
  return useContext(Ctx) ?? FALLBACK;
}
