/**
 * Read API and the live stream. Everything a phone shows comes from here: one `bootstrap` to paint
 * the app, `/api/stream` to keep it live, and range reads for the charts and lists that go further
 * back than a snapshot carries.
 *
 * Every route needs a session, and every payload is filtered server-side (realtime/snapshot.ts):
 *   - hidden company data (`reveal`: q, qEff, surprise, quality, grade, pillars, fairValue) is
 *     stripped until `phase === 'ended'`; the seed, the secrets table and the news schedule have no
 *     route at all outside `/admin/*`;
 *   - a crew's own rows (crew, holdings, history, trades, orders) come from the token's `teamId`,
 *     never from a query or body, so one crew cannot read another's.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireSession, requireStreamSession, requireTeam } from '../auth/middleware';
import { subscribe } from '../realtime/hub';
import {
  SNAPSHOT_NEWS,
  buildSnapshot,
  currentPhase,
  portfolioFor,
  publicCompanies,
  publicCompany,
  publicFundamentals,
} from '../realtime/snapshot';
import { store } from '../store';

/** Most points one range read returns (a 30-minute game is at most 360 ticks). */
const MAX_POINTS = 2000;
/** Most rows one list read returns. */
const MAX_LIMIT = 200;

function intParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** `?from&to` as an inclusive, bounded tick range. */
function tickRange(req: FastifyRequest): { from: number; to: number } {
  const q = (req.query ?? {}) as { from?: unknown; to?: unknown };
  const from = Math.max(0, intParam(q.from, 0));
  const to = Math.max(from, intParam(q.to, from + MAX_POINTS));
  return { from, to: Math.min(to, from + MAX_POINTS) };
}

/** `?limit`, clamped. */
function limitParam(req: FastifyRequest, fallback: number): number {
  const q = (req.query ?? {}) as { limit?: unknown };
  return Math.min(MAX_LIMIT, Math.max(1, intParam(q.limit, fallback)));
}

const NOT_FOUND = { error: 'not_found', message: 'We could not find that company.' };

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  // ----- Live stream ---------------------------------------------------------------------------
  // EventSource cannot set headers, so this guard (and only this one) also accepts `?token=`.
  app.get('/api/stream', { preHandler: requireStreamSession }, (req, reply) => {
    subscribe(reply, { role: req.user!.role, teamId: req.user!.teamId });
    return reply; // hijacked: the socket stays open until the client leaves
  });

  // ----- Everything at once --------------------------------------------------------------------
  app.get('/api/bootstrap', { preHandler: requireSession }, async (req) =>
    buildSnapshot({ role: req.user!.role, teamId: req.user!.teamId }),
  );

  // ----- Companies -----------------------------------------------------------------------------
  app.get('/api/companies', { preHandler: requireSession }, async () => ({ companies: publicCompanies(currentPhase()) }));

  app.get('/api/companies/:id', { preHandler: requireSession }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const company = store.companies.get(id);
    if (!company) return reply.code(404).send(NOT_FOUND);
    return {
      company: publicCompany(company, currentPhase()),
      fundamentals: store.fundamentals.get(id),
      news: store.news.forCompany(id, SNAPSHOT_NEWS),
    };
  });

  app.get('/api/fundamentals', { preHandler: requireSession }, async () => ({ fundamentals: publicFundamentals() }));

  app.get('/api/companies/:id/history', { preHandler: requireSession }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!store.companies.get(id)) return reply.code(404).send(NOT_FOUND);
    const { from, to } = tickRange(req);
    return { companyId: id, from, to, points: store.history.range(id, from, to) };
  });

  // ----- Market and news -----------------------------------------------------------------------
  app.get('/api/market', { preHandler: requireSession }, async () => ({ market: store.market.get() }));

  app.get('/api/market/history', { preHandler: requireSession }, async (req) => {
    const { from, to } = tickRange(req);
    return { from, to, points: store.market.historyRange(from, to) };
  });

  app.get('/api/news', { preHandler: requireSession }, async (req) => ({
    news: store.news.recent(limitParam(req, SNAPSHOT_NEWS)),
  }));

  app.get('/api/standings', { preHandler: requireSession }, async () => ({ leaderboard: store.leaderboard.get() }));

  // ----- The crew's own rows (crew token only; the id comes from the token) ---------------------
  app.get('/api/portfolio', { preHandler: requireTeam }, async (req) => portfolioFor(req.user!.teamId!));

  app.get('/api/portfolio/history', { preHandler: requireTeam }, async (req) => {
    const { from, to } = tickRange(req);
    return { from, to, points: store.crewHistory.range(req.user!.teamId!, from, to) };
  });

  app.get('/api/trades', { preHandler: requireTeam }, async (req) => ({
    trades: store.trades.forCrew(req.user!.teamId!, limitParam(req, 50)),
  }));

  app.get('/api/orders', { preHandler: requireTeam }, async (req) => ({
    orders: store.orders.forCrew(req.user!.teamId!, limitParam(req, 50)),
  }));
}
