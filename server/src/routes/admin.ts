import type { FastifyInstance } from 'fastify';
import {
  createTeamSchema,
  fireNewsSchema,
  setConfigSchema,
  slugifyTeamName,
  STARTING_CAPITAL,
  TEAM_EMAIL_DOMAIN,
  CURRENCY,
} from '@deca/shared';
import { requireAdmin } from '../auth/middleware';
import { adminAuth, db } from '../firebase';
import { engine } from '../engine/loop';
import { auditLog } from '../lib/logger';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Create a team: Firebase Auth user + claims + team doc seeded with starting capital.
  app.post('/admin/teams', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', message: parsed.error.issues[0]?.message });
    const { name, password } = parsed.data;
    const slug = slugifyTeamName(name);
    if (!slug) return reply.code(400).send({ error: 'bad_name', message: 'Invalid team name' });
    const email = `${slug}@${TEAM_EMAIL_DOMAIN}`;
    try {
      const user = await adminAuth.createUser({ email, password, displayName: name });
      await adminAuth.setCustomUserClaims(user.uid, { role: 'team', teamId: slug });
      await db.doc(`teams/${slug}`).set({
        id: slug,
        name,
        cashBalance: STARTING_CAPITAL,
        totalValue: STARTING_CAPITAL,
        rank: 0,
      });
      await auditLog('team.create', 'admin', { teamId: slug, name });
      return { team: { id: slug, name, email } };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        return reply.code(409).send({ error: 'exists', message: 'A team with that name already exists' });
      }
      app.log.error(err);
      return reply.code(500).send({ error: 'internal', message: 'Could not create team' });
    }
  });

  // Game control: start | pause | resume | end.
  app.post('/admin/game/:action', { preHandler: requireAdmin }, async (req, reply) => {
    const action = (req.params as { action: string }).action;
    switch (action) {
      case 'start':
        await engine.startGame();
        break;
      case 'pause':
        await engine.pauseGame();
        break;
      case 'resume':
        await engine.resumeGame();
        break;
      case 'end':
        await engine.endGame();
        break;
      default:
        return reply.code(400).send({ error: 'bad_action', message: 'Unknown game action' });
    }
    return { ok: true, phase: engine.phase, tick: engine.currentTick };
  });

  // Fire a host-triggered news event (applies next tick).
  app.post('/admin/news', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = fireNewsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', message: parsed.error.issues[0]?.message });
    await engine.fireManualNews(parsed.data);
    return { ok: true };
  });

  // Update lobby config (currency, starting capital) before the game starts.
  app.post('/admin/config', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = setConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', message: parsed.error.issues[0]?.message });
    const update: Record<string, unknown> = {};
    if (parsed.data.currencyName || parsed.data.currencySymbol) {
      update.currency = {
        name: parsed.data.currencyName ?? CURRENCY.name,
        symbol: parsed.data.currencySymbol ?? CURRENCY.symbol,
      };
    }
    if (parsed.data.startingCapital) update.startingCapital = parsed.data.startingCapital;
    await db.doc('game/state').set(update, { merge: true });
    await auditLog('config.set', 'admin', parsed.data);
    return { ok: true };
  });

  // Read the audit log (server-only collection; admins read it through here).
  app.get('/admin/logs', { preHandler: requireAdmin }, async () => {
    const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(200).get();
    return { logs: snap.docs.map((d) => d.data()) };
  });

  // List teams (admins can read all).
  app.get('/admin/teams', { preHandler: requireAdmin }, async () => {
    const snap = await db.collection('teams').get();
    return { teams: snap.docs.map((d) => d.data()) };
  });
}
