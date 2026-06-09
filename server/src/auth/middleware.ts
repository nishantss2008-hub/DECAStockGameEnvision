/**
 * Fastify auth guards. Verify the Firebase ID token on the Authorization header
 * and enforce role/team custom claims. These run as preHandlers on protected
 * routes; the authority service trusts ONLY verified tokens.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@deca/shared';
import { adminAuth } from '../firebase';

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

async function verify(req: FastifyRequest): Promise<AuthedUser | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    return {
      uid: decoded.uid,
      role: (decoded.role as Role) ?? 'team',
      teamId: typeof decoded.teamId === 'string' ? decoded.teamId : undefined,
    };
  } catch {
    return null;
  }
}

/** Requires a valid team login (token with a teamId claim). */
export async function requireTeam(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await verify(req);
  if (!user || !user.teamId) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Team login required' });
    return;
  }
  req.user = user;
}

/** Requires an admin/host login (token with role === 'admin'). */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await verify(req);
  if (!user || user.role !== 'admin') {
    await reply.code(403).send({ error: 'forbidden', message: 'Admin only' });
    return;
  }
  req.user = user;
}
