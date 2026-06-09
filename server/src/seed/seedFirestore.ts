/**
 * Seed script: builds the entire hidden market from the game seed and writes it to
 * Firestore. Creates companies + fundamentals + initial price points, the
 * server-only `_schedule` (archetypes, start prices, news), the lobby game state,
 * and the admin/host account. Idempotent: re-running overwrites with the same
 * deterministic data (same seed => same market).
 *
 * Run: `npm run seed -w @deca/server`  (set GAME_SEED / ADMIN_PASSWORD as needed)
 */

import type { GameState } from '@deca/shared';
import { CURRENCY, STARTING_CAPITAL, TICK_INTERVAL_MS } from '@deca/shared';
import { db } from '../firebase';
import { config } from '../config';
import { Prng } from '../lib/prng';
import { randomToken } from '../lib/secret';
import { hashPassword } from '../lib/password';
import { assignArchetypes } from '../engine/archetypes';
import { ROSTER } from './roster';
import { generateCompanyData } from './generateFundamentals';
import { generateNewsSchedule } from '../news/schedule';

async function seed(): Promise<void> {
  // Resolve secrets. With no env override, generate high-entropy values so the
  // hidden market + admin account are never reproducible from committed defaults.
  const seed = config.seed || randomToken();
  const adminPassword = config.adminPassword || randomToken(9);

  const ids = ROSTER.map((r) => r.id);
  const archetypes = assignArchetypes(new Prng(`${seed}:archetypes`), ids);

  const newsCompanies = ROSTER.map((r) => ({
    id: r.id,
    name: r.name,
    sector: r.sector,
    archetype: archetypes[r.id]!,
  }));
  const newsSchedule = generateNewsSchedule(seed, newsCompanies);

  let batch = db.batch();
  let ops = 0;
  const flush = async (force = false) => {
    if (force || ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  const now = Date.now();
  for (const entry of ROSTER) {
    const archetype = archetypes[entry.id]!;
    const { company, fundamentals, startPriceCents } = generateCompanyData(seed, entry, archetype);
    batch.set(db.doc(`companies/${entry.id}`), company);
    batch.set(db.doc(`companies/${entry.id}/fundamentals/data`), fundamentals);
    batch.set(db.doc(`companies/${entry.id}/priceHistory/0`), { tick: 0, timestamp: now, price: startPriceCents, volume: 0 });
    batch.set(db.doc(`_schedule/${entry.id}`), { archetype, startPriceCents });
    ops += 4;
    await flush();
  }

  batch.set(db.doc('_schedule/_news'), { events: newsSchedule });
  // Persist the seed server-only so the engine reads it from here (never exposed to clients).
  batch.set(db.doc('_schedule/_meta'), { seed, createdAt: now });
  ops += 2;

  const state: GameState = {
    phase: 'lobby',
    startAt: null,
    endAt: null,
    pausedAt: null,
    currentTick: 0,
    tickIntervalMs: TICK_INTERVAL_MS,
    serverTime: now,
    currency: { name: CURRENCY.name, symbol: CURRENCY.symbol },
    startingCapital: STARTING_CAPITAL,
  };
  batch.set(db.doc('game/state'), state);
  ops += 1;
  await flush(true);

  // Admin / host credentials → server-only `_auth/_admin` doc (custom-token auth).
  await db.doc('_auth/_admin').set({ passwordHash: hashPassword(adminPassword), role: 'admin' });

  const archCounts = ids.reduce<Record<string, number>>((acc, id) => {
    const a = archetypes[id]!;
    acc[a] = (acc[a] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`✅ Seeded ${ROSTER.length} companies and ${newsSchedule.length} news events.`);
  console.log(`   Archetype spread:`, archCounts);
  console.log('   ────────────────────────────────────────────────');
  console.log(`   Admin/host login:  name "admin"`);
  console.log(`   Admin password:    ${adminPassword}   ${config.adminPassword ? '(from ADMIN_PASSWORD)' : '(generated — save this!)'}`);
  console.log(`   Game seed:         ${seed}   ${config.seed ? '(from GAME_SEED)' : '(generated — stored server-only)'}`);
  console.log('   ────────────────────────────────────────────────');
  console.log(`   Game is in LOBBY — start it from the Admin console.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
