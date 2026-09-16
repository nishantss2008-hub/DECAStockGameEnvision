/**
 * One whole game against a real SQLite file, through the HTTP surface a phone uses: seed → lobby →
 * host starts → crews trade → ticks run → standings → host ends → the reveal.
 *
 * Nothing is mocked. The engine singleton, the store, the session tokens, the trading path and the
 * Fastify app are the production ones, so this is the closest thing to a classroom run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GAME_LENGTH_OPTIONS_MS, type Company, type GameState, type Leaderboard, type Team, type Trade } from '@deca/shared';
import { buildServer } from '../../src/index';
import { engine } from '../../src/engine/loop';
import { store } from '../../src/store';
import { CREW_PASSWORD, HOST_PASSWORD, bearer, login, runTicks, seedWorld, tempDb } from './helpers';

const db = tempDb('scenario');
const SEED = 'integration-scenario-seed';
const SHORT_GAME = GAME_LENGTH_OPTIONS_MS[0]!;
const STARTING_CAPITAL = 1_000_000_00;

let app: FastifyInstance;
let saltwind = '';
let blackfin = '';
let host = '';
let krkn = '';

beforeAll(async () => {
  await seedWorld({
    seed: SEED,
    crews: ['Saltwind', 'Blackfin'],
    settings: { gameLengthMs: SHORT_GAME, startingCapital: STARTING_CAPITAL, feeBps: 10 },
  });
  await engine.load();
  app = await buildServer({ logger: false });
  await app.ready();
  saltwind = await login(app, 'Saltwind', CREW_PASSWORD);
  blackfin = await login(app, 'Blackfin', CREW_PASSWORD);
  host = await login(app, 'admin', HOST_PASSWORD);
  krkn = store.companies.all()[0]!.id;
});

afterAll(async () => {
  await engine.stop();
  await app?.close();
  db.cleanup();
});

const json = <T>(res: { json: () => unknown }): T => res.json() as T;

async function buy(token: string, quantity: number, clientOrderId: string): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'POST',
    url: '/orders',
    headers: bearer(token),
    payload: { companyId: krkn, side: 'buy', quantity, clientOrderId },
  });
  return { status: res.statusCode, body: res.json() };
}

describe('a whole game, end to end on a real database file', () => {
  it('seeds 15 companies into the lobby and hands a crew a session token', async () => {
    expect(store.companies.all()).toHaveLength(15);
    expect(db.file).toMatch(/game\.db$/);

    const res = await app.inject({ method: 'GET', url: '/api/bootstrap', headers: bearer(saltwind) });
    expect(res.statusCode).toBe(200);
    const boot = json<{ game: GameState; companies: Company[]; portfolio: { team: Team } }>(res);
    expect(boot.game.phase).toBe('lobby');
    expect(boot.companies).toHaveLength(15);
    expect(boot.portfolio.team.cashBalance).toBe(STARTING_CAPITAL);
  });

  it('refuses orders while the market is closed', async () => {
    const { status, body } = await buy(saltwind, 10, 'lobby-order-1');
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('market_closed');
  });

  it('the host starts the game and the engine goes live', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/game/start', headers: bearer(host) });
    expect(res.statusCode).toBe(200);
    expect(json<{ phase: string }>(res).phase).toBe('live');
    expect(engine.state.phase).toBe('live');
    expect(store.game.get()?.phase).toBe('live');
  });

  it('fills a crew order in integer cents and persists the trade, order and holding', async () => {
    const before = store.crews.get('saltwind')!;
    const { status, body } = await buy(saltwind, 100, 'saltwind-order-1');
    expect(status).toBe(200);

    const trade = (body as { trade: Trade }).trade;
    for (const value of [trade.price, trade.fee, trade.cashAfter, trade.realizedPnl]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(trade.quantity).toBe(100);
    expect(trade.teamId).toBe('saltwind');
    // Cash out = notional + fee, to the cent, where notional = round(shares × the UNROUNDED fill).
    // `trade.price` is that fill rounded to the cent, so shares × price can sit up to half a cent
    // per share away from the notional.
    const cashOut = before.cashBalance - trade.cashAfter;
    expect(Number.isInteger(cashOut)).toBe(true);
    expect(Math.abs(cashOut - trade.fee - trade.price * trade.quantity)).toBeLessThanOrEqual(trade.quantity / 2);

    const crew = store.crews.get('saltwind')!;
    expect(crew.cashBalance).toBe(trade.cashAfter);
    expect(store.holdings.get('saltwind', krkn)).toMatchObject({ shares: 100 });
    expect(store.orders.byClientId('saltwind', 'saltwind-order-1')).toMatchObject({ status: 'filled', tradeId: trade.id });
  });

  it('answers a retried clientOrderId with the SAME trade instead of filling twice', async () => {
    const first = store.trades.forCrew('saltwind', 10);
    const { status, body } = await buy(saltwind, 100, 'saltwind-order-1');
    expect(status).toBe(200);
    expect((body as { trade: Trade }).trade.id).toBe(first[0]!.id);
    expect(store.trades.forCrew('saltwind', 10)).toHaveLength(first.length);
    expect(store.holdings.get('saltwind', krkn)!.shares).toBe(100);
  });

  it('runs ticks that write prices, market history, crew history and standings in one pass', async () => {
    await buy(blackfin, 250, 'blackfin-order-1');
    await runTicks(engine, 5);

    expect(engine.state.currentTick).toBe(5);
    expect(store.engine.get()?.lastTick).toBe(5);
    expect(store.history.range(krkn, 0, 5)).toHaveLength(6);
    expect(store.market.historyRange(0, 5)).toHaveLength(6);
    expect(store.crewHistory.range('saltwind', 0, 5).length).toBeGreaterThan(0);

    const standings = json<{ leaderboard: Leaderboard }>(
      await app.inject({ method: 'GET', url: '/api/standings', headers: bearer(saltwind) }),
    ).leaderboard;
    expect(standings.entries.map((e) => e.teamId).sort()).toEqual(['blackfin', 'saltwind']);
    for (const entry of standings.entries) expect(Number.isInteger(entry.totalValue)).toBe(true);

    const history = json<{ points: { tick: number; price: number }[] }>(
      await app.inject({ method: 'GET', url: `/api/companies/${krkn}/history?from=0&to=5`, headers: bearer(saltwind) }),
    );
    expect(history.points.map((p) => p.tick)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const p of history.points) expect(Number.isInteger(p.price)).toBe(true);
  });

  it('sells the position back and records the realized P&L', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: bearer(saltwind),
      payload: { companyId: krkn, side: 'sell', quantity: 100, clientOrderId: 'saltwind-sell-1' },
    });
    expect(res.statusCode).toBe(200);
    const trade = json<{ trade: Trade }>(res).trade;
    expect(trade.side).toBe('sell');
    expect(trade.sharesAfter).toBe(0);
    expect(Number.isInteger(trade.realizedPnl)).toBe(true);
    expect(store.holdings.get('saltwind', krkn)).toBeNull();
    expect(store.crews.get('saltwind')!.realizedPnl).toBe(trade.realizedPnl);
  });

  it("shows the crew its own portfolio, trades and orders", async () => {
    const portfolio = json<{ team: Team; holdings: unknown[]; trades: Trade[]; orders: { status: string }[] }>(
      await app.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(saltwind) }),
    );
    expect(portfolio.team.id).toBe('saltwind');
    expect(portfolio.trades.every((t) => t.teamId === 'saltwind')).toBe(true);
    expect(portfolio.trades.length).toBe(2);
    // The journal keeps the rejected lobby order too, so a crew can see why it did not fill.
    expect(portfolio.orders.map((o) => (o as { clientOrderId: string; status: string }).status).sort()).toEqual([
      'filled',
      'filled',
      'rejected',
    ]);
  });

  it('hides the reveal while the game is live and publishes it once the host ends the game', async () => {
    const live = json<{ companies: Company[] }>(
      await app.inject({ method: 'GET', url: '/api/companies', headers: bearer(saltwind) }),
    );
    expect(live.companies.every((c) => (c as { reveal?: unknown }).reveal === undefined)).toBe(true);

    const ended = await app.inject({ method: 'POST', url: '/api/admin/game/end', headers: bearer(host) });
    expect(ended.statusCode).toBe(200);
    expect(engine.state.phase).toBe('ended');

    const after = json<{ companies: Company[] }>(
      await app.inject({ method: 'GET', url: '/api/companies', headers: bearer(saltwind) }),
    );
    const reveal = (after.companies.find((c) => c.id === krkn) as { reveal?: Record<string, unknown> }).reveal;
    expect(reveal).toBeTruthy();
    expect(reveal).toHaveProperty('q');
    expect(reveal).toHaveProperty('fairValue');

    const final = store.leaderboard.get()!;
    expect(final.entries).toHaveLength(2);
    expect(final.entries[0]!.rank).toBe(1);
  });

  it('kept an audit trail of the host actions and the logins', async () => {
    const logs = json<{ logs: { action: string }[] }>(
      await app.inject({ method: 'GET', url: '/api/admin/logs', headers: bearer(host) }),
    ).logs.map((l) => l.action);
    expect(logs).toEqual(expect.arrayContaining(['auth.login', 'game.start', 'game.end', 'order.fill']));
  });
});
