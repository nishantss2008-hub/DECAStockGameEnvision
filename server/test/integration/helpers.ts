/**
 * Shared setup for the integration suites (not a test file: vitest only collects *.int.test.ts).
 *
 * Every suite drives the REAL stack — a real SQLite file on disk, the real store, the real engine
 * loop, the real session tokens and the real Fastify app — with nothing mocked. No emulator, no
 * network, no credentials: each suite opens its own database under the OS temp directory and
 * deletes it afterwards.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { openStore, store, useStore, type Store } from '../../src/store';
import { resetSessionSecretCache } from '../../src/auth/sessions';
import { resetLeaderboardCache } from '../../src/services/leaderboard';
import { createMarket } from '../../src/services/market';
import { completeCrewIntro, createCrew } from '../../src/services/crews';
import { closeAll } from '../../src/realtime/hub';

/** A temp database that survives a "restart": closing and reopening keeps the same file. */
export interface TempDb {
  /** The open store — read it again after `reopen()`, which replaces it. */
  store(): Store;
  file: string;
  /** Closes the store and opens the same FILE again, as a process restart would. */
  reopen(): Store;
  cleanup(): void;
}

/**
 * Opens a fresh database file and installs it as the process store, so the engine singleton, the
 * services and the routes all read and write it.
 */
export function tempDb(label: string): TempDb {
  const dir = mkdtempSync(join(tmpdir(), `bx-${label}-`));
  const file = join(dir, 'game.db');
  let open = openStore(file);
  useStore(open);
  resetSessionSecretCache();
  resetLeaderboardCache();

  return {
    file,
    store: () => open,
    reopen(): Store {
      open.close();
      open = openStore(file);
      useStore(open);
      // A restart keeps the session secret: it lives in `meta`, not in memory.
      resetSessionSecretCache();
      resetLeaderboardCache();
      return open;
    },
    cleanup(): void {
      closeAll();
      try {
        open.close();
      } catch {
        /* already closed */
      }
      useStore(null);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const HOST_PASSWORD = 'anchor-chain-99';
export const CREW_PASSWORD = 'kraken-tide-42';

export interface SeededWorld {
  seed: string;
  companyIds: string[];
}

/** A fresh market in the lobby plus the given crews, exactly as `npm run seed` + the host console make. */
export async function seedWorld(
  opts: { seed: string; crews: string[]; settings?: Parameters<typeof createMarket>[0]['settings'] },
): Promise<SeededWorld> {
  await createMarket({
    seed: opts.seed,
    keepCrews: false,
    adminPassword: HOST_PASSWORD,
    settings: opts.settings,
  });
  // `store` is the process proxy: it always resolves the store `tempDb` installed.
  const startingCapital = store.game.get()?.startingCapital ?? 1_000_000;
  for (const name of opts.crews) {
    const crew = await createCrew(name, CREW_PASSWORD, startingCapital);
    // Past the lobby: these crews have met the market (design §6), so the required-once intro
    // gate on the first order is out of the way of whatever the scenario is actually testing.
    await completeCrewIntro(crew.id);
  }
  return { seed: opts.seed, companyIds: store.companies.all().map((c) => c.id) };
}

/** `POST /auth/login`, returning the token a phone would keep. */
export async function login(app: FastifyInstance, name: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { name, password } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${name}: ${res.statusCode} ${res.body}`);
  return (res.json() as { token: string }).token;
}

export const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

/** Drives the engine forward `count` ticks from the game's start, as the interval timer would. */
export async function runTicks(
  engineLike: { state: { startAt: number | null; tickIntervalMs: number; currentTick: number }; tickOnce(now: number): Promise<void> },
  count: number,
): Promise<void> {
  const start = engineLike.state.startAt;
  if (start === null) throw new Error('runTicks: the game has not started');
  const target = engineLike.state.currentTick + count;
  for (let tick = engineLike.state.currentTick + 1; tick <= target; tick += 1) {
    await engineLike.tickOnce(start + tick * engineLike.state.tickIntervalMs);
  }
}
