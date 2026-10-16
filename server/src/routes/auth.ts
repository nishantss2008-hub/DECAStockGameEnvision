/**
 * Sign-in. The HOST signs in at /auth/login with the name 'admin' and the host password (scrypt hash in
 * `meta.admin_password_hash`). Crews have no password sign-in: they join at /auth/join with the game code
 * and a crew name, plus the crew PIN when the crew already exists. Both answer `{ token, role, teamId?,
 * expiresAt }` — the server's own HS256 session token (auth/sessions.ts) — which the client sends as
 * `Authorization: Bearer`.
 */

import type { FastifyInstance } from 'fastify';
import { joinSchema, loginSchema, slugifyTeamName, type Role } from '@deca/shared';
import { store } from '../store';
import { hostPasswordHash } from '../services/hostPassword';
import { currentTokenVersion, issueToken } from '../auth/sessions';
import { verifyPassword } from '../lib/password';
import { auditLog } from '../lib/logger';
import { engine } from '../engine/loop';
import { CrewError, createCrew } from '../services/crews';
import {
  clearPinMisses,
  generateCrewPin,
  joinCodeMatches,
  pinLocked,
  recordPinMiss,
} from '../services/joinCode';

const ADMIN_SLUG = 'admin';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid login' });
    }
    const slug = slugifyTeamName(parsed.data.name);
    if (!slug) return reply.code(400).send({ error: 'bad_name', message: 'Invalid name' });

    // Host only. Crews get in with the game code (/auth/join) — there is no crew password sign-in.
    const hash = slug === ADMIN_SLUG ? hostPasswordHash() : null;
    if (!hash || !verifyPassword(parsed.data.password, hash)) {
      return reply.code(401).send({ error: 'bad_login', message: 'Wrong host password' });
    }

    const role: Role = 'admin';
    const { token, expiresAt } = issueToken({ role, tokenVersion: currentTokenVersion(role, undefined) });
    await auditLog('auth.login', 'admin', { role });
    return { token, role, expiresAt };
  });

  /**
   * Join with the game code. A new crew name creates the crew and answers with its 4-digit PIN (shown
   * once, for teammates). An existing crew name needs that PIN: without one the answer is 409
   * `needs_pin`, so the form can ask for it.
   */
  app.post('/auth/join', async (req, reply) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: 'Enter the game code and a crew name.' });
    }
    const { code, name, pin } = parsed.data;
    if (!store.game.get() || !joinCodeMatches(code)) {
      return reply.code(401).send({ error: 'bad_code', message: 'That game code is not right. Check the code on the board and try again.' });
    }
    if (engine.state.phase === 'ended') {
      return reply.code(409).send({ error: 'game_over', message: 'This game has ended. Ask your host for the next game code.' });
    }
    const slug = slugifyTeamName(name);
    if (!slug || slug === ADMIN_SLUG) {
      return reply.code(400).send({ error: 'bad_name', message: 'Pick a different crew name (letters and numbers).' });
    }

    let issuedPin: string | undefined;
    const hash = store.crews.passwordHash(slug);
    if (hash) {
      if (!pin) {
        return reply.code(409).send({ error: 'needs_pin', message: 'That crew already exists. Enter its 4-digit crew PIN from a teammate.' });
      }
      if (pinLocked(slug)) {
        return reply.code(429).send({ error: 'pin_locked', message: 'Too many wrong PINs for this crew. Wait a few minutes or ask your host.' });
      }
      if (!verifyPassword(pin, hash)) {
        recordPinMiss(slug);
        return reply.code(401).send({ error: 'bad_pin', message: 'That PIN is not right for this crew. Ask a teammate for it.' });
      }
      clearPinMisses(slug);
    } else {
      issuedPin = generateCrewPin();
      try {
        await createCrew(name, issuedPin, engine.state.startingCapital);
      } catch (err) {
        // Two phones racing to create the same crew: the loser joins like a teammate.
        if (err instanceof CrewError && err.code === 'exists') {
          return reply.code(409).send({ error: 'needs_pin', message: 'That crew already exists. Enter its 4-digit crew PIN from a teammate.' });
        }
        if (err instanceof CrewError) {
          return reply.code(400).send({ error: 'bad_name', message: 'Pick a different crew name (letters and numbers).' });
        }
        throw err;
      }
      await auditLog('team.join', slug, { name: name.trim() });
    }

    const { token, expiresAt } = issueToken({ role: 'team', teamId: slug, tokenVersion: currentTokenVersion('team', slug) });
    await auditLog('auth.login', slug, { role: 'team', via: 'code' });
    return { token, role: 'team' as Role, teamId: slug, expiresAt, ...(issuedPin ? { pin: issuedPin } : {}) };
  });
}
