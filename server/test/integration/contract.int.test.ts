/**
 * Engine ↔ services contract on the emulator (ported from the Wave 2 gate script `contract.ts`).
 *
 * The real crew service creates the crew, the real trading service fills an order against the engine (and
 * answers a retry with the same trade), and the engine then drains exactly that fill into the next tick's
 * volume, ranks the crew, pauses, resumes and ends with a research grade.
 *
 * Run with `npm run test:integration` from the repo root.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRADES, HOUR_MS, feeFor, notionalFor, type HistoryChunk, type Holding, type Leaderboard, type Team } from '@deca/shared';
import { db, emulatorMode } from '../../src/firebase';
import { engine } from '../../src/engine/loop';
import { createCrew } from '../../src/services/crews';
import { resetLeaderboardCache } from '../../src/services/leaderboard';
import { createMarket } from '../../src/services/market';
import { executeOrder } from '../../src/services/trading';
import { clearEmulator, data } from './helpers';

describe('engine and services contract on the emulator', () => {
  beforeAll(async () => {
    expect(emulatorMode).toBe(true);
    expect(process.env.GCLOUD_PROJECT).toMatch(/^demo-/);
    await engine.stop();
    await clearEmulator();
    resetLeaderboardCache();
  });

  afterAll(async () => {
    await engine.stop();
    await db.terminate();
  });

  it('createCrew → startGame → executeOrder (+ retry) → tick → pause/resume → end', async () => {
    await createMarket({ seed: 'int', keepCrews: false, adminPassword: 'pw', settings: { gameLengthMs: HOUR_MS } });
    await engine.reload();
    await engine.stop();
    await engine.applySettings({ startingCapital: 50_000_000 });
    const crew = await createCrew('Test Crew', 'pass', 50_000_000);
    expect(crew.id).toBe('test-crew');
    expect((await data<Team>('teams/test-crew'))!.cashBalance).toBe(50_000_000);

    await engine.startGame();
    const first = engine.companies()[0]!.id;
    const quote = engine.quote(first, 'buy', 10, 'test-crew');
    const order = { companyId: first, side: 'buy' as const, quantity: 10, clientOrderId: 'int-order-1', quotedPrice: engine.getPrice(first) };
    const trade = await executeOrder(engine, 'test-crew', order);
    const notional = notionalFor(10, quote.fillPrice);
    const fee = feeFor(notional, engine.state.feeBps);
    const team = (await data<Team>('teams/test-crew'))!;
    expect(team.cashBalance).toBe(50_000_000 - notional - fee);
    expect(trade).toMatchObject({ cashAfter: team.cashBalance, fee, tick: 0, quantity: 10 });
    expect((await data<Holding>(`teams/test-crew/holdings/${first}`))!.shares).toBe(10);

    const again = await executeOrder(engine, 'test-crew', order);
    expect(again.id).toBe(trade.id);
    expect((await data<Team>('teams/test-crew'))!.cashBalance).toBe(team.cashBalance);
    expect(engine.adminMarket()[0]!.netFlow).toBe(10);
    // The pending-flow rebuild reads the tick the fill was priced at, never the wall clock.
    expect(trade.tick).toBe(engine.state.currentTick);

    await engine.tickOnce(engine.state.startAt! + 3 * engine.state.tickIntervalMs + 10);
    expect((await data<HistoryChunk>(`companies/${first}/history/0`))!.volumes[1]).toBe(10);
    expect((await data<Leaderboard>('leaderboard/current'))!.entries[0]!.teamId).toBe('test-crew');
    expect(engine.adminMarket()[0]!.netFlow).toBe(0);

    await engine.pauseGame();
    await engine.resumeGame();
    await engine.endGame();
    const final = (await data<Leaderboard>('leaderboard/current'))!.final!.entries[0]!;
    expect(GRADES).toContain(final.researchGrade);
    expect(final).toMatchObject({ teamId: 'test-crew', heldAnyShares: true });
    expect(final.researchWeight).toBeGreaterThan(0);
  });
});
