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
 *
 * One write lives here: `POST /api/intro/complete`, the crew's own "Meet the market" completion
 * (design §6). It takes no body — the crew is the token — and answers with the completion time.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireSession, requireStreamSession, requireTeam } from '../auth/middleware';
import { publishPortfolio, subscribe } from '../realtime/hub';
import {
  SNAPSHOT_NEWS,
  buildSnapshot,
  currentPhase,
  portfolioFor,
  publicCompanies,
  publicCompany,
  publicFundamentals,
  publicFund,
  publicFunds,
} from '../realtime/snapshot';
import { store } from '../store';
import { auditLog } from '../lib/logger';
import { HOST_ERRORS } from '../lib/hostCopy';
import { completeCrewIntro, CrewError } from '../services/crews';

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
const FUND_NOT_FOUND = { error: 'not_found', message: 'We could not find that fund.' };

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

  // ----- Funds ---------------------------------------------------------------------------------
  // A fund's price history is a `price_history` row like a company's, so the chart route is shared.
  app.get('/api/funds', { preHandler: requireSession }, async () => ({ funds: publicFunds(currentPhase()) }));

  app.get('/api/funds/:id', { preHandler: requireSession }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const fund = store.funds.get(id);
    if (!fund) return reply.code(404).send(FUND_NOT_FOUND);
    return { fund: publicFund(fund, currentPhase()) };
  });

  app.get('/api/funds/:id/history', { preHandler: requireSession }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!store.funds.get(id)) return reply.code(404).send(FUND_NOT_FOUND);
    const { from, to } = tickRange(req);
    return { fundId: id, from, to, points: store.history.range(id, from, to) };
  });

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

  /**
   * The crew finished the required-once "Meet the market" intro (design §6). The crew comes from
   * the token, so this can never complete another crew's intro, and there is no body to read.
   *
   * Idempotent: a replay from Learn, a second device or a retry answers with the same time.
   * The answer carries the completion time and nothing else — the intro's content is the public
   * market data every crew already reads.
   */
  app.post('/api/intro/complete', { preHandler: requireTeam }, async (req, reply) => {
    const teamId = req.user!.teamId!;
    let introCompletedAt: number;
    try {
      introCompletedAt = await completeCrewIntro(teamId);
    } catch (err) {
      if (err instanceof CrewError) return reply.code(404).send({ error: err.code, message: err.message });
      req.log.error(err);
      return reply.code(500).send({ error: 'internal', message: HOST_ERRORS.internal.message });
    }
    // The crew's other devices unlock the ticket without a reload.
    publishPortfolio(teamId);
    await auditLog('intro.complete', teamId, { introCompletedAt });
    return { ok: true, introCompletedAt };
  });
}
