/**
 * Login. A crew (or the host) signs in with a name and password; the server checks the scrypt hash
 * it stores — `crews.password_hash` for a crew, `meta.admin_password_hash` for the host — and
 * issues its own HS256 session token (auth/sessions.ts). There is no identity provider and no
 * account to create: the roster is the crews the host made.
 *
 * The answer is `{ token, role, teamId, expiresAt }`; the client keeps the token and sends it as
 * `Authorization: Bearer`. A wrong name and a wrong password give the same message, so the form
 * never reveals which crews exist.
 */

import type { FastifyInstance } from 'fastify';
import { loginSchema, slugifyTeamName, type Role } from '@deca/shared';
import { store } from '../store';
import { hostPasswordHash } from '../services/hostPassword';
import { currentTokenVersion, issueToken } from '../auth/sessions';
import { verifyPassword } from '../lib/password';
import { auditLog } from '../lib/logger';

const ADMIN_SLUG = 'admin';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid login' });
    }
    const slug = slugifyTeamName(parsed.data.name);
    if (!slug) return reply.code(400).send({ error: 'bad_name', message: 'Invalid name' });

    const isAdmin = slug === ADMIN_SLUG;
    const hash = isAdmin ? hostPasswordHash() : store.crews.passwordHash(slug);
    // Generic failure message — never reveal whether the crew exists.
    if (!hash || !verifyPassword(parsed.data.password, hash)) {
      return reply.code(401).send({ error: 'bad_login', message: 'Wrong crew name or password' });
    }

    const role: Role = isAdmin ? 'admin' : 'team';
    const teamId = isAdmin ? undefined : slug;
    const { token, expiresAt } = issueToken({ role, teamId, tokenVersion: currentTokenVersion(role, teamId) });
    await auditLog('auth.login', isAdmin ? 'admin' : slug, { role });
    return { token, role, teamId, expiresAt };
  });
}
