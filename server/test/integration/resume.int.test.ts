/**
 * Crash and resume on a real database file: the server is killed mid-game and started again on the
 * same `DB_FILE`, as a redeploy or an OOM kill would do.
 *
 * What must survive: the phase and tick, every price, the crews' cash, holdings and ledger, the
 * standings, the sessions already issued — and the impact of trades that filled AFTER the last
 * committed tick, which the resumed engine rebuilds from `trades.sinceTick`.
 *
 * The prices after a restart are compared against a control run of the SAME seed that never
 * restarted: resume must change nothing about the market.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { GAME_LENGTH_OPTIONS_MS } from '@deca/shared';
import { GameEngine } from '../../src/engine/loop';
import { executeOrder } from '../../src/services/trading';
import { store } from '../../src/store';
import { verifyToken } from '../../src/auth/sessions';
import { buildServer } from '../../src/index';
import { CREW_PASSWORD, HOST_PASSWORD, bearer, login, runTicks, seedWorld, tempDb, type TempDb } from './helpers';

const SEED = 'integration-resume-seed';
const SHORT_GAME = GAME_LENGTH_OPTIONS_MS[0]!;
const TICKS_BEFORE = 4;
/**
 * Deep pockets on purpose: only an order worth a noticeable slice of a company's average daily
 * volume moves the price at all, and the pending-flow rebuild is only observable when it does.
 */
const STARTING_CAPITAL = 1_000_000_000_00;
const BIG_ORDER = 200_000;
const TICKS_AFTER = 3;

let db: TempDb | null = null;

afterEach(() => {
  db?.cleanup();
  db = null;
});

/** A seeded, started game with one crew, driven to `TICKS_BEFORE`. */
async function gameAtTick4(label: string): Promise<GameEngine> {
  db = tempDb(label);
  await seedWorld({ seed: SEED, crews: ['Saltwind'], settings: { gameLengthMs: SHORT_GAME, startingCapital: STARTING_CAPITAL } });
  const engine = new GameEngine();
  await engine.load();
  await engine.startGame();
  await runTicks(engine, TICKS_BEFORE);
  return engine;
}

const pricesNow = (): Record<string, number> =>
  Object.fromEntries(store.companies.all().map((c) => [c.id, c.currentPrice]));

describe('resume from the database file', () => {
  it('a restarted engine picks up the phase, tick, prices, crews and standings it left behind', async () => {
    const before = await gameAtTick4('resume-state');
    const app = await buildServer({ logger: false });
    const token = await login(app, 'Saltwind', CREW_PASSWORD);
    const company = store.companies.all()[0]!.id;
    await executeOrder(before, 'saltwind', { companyId: company, side: 'buy', quantity: 80, clientOrderId: 'before-crash' });

    const snapshot = {
      tick: before.state.currentTick,
      prices: pricesNow(),
      cash: store.crews.get('saltwind')!.cashBalance,
      holding: store.holdings.get('saltwind', company)!.shares,
      leaderboard: store.leaderboard.get(),
      trades: store.trades.forCrew('saltwind', 50).map((t) => t.id),
    };
    await app.close();

    // ── the process dies here; another one opens the same file ──
    db!.reopen();
    const after = new GameEngine();
    await after.load();

    expect(after.state.phase).toBe('live');
    expect(after.state.currentTick).toBe(snapshot.tick);
    expect(pricesNow()).toEqual(snapshot.prices);
    expect(store.crews.get('saltwind')!.cashBalance).toBe(snapshot.cash);
    expect(store.holdings.get('saltwind', company)!.shares).toBe(snapshot.holding);
    expect(store.leaderboard.get()).toEqual(snapshot.leaderboard);
    expect(store.trades.forCrew('saltwind', 50).map((t) => t.id)).toEqual(snapshot.trades);

    // The session secret lives in `meta`, so a token issued before the restart still authenticates.
    const restarted = await buildServer({ logger: false });
    expect(verifyToken(token)).toMatchObject({ role: 'team', teamId: 'saltwind' });
    const res = await restarted.inject({ method: 'GET', url: '/api/portfolio', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { team: { id: string } }).team.id).toBe('saltwind');
    await restarted.close();
    await after.stop();
  });

  it('rebuilds the flow of trades filled after the last committed tick, so prices match a run that never crashed', async () => {
    // ── control: one uninterrupted process ──
    const control = await gameAtTick4('resume-control');
    const company = store.companies.all()[0]!.id;
    await executeOrder(control, 'saltwind', { companyId: company, side: 'buy', quantity: BIG_ORDER, clientOrderId: 'after-tick-4' });
    await runTicks(control, TICKS_AFTER);
    const expected = pricesNow();
    const expectedTick = control.state.currentTick;
    await control.stop();
    db!.cleanup();
    db = null;

    // Guard against a vacuous comparison: without that trade the same seed ends somewhere else,
    // so an engine that dropped the pending flow on resume WOULD fail the assertion below.
    const untraded = await gameAtTick4('resume-untraded');
    await runTicks(untraded, TICKS_AFTER);
    expect(pricesNow()).not.toEqual(expected);
    await untraded.stop();
    db!.cleanup();
    db = null;

    // ── the same game, with a restart between the trade and the next tick ──
    const crashed = await gameAtTick4('resume-crashed');
    expect(company).toBe(store.companies.all()[0]!.id);
    await executeOrder(crashed, 'saltwind', { companyId: company, side: 'buy', quantity: BIG_ORDER, clientOrderId: 'after-tick-4' });
    await crashed.stop();

    db!.reopen();
    const resumed = new GameEngine();
    await resumed.load();
    expect(resumed.state.currentTick).toBe(TICKS_BEFORE);
    await runTicks(resumed, TICKS_AFTER);

    expect(resumed.state.currentTick).toBe(expectedTick);
    // The trade's impact is applied exactly once: not lost, and not replayed on top of itself.
    expect(pricesNow()).toEqual(expected);
    await resumed.stop();
  });

  it('keeps the host login and the game seed server-side across a restart', async () => {
    const engine = await gameAtTick4('resume-host');
    await engine.stop();
    db!.reopen();
    const after = new GameEngine();
    await after.load();

    const app = await buildServer({ logger: false });
    const host = await login(app, 'admin', HOST_PASSWORD);
    expect(verifyToken(host)).toMatchObject({ role: 'admin' });

    // The seed is stored, and no response carries it.
    expect(store.meta.get('seed')).toBe(SEED);
    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap', headers: bearer(host) });
    expect(JSON.stringify(bootstrap.json())).not.toContain(SEED);
    await app.close();
    await after.stop();
  });
});
