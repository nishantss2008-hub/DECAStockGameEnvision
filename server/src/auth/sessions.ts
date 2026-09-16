/**
 * Server-issued sessions: HS256 JWTs signed with a secret this process owns.
 *
 * There is no identity provider any more. `/auth/login` checks the scrypt hash in the store and
 * calls `issueToken`; every guarded route calls `verifyToken`. A token carries the role, the crew
 * id and the crew's `token_version`, so bumping that version (password reset, removal) invalidates
 * every token already handed out — an instant sign-out, without any server-side session table.
 *
 * The secret lives in `meta.session_secret` and is generated on first use, so restarts keep every
 * signed-in phone signed in, and a fresh database starts with a secret nobody can guess.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from '@deca/shared';
import { store } from '../store';
import { randomToken } from '../lib/secret';
import { config } from '../config';
import { adminTokenVersion } from '../services/hostPassword';

/** Sessions last one long school day; a crew signs in once per game. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const SECRET_KEY = 'session_secret';

export interface SessionSubject {
  role: Role;
  teamId?: string;
  tokenVersion: number;
}

interface JwtPayload {
  role: Role;
  teamId?: string;
  tv: number;
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

let cachedSecret: string | null = null;

/**
 * The HMAC secret: `SESSION_SECRET` when the deployment sets one (several processes, or a redeploy
 * onto fresh storage, then share sessions), otherwise `meta.session_secret`, generated and stored
 * the first time it is needed.
 */
export function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (config.sessionSecret) {
    cachedSecret = config.sessionSecret;
    return cachedSecret;
  }
  const existing = store.meta.get(SECRET_KEY);
  if (existing) {
    cachedSecret = existing;
    return existing;
  }
  // 48 bytes of entropy; the value never leaves the server.
  const generated = randomToken(48);
  store.meta.set(SECRET_KEY, generated);
  cachedSecret = generated;
  return generated;
}

/** Tests (and `openStore` swaps) start from a clean cache. */
export function resetSessionSecretCache(): void {
  cachedSecret = null;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Current token version for a crew, or null when there is no such crew — a removed crew's token
 * stops verifying the moment the row is gone.
 */
export function crewTokenVersion(teamId: string): number | null {
  return store.crews.tokenVersion(teamId);
}

/** The version a freshly issued token should carry for this subject. */
export function currentTokenVersion(role: Role, teamId?: string): number {
  if (role === 'admin' || !teamId) return adminTokenVersion();
  return crewTokenVersion(teamId) ?? 0;
}

/** Mints a 12-hour HS256 token. `expiresAt` is epoch ms, for the client's own countdown. */
export function issueToken(subject: SessionSubject): { token: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const payload: JwtPayload = {
    role: subject.role,
    ...(subject.teamId ? { teamId: subject.teamId } : {}),
    tv: subject.tokenVersion,
    iat: Math.floor(now / 1000),
    exp: Math.floor(expiresAt / 1000),
  };
  const body = `${HEADER}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return { token: `${body}.${sign(body, sessionSecret())}`, expiresAt: payload.exp * 1000 };
}

function signatureMatches(body: string, signature: string): boolean {
  const expected = Buffer.from(sign(body, sessionSecret()), 'base64url');
  const actual = Buffer.from(signature, 'base64url');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Verifies signature, expiry and the subject's current token version. Returns null for anything
 * that does not check out — the caller answers 401/403 and never learns why.
 */
export function verifyToken(token: string, now: number = Date.now()): SessionSubject | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];
  if (header !== HEADER || !signature) return null;
  if (!signatureMatches(`${header}.${body}`, signature)) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
  if (payload.role !== 'admin' && payload.role !== 'team') return null;
  if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= now) return null;

  if (payload.role === 'team') {
    if (typeof payload.teamId !== 'string' || !payload.teamId) return null;
    const version = crewTokenVersion(payload.teamId);
    // No crew (removed) or a bumped version (password reset): the token is dead.
    if (version === null || version !== payload.tv) return null;
    return { role: 'team', teamId: payload.teamId, tokenVersion: payload.tv };
  }
  if (adminTokenVersion() !== payload.tv) return null;
  return { role: 'admin', tokenVersion: payload.tv };
}
