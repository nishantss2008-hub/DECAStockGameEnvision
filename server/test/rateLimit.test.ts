/**
 * The per-minute budget, as a classroom actually loads it.
 *
 * Two rules matter more than the number: a phone loading the app (and the PWA precaching it) must
 * not spend the budget on static files or on the one long-lived SSE connection, and twenty crews
 * behind one school NAT must not share a single bucket.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A budget small enough to exhaust in a test. Hoisted above the imports: config.ts reads the
 * environment the first time anything imports it, which an ordinary top-level assignment is too
 * late for.
 */
const { MAX } = vi.hoisted(() => {
  process.env.RATE_LIMIT_MAX = '3';
  return { MAX: 3 };
});

import type { FastifyInstance } from 'fastify';
import { openStore, useStore, type Store } from '../src/store';
import { currentTokenVersion, issueToken, resetSessionSecretCache } from '../src/auth/sessions';
import { CREW_A, CREW_B, seedWorld } from './helpers/apiFixtures';

// The engine is the only piece these tests do not need; the guards, store and limiter are real.
vi.mock('../src/engine/loop', () => {
  class EngineError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  const state = { phase: 'live', currentTick: 12, startingCapital: 1_000_000, currency: { name: 'Doubloon', symbol: '⌬' } };
  return {
    EngineError,
    engine: {
      state,
      health: () => ({ ok: true, phase: 'live', tick: 12, totalTicks: 360, serverTime: Date.now(), lastTickAt: Date.now(), ticksBehind: 0 }),
      adminMarket: () => [],
      scheduledNews: () => [],
      load: async () => undefined,
      start: () => undefined,
      stop: async () => undefined,
    },
  };
});

const { buildServer, countsAgainstLimit, limiterKey } = await import('../src/index');
const { closeAll } = await import('../src/realtime/hub');

let store: Store;
let app: FastifyInstance;
let crewA: string;
let crewB: string;

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  store = openStore(':memory:');
  useStore(store);
  resetSessionSecretCache();
  seedWorld(store);
  app = await buildServer({ logger: false });
  await app.ready();
  crewA = issueToken({ role: 'team', teamId: CREW_A, tokenVersion: currentTokenVersion('team', CREW_A) }).token;
  crewB = issueToken({ role: 'team', teamId: CREW_B, tokenVersion: currentTokenVersion('team', CREW_B) }).token;
});

afterEach(async () => {
  closeAll();
  await app.close();
  useStore(null);
  store.close();
  resetSessionSecretCache();
});

describe('what counts against the budget', () => {
  it('counts API calls and nothing else', () => {
    for (const url of ['/api/bootstrap', '/api/companies?x=1', '/auth/login', '/orders', '/api/admin/teams', '/admin/teams']) {
      expect(countsAgainstLimit(url)).toBe(true);
    }
    for (const url of ['/', '/index.html', '/assets/app.abc123.js', '/sw.js', '/manifest.webmanifest', '/health', '/api/stream?token=x']) {
      expect(countsAgainstLimit(url)).toBe(false);
    }
  });

  it('keys on the session, and only falls back to the IP when there is none', () => {
    const req = (headers: Record<string, string>, query: unknown = {}) =>
      ({ headers, query, ip: '203.0.113.7' }) as unknown as Parameters<typeof limiterKey>[0];
    expect(limiterKey(req({ authorization: 'Bearer aaa' }))).toBe('t:aaa');
    expect(limiterKey(req({ authorization: 'Bearer bbb' }))).not.toBe(limiterKey(req({ authorization: 'Bearer aaa' })));
    expect(limiterKey(req({}, { token: 'ccc' }))).toBe('t:ccc');
    expect(limiterKey(req({}))).toBe('ip:203.0.113.7');
  });
});

describe('the limiter on the running server', () => {
  it('answers a JSON the app can show once a crew is over budget', async () => {
    for (let i = 0; i < MAX; i++) {
      expect((await app.inject({ method: 'GET', url: '/api/companies', headers: auth(crewA) })).statusCode).toBe(200);
    }
    const over = await app.inject({ method: 'GET', url: '/api/companies', headers: auth(crewA) });
    expect(over.statusCode).toBe(429);
    expect(over.headers['content-type']).toMatch(/json/);
    expect(JSON.parse(over.body)).toMatchObject({ error: 'rate_limited' });
    expect(JSON.parse(over.body).message).toMatch(/try again/i);
  });

  it('gives a second crew on the same address its own budget', async () => {
    for (let i = 0; i < MAX + 1; i++) await app.inject({ method: 'GET', url: '/api/companies', headers: auth(crewA) });
    // Same IP (127.0.0.1), different session: untouched.
    expect((await app.inject({ method: 'GET', url: '/api/companies', headers: auth(crewB) })).statusCode).toBe(200);
  });

  it('never spends the budget on /health', async () => {
    for (let i = 0; i < MAX * 3; i++) {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'GET', url: '/api/companies', headers: auth(crewA) })).statusCode).toBe(200);
  });
});
