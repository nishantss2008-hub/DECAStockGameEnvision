/**
 * The HTTP surface, end to end through `fastify.inject` against a real `:memory:` store: who may
 * call each endpoint, what a crew is allowed to see, and what the server must never hand out.
 *
 * Only the engine (and the two services it drags in) is mocked — the store, the guards, the session
 * tokens, the trading path and the crew service are all the real thing.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { openStore, useStore, type Store } from '../src/store';
import { currentTokenVersion, issueToken, resetSessionSecretCache } from '../src/auth/sessions';
import { CREW_A, CREW_B, GALE, KRKN, PASSWORD_A, gameState, seedWorld } from './helpers/apiFixtures';
import { hashPassword } from '../src/lib/password';

// ---------------------------------------------------------------------------
// Mocks: the engine (and the services it pulls in) — never the store or the auth.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  phase: 'live' as string,
  startingCapital: 1_000_000,
  released: 0,
  createMarket: null as unknown as ReturnType<typeof vi.fn>,
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
    get phase() {
      return h.phase;
    },
    currentTick: 12,
    get startingCapital() {
      return h.startingCapital;
    },
    feeBps: 10,
    maxPositionPct: 1,
    tickIntervalMs: 5000,
    startAt: Date.now() - 60_000,
    currency: { name: 'Doubloon', symbol: '⌬' },
  };
  const engine = {
    state,
    health: () => ({
      ok: true,
      phase: h.phase,
      tick: 12,
      totalTicks: 360,
      serverTime: Date.now(),
      lastTickAt: Date.now(),
      ticksBehind: 0,
    }),
    getCompany: (id: string) =>
      id === KRKN_ID ? { id: KRKN_ID, ticker: 'KRKN', sharesOutstanding: 1_000_000, adv: 10_000 } : undefined,
    getPrice: () => 1000,
    reserveFlow: () => ({
      fillPrice: 1000,
      lastPrice: 1000,
      impactBps: 2,
      tick: 12,
      release: () => {
        h.released += 1;
      },
    }),
    adminMarket: () => [{ companyId: KRKN_ID, quality: 0.42, q: 0.31, grade: 'A', fairValue: 12_345 }],
    scheduledNews: () => [{ tick: 20, companyIds: [KRKN_ID], headline: 'Later', fired: false, source: 'scheduled' }],
    applySettings: async () => state,
    startGame: async () => undefined,
    pauseGame: async () => undefined,
    resumeGame: async () => undefined,
    endGame: async () => undefined,
    queueHostNews: async () => undefined,
    runCrewRemoval: async (fn: () => Promise<void>) => fn(),
    refreshStandings: async () => undefined,
    reload: async () => undefined,
    stop: async () => undefined,
    load: async () => undefined,
  };
  return { engine, EngineError, GameEngine: class {} };
});

vi.mock('../src/services/market', () => {
  h.createMarket = vi.fn(async () => undefined);
  return { createMarket: h.createMarket, clearDynamicData: vi.fn(), ADMIN_PASSWORD_KEY: 'admin_password_hash' };
});

vi.mock('../src/services/leaderboard', () => ({
  resetLeaderboardCache: vi.fn(),
  recomputeLeaderboard: vi.fn(),
  finalizeLeaderboard: vi.fn(),
}));

const KRKN_ID = 'krkn';

const { buildServer, registerWeb } = await import('../src/index');
const { closeAll } = await import('../src/realtime/hub');

// ---------------------------------------------------------------------------

let store: Store;
let app: FastifyInstance;
let crewA: string;
let crewB: string;
let host: string;

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
const body = <T>(res: { body: string }): T => JSON.parse(res.body) as T;

/** Every read endpoint a signed-in client may call, and who may call it. */
const CREW_OR_HOST = [
  '/api/bootstrap',
  '/api/companies',
  `/api/companies/${KRKN}`,
  `/api/companies/${KRKN}/history?from=0&to=12`,
  '/api/fundamentals',
  '/api/market',
  '/api/market/history?from=0&to=12',
  '/api/news?limit=5',
  '/api/standings',
  '/api/stream',
];
const CREW_ONLY = ['/api/portfolio', '/api/portfolio/history?from=0&to=12', '/api/trades', '/api/orders'];
const ADMIN_GETS = ['/admin/teams', '/admin/market', '/admin/news/scheduled', '/admin/logs'];

beforeEach(async () => {
  h.phase = 'live';
  h.startingCapital = 1_000_000;
  h.released = 0;
  store = openStore(':memory:');
  useStore(store);
  resetSessionSecretCache();
  seedWorld(store);
  store.meta.set('admin_password_hash', hashPassword('host-password-1'));
  app = await buildServer({ logger: false });
  await app.ready();
  crewA = issueToken({ role: 'team', teamId: CREW_A, tokenVersion: currentTokenVersion('team', CREW_A) }).token;
  crewB = issueToken({ role: 'team', teamId: CREW_B, tokenVersion: currentTokenVersion('team', CREW_B) }).token;
  host = issueToken({ role: 'admin', tokenVersion: currentTokenVersion('admin') }).token;
});

afterEach(async () => {
  closeAll();
  await app.close();
  useStore(null);
  store.close();
  resetSessionSecretCache();
});

describe('every endpoint needs a session', () => {
  it.each([...CREW_OR_HOST, ...CREW_ONLY])('%s refuses an anonymous request', async (url) => {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });

  it.each([...CREW_OR_HOST, ...CREW_ONLY])('%s refuses a forged token', async (url) => {
    const res = await app.inject({ method: 'GET', url, headers: auth('not.a.token') });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a token whose crew has been removed mid-session', async () => {
    store.crews.remove(CREW_A);
    expect((await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(crewA) })).statusCode).toBe(401);
  });

  it('keeps a token out of the query string everywhere but the stream', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/bootstrap?token=${crewA}` })).statusCode).toBe(401);
  });

  it('answers /health without one (it is the deploy probe)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(body<{ ok: boolean; connections: number }>(res)).toMatchObject({ ok: true, connections: 0 });
  });
});

describe('role separation', () => {
  it.each(CREW_ONLY)('%s is for crews, not the host', async (url) => {
    expect((await app.inject({ method: 'GET', url, headers: auth(host) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url, headers: auth(crewA) })).statusCode).toBe(200);
  });

  it.each(ADMIN_GETS)('%s is host-only', async (url) => {
    expect((await app.inject({ method: 'GET', url, headers: auth(crewA) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url, headers: auth(host) })).statusCode).toBe(200);
  });

  it.each([
    ['POST', '/admin/settings'],
    ['POST', '/admin/game/start'],
    ['POST', '/admin/game/new'],
    ['POST', '/admin/teams'],
    ['POST', `/admin/teams/${CREW_A}/password`],
    ['POST', `/admin/teams/${CREW_A}/trading`],
    ['DELETE', `/admin/teams/${CREW_A}`],
    ['POST', '/admin/news'],
  ])('%s %s refuses a crew token', async (method, url) => {
    const res = await app.inject({ method: method as 'POST', url, headers: auth(crewA), payload: {} });
    expect(res.statusCode).toBe(403);
  });
});

describe('hidden data never reaches a crew before the end', () => {
  it('strips the reveal block from the company reads while the game is live', async () => {
    for (const url of ['/api/companies', `/api/companies/${KRKN}`, '/api/bootstrap']) {
      const res = await app.inject({ method: 'GET', url, headers: auth(crewA) });
      expect(res.statusCode).toBe(200);
      for (const secret of ['reveal', 'fairValue', 'qEff', 'surprise', 'pillars', 'idioVol', 'startPriceCents']) {
        expect(res.body).not.toContain(secret);
      }
    }
  });

  it('hands the reveal over once the phase is ended', async () => {
    store.game.set(gameState('ended'));
    const res = await app.inject({ method: 'GET', url: `/api/companies/${KRKN}`, headers: auth(crewA) });
    expect(body<{ company: { reveal?: { grade: string } } }>(res).company.reveal?.grade).toBe('A');
  });

  it('keeps the seed, the secrets and the schedule off every crew route', async () => {
    store.meta.set('seed', 'top-secret-seed');
    for (const url of CREW_OR_HOST.filter((u) => u !== '/api/stream')) {
      const res = await app.inject({ method: 'GET', url, headers: auth(crewA) });
      expect(res.body).not.toContain('top-secret-seed');
    }
    // The schedule and the quality table have host-only routes, and they still carry the numbers.
    const scheduled = await app.inject({ method: 'GET', url: '/admin/news/scheduled', headers: auth(host) });
    expect(body<{ events: unknown[] }>(scheduled).events).toHaveLength(1);
    const market = await app.inject({ method: 'GET', url: '/admin/market', headers: auth(host) });
    expect(market.body).toContain('fairValue');
  });
});

describe('a crew sees only its own rows', () => {
  it('portfolio, trades and orders are filtered by the token', async () => {
    const portfolio = body<{ team: { id: string }; holdings: { companyId: string }[]; trades: { teamId: string }[] }>(
      await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(crewA) }),
    );
    expect(portfolio.team.id).toBe(CREW_A);
    expect(portfolio.holdings.map((x) => x.companyId)).toEqual([KRKN]);
    expect(portfolio.trades.every((t) => t.teamId === CREW_A)).toBe(true);

    const trades = await app.inject({ method: 'GET', url: '/api/trades', headers: auth(crewA) });
    expect(trades.body).not.toContain(CREW_B);
    const orders = await app.inject({ method: 'GET', url: '/api/orders', headers: auth(crewA) });
    expect(orders.body).not.toContain(CREW_B);

    const other = body<{ holdings: { companyId: string }[] }>(
      await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(crewB) }),
    );
    expect(other.holdings.map((x) => x.companyId)).toEqual([GALE]);
  });

  it('value history comes from the token, not a query parameter', async () => {
    const mine = body<{ points: { tick: number }[] }>(
      await app.inject({ method: 'GET', url: `/api/portfolio/history?from=0&to=12&teamId=${CREW_B}`, headers: auth(crewA) }),
    );
    expect(mine.points).toHaveLength(2); // crew A's two points, not crew B's one
  });

  it('bootstrap gives the host no portfolio at all', async () => {
    const snap = body<{ portfolio: unknown }>(await app.inject({ method: 'GET', url: '/api/bootstrap', headers: auth(host) }));
    expect(snap.portfolio).toBeNull();
  });
});

describe('POST /auth/login', () => {
  it('signs a crew in and refuses a wrong password with the same message as an unknown crew', async () => {
    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { name: 'Saltwind', password: PASSWORD_A } });
    expect(ok.statusCode).toBe(200);
    const session = body<{ token: string; role: string; teamId: string; expiresAt: number }>(ok);
    expect(session).toMatchObject({ role: 'team', teamId: CREW_A });
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    const me = await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(session.token) });
    expect(body<{ team: { id: string } }>(me).team.id).toBe(CREW_A);

    const wrong = await app.inject({ method: 'POST', url: '/auth/login', payload: { name: 'Saltwind', password: 'nope-nope-1' } });
    const missing = await app.inject({ method: 'POST', url: '/auth/login', payload: { name: 'Nobody', password: 'nope-nope-1' } });
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.body).toBe(missing.body);
  });

  it('signs the host in with the stored host password', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { name: 'admin', password: 'host-password-1' } });
    expect(res.statusCode).toBe(200);
    const session = body<{ token: string; role: string; teamId?: string }>(res);
    expect(session.role).toBe('admin');
    expect(session.teamId).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/admin/teams', headers: auth(session.token) })).statusCode).toBe(200);
  });

  it('rejects a malformed body', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { name: '' } })).statusCode).toBe(400);
  });
});

describe('POST /orders', () => {
  const order = { companyId: KRKN_ID, side: 'buy', quantity: 10, clientOrderId: 'client-order-1' };

  it('needs a crew token', async () => {
    expect((await app.inject({ method: 'POST', url: '/orders', payload: order })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/orders', payload: order, headers: auth(host) })).statusCode).toBe(401);
  });

  it('fills, writes every row once, and answers a retry with the same trade', async () => {
    const before = store.crews.get(CREW_A)!.cashBalance;
    const res = await app.inject({ method: 'POST', url: '/orders', payload: order, headers: auth(crewA) });
    expect(res.statusCode).toBe(200);
    const { trade } = body<{ trade: { id: string; price: number; teamId: string } }>(res);
    expect(trade.teamId).toBe(CREW_A);

    const crew = store.crews.get(CREW_A)!;
    expect(crew.cashBalance).toBe(before - 10 * 1000 - 10);
    // The crew already held 10 KRKN in the fixture, so the buy takes it to 20 at the same average cost.
    expect(store.holdings.get(CREW_A, KRKN_ID)).toMatchObject({ shares: 20, avgCost: 1000 });
    expect(store.orders.byClientId(CREW_A, 'client-order-1')!.status).toBe('filled');

    const retry = await app.inject({ method: 'POST', url: '/orders', payload: order, headers: auth(crewA) });
    expect(body<{ trade: { id: string } }>(retry).trade.id).toBe(trade.id);
    expect(store.crews.get(CREW_A)!.cashBalance).toBe(crew.cashBalance);
    expect(store.trades.forCrew(CREW_A, 50).filter((t) => t.clientOrderId === 'client-order-1')).toHaveLength(1);
  });

  it('records a rejection and releases the reservation when the crew cannot trade', async () => {
    await app.inject({
      method: 'POST',
      url: `/admin/teams/${CREW_A}/trading`,
      payload: { enabled: false },
      headers: auth(host),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { ...order, clientOrderId: 'client-order-2' },
      headers: auth(crewA),
    });
    expect(res.statusCode).toBe(400);
    expect(body<{ error: string }>(res).error).toBe('trading_disabled');
    expect(store.orders.byClientId(CREW_A, 'client-order-2')).toMatchObject({ status: 'rejected', code: 'trading_disabled' });
    expect(h.released).toBe(1);
  });

  it('refuses a closed market, an unknown company and a bad quantity', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { ...order, companyId: 'nope', clientOrderId: 'client-order-3' },
      headers: auth(crewA),
    });
    expect(body<{ error: string }>(unknown).error).toBe('unknown_company');

    const bad = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { ...order, quantity: 0, clientOrderId: 'client-order-4' },
      headers: auth(crewA),
    });
    expect(bad.statusCode).toBe(400);

    h.phase = 'paused';
    const closed = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { ...order, clientOrderId: 'client-order-5' },
      headers: auth(crewA),
    });
    expect(body<{ error: string }>(closed).error).toBe('market_closed');
  });
});

describe('/admin crew management', () => {
  it('creates a crew that can sign in at once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/teams',
      payload: { name: 'Gale Runners', password: 'anchors-aweigh-7' },
      headers: auth(host),
    });
    expect(res.statusCode).toBe(200);
    expect(store.crews.get('gale-runners')!.cashBalance).toBe(h.startingCapital);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { name: 'Gale Runners', password: 'anchors-aweigh-7' },
    });
    expect(login.statusCode).toBe(200);

    const dup = await app.inject({
      method: 'POST',
      url: '/admin/teams',
      payload: { name: 'gale runners', password: 'anchors-aweigh-7' },
      headers: auth(host),
    });
    expect(dup.statusCode).toBe(409);
  });

  it('signs a crew out of every device when its password is reset', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(crewA) })).statusCode).toBe(200);
    const reset = await app.inject({
      method: 'POST',
      url: `/admin/teams/${CREW_A}/password`,
      payload: { password: 'brand-new-pass-3' },
      headers: auth(host),
    });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(crewA) })).statusCode).toBe(401);
    const again = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { name: 'Saltwind', password: 'brand-new-pass-3' },
    });
    expect(again.statusCode).toBe(200);
  });

  it('removes a crew with its holdings, trades, orders and standings row', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/admin/teams/${CREW_A}`, headers: auth(host) });
    expect(res.statusCode).toBe(200);
    expect(store.crews.get(CREW_A)).toBeNull();
    expect(store.holdings.forCrew(CREW_A)).toEqual([]);
    expect(store.trades.forCrew(CREW_A, 50)).toEqual([]);
    expect(store.orders.forCrew(CREW_A, 50)).toEqual([]);
    expect(store.leaderboard.get()!.entries.map((e) => e.teamId)).toEqual([CREW_B]);
    expect(store.leaderboard.get()!.entries[0]!.rank).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/portfolio', headers: auth(crewA) })).statusCode).toBe(401);
    // The other crew is untouched.
    expect(store.holdings.forCrew(CREW_B)).toHaveLength(1);
    expect(store.trades.forCrew(CREW_B, 50)).toHaveLength(1);
  });

  it('answers 404 for a crew that is not there', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/admin/teams/ghost-crew', headers: auth(host) });
    expect(res.statusCode).toBe(404);
  });

  it('lists crews and the audit log for the host', async () => {
    const teams = body<{ teams: { id: string }[] }>(
      await app.inject({ method: 'GET', url: '/admin/teams', headers: auth(host) }),
    );
    expect(teams.teams.map((t) => t.id).sort()).toEqual([CREW_B, CREW_A].sort());
    await app.inject({ method: 'POST', url: '/auth/login', payload: { name: 'Saltwind', password: PASSWORD_A } });
    const logs = body<{ logs: { action: string }[] }>(
      await app.inject({ method: 'GET', url: '/admin/logs', headers: auth(host) }),
    );
    expect(logs.logs.some((l) => l.action === 'auth.login')).toBe(true);
  });
});

describe('/admin game control', () => {
  it('runs the game actions and refuses an unknown one', async () => {
    for (const action of ['start', 'pause', 'resume', 'end']) {
      const res = await app.inject({ method: 'POST', url: `/admin/game/${action}`, headers: auth(host) });
      expect(res.statusCode).toBe(200);
    }
    const bad = await app.inject({ method: 'POST', url: '/admin/game/explode', headers: auth(host) });
    expect(bad.statusCode).toBe(400);
  });

  it('rebuilds the market on /admin/game/new and never returns the seed', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/game/new', payload: { keepCrews: true }, headers: auth(host) });
    expect(res.statusCode).toBe(200);
    expect(h.createMarket).toHaveBeenCalledWith({ keepCrews: true });
    expect(res.body).not.toContain('seed');
  });
});

describe('static hosting', () => {
  /** A throwaway `web/dist`, so the test does not depend on a build being present. */
  let dist: string;
  let web: FastifyInstance;

  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), 'bx-web-'));
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Buccaneer Exchange</title>');
    await writeFile(join(dist, 'sw.js'), 'self.addEventListener("install", () => {});');
    await writeFile(join(dist, 'assets', 'app.abc123.js'), 'console.log(1);');
    web = Fastify({ logger: false });
    await registerWeb(web, dist);
    await web.ready();
  });

  afterEach(async () => {
    await web.close();
    await rm(dist, { recursive: true, force: true });
  });

  it('serves the app shell, and the same shell for a deep client route', async () => {
    for (const url of ['/', '/companies/krkn', '/standings']) {
      const res = await web.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Buccaneer Exchange');
      expect(res.headers['cache-control']).toMatch(/no-cache/);
    }
  });

  it('caches hashed assets for a year and never the service worker', async () => {
    const asset = await web.inject({ method: 'GET', url: '/assets/app.abc123.js' });
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const sw = await web.inject({ method: 'GET', url: '/sw.js' });
    expect(sw.headers['cache-control']).toBe('no-cache');
  });

  it('never swallows the API surface or a non-GET request', async () => {
    for (const url of ['/api/nope', '/auth/nope', '/admin/nope', '/orders/nope', '/health/nope']) {
      const res = await web.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toMatch(/json/);
    }
    const post = await web.inject({ method: 'POST', url: '/not-a-route' });
    expect(post.statusCode).toBe(404);
    expect(post.headers['content-type']).toMatch(/json/);
  });

  it('keeps the SPA fallback away from the API on the real server too', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/not-a-route', headers: auth(crewA) });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('GET /api/stream', () => {
  it('opens a real SSE stream for a token in the query string', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const response = await fetch(`${address}/api/stream?token=${crewA}`, { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(response.headers.get('x-accel-buffering')).toBe('no');

    const reader = response.body!.getReader();
    let text = '';
    while (!text.includes('event: snapshot')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    expect(text).toContain('event: snapshot');
    expect(text).toContain(`"id":"${CREW_A}"`);
    expect(text).not.toContain('fairValue');
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });

  it('refuses a stream token that has been revoked', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    store.crews.bumpTokenVersion(CREW_A);
    const response = await fetch(`${address}/api/stream?token=${crewA}`);
    expect(response.status).toBe(401);
    await response.text();
  });
});
