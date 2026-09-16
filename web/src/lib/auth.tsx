/**
 * Authentication context.
 *
 * Crews and the host sign in with a name and password. The server checks the scrypt hash it stores
 * and answers `{ token, role, teamId, expiresAt }` — its own HS256 session token, not an identity
 * provider's. The token is kept in `localStorage` under `bx.session`, sent as `Authorization:
 * Bearer` on every request and on the live stream, and dropped on sign-out or on any 401 (a
 * password reset or a removed crew bumps the server's token version, so a revoked phone signs out
 * the moment it touches the server).
 *
 * Failed sign-ins throw `ApiRequestError` (`bad_login`, `bad_request`, `network`, …) so the sign-in
 * screen can show the matching COPY text. `useAuth()` keeps the shape every screen already uses.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { slugifyTeamName, type Role } from '@deca/shared';
import {
  apiUrl,
  clearSession,
  fetchOrNetworkError,
  onSessionChange,
  parseApiResponse,
  readSession,
  saveSession,
  type Session,
} from './api';
import { startLive, stopLive } from './live';
import { clearSnapshotCache } from './snapshotCache';

/** Name the server treats as the host account. */
const ADMIN_LOGIN_NAME = 'admin';

/**
 * Team name → login slug. MUST match the server exactly (it is the crew's id and the `teamId` in
 * the token), so it is the single canonical helper from @deca/shared.
 *   "Anne's Revenge" → "anne-s-revenge"
 */
export const slugify = slugifyTeamName;

/**
 * The signed-in account, as the screens use it: a truthy value means "signed in". `uid` is the
 * crew id (the host's is 'admin'), so a shared device can tell one account from the next.
 */
export interface SessionUser {
  uid: string;
  role: Role;
  teamId: string | null;
  expiresAt: number;
}

export interface AuthContextValue {
  user: SessionUser | null;
  role: Role | null;
  teamId: string | null;
  loading: boolean;
  login: (teamName: string, password: string) => Promise<void>;
  loginAdmin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function userFromSession(session: Session | null): SessionUser | null {
  if (!session) return null;
  return {
    uid: session.teamId ?? ADMIN_LOGIN_NAME,
    role: session.role,
    teamId: session.teamId,
    expiresAt: session.expiresAt,
  };
}

/** Exchanges a name + password for a server session token. */
async function requestSession(name: string, password: string): Promise<Session> {
  const res = await fetchOrNetworkError(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await parseApiResponse<{ token: string; role: Role; teamId?: string; expiresAt: number }>(res);
  return {
    token: data.token,
    role: data.role,
    teamId: typeof data.teamId === 'string' && data.teamId ? data.teamId : null,
    expiresAt: data.expiresAt,
  };
}

async function signIn(name: string, password: string): Promise<void> {
  const session = await requestSession(name, password);
  // A different crew on a shared phone must not inherit the last one's numbers.
  clearSnapshotCache();
  saveSession(session);
  startLive();
}

async function login(teamName: string, password: string): Promise<void> {
  await signIn(teamName, password);
}

async function loginAdmin(password: string): Promise<void> {
  await signIn(ADMIN_LOGIN_NAME, password);
}

async function logout(): Promise<void> {
  clearSession();
  stopLive();
  clearSnapshotCache();
}

interface AuthState {
  user: SessionUser | null;
  role: Role | null;
  teamId: string | null;
  loading: boolean;
}

function stateFor(session: Session | null, loading = false): AuthState {
  const user = userFromSession(session);
  return { user, role: user?.role ?? null, teamId: user?.teamId ?? null, loading };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, teamId: null, loading: true });

  useEffect(() => {
    let active = true;
    let lastUid: string | null | undefined;

    const settle = (session: Session | null): void => {
      if (!active) return;
      const next = stateFor(session);
      // Sign-out or a different account on a shared device: forget the previous crew's data.
      if (lastUid !== undefined && lastUid !== next.user?.uid) clearSnapshotCache();
      lastUid = next.user?.uid ?? null;
      setState(next);
    };

    // Restore a stored session on load, and follow every later sign-in, sign-out or 401.
    const restored = readSession();
    settle(restored);
    if (restored) startLive();
    const unsubscribe = onSessionChange((session) => {
      settle(session);
      if (!session) stopLive();
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
