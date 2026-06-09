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
import { db, adminAuth } from '../firebase';
import { config } from '../config';
import { Prng } from '../lib/prng';
import { assignArchetypes } from '../engine/archetypes';
import { ROSTER } from './roster';
import { generateCompanyData } from './generateFundamentals';
import { generateNewsSchedule } from '../news/schedule';

async function seed(): Promise<void> {
  const ids = ROSTER.map((r) => r.id);
  const archetypes = assignArchetypes(new Prng(`${config.seed}:archetypes`), ids);

  const newsCompanies = ROSTER.map((r) => ({
    id: r.id,
    name: r.name,
    sector: r.sector,
    archetype: archetypes[r.id]!,
  }));
  const newsSchedule = generateNewsSchedule(config.seed, newsCompanies);

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
    const { company, fundamentals, startPriceCents } = generateCompanyData(config.seed, entry, archetype);
    batch.set(db.doc(`companies/${entry.id}`), company);
    batch.set(db.doc(`companies/${entry.id}/fundamentals/data`), fundamentals);
    batch.set(db.doc(`companies/${entry.id}/priceHistory/0`), { tick: 0, timestamp: now, price: startPriceCents, volume: 0 });
    batch.set(db.doc(`_schedule/${entry.id}`), { archetype, startPriceCents });
    ops += 4;
    await flush();
  }

  batch.set(db.doc('_schedule/_news'), { events: newsSchedule });
  ops += 1;

  const state: GameState = {
    phase: 'lobby',
    startAt: null,
    endAt: null,
    currentTick: 0,
    tickIntervalMs: TICK_INTERVAL_MS,
    serverTime: now,
    currency: { name: CURRENCY.name, symbol: CURRENCY.symbol },
    startingCapital: STARTING_CAPITAL,
  };
  batch.set(db.doc('game/state'), state);
  ops += 1;
  await flush(true);

  // Admin / host account.
  const email = 'admin@deca-pirates.game';
  try {
    const existing = await adminAuth.getUserByEmail(email).catch(() => null);
    const uid = existing
      ? (await adminAuth.updateUser(existing.uid, { password: config.adminPassword })).uid
      : (await adminAuth.createUser({ email, password: config.adminPassword, displayName: 'Harbormaster' })).uid;
    await adminAuth.setCustomUserClaims(uid, { role: 'admin' });
  } catch (err) {
    console.error('admin user setup failed (continuing):', err);
  }

  const archCounts = ids.reduce<Record<string, number>>((acc, id) => {
    const a = archetypes[id]!;
    acc[a] = (acc[a] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`✅ Seeded ${ROSTER.length} companies and ${newsSchedule.length} news events.`);
  console.log(`   Archetype spread:`, archCounts);
  console.log(`   Admin/host login: ${email} / ${config.adminPassword}`);
  console.log(`   Game is in LOBBY — start it from the Admin console.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
