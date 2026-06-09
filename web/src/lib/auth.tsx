/**
 * Authentication context.
 *
 * Wraps Firebase Auth email/password. Teams log in with a TEAM NAME (mapped to
 * a slug email under the team domain); the admin logs in with a fixed admin
 * email. Custom claims (role/teamId) are read from the ID token result.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { TEAM_EMAIL_DOMAIN, slugifyTeamName, type Role } from '@deca/shared';
import { auth } from '../firebase';

/** Fixed credential identity for the game administrator. */
export const ADMIN_EMAIL = `admin@${TEAM_EMAIL_DOMAIN}`;

/**
 * Team name -> login email local-part. MUST match the server's slug exactly
 * (it creates the auth user + teamId), so we use the single canonical helper
 * from @deca/shared.  "Anne's Revenge" -> "anne-s-revenge"
 */
export const slugify = slugifyTeamName;

/** Map a team name to its full Firebase Auth email. */
export function teamEmail(name: string): string {
  return `${slugify(name)}@${TEAM_EMAIL_DOMAIN}`;
}

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  teamId: string | null;
  loading: boolean;
  login: (teamName: string, password: string) => Promise<void>;
  loginAdmin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setRole(null);
        setTeamId(null);
        setLoading(false);
        return;
      }
      try {
        // Force-refresh so freshly minted custom claims are picked up.
        const result = await nextUser.getIdTokenResult(true);
        const claims = result.claims as { role?: Role; teamId?: string };
        setUser(nextUser);
        setRole((claims.role as Role) ?? null);
        setTeamId(claims.teamId ?? null);
      } catch {
        setUser(nextUser);
        setRole(null);
        setTeamId(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function login(teamName: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, teamEmail(teamName), password);
  }

  async function loginAdmin(password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  }

  async function logout(): Promise<void> {
    await signOut(auth);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, role, teamId, loading, login, loginAdmin, logout }),
    [user, role, teamId, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
