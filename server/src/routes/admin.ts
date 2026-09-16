/**
 * Host (admin) API (spec §8). Every route lives under `/api/admin/*`, requires an admin token, and
 * every mutation writes the audit log.
 *
 * The `/api` prefix is not decoration: `/admin/*` is the host console's own client-side URL space
 * (`/admin`, `/admin/crews`, `/admin/news`, …), so an API route there would answer a reload, a
 * deep link or a PWA launch with JSON instead of the app. src/index.ts keeps a 308 redirect from
 * the old paths for non-HTML requests.
 *
 * Status codes: 400 bad input · 404 unknown crew · 409 not allowed in the
 * current phase (EngineError), name taken, or a new game is being built · 500 unexpected.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createTeamSchema,
  fireNewsSchema,
  introToggleSchema,
  newGameSchema,
  resetPasswordSchema,
  settingsSchema,
  tradingToggleSchema,
} from '@deca/shared';
import type { ZodError } from 'zod';
import { requireAdmin } from '../auth/middleware';
import { publishPortfolio, publishSnapshot } from '../realtime/hub';
import { store } from '../store';
import { engine, EngineError } from '../engine/loop';
import { HOST_ERRORS } from '../lib/hostCopy';
import { auditLog } from '../lib/logger';
import { createMarket } from '../services/market';
import { resetLeaderboardCache } from '../services/leaderboard';
import { CrewError, createCrew, removeCrew, resetCrewPassword, setCrewIntro, setCrewTrading } from '../services/crews';
import { haltTrading, resumeTrading } from '../services/trading';

/** COPY.md §11 host-settings wording. */
const SETTINGS_LOCKED = 'Locked while the game is running. You can change settings only in the lobby.';
const SETTINGS_SAVED = 'Settings saved.';
const NEW_GAME_DONE = 'New game ready. The game is back in the lobby.';
/** COPY.md §11.1 host-errors wording. */
const INTERNAL = HOST_ERRORS.internal.message;
const BUSY = HOST_ERRORS.busy.message;
const BAD_REQUEST = HOST_ERRORS.bad_request.message;

/** Rows one tape read returns, and its ceiling. */
const TAPE_LIMIT = 100;
const TAPE_MAX = 500;

/** `?limit=`, clamped, so one call can never ask for the whole trade table. */
export function tapeLimit(req: FastifyRequest, fallback = TAPE_LIMIT): number {
  const raw = Number((req.query as { limit?: unknown } | undefined)?.limit);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(TAPE_MAX, Math.max(1, Math.floor(raw)));
}

const GAME_ACTIONS = ['start', 'pause', 'resume', 'end'] as const;
type GameAction = (typeof GAME_ACTIONS)[number];

function actor(req: FastifyRequest): string {
  return req.user?.uid ?? 'admin';
}

/** A body that fails its schema. The host console validates fields first, so this is the plain COPY fallback. */
function badRequest(req: FastifyRequest, reply: FastifyReply, error: ZodError): FastifyReply {
  req.log.warn({ issues: error.issues.map((i) => ({ path: i.path, code: i.code })) }, 'host request failed validation');
  return reply.code(400).send({ error: 'bad_request', message: BAD_REQUEST });
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

/**
 * Crew changes that write outside the engine queue (add a crew, reset a password, switch trading) and were
 * already running when a new game began. The new game waits for them before it clears anything: otherwise a
 * crew added a moment before "New game" without keeping crews could be written after the crews were deleted.
 * (Engine actions and crew removals run in the engine queue, which `engine.stop()` settles.)
 */
const crewChanges = new Set<Promise<unknown>>();

function trackCrewChange<T>(change: Promise<T>): Promise<T> {
  crewChanges.add(change);
  const done = (): void => void crewChanges.delete(change);
  change.then(done, done);
  return change;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // ----- Settings (lobby only) -----------------------------------------------------------------
  app.post('/api/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(req, reply, parsed.error);
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
  app.post('/api/admin/game/new', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = newGameSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(req, reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    newGameInProgress = true;
    const { keepCrews } = parsed.data;
    try {
      // Crew changes already running finish first. No order may fill while the data is cleared: halt trading
      // and wait for queued order writes, then wait for queued engine work (including crew removals) to settle.
      await Promise.allSettled([...crewChanges]);
      await haltTrading();
      await engine.stop();
      await createMarket({ keepCrews });
      resetLeaderboardCache();
      await engine.reload();
      await auditLog('game.new', actor(req), { keepCrews });
      // Every company, price, holding and news item is new, and no tick has fired yet: hand every
      // connected phone the new world at once, so crews land in the fresh lobby without reconnecting.
      publishSnapshot();
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
  app.post('/api/admin/game/:action', { preHandler: requireAdmin }, async (req, reply) => {
    const action = (req.params as { action: string }).action as GameAction;
    if (!GAME_ACTIONS.includes(action)) {
      return reply.code(400).send({ error: 'bad_action', message: BAD_REQUEST });
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
  app.post('/api/admin/teams', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(req, reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      const team = await trackCrewChange(createCrew(parsed.data.name, parsed.data.password, engine.state.startingCapital));
      await auditLog('team.create', actor(req), { teamId: team.id, name: team.name });
      return { team };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  app.post('/api/admin/teams/:id/password', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(req, reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      await trackCrewChange(resetCrewPassword(id, parsed.data.password));
      await auditLog('team.password_reset', actor(req), { teamId: id });
      return { ok: true };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  app.post('/api/admin/teams/:id/trading', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = tradingToggleSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(req, reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    try {
      await trackCrewChange(setCrewTrading(id, parsed.data.enabled));
      await auditLog('team.trading', actor(req), { teamId: id, enabled: parsed.data.enabled });
      return { ok: true, enabled: parsed.data.enabled };
    } catch (err) {
      return crewFailure(req, reply, err);
    }
  });

  /**
   * The "Meet the market" intro gate (design §6). `{ completed: true }` marks the crew done —
   * a phone that died mid-flow, or a late arrival the host walked through in person, must not
   * cost a crew its competition. `{ completed: false }` sends the crew back through it.
   * The crews listing (`GET /api/admin/teams`) carries `introCompletedAt` for every crew.
   */
  app.post('/api/admin/teams/:id/intro', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = introToggleSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(req, reply, parsed.error);
    if (newGameInProgress) return busy(reply);
    let introCompletedAt: number | null;
    try {
      introCompletedAt = await trackCrewChange(setCrewIntro(id, parsed.data.completed));
    } catch (err) {
      return crewFailure(req, reply, err);
    }
    // The crew's own screens unlock (or lock) without a reload.
    publishPortfolio(id);
    await auditLog('team.intro', actor(req), { teamId: id, completed: parsed.data.completed });
    return { ok: true, introCompletedAt };
  });

  app.delete('/api/admin/teams/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (newGameInProgress) return busy(reply);
    try {
      // In the engine queue: no tick or standings recompute runs alongside (one could write the crew's history
      // and stats back), a new game waits for it, and the standings refresh right after so the remaining ranks
      // renumber at once. A failed refresh is only logged: the crew is gone and the next tick recomputes anyway.
      await engine.runCrewRemoval(
        () => removeCrew(id),
        (refreshErr) => req.log.error(refreshErr),
      );
    } catch (err) {
      return crewFailure(req, reply, err);
    }
    await auditLog('team.remove', actor(req), { teamId: id });
    return { ok: true };
  });

  app.get('/api/admin/teams', { preHandler: requireAdmin }, async () => ({ teams: store.crews.all() }));

  // ----- Market and news (host only: carries hidden quality and the schedule) ------------------
  app.get('/api/admin/market', { preHandler: requireAdmin }, async () => ({ rows: engine.adminMarket() }));

  app.get('/api/admin/news/scheduled', { preHandler: requireAdmin }, async () => ({ events: engine.scheduledNews() }));

  app.post('/api/admin/news', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = fireNewsSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(req, reply, parsed.error);
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

  // ----- Reads across every crew (host only: a crew may never see another crew's rows) ---------
  /** Recent fills across all crews, newest first — the host Tape screen. */
  app.get('/api/admin/trades', { preHandler: requireAdmin }, async (req) => ({
    trades: store.trades.recent(tapeLimit(req)),
  }));

  /** One crew's holdings — the host Crews screen. 404 when the crew is gone. */
  app.get('/api/admin/teams/:id/holdings', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!store.crews.get(id)) {
      return reply.code(404).send({ error: 'not_found', message: HOST_ERRORS.not_found.message });
    }
    return { teamId: id, holdings: store.holdings.forCrew(id) };
  });

  // ----- Audit log (server-only table; admins read it through here) --------------------------
  app.get('/api/admin/logs', { preHandler: requireAdmin }, async () => ({ logs: store.audit.recent(200) }));
}
