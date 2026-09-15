/**
 * Auth gating decisions (pure): crews go to the tabs, hosts to /admin, signed-out visitors to /login?next=.
 */
import type { Role } from '@deca/shared';

export type Area = 'crew' | 'host' | 'login';
export type Gate = { kind: 'loading' } | { kind: 'allow' } | { kind: 'redirect'; to: string };

export interface AuthSnapshot {
  loading: boolean;
  signedIn: boolean;
  role: Role | null;
}

export interface LocationParts {
  pathname: string;
  search: string;
  hash: string;
}

export function homeFor(role: Role | null): string {
  if (role === 'team') return '/portfolio';
  if (role === 'admin') return '/admin';
  return '/login';
}

const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/') || p.startsWith('/admin?') || p.startsWith('/admin#');

/** A same-origin path the role may open after signing in, or null. */
export function safeNext(next: string | null, role: Role | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return null;
  if (role === 'team' && isAdminPath(next)) return null;
  if (role === 'admin' && !isAdminPath(next)) return null;
  if (role === null) return null;
  return next;
}

function loginWithNext(loc: LocationParts): string {
  const target = `${loc.pathname}${loc.search}${loc.hash}`;
  const isHome = target === '/portfolio' || target === '/admin' || target === '/';
  return isHome ? '/login' : `/login?next=${encodeURIComponent(target)}`;
}

export function gateFor(area: Area, auth: AuthSnapshot, loc: LocationParts): Gate {
  if (auth.loading) return { kind: 'loading' };
  if (area === 'login') {
    if (!auth.signedIn || auth.role === null) return { kind: 'allow' };
    const next = safeNext(new URLSearchParams(loc.search).get('next'), auth.role);
    return { kind: 'redirect', to: next ?? homeFor(auth.role) };
  }
  if (!auth.signedIn) return { kind: 'redirect', to: loginWithNext(loc) };
  if (auth.role === null) return { kind: 'redirect', to: '/login' };
  const wanted: Role = area === 'host' ? 'admin' : 'team';
  if (auth.role !== wanted) return { kind: 'redirect', to: homeFor(auth.role) };
  return { kind: 'allow' };
}
