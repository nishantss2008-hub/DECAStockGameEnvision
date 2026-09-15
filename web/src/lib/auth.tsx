/**
 * Authentication context.
 *
 * Crews and the host sign in with a name and password. The authority service checks the
 * password and returns a Firebase custom token whose claims carry `role` and `teamId`;
 * the client exchanges it with signInWithCustomToken. Failed sign-ins throw
 * `ApiRequestError` (`bad_login`, `bad_request`, `network`, …) so the sign-in screen can
 * show the matching COPY text.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { slugifyTeamName, type Role } from '@deca/shared';
import { auth } from '../firebase';
import { apiUrl, fetchOrNetworkError, parseApiResponse } from './api';
import { clearSnapshotCache } from './snapshotCache';

/** Name the server treats as the host account. */
const ADMIN_LOGIN_NAME = 'admin';

/** Exchanges a name + password for a Firebase custom token. */
async function fetchLoginToken(name: string, password: string): Promise<string> {
  const res = await fetchOrNetworkError(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await parseApiResponse<{ token: string }>(res);
  return data.token;
}

/**
 * Team name → login slug. MUST match the server exactly (it creates the auth user and
 * teamId), so it is the single canonical helper from @deca/shared.
 *   "Anne's Revenge" → "anne-s-revenge"
 */
export const slugify = slugifyTeamName;

export interface AuthContextValue {
  user: User | null;
  role: Role | null;
  teamId: string | null;
  loading: boolean;
  login: (teamName: string, password: string) => Promise<void>;
  loginAdmin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function login(teamName: string, password: string): Promise<void> {
  await signInWithCustomToken(auth, await fetchLoginToken(teamName, password));
}

async function loginAdmin(password: string): Promise<void> {
  await signInWithCustomToken(auth, await fetchLoginToken(ADMIN_LOGIN_NAME, password));
}

async function logout(): Promise<void> {
  await signOut(auth);
}

interface AuthState {
  user: User | null;
  role: Role | null;
  teamId: string | null;
  loading: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, teamId: null, loading: true });

  useEffect(() => {
    let active = true;
    let latest = 0;
    let lastUid: string | null | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const call = ++latest;
      const uid = nextUser?.uid ?? null;
      // Sign-out or a different account on a shared device: forget the previous crew's data.
      if (lastUid !== undefined && lastUid !== uid) clearSnapshotCache();
      lastUid = uid;
      if (!nextUser) {
        setState({ user: null, role: null, teamId: null, loading: false });
        return;
      }
      let role: Role | null = null;
      let teamId: string | null = null;
      // Force-refresh so freshly minted custom claims are picked up. When that fails (offline
      // reload, flaky Wi-Fi) the cached token still carries the claims the server minted into the
      // custom token; only when neither can be read is the user signed in without a role.
      const result = await nextUser.getIdTokenResult(true).catch(() => nextUser.getIdTokenResult().catch(() => null));
      if (result) {
        const claims = (result.claims ?? {}) as { role?: unknown; teamId?: unknown };
        role = claims.role === 'team' || claims.role === 'admin' ? claims.role : null;
        teamId = typeof claims.teamId === 'string' ? claims.teamId : null;
      }
      // Ignore a slow claims read that a newer auth change has overtaken.
      if (active && call === latest) setState({ user: nextUser, role, teamId, loading: false });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ ...state, login, loginAdmin, logout }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>.');
  return ctx;
}
