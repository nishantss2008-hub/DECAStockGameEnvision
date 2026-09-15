/**
 * Firestore security rules (repo-root firestore.rules) against the emulator.
 *
 * - Public: game state, companies (+ fundamentals and price history), market summary
 *   (+ composite history), news, leaderboard.
 * - Crew and host: a crew reads its own team, holdings, value history, trades and
 *   orders; the host (admin claim) reads every crew.
 * - Server only: the hidden future (_schedule), engine state, team stats, logins, logs.
 * - Nobody writes anything from a client; the authority service uses the Admin SDK.
 *
 * Run with `npm run test:integration` from the repo root.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/firestore';

const RULES_PATH = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));

let env: RulesTestEnvironment;

function emulatorAddress(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST!;
  const i = raw.lastIndexOf(':');
  return { host: raw.slice(0, i), port: Number(raw.slice(i + 1)) };
}

const anon = () => env.unauthenticatedContext().firestore();
const crew = (teamId: string) => env.authenticatedContext(teamId, { role: 'team', teamId }).firestore();
const host = () => env.authenticatedContext('admin', { role: 'admin' }).firestore();
type Db = ReturnType<RulesTestContext['firestore']>;

/** Every client-visible and server-only path the app uses, seeded with rules disabled. */
const SEED: Record<string, Record<string, unknown>> = {
  'game/state': { phase: 'lobby', currentTick: 0 },
  'companies/x': { id: 'x', ticker: 'XXXX', currentPrice: 1_200 },
  'companies/x/fundamentals/data': { revenue: 1 },
  'companies/x/history/0': { chunk: 0, startTick: 0, prices: [1_200], volumes: [0] },
  'companies/x/priceHistory/1': { price: 1_200 },
  'market/summary': { lastTick: 0 },
  'market/summary/history/0': { chunk: 0, startTick: 0, values: [1_000] },
  'news/n': { headline: 'H', firedAt: 1 },
  'leaderboard/current': { tick: 0, entries: [] },
  'teams/t': { id: 't', name: 'T', cashBalance: 1 },
  'teams/t/holdings/h': { companyId: 'x', shares: 1, avgCost: 1 },
  'teams/t/history/0': { chunk: 0, startTick: 0, values: [1] },
  'teams/u': { id: 'u', name: 'U', cashBalance: 1 },
  'teams/u/holdings/h': { companyId: 'x', shares: 1, avgCost: 1 },
  'teams/u/history/0': { chunk: 0, startTick: 0, values: [1] },
  'trades/t-trade': { id: 't-trade', teamId: 't', executedAt: 1 },
  'trades/u-trade': { id: 'u-trade', teamId: 'u', executedAt: 1 },
  'orders/t_order-0001': { id: 't_order-0001', teamId: 't', createdAt: 1 },
  'orders/u_order-0001': { id: 'u_order-0001', teamId: 'u', createdAt: 1 },
  '_schedule/x': { q: 0.5 },
  '_schedule/_news': { events: [] },
  '_schedule/_meta': { seed: 'secret' },
  '_engine/state': { lastTick: 0 },
  '_teamStats/t': { exposure: 1, weight: 1 },
  '_auth/t': { passwordHash: 'x' },
  '_auth/_admin': { passwordHash: 'x' },
  'logs/l': { action: 'x' },
  // Nested docs under server-only collections (recursive deny).
  '_schedule/x/deep/1': { q: 0.5 },
  '_engine/state/deep/1': { v: 1 },
  '_teamStats/t/deep/1': { exposure: 1 },
  '_auth/t/deep/1': { passwordHash: 'x' },
  'logs/l/deep/1': { action: 'x' },
};

const PUBLIC = [
  'game/state',
  'companies/x',
  'companies/x/fundamentals/data',
  'companies/x/history/0',
  'market/summary',
  'market/summary/history/0',
  'news/n',
  'leaderboard/current',
];
const SERVER_ONLY = ['_schedule/x', '_schedule/_news', '_schedule/_meta', '_engine/state', '_teamStats/t', '_auth/t', '_auth/_admin', 'logs/l'];
const SERVER_ONLY_COLLECTIONS = ['_schedule', '_engine', '_teamStats', '_auth', 'logs'];
const SERVER_ONLY_DEEP = ['_schedule/x/deep/1', '_engine/state/deep/1', '_teamStats/t/deep/1', '_auth/t/deep/1', 'logs/l/deep/1'];
const CREW_T = ['teams/t', 'teams/t/holdings/h', 'teams/t/history/0', 'trades/t-trade', 'orders/t_order-0001'];
const CREW_U = ['teams/u', 'teams/u/holdings/h', 'teams/u/history/0', 'trades/u-trade', 'orders/u_order-0001'];

const read = (db: Db, path: string) => db.doc(path).get();

beforeAll(async () => {
  setLogLevel('silent'); // denied requests are the point here; don't log each one as an SDK error
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT!,
    firestore: { ...emulatorAddress(), rules: readFileSync(RULES_PATH, 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all(Object.entries(SEED).map(([path, doc]) => db.doc(path).set(doc)));
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('public reads', () => {
  it('a signed-out visitor, a crew and the host all read game state, companies, price history, market summary (+ history), news and the leaderboard', async () => {
    for (const db of [anon(), crew('t'), host()]) {
      for (const path of PUBLIC) await assertSucceeds(read(db, path));
    }
  });

  it('a signed-out visitor can list companies, a price-history chunk range, composite history and news', async () => {
    const db = anon();
    await assertSucceeds(db.collection('companies').orderBy('ticker').get());
    await assertSucceeds(db.collection('companies/x/history').get());
    await assertSucceeds(db.collection('market/summary/history').get());
    await assertSucceeds(db.collection('news').orderBy('firedAt', 'desc').limit(20).get());
  });

  it('fundamentals are public research data: one collection-group query reads every company profile, signed in or not', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all(['y', 'z'].map((id) => db.doc(`companies/${id}/fundamentals/data`).set({ revenue: 2 })));
    });
    for (const db of [anon(), crew('t'), host()]) {
      const snap = await assertSucceeds(db.collectionGroup('fundamentals').get());
      expect(snap.docs.map((d) => d.ref.path).sort()).toEqual(['companies/x/fundamentals/data', 'companies/y/fundamentals/data', 'companies/z/fundamentals/data']);
    }
    // Still read-only for everyone.
    for (const db of [anon(), crew('t'), host()]) {
      await assertFails(db.doc('companies/x/fundamentals/data').set({ revenue: 1e12 }));
    }
  });

  it('the v1 per-tick priceHistory path is no longer readable', async () => {
    await assertFails(read(anon(), 'companies/x/priceHistory/1'));
  });
});

describe('server-only data', () => {
  it('nobody signed out can read the schedule, engine state, team stats, logins, logs or any crew', async () => {
    const db = anon();
    for (const path of [...SERVER_ONLY, ...CREW_T]) await assertFails(read(db, path));
  });

  it('a crew cannot read the schedule, engine state, team stats, logins or logs', async () => {
    const db = crew('t');
    for (const path of SERVER_ONLY) await assertFails(read(db, path));
  });

  it('even the host cannot read server-only data from a client', async () => {
    const db = host();
    for (const path of SERVER_ONLY) await assertFails(read(db, path));
  });

  it('no client can list a server-only collection or read below one', async () => {
    for (const db of [anon(), crew('t'), host()]) {
      for (const name of SERVER_ONLY_COLLECTIONS) await assertFails(db.collection(name).get());
      for (const path of SERVER_ONLY_DEEP) await assertFails(read(db, path));
    }
  });
});

describe('crew-scoped reads', () => {
  it('crew t reads its team, holdings, value history, trades and orders', async () => {
    const db = crew('t');
    for (const path of CREW_T) await assertSucceeds(read(db, path));
  });

  it("crew t cannot read crew u's team, holdings, value history, trades or orders", async () => {
    const db = crew('t');
    for (const path of CREW_U) await assertFails(read(db, path));
  });

  it('crew t can query its own trades and orders by teamId, but not every trade', async () => {
    const db = crew('t');
    await assertSucceeds(db.collection('trades').where('teamId', '==', 't').get());
    await assertSucceeds(db.collection('orders').where('teamId', '==', 't').get());
    await assertSucceeds(db.collection('teams/t/holdings').get());
    await assertSucceeds(db.collection('teams/t/history').get());
    await assertFails(db.collection('trades').get());
    await assertFails(db.collection('orders').where('teamId', '==', 'u').get());
    await assertFails(db.collection('teams').get());
  });

  it("a crew cannot list another crew's holdings or value history, and a signed-out visitor lists none", async () => {
    for (const db of [crew('t'), anon()]) {
      await assertFails(db.collection('teams/u/holdings').get());
      await assertFails(db.collection('teams/u/history').get());
    }
    await assertFails(anon().collection('teams/t/history').get());
  });

  it('collection-group queries cannot sweep crew holdings or value history (only per-crew paths match)', async () => {
    for (const db of [anon(), crew('t')]) {
      await assertFails(db.collectionGroup('holdings').get());
      await assertFails(db.collectionGroup('history').get());
    }
  });

  it('the host cannot sweep holdings or history with a collection group from a client either', async () => {
    await assertFails(host().collectionGroup('holdings').get());
    await assertFails(host().collectionGroup('history').get());
  });

  it('a signed-in user without a team claim reads no crew data, even with a matching uid', async () => {
    const db = env.authenticatedContext('t').firestore();
    for (const path of CREW_T) await assertFails(read(db, path));
  });

  it('the host reads every crew', async () => {
    const db = host();
    for (const path of [...CREW_T, ...CREW_U]) await assertSucceeds(read(db, path));
    await assertSucceeds(db.collection('teams').orderBy('name').get());
    await assertSucceeds(db.collection('trades').get());
  });
});

describe('client writes', () => {
  const EXISTING = [...PUBLIC, ...CREW_T, ...CREW_U, ...SERVER_ONLY, ...SERVER_ONLY_DEEP];
  const ALL = [...EXISTING, 'companies/new', 'teams/t/holdings/new', 'teams/t/history/9', 'market/summary/history/9', 'orders/t_order-0002', '_engine/new'];

  it('nobody can create, update or delete anything: signed out, crew or host', async () => {
    for (const db of [anon(), crew('t'), host()]) {
      for (const path of ALL) {
        await assertFails(db.doc(path).set({ hacked: true }));
        await assertFails(db.doc(path).set({ cashBalance: 1e12 }, { merge: true }));
        await assertFails(db.doc(path).delete());
      }
      for (const path of EXISTING) await assertFails(db.doc(path).update({ cashBalance: 1e12 }));
    }
  });

  it("a crew cannot change its own cash, holdings or value history, even in a batch", async () => {
    const db = crew('t');
    await assertFails(db.doc('teams/t').update({ cashBalance: 1e12, totalValue: 1e12 }));
    await assertFails(db.doc('teams/t/holdings/h').update({ shares: 1e9 }));
    await assertFails(db.doc('teams/t/history/0').update({ values: [1e12] }));
    const batch = db.batch();
    batch.update(db.doc('teams/t'), { cashBalance: 1e12 });
    batch.set(db.doc('teams/t/holdings/x'), { companyId: 'x', shares: 1e9, avgCost: 1 });
    await assertFails(batch.commit());
  });

  it('a crew cannot add its own trade or order', async () => {
    const db = crew('t');
    await assertFails(db.collection('trades').add({ teamId: 't', quantity: 1_000_000 }));
    await assertFails(db.collection('orders').add({ teamId: 't', status: 'filled' }));
  });
});
