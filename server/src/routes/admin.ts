/**
 * Host (admin) API (spec §8). Every route requires an admin token, and every
 * mutation writes the audit log.
 *
 * Status codes: 400 bad input · 404 unknown crew · 409 not allowed in the
 * current phase (EngineError), name taken, or a new game is being built · 500 unexpected.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createTeamSchema,
  fireNewsSchema,
  newGameSchema,
  resetPasswordSchema,
  settingsSchema,
  tradingToggleSchema,
} from '@deca/shared';
import type { ZodError } from 'zod';
import { requireAdmin } from '../auth/middleware';
import { db } from '../firebase';
import { engine, EngineError } from '../engine/loop';
import { auditLog } from '../lib/logger';
import { createMarket } from '../services/market';
import { resetLeaderboardCache } from '../services/leaderboard';
import { CrewError, createCrew, removeCrew, resetCrewPassword, setCrewTrading } from '../services/crews';
import { haltTrading, resumeTrading } from '../services/trading';

/** COPY.md §11 host-settings wording. */
const SETTINGS_LOCKED = 'Locked while the game is running. You can change settings only in the lobby.';
const SETTINGS_SAVED = 'Settings saved.';
const NEW_GAME_DONE = 'New game ready. The game is back in the lobby.';
const INTERNAL = 'Something went wrong on the server. Try again; if it keeps failing, check the server logs.';
const BUSY = 'A new game is being prepared. Wait a moment, then try again.';

const GAME_ACTIONS = ['start', 'pause', 'resume', 'end'] as const;
type GameAction = (typeof GAME_ACTIONS)[number];

function actor(req: FastifyRequest): string {
  return req.user?.uid ?? 'admin';
}

function badRequest(reply: FastifyReply, error: ZodError): FastifyReply {
  return reply.code(400).send({ error: 'bad_request', message: error.issues[0]?.message ?? 'Invalid request' });
}

/** EngineError → 400 (unknown company) or 409 (wrong phase); anything else → 500. */
function engineFailure(
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  messages: Record<string, string> = {},
): FastifyReply {
  if (err instanceof EngineError) {
    const status = err.code === 'unknown_company' ? 400 : 409;
    return reply.code(status).send({ error: err.code, message: messages[err.code] ?? err.message });
  }
  req.log.error(err);
  return reply.code(500).send({ error: 'internal', message: INTERNAL });
}

function crewFailure(req: FastifyRequest, reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof CrewError) {
    const status = err.code === 'exists' ? 409 : err.code === 'not_found' ? 404 : 400;
    return reply.code(status).send({ error: err.code, message: err.message });
  }
  req.log.error(err);
  return reply.code(500).send({ error: 'internal', message: INTERNAL });
}

/**
 * One new-game rebuild at a time. While it runs, every other host mutation is refused
 * (409 busy): the engine is stopped but still holds the old market in memory, so a
 * start, settings change, crew change or host news would write into data that is
 * being deleted and rewritten (or be silently overwritten by it).
 */
let newGameInProgress = false;

function busy(reply: FastifyReply): FastifyReply {
  return reply.code(409).send({ error: 'busy', message: BUSY });
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // ----- Settings (lobby only) -----------------------------------------------------------------
  app.post('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      const state = await engine.applySettings(parsed.data);
      await auditLog('settings.update', actor(req), parsed.data);
      return { ok: true, message: SETTINGS_SAVED, state };
    } catch (err) {
      return engineFailure(req, reply, err, { not_lobby: SETTINGS_LOCKED });
    }
  });

  // ----- New game: regenerate the market, clear dynamic data, reload the engine -----------------
  // Registered before /admin/game/:action; find-my-way matches the static path first either way.
  app.post('/admin/game/new', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = newGameSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    newGameInProgress = true;
    const { keepCrews } = parsed.data;
    try {
      // No order may fill while the data is cleared: halt trading and wait for queued order writes,
      // then wait for queued engine work to settle.
      await haltTrading();
      await engine.stop();
      await createMarket({ keepCrews });
      resetLeaderboardCache();
      await engine.reload();
      await auditLog('game.new', actor(req), { keepCrews });
      // Never return the seed.
      return { ok: true, message: NEW_GAME_DONE, phase: engine.state.phase };
    } catch (err) {
      req.log.error(err);
      // Bring the engine back on whatever is stored rather than leaving it stopped.
      try {
        resetLeaderboardCache();
        await engine.reload();
      } catch (reloadErr) {
        req.log.error(reloadErr);
      }
      await auditLog('game.new_failed', actor(req), { keepCrews, error: String(err) });
      return reply.code(500).send({ error: 'internal', message: INTERNAL });
    } finally {
      resumeTrading();
      newGameInProgress = false;
    }
  });

  // ----- Game control: start | pause | resume | end -------------------------------------------
  app.post('/admin/game/:action', { preHandler: requireAdmin }, async (req, reply) => {
    const action = (req.params as { action: string }).action as GameAction;
    if (!GAME_ACTIONS.includes(action)) {
      return reply.code(400).send({ error: 'bad_action', message: 'Unknown game action' });
    }
    if (newGameInProgress) return busy(reply);
    try {
      if (action === 'start') await engine.startGame();
      else if (action === 'pause') await engine.pauseGame();
      else if (action === 'resume') await engine.resumeGame();
      else await engine.endGame();
    } catch (err) {
      return engineFailure(req, reply, err);
    }
    await auditLog(`game.${action}`, actor(req), { tick: engine.state.currentTick });
    return { ok: true, phase: engine.state.phase, tick: engine.state.currentTick };
  });

  // ----- Crews --------------------------------------------------------------------------------
  app.post('/admin/teams', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      const team = await createCrew(parsed.data.name, parsed.data.password, engine.state.startingCapital);
      await auditLog('team.create', actor(req), { teamId: team.id, name: team.name });
      return { team };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  app.post('/admin/teams/:id/password', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      await resetCrewPassword(id, parsed.data.password);
      await auditLog('team.password_reset', actor(req), { teamId: id });
      return { ok: true };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  app.post('/admin/teams/:id/trading', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = tradingToggleSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      await setCrewTrading(id, parsed.data.enabled);
      await auditLog('team.trading', actor(req), { teamId: id, enabled: parsed.data.enabled });
      return { ok: true, enabled: parsed.data.enabled };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  app.delete('/admin/teams/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (newGameInProgress) return busy(reply);
    try {
      await removeCrew(id);
      // The leaderboard keeps per-crew value series in memory; a crew re-created with this name must start fresh.
      resetLeaderboardCache();
      await auditLog('team.remove', actor(req), { teamId: id });
      return { ok: true };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  app.get('/admin/teams', { preHandler: requireAdmin }, async () => {
    const snap = await db.collection('teams').get();
    return { teams: snap.docs.map((d) => d.data()) };
  });

  // ----- Market and news (host only: carries hidden quality and the schedule) ------------------
  app.get('/admin/market', { preHandler: requireAdmin }, async () => ({ rows: engine.adminMarket() }));

  app.get('/admin/news/scheduled', { preHandler: requireAdmin }, async () => ({ events: engine.scheduledNews() }));

  app.post('/admin/news', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = fireNewsSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    const unknown = parsed.data.companyIds.filter((id) => !engine.getCompany(id));
    if (unknown.length > 0) {
      return reply
        .code(400)
        .send({ error: 'unknown_company', message: `We couldn't find these companies: ${unknown.join(', ')}.` });
    }
    try {
      await engine.queueHostNews(parsed.data);
    } catch (err) {
      return engineFailure(req, reply, err);
    }
    await auditLog('news.queue', actor(req), {
      companyIds: parsed.data.companyIds,
      type: parsed.data.type,
      magnitude: parsed.data.magnitude,
      headline: parsed.data.headline,
    });
    return { ok: true, tick: engine.state.currentTick };
  });

  // ----- Audit log (server-only collection; admins read it through here) ----------------------
  app.get('/admin/logs', { preHandler: requireAdmin }, async () => {
    const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(200).get();
    return { logs: snap.docs.map((d) => d.data()) };
  });
}
