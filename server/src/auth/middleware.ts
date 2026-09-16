/**
 * Fastify auth guards. They verify the server's own Bearer JWT (auth/sessions.ts) and enforce the
 * role and crew id it carries. These run as preHandlers on protected routes; the authority service
 * trusts ONLY a verified token, never a body or query field naming a crew.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@deca/shared';
import { verifyToken } from './sessions';

export interface AuthedUser {
  uid: string;
  role: Role;
  teamId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

/**
 * The token on a request: `Authorization: Bearer <jwt>`, or `?token=` for EventSource-style
 * clients that cannot set headers (the stream route only — see routes/api.ts).
 */
export function bearerToken(req: FastifyRequest, allowQuery = false): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim() || null;
  if (allowQuery) {
    const q = (req.query as { token?: unknown } | undefined)?.token;
    if (typeof q === 'string' && q) return q;
  }
  return null;
}

/** The verified user on a request, or null. */
export function authenticate(req: FastifyRequest, allowQuery = false): AuthedUser | null {
  const token = bearerToken(req, allowQuery);
  if (!token) return null;
  const subject = verifyToken(token);
  if (!subject) return null;
  return {
    uid: subject.role === 'admin' ? 'admin' : (subject.teamId as string),
    role: subject.role,
    teamId: subject.teamId,
  };
}

const UNAUTHORIZED = { error: 'unauthorized', message: 'Sign in again to continue.' };

/** Requires a valid crew login (a token with a teamId). */
export async function requireTeam(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = authenticate(req);
  if (!user || !user.teamId) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Team login required' });
    return;
  }
  req.user = user;
}

/** Requires a host login (a token with role === 'admin'). */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = authenticate(req);
  if (!user || user.role !== 'admin') {
    await reply.code(403).send({ error: 'forbidden', message: 'Admin only' });
    return;
  }
  req.user = user;
}

/**
 * Requires any valid session (crew or host). Read endpoints use this and then filter by
 * `req.user`: a crew sees only its own rows, and never a hidden field before the reveal.
 */
export async function requireSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = authenticate(req);
  if (!user) {
    await reply.code(401).send(UNAUTHORIZED);
    return;
  }
  req.user = user;
}

/**
 * The stream's guard. Same as requireSession, but it also accepts `?token=`: EventSource cannot
 * set an Authorization header, so the query form is the fallback for clients that use it. No other
 * route takes a token from the URL, where it would end up in access logs and browser history.
 */
export async function requireStreamSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = authenticate(req, true);
  if (!user) {
    await reply.code(401).send(UNAUTHORIZED);
    return;
  }
  req.user = user;
}
