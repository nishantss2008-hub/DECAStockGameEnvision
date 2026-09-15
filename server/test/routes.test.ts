/**
 * Route guards, validation and error mapping for the authority API (Task 5).
 * Pure: Firebase, the engine, the market service and the audit log are mocked, so
 * no emulator, network or service account is touched. The real auth middleware runs
 * against a fake `verifyIdToken`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';

const h = vi.hoisted(() => {
  const tokens: Record<string, Record<string, unknown>> = {
    'admin-token': { uid: 'admin', role: 'admin' },
    'team-token': { uid: 'saltwind', role: 'team', teamId: 'saltwind' },
  };
  const touched: string[] = [];
  const touch = (what: string) => () => {
    touched.push(what);
    throw new Error(`${what} must not be reached`);
  };
  return {
    tokens,
    touched,
    touch,
    engine: null as any,
    createMarket: null as any,
    executeOrder: null as any,
    auditLog: null as any,
    resetLeaderboardCache: null as any,
    gate: null as null | Promise<void>,
  };
});

vi.mock('../src/firebase', () => ({
  db: { doc: h.touch('db.doc'), collection: h.touch('db.collection'), runTransaction: h.touch('db.runTransaction') },
  adminAuth: {
    verifyIdToken: async (token: string) => {
      const claims = h.tokens[token];
      if (!claims) throw new Error('invalid token');
      return claims;
    },
  },
}));

vi.mock('../src/engine/loop', () => {
  class EngineError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'EngineError';
    }
  }
  const state = {
    phase: 'live',
    currentTick: 4,
    startingCapital: 100_000_000,
    currency: { name: 'Doubloons', symbol: 'Ð' },
  };
  h.engine = {
    state,
    stop: vi.fn(async () => {}),
    reload: vi.fn(async () => {
      state.phase = 'lobby';
    }),
    applySettings: vi.fn(async () => ({ ...state })),
    startGame: vi.fn(async () => {
      throw new EngineError('not_lobby', 'The game has already started. Start a new game to return to the lobby.');
    }),
    pauseGame: vi.fn(async () => {}),
    resumeGame: vi.fn(async () => {}),
    endGame: vi.fn(async () => {}),
    queueHostNews: vi.fn(async () => {}),
    getCompany: vi.fn((id: string) => (id === 'kraken' ? { id, ticker: 'KRKN', sharesOutstanding: 242_000_000 } : undefined)),
    adminMarket: vi.fn(() => [{ companyId: 'kraken', q: 0.4, quality: 0.7 }]),
    scheduledNews: vi.fn(() => [{ tick: 9, headline: 'Upcoming' }]),
    health: vi.fn(() => ({ ok: true, phase: state.phase, tick: 4, totalTicks: 720, serverTime: 1, lastTickAt: 1, ticksBehind: 0 })),
  };
  return { engine: h.engine, EngineError };
});

vi.mock('../src/services/market', () => {
  h.createMarket = vi.fn(async () => {
    if (h.gate) await h.gate;
    return { seed: 'TOP-SECRET-SEED', companies: 25, adminPasswordSet: false };
  });
  return { createMarket: h.createMarket };
});

vi.mock('../src/services/leaderboard', () => {
  h.resetLeaderboardCache = vi.fn();
  return { resetLeaderboardCache: h.resetLeaderboardCache };
});

vi.mock('../src/lib/logger', () => {
  h.auditLog = vi.fn(async () => {});
  return { auditLog: h.auditLog };
});

vi.mock('../src/services/trading', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/services/trading')>();
  h.executeOrder = vi.fn();
  return { ...real, executeOrder: h.executeOrder };
});

import { requireAdmin, requireTeam } from '../src/auth/middleware';
import { adminRoutes } from '../src/routes/admin';
import { orderRoutes } from '../src/routes/orders';
import { healthRoutes } from '../src/routes/health';
import { TradeError, tradeError, UNKNOWN_ORDER_ERROR_MESSAGE } from '../src/services/trading';

const ADMIN = { authorization: 'Bearer admin-token' };
const TEAM = { authorization: 'Bearer team-token' };

/** Every host route with a body that passes its schema, so only the guard can refuse it. */
const ADMIN_ROUTES: { method: 'GET' | 'POST' | 'DELETE'; url: string; payload?: Record<string, unknown> }[] = [
  { method: 'POST', url: '/admin/settings', payload: { feeBps: 5 } },
  { method: 'POST', url: '/admin/game/new', payload: { keepCrews: true } },
  { method: 'POST', url: '/admin/game/start' },
  { method: 'POST', url: '/admin/game/pause' },
  { method: 'POST', url: '/admin/game/resume' },
  { method: 'POST', url: '/admin/game/end' },
  { method: 'POST', url: '/admin/teams', payload: { name: 'Late Crew', password: 'pass' } },
  { method: 'POST', url: '/admin/teams/saltwind/password', payload: { password: 'abcd' } },
  { method: 'POST', url: '/admin/teams/saltwind/trading', payload: { enabled: false } },
  { method: 'DELETE', url: '/admin/teams/saltwind' },
  { method: 'GET', url: '/admin/teams' },
  { method: 'GET', url: '/admin/market' },
  { method: 'GET', url: '/admin/news/scheduled' },
  { method: 'POST', url: '/admin/news', payload: { companyIds: ['kraken'], type: 'earnings', magnitude: 0.1, headline: 'Beats' } },
  { method: 'GET', url: '/admin/logs' },
];

const routes: RouteOptions[] = [];
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.addHook('onRoute', (r) => {
    routes.push(r as RouteOptions);
  });
  await app.register(healthRoutes);
  await app.register(orderRoutes);
  await app.register(adminRoutes);
  await app.ready();
});

beforeEach(() => {
  vi.clearAllMocks();
  h.touched.length = 0;
  h.gate = null;
  h.engine.state.phase = 'live';
});

const hooks = (r: RouteOptions): unknown[] => [r.preHandler ?? []].flat();

describe('guards', () => {
  it('every /admin route is registered behind requireAdmin, and /orders behind requireTeam', () => {
    const admin = routes.filter((r) => r.url.startsWith('/admin'));
    // Every registered host route (Fastify adds HEAD for each GET) is one the behavioral test below covers.
    const registered = new Set(admin.filter((r) => r.method !== 'HEAD').map((r) => `${r.method} ${r.url}`));
    const covered = new Set(ADMIN_ROUTES.map((r) => `${r.method} ${r.url.replace(/^\/admin\/game\/(start|pause|resume|end)$/, '/admin/game/:action').replace('/saltwind', '/:id')}`));
    expect([...registered].sort()).toEqual([...covered].sort());
    for (const r of admin) expect(hooks(r), `${r.method} ${r.url}`).toContain(requireAdmin);
    const orders = routes.find((r) => r.url === '/orders')!;
    expect(hooks(orders)).toContain(requireTeam);
    const health = routes.find((r) => r.url === '/health')!;
    expect(hooks(health)).toHaveLength(0);
  });

  it('refuses every host route without an admin token and never reaches the engine, db or market', async () => {
    for (const headers of [{}, TEAM, { authorization: 'Bearer forged' }, { authorization: 'admin-token' }]) {
      for (const r of ADMIN_ROUTES) {
        const res = await app.inject({ ...r, headers });
        expect(res.statusCode, `${r.method} ${r.url}`).toBe(403);
        expect(res.json()).toEqual({ error: 'forbidden', message: 'Admin only' });
      }
    }
    expect(h.touched).toEqual([]);
    expect(h.createMarket).not.toHaveBeenCalled();
    for (const fn of ['applySettings', 'startGame', 'endGame', 'queueHostNews', 'adminMarket', 'scheduledNews', 'stop']) {
      expect(h.engine[fn], fn).not.toHaveBeenCalled();
    }
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('POST /orders needs a crew token (an admin token has no crew)', async () => {
    const body = { companyId: 'kraken', side: 'buy', quantity: 5, clientOrderId: 'order-12345' };
    expect((await app.inject({ method: 'POST', url: '/orders', payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/orders', payload: body, headers: ADMIN })).statusCode).toBe(401);
    expect(h.executeOrder).not.toHaveBeenCalled();
  });

  it('GET /health is public and carries no hidden market data', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(['lastTickAt', 'ok', 'phase', 'serverTime', 'tick', 'ticksBehind', 'totalTicks']);
  });
});

describe('POST /orders', () => {
  const body = { companyId: 'kraken', side: 'buy', quantity: 5, clientOrderId: 'order-12345', quotedPrice: 8_412 };
  const order = (payload: unknown) => app.inject({ method: 'POST', url: '/orders', headers: TEAM, payload: payload as object });

  it('fills for the crew in the token, never one named in the body', async () => {
    h.executeOrder.mockResolvedValueOnce({ id: 't1' });
    const res = await order({ ...body, teamId: 'someone-else' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ trade: { id: 't1' } });
    expect(h.executeOrder).toHaveBeenCalledWith(h.engine, 'saltwind', body);
  });

  it('maps TradeError to 400, price_moved to 409, and anything else to a 500 with COPY text', async () => {
    h.executeOrder.mockRejectedValueOnce(new TradeError('insufficient_funds', 'Not enough cash. …'));
    let res = await order(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'insufficient_funds', message: 'Not enough cash. …' });

    h.executeOrder.mockRejectedValueOnce(new TradeError('price_moved', 'Price moved. …'));
    res = await order(body);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('price_moved');

    h.executeOrder.mockRejectedValueOnce(new Error('DEADLINE_EXCEEDED: firestore internals'));
    res = await order(body);
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal', message: UNKNOWN_ORDER_ERROR_MESSAGE });
    expect(res.body).not.toContain('firestore');
  });

  it('rejects malformed orders with COPY wording before trading', async () => {
    const quantity = await order({ ...body, quantity: 1.5 });
    expect(quantity.statusCode).toBe(400);
    expect(quantity.json()).toEqual({ error: 'bad_quantity', message: tradeError('bad_quantity').message });
    expect((await order({ ...body, quantity: 0 })).json().error).toBe('bad_quantity');
    expect((await order({ ...body, quantity: '5' })).json().error).toBe('bad_quantity');

    const company = await order({ ...body, companyId: 'x'.repeat(65) });
    expect(company.json()).toEqual({ error: 'unknown_company', message: tradeError('unknown_company').message });

    for (const bad of [{ ...body, clientOrderId: '../../x' }, { ...body, side: 'short' }, { ...body, quotedPrice: -1 }, null]) {
      const res = await order(bad);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'bad_request', message: UNKNOWN_ORDER_ERROR_MESSAGE });
    }
    expect(h.executeOrder).not.toHaveBeenCalled();
  });
});

describe('host routes', () => {
  it('a new game never returns or logs the seed', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/game/new', headers: ADMIN, payload: { keepCrews: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, message: 'New game ready. The game is back in the lobby.', phase: 'lobby' });
    expect(res.body).not.toContain('TOP-SECRET-SEED');
    expect(JSON.stringify(h.auditLog.mock.calls)).not.toContain('TOP-SECRET-SEED');
    expect(h.createMarket).toHaveBeenCalledWith({ keepCrews: false });
    expect(h.engine.stop).toHaveBeenCalled();
    expect(h.resetLeaderboardCache).toHaveBeenCalled();
    expect(h.engine.reload).toHaveBeenCalled();
  });

  it('refuses every other host change while a new game is being built', async () => {
    let open!: () => void;
    h.gate = new Promise<void>((r) => (open = r));
    const building = app.inject({ method: 'POST', url: '/admin/game/new', headers: ADMIN, payload: { keepCrews: true } });
    await vi.waitFor(() => expect(h.createMarket).toHaveBeenCalled());

    const mutations = ADMIN_ROUTES.filter((r) => r.method !== 'GET');
    for (const r of mutations) {
      const res = await app.inject({ ...r, headers: ADMIN });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(409);
      expect(res.json().error).toBe('busy');
    }
    for (const fn of ['applySettings', 'startGame', 'pauseGame', 'resumeGame', 'endGame', 'queueHostNews']) {
      expect(h.engine[fn], fn).not.toHaveBeenCalled();
    }
    // Reads stay available.
    expect((await app.inject({ method: 'GET', url: '/admin/market', headers: ADMIN })).statusCode).toBe(200);

    open();
    expect((await building).statusCode).toBe(200);
    expect(h.createMarket).toHaveBeenCalledTimes(1);
    const after = await app.inject({ method: 'POST', url: '/admin/settings', headers: ADMIN, payload: { feeBps: 5 } });
    expect(after.statusCode).toBe(200);
  });

  it('maps engine errors: wrong phase 409 (settings use the COPY locked note), unknown company 400', async () => {
    h.engine.applySettings.mockRejectedValueOnce(new (await import('../src/engine/loop')).EngineError('not_lobby', 'x'));
    const locked = await app.inject({ method: 'POST', url: '/admin/settings', headers: ADMIN, payload: { feeBps: 5 } });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toEqual({ error: 'not_lobby', message: 'Locked while the game is running. You can change settings only in the lobby.' });

    const start = await app.inject({ method: 'POST', url: '/admin/game/start', headers: ADMIN });
    expect(start.statusCode).toBe(409);
    expect(start.json().error).toBe('not_lobby');

    const news = await app.inject({
      method: 'POST',
      url: '/admin/news',
      headers: ADMIN,
      payload: { companyIds: ['kraken', 'ghost'], type: 'earnings', magnitude: 0.1, headline: 'Beats' },
    });
    expect(news.statusCode).toBe(400);
    expect(news.json().error).toBe('unknown_company');
    expect(h.engine.queueHostNews).not.toHaveBeenCalled();

    expect((await app.inject({ method: 'POST', url: '/admin/game/launch', headers: ADMIN })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/admin/settings', headers: ADMIN, payload: { maxPositionPct: 0.3 } })).statusCode).toBe(400);
  });

  it('host market and schedule views are served only to the host', async () => {
    const market = await app.inject({ method: 'GET', url: '/admin/market', headers: ADMIN });
    expect(market.json()).toEqual({ rows: [{ companyId: 'kraken', q: 0.4, quality: 0.7 }] });
    const sched = await app.inject({ method: 'GET', url: '/admin/news/scheduled', headers: ADMIN });
    expect(sched.json()).toEqual({ events: [{ tick: 9, headline: 'Upcoming' }] });
  });
});
