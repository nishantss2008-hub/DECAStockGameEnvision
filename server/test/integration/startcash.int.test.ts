/**
 * Starting cash on the emulator (ported from the Wave 2 gate script `startcash.ts`).
 *
 * startGame gives every crew the lobby's Starting cash, including a crew created before the host changed it,
 * and seeds each crew's tick-0 value history with it, so the first standings show 0% and a flat spark.
 *
 * Run with `npm run test:integration` from the repo root.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HOUR_MS, type Leaderboard, type Team, type ValueChunk } from '@deca/shared';
import { db, emulatorMode } from '../../src/firebase';
import { engine } from '../../src/engine/loop';
import { createCrew } from '../../src/services/crews';
import { resetLeaderboardCache } from '../../src/services/leaderboard';
import { createMarket } from '../../src/services/market';
import { clearEmulator, data } from './helpers';

describe('starting cash on the emulator', () => {
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

  it('every crew starts with the lobby Starting cash and a tick-0 history point of it', async () => {
    await createMarket({ seed: 'adv', keepCrews: false, adminPassword: 'pw', settings: { gameLengthMs: HOUR_MS } });
    resetLeaderboardCache();
    await engine.reload();
    await engine.stop();
    expect(engine.state.startingCapital).toBe(100_000_000);
    await createCrew('Early Crew', 'pass', engine.state.startingCapital);
    await engine.applySettings({ startingCapital: 50_000_000 });
    await createCrew('Late Crew', 'pass', 50_000_000);

    await engine.startGame();
    for (const id of ['early-crew', 'late-crew']) {
      const t = (await data<Team>(`teams/${id}`))!;
      expect([t.cashBalance, t.totalValue, t.sessionOpenValue], id).toEqual([50_000_000, 50_000_000, 50_000_000]);
      expect(await data<ValueChunk>(`teams/${id}/history/0`), id).toEqual({ chunk: 0, startTick: 0, values: [50_000_000] });
    }

    await engine.tickOnce(engine.state.startAt! + 2 * engine.state.tickIntervalMs + 10);
    const lb = (await data<Leaderboard>('leaderboard/current'))!;
    expect(lb.entries).toHaveLength(2);
    for (const e of lb.entries) {
      expect(e.returnPct).toBe(0);
      expect(e.spark).toEqual([50_000_000, 50_000_000, 50_000_000]);
    }
    expect((await data<ValueChunk>('teams/early-crew/history/0'))!.values).toEqual([50_000_000, 50_000_000, 50_000_000]);
    await engine.endGame();
  });
});
