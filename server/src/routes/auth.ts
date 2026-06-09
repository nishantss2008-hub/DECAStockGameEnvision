/**
 * Custom-token login. Teams/admin authenticate with a name + password; the server
 * verifies a hashed password stored in the server-only `_auth` collection and
 * mints a Firebase CUSTOM TOKEN (signed locally with the service account — no
 * Firebase user accounts, no email/password provider). The client exchanges it via
 * signInWithCustomToken, and the developer claims (role/teamId) flow into the ID
 * token so the existing Firestore rules + auth middleware keep working unchanged.
 */

import type { FastifyInstance } from 'fastify';
import { loginSchema, slugifyTeamName } from '@deca/shared';
import { adminAuth, db } from '../firebase';
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
    const snap = await db.doc(isAdmin ? '_auth/_admin' : `_auth/${slug}`).get();
    const data = snap.data() as { passwordHash?: string } | undefined;
    // Generic failure message — never reveal whether the crew exists.
    if (!data?.passwordHash || !verifyPassword(parsed.data.password, data.passwordHash)) {
      return reply.code(401).send({ error: 'bad_login', message: 'Wrong crew name or password' });
    }

    const uid = isAdmin ? 'admin' : slug;
    const claims = isAdmin ? { role: 'admin' } : { role: 'team', teamId: slug };
    const token = await adminAuth.createCustomToken(uid, claims);
    await auditLog('auth.login', uid, { role: claims.role });
    return { token };
  });
}
