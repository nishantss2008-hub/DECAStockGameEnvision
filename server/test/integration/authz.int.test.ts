/**
 * Who may call what, and what a crew may never see — against a real database, with a live game and
 * real hidden data in it (the reveal block, the seed, the news schedule).
 *
 * The routes are unit-tested endpoint by endpoint; this suite is the whole-server check: a phone
 * with a crew token cannot reach the host console, cannot read another crew's money, and cannot
 * find a hidden field ANYWHERE in any response before the game ends.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GAME_LENGTH_OPTIONS_MS, type Trade } from '@deca/shared';
import { buildServer, webRoot } from '../../src/index';
import { engine } from '../../src/engine/loop';
import { store } from '../../src/store';
import { issueToken } from '../../src/auth/sessions';
import { CREW_PASSWORD, HOST_PASSWORD, bearer, login, runTicks, seedWorld, tempDb } from './helpers';

const db = tempDb('authz');

/** Every hidden field the spec forbids before `phase === 'ended'`. */
const HIDDEN_KEYS = ['"q"', '"qEff"', '"surprise"', '"quality"', '"grade"', '"pillars"', '"fairValue"', '"reveal"'];

/** Read endpoints any signed-in session may call. */
const SESSION_READS = [
  '/api/bootstrap',
  '/api/companies',
  '/api/fundamentals',
  '/api/market',
  '/api/market/history?from=0&to=5',
  '/api/news?limit=10',
  '/api/standings',
];
/** Read endpoints that need a crew (they answer with that crew's own rows). */
const CREW_READS = ['/api/portfolio', '/api/portfolio/history?from=0&to=5', '/api/trades?limit=10', '/api/orders?limit=10'];
/** The host console. */
const ADMIN_ROUTES: [string, string][] = [
  ['GET', '/admin/teams'],
  ['GET', '/admin/market'],
  ['GET', '/admin/news/scheduled'],
  ['GET', '/admin/logs'],
  ['POST', '/admin/settings'],
  ['POST', '/admin/game/start'],
  ['POST', '/admin/game/new'],
  ['POST', '/admin/teams'],
  ['POST', '/admin/news'],
  ['DELETE', '/admin/teams/blackfin'],
];

let app: FastifyInstance;
let saltwind = '';
let blackfin = '';
let host = '';
let krkn = '';

beforeAll(async () => {
  await seedWorld({
    seed: 'integration-authz-seed',
    crews: ['Saltwind', 'Blackfin'],
    settings: { gameLengthMs: GAME_LENGTH_OPTIONS_MS[0]!, startingCapital: 1_000_000_00 },
  });
  await engine.load();
  app = await buildServer({ logger: false });
  await app.ready();
  saltwind = await login(app, 'Saltwind', CREW_PASSWORD);
  blackfin = await login(app, 'Blackfin', CREW_PASSWORD);
  host = await login(app, 'admin', HOST_PASSWORD);
  krkn = store.companies.all()[0]!.id;

  await engine.startGame();
  await app.inject({
    method: 'POST',
    url: '/orders',
    headers: bearer(blackfin),
    payload: { companyId: krkn, side: 'buy', quantity: 40, clientOrderId: 'blackfin-secret-1' },
  });
  await runTicks(engine, 3);
});

afterAll(async () => {
  await engine.stop();
  await app?.close();
  db.cleanup();
});

describe('authentication', () => {
  it('turns away every protected endpoint without a token', async () => {
    for (const url of [...SESSION_READS, ...CREW_READS]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
    const order = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { companyId: krkn, side: 'buy', quantity: 1, clientOrderId: 'anonymous-1' },
    });
    expect(order.statusCode).toBe(401);
  });

  it('rejects a tampered, unsigned or foreign-secret token', async () => {
    const [header, payload] = saltwind.split('.');
    const forged = [header, payload, 'not-the-signature'].join('.');
    for (const token of [forged, 'garbage', `${saltwind}x`]) {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    }
  });

  it('rejects an expired token', async () => {
    const { token } = issueToken({ role: 'team', teamId: 'saltwind', tokenVersion: 1 });
    // Any token is dead 12 hours on: expiry is inside the signed payload.
    const long = 13 * 60 * 60 * 1000;
    const realNow = Date.now;
    Date.now = () => realNow() + long;
    try {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    } finally {
      Date.now = realNow;
    }
  });

  it('keeps a crew out of the host console and the host out of crew-only reads', async () => {
    for (const [method, url] of ADMIN_ROUTES) {
      const res = await app.inject({ method: method as 'GET', url, headers: bearer(saltwind), payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    for (const url of CREW_READS) {
      const res = await app.inject({ method: 'GET', url, headers: bearer(host) });
      expect(res.statusCode, url).toBe(401);
    }
  });

  it('signs a crew out the moment the host resets its password or removes it', async () => {
    const reset = await app.inject({
      method: 'POST',
      url: '/admin/teams/saltwind/password',
      headers: bearer(host),
      payload: { password: 'new-anchor-77' },
    });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(saltwind) })).statusCode).toBe(401);

    saltwind = await login(app, 'Saltwind', 'new-anchor-77');
    expect((await app.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(saltwind) })).statusCode).toBe(200);
  });
});

describe('one crew can never see another', () => {
  it('answers /api/portfolio, /api/trades and /api/orders from the TOKEN, not from any field a client sends', async () => {
    const mine = await app.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(saltwind) });
    expect((mine.json() as { team: { id: string } }).team.id).toBe('saltwind');

    // Naming another crew in the query or body changes nothing.
    for (const url of ['/api/portfolio?teamId=blackfin', '/api/trades?teamId=blackfin&limit=50']) {
      const res = await app.inject({ method: 'GET', url, headers: bearer(saltwind) });
      expect(res.statusCode).toBe(200);
      const body = JSON.stringify(res.json());
      expect(body).not.toContain('blackfin-secret-1');
    }

    const trades = (await app.inject({ method: 'GET', url: '/api/trades?limit=50', headers: bearer(saltwind) })).json() as {
      trades: Trade[];
    };
    expect(trades.trades.every((t) => t.teamId === 'saltwind')).toBe(true);
  });

  it('never leaks another crew’s cash, holdings or ledger through a public read', async () => {
    const blackfinCash = store.crews.get('blackfin')!.cashBalance;
    expect(store.trades.forCrew('blackfin', 10).length).toBeGreaterThan(0);

    for (const url of SESSION_READS) {
      const body = JSON.stringify((await app.inject({ method: 'GET', url, headers: bearer(saltwind) })).json());
      expect(body, url).not.toContain('blackfin-secret-1');
      expect(body, url).not.toContain(`"cashBalance":${blackfinCash}`);
    }
  });
});

describe('hidden data before the reveal', () => {
  it('strips every hidden field from every crew-visible read while the game is live', async () => {
    expect(engine.state.phase).toBe('live');
    for (const url of [...SESSION_READS, ...CREW_READS, `/api/companies/${krkn}`, `/api/companies/${krkn}/history?from=0&to=3`]) {
      const res = await app.inject({ method: 'GET', url, headers: bearer(saltwind) });
      expect(res.statusCode, url).toBe(200);
      const body = res.body;
      for (const key of HIDDEN_KEYS) expect(body, `${key} in ${url}`).not.toContain(key);
      expect(body, url).not.toContain('integration-authz-seed');
    }
  });

  it('keeps the seed and the news schedule server-side, and shows the host what only the host may see', async () => {
    const scheduled = await app.inject({ method: 'GET', url: '/admin/news/scheduled', headers: bearer(host) });
    expect(scheduled.statusCode).toBe(200);
    expect((scheduled.json() as { events: unknown[] }).events.length).toBeGreaterThan(0);
    // A crew asking for the same thing is turned away, not answered with an empty list.
    expect((await app.inject({ method: 'GET', url: '/admin/news/scheduled', headers: bearer(saltwind) })).statusCode).toBe(403);

    const market = await app.inject({ method: 'GET', url: '/admin/market', headers: bearer(host) });
    expect(market.body).toContain('"fairValue"');
    expect(market.body).not.toContain('integration-authz-seed');
  });

  it('opens the reveal to everyone once the host ends the game', async () => {
    await engine.endGame();
    const res = await app.inject({ method: 'GET', url: `/api/companies/${krkn}`, headers: bearer(saltwind) });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"reveal"');
    expect(res.body).toContain('"fairValue"');
    // Even then, the seed stays in `meta`.
    expect(res.body).not.toContain('integration-authz-seed');
  });
});

describe('the static SPA never swallows the API', () => {
  it('answers an unknown API path with JSON 404, not with index.html', async () => {
    for (const url of ['/api/nope', '/auth/nope', '/admin/nope', '/orders/nope', '/health/nope']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.body, url).not.toContain('<!doctype html');
      expect((res.json() as { error: string }).error).toBe('not_found');
    }
  });

  it('deep-links into the app itself, uncached, when a web build is present', async () => {
    if (!webRoot()) return; // no build in this checkout — `npm run build:web` makes one
    const res = await app.inject({ method: 'GET', url: '/portfolio' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    // A stale index.html (or sw.js) would pin an old app on a phone for good.
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves /health to anyone, with the live stream count', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, connections: 0 });
  });
});
