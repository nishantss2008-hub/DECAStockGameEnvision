/**
 * Crew management (services/crews.ts) with the order path it guards, against the in-memory
 * Firestore fake and a fake Auth. No emulator, network or credentials.
 *
 * - host error wording comes from COPY.md §11.1 host-errors
 * - a password reset and a removal revoke the crew's refresh tokens (a crew that never signed
 *   in has no Auth user, which is fine)
 * - orders from a removed crew fail with no_team and the COPY §9 message, write nothing and
 *   move no price
 * - after a removal, one standings refresh renumbers the remaining ranks, and nobody's movement arrow moves
 * - a removal run through engine.runCrewRemoval waits for a running standings recompute, so nothing is written back
 * - a removed crew's rejected orders leave no order doc, whatever the rejection
 * - concurrent duplicates of one clientOrderId share one outcome and reserve flow once
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', async () => {
  const { FakeFirestore } = await import('./helpers/fakeFirestore');
  return {
    db: new FakeFirestore(),
    adminAuth: { revokeRefreshTokens: vi.fn(async (_uid: string) => {}) },
    emulatorMode: true,
    EMULATOR_PROJECT_ID: 'demo-deca',
  };
});
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (operand: number) => ({ __fake: 'increment', operand }) },
}));

import { HOUR_MS, type Leaderboard, type Team } from '@deca/shared';
import { adminAuth, db as mockedDb } from '../src/firebase';
import type { FakeFirestore } from './helpers/fakeFirestore';
import { GameEngine } from '../src/engine/loop';
import { verifyPassword } from '../src/lib/password';
import { HOST_ERRORS } from '../src/lib/hostCopy';
import { CrewError, createCrew, removeCrew, resetCrewPassword } from '../src/services/crews';
import { resetLeaderboardCache } from '../src/services/leaderboard';
import { createMarket } from '../src/services/market';
import { executeOrder, TradeError, tradeError } from '../src/services/trading';
import { intervalShareCap, type FinalEntry, type OrderRecord } from '@deca/shared';

const db = mockedDb as unknown as FakeFirestore;
const revoke = (adminAuth as unknown as { revokeRefreshTokens: ReturnType<typeof vi.fn> }).revokeRefreshTokens;
const NO_TEAM = "Crew account not found. We couldn't find your crew's account. Sign out, sign back in, and try again; if it keeps happening, tell your host.";

async function crewErrorOf(p: Promise<unknown>): Promise<CrewError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CrewError);
  return err as CrewError;
}

async function liveMarket(): Promise<GameEngine> {
  db.reset();
  resetLeaderboardCache();
  await createMarket({ seed: 'crews-test-seed', keepCrews: false, adminPassword: 'host-pass', settings: { gameLengthMs: HOUR_MS } });
  const e = new GameEngine();
  await e.load();
  return e;
}

beforeEach(() => {
  revoke.mockReset();
  revoke.mockImplementation(async () => {});
});

describe('crew errors use the COPY.md host-errors wording', () => {
  it('exists, bad_name and not_found', async () => {
    db.reset();
    await createCrew('Salt Wind', 'pass1', 100_000_000);
    const exists = await crewErrorOf(createCrew('salt-wind', 'pass2', 100_000_000));
    expect([exists.code, exists.message]).toEqual(['exists', HOST_ERRORS.exists.message]);
    for (const name of ['admin', '!!!']) {
      const bad = await crewErrorOf(createCrew(name, 'pass1', 100_000_000));
      expect([bad.code, bad.message]).toEqual(['bad_name', HOST_ERRORS.bad_name.message]);
    }
    for (const p of [resetCrewPassword('ghost', 'pass1'), removeCrew('ghost'), removeCrew('../teams')]) {
      const missing = await crewErrorOf(p);
      expect([missing.code, missing.message]).toEqual(['not_found', HOST_ERRORS.not_found.message]);
    }
    expect(revoke).not.toHaveBeenCalled();
  });
});

describe('sessions are revoked on a password reset and a removal', () => {
  it('reset: the new password works and the crew is signed out everywhere', async () => {
    db.reset();
    await createCrew('Salt Wind', 'old-pass', 100_000_000);
    await resetCrewPassword('salt-wind', 'new-pass');
    const hash = (await db.doc('_auth/salt-wind').get()).data()!.passwordHash as string;
    expect(verifyPassword('new-pass', hash)).toBe(true);
    expect(verifyPassword('old-pass', hash)).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('salt-wind');
  });

  it('a crew that never signed in has no Auth user: that is not an error; any other Auth failure is', async () => {
    db.reset();
    await createCrew('Salt Wind', 'old-pass', 100_000_000);
    revoke.mockRejectedValueOnce(Object.assign(new Error('no user'), { code: 'auth/user-not-found' }));
    await expect(resetCrewPassword('salt-wind', 'new-pass')).resolves.toBeUndefined();
    revoke.mockRejectedValueOnce(Object.assign(new Error('auth is down'), { code: 'auth/internal-error' }));
    await expect(resetCrewPassword('salt-wind', 'newer-pass')).rejects.toThrow('auth is down');
  });

  it('removal revokes the sessions and deletes the crew, its login and its data', async () => {
    db.reset();
    await createCrew('Salt Wind', 'pass1', 100_000_000);
    await db.doc('teams/salt-wind/holdings/kraken').set({ companyId: 'kraken', shares: 5, avgCost: 100 });
    await db.doc('trades/t1').set({ teamId: 'salt-wind' });
    await removeCrew('salt-wind');
    expect(revoke).toHaveBeenCalledWith('salt-wind');
    expect([...db.docs.keys()].filter((p) => p.includes('salt-wind') || p === 'trades/t1')).toEqual([]);
  });
});

describe('orders from a removed crew', () => {
  it('fail with no_team and the COPY message, write no order doc and reserve no flow', async () => {
    const e = await liveMarket();
    await createCrew('Alpha', 'pass1', 100_000_000);
    await createCrew('Bravo', 'pass1', 100_000_000);
    await e.startGame();
    const co = e.companies()[0]!;
    await executeOrder(e, 'bravo', { companyId: co.id, side: 'buy', quantity: 10, clientOrderId: 'bravo-order-1' });
    await removeCrew('bravo');

    const quoteBefore = e.quote(co.id, 'buy', 100, 'alpha');
    const err = await executeOrder(e, 'bravo', { companyId: co.id, side: 'buy', quantity: 10, clientOrderId: 'bravo-order-2' }).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(TradeError);
    expect(err).toMatchObject({ code: 'no_team', message: NO_TEAM });
    expect((err as TradeError).message).toBe(tradeError('no_team').message);
    expect(db.docs.has('orders/bravo_bravo-order-2')).toBe(false);
    expect(db.docs.has('teams/bravo')).toBe(false);
    expect(e.quote(co.id, 'buy', 100, 'alpha')).toEqual(quoteBefore); // pending flow unchanged

    // A crew created again under that name trades normally.
    await createCrew('Bravo', 'pass2', 100_000_000);
    await expect(executeOrder(e, 'bravo', { companyId: co.id, side: 'buy', quantity: 10, clientOrderId: 'bravo-order-3' })).resolves.toMatchObject({ teamId: 'bravo' });
  });

  it('a crew whose account is gone without a removal in this process (for example after a restart) gets the same answer from the order transaction', async () => {
    const e = await liveMarket();
    await createCrew('Charlie', 'pass1', 100_000_000);
    await e.startGame();
    const co = e.companies()[1]!;
    await db.doc('teams/charlie').delete();
    const quoteBefore = e.quote(co.id, 'sell', 100, 'charlie');
    await expect(executeOrder(e, 'charlie', { companyId: co.id, side: 'buy', quantity: 10, clientOrderId: 'charlie-order-1' })).rejects.toMatchObject({
      code: 'no_team',
      message: NO_TEAM,
    });
    expect(db.docs.has('orders/charlie_charlie-order-1')).toBe(false);
    expect(e.quote(co.id, 'sell', 100, 'charlie')).toEqual(quoteBefore); // the reservation was released
  });
});

describe('removing a crew renumbers the standings at once', () => {
  it('one refresh after the removal leaves ranks 1..n with no gap', async () => {
    const e = await liveMarket();
    await createCrew('Alpha', 'pass1', 100_000_000);
    await createCrew('Bravo', 'pass1', 100_000_000);
    await createCrew('Charlie', 'pass1', 100_000_000);
    await e.startGame();
    await db.doc('teams/alpha').update({ cashBalance: 300_000_000 });
    await db.doc('teams/bravo').update({ cashBalance: 200_000_000 });
    const now = e.state.startAt! + e.state.tickIntervalMs;
    vi.setSystemTime(now);
    await e.tickOnce(now);
    const ranks = () => get<Leaderboard>('leaderboard/current').entries.map((x) => [x.teamId, x.rank]);
    expect(ranks()).toEqual([['alpha', 1], ['bravo', 2], ['charlie', 3]]);

    await removeCrew('bravo');
    resetLeaderboardCache();
    await e.refreshStandings();
    expect(ranks()).toEqual([['alpha', 1], ['charlie', 2]]);
    expect((await db.doc('teams/charlie').get()).data() as unknown as Team).toMatchObject({ rank: 2 });
    expect(get<Leaderboard>('leaderboard/current').tick).toBe(1);
    // The refresh is idempotent for the tick: no research exposure is counted twice.
    const stats = (await db.doc('_teamStats/alpha').get()).data();
    await e.refreshStandings();
    expect((await db.doc('_teamStats/alpha').get()).data()).toEqual(stats);
    vi.useRealTimers();
  });

  it('in the lobby and after the end, refreshStandings writes nothing', async () => {
    const e = await liveMarket();
    const writes = db.writes.length;
    await e.refreshStandings();
    expect(db.writes.length).toBe(writes);
  });
});

describe('removal in the engine queue', () => {
  it('waits for a standings recompute that has already read the crews, so it cannot write the removed crew back', async () => {
    const e = await liveMarket();
    await createCrew('Alpha', 'pass1', 100_000_000);
    await createCrew('Bravo', 'pass1', 100_000_000);
    await e.startGame();
    const co = e.companies()[0]!;
    await executeOrder(e, 'bravo', { companyId: co.id, side: 'buy', quantity: 10, clientOrderId: 'bravo-order-1' });

    // Hold the recompute of tick 1 after it has read the crews.
    const original = db.collectionGroup.bind(db);
    let open!: () => void;
    let reached = false;
    const gate = new Promise<void>((r) => (open = r));
    (db as unknown as { collectionGroup: (id: string) => unknown }).collectionGroup = (id: string) => {
      const q = original(id);
      if (id !== 'holdings') return q;
      delete (db as unknown as { collectionGroup?: unknown }).collectionGroup;
      return {
        get: async () => {
          reached = true;
          await gate;
          return q.get();
        },
      };
    };
    const tick = e.tickOnce(e.state.startAt! + e.state.tickIntervalMs + 10);
    await vi.waitFor(() => expect(reached).toBe(true));
    let removed = false;
    const removal = e.runCrewRemoval(() => removeCrew('bravo')).then(() => (removed = true));
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    expect(removed).toBe(false);
    expect(db.docs.has('teams/bravo')).toBe(true); // the removal has not started: the recompute holds the queue

    open();
    await Promise.all([tick, removal]);
    expect([...db.docs.keys()].filter((p) => p.includes('bravo'))).toEqual([]);
    expect(get<Leaderboard>('leaderboard/current').entries.map((x) => [x.teamId, x.rank])).toEqual([['alpha', 1]]);
    expect(get<Team>('teams/alpha').rank).toBe(1);
  });

  it('a failed removal is thrown, and a failed refresh is reported without failing the removal', async () => {
    const e = await liveMarket();
    await createCrew('Alpha', 'pass1', 100_000_000);
    await e.startGame();
    await expect(e.runCrewRemoval(() => removeCrew('ghost'))).rejects.toMatchObject({ code: 'not_found' });

    const failures: unknown[] = [];
    (db as unknown as { collectionGroup: () => never }).collectionGroup = () => {
      throw new Error('firestore down');
    };
    try {
      await e.runCrewRemoval(() => removeCrew('alpha'), (err) => failures.push(err));
    } finally {
      delete (db as unknown as { collectionGroup?: unknown }).collectionGroup;
    }
    expect(failures).toHaveLength(1);
    expect(db.docs.has('teams/alpha')).toBe(false);
  });
});

describe('rejected orders from a removed crew', () => {
  it('leave no order doc for any rejection: validation, price protection, the interval cap or a paused market', async () => {
    const e = await liveMarket();
    await createCrew('Bravo', 'pass1', 100_000_000);
    await e.startGame();
    const co = e.companies()[0]!;
    await removeCrew('bravo');

    const attempts: Array<[string, Parameters<typeof executeOrder>[2]]> = [
      ['bad_quantity', { companyId: co.id, side: 'buy', quantity: 0.5, clientOrderId: 'bravo-badqty' }],
      ['unknown_company', { companyId: 'ghost-co', side: 'buy', quantity: 1, clientOrderId: 'bravo-unknown' }],
      ['price_moved', { companyId: co.id, side: 'buy', quantity: 1, clientOrderId: 'bravo-moved', quotedPrice: 1 }],
      ['interval_limit', { companyId: co.id, side: 'buy', quantity: intervalShareCap(co.sharesOutstanding) + 1, clientOrderId: 'bravo-cap' }],
    ];
    for (const [code, o] of attempts) await expect(executeOrder(e, 'bravo', o)).rejects.toMatchObject({ code });
    await e.pauseGame();
    await expect(executeOrder(e, 'bravo', { companyId: co.id, side: 'buy', quantity: 1, clientOrderId: 'bravo-paused' })).rejects.toMatchObject({ code: 'market_closed' });
    expect([...db.docs.keys()].filter((p) => p.includes('bravo'))).toEqual([]);

    // An existing crew's rejection is still recorded.
    await createCrew('Alpha', 'pass1', 100_000_000);
    await expect(executeOrder(e, 'alpha', { companyId: co.id, side: 'buy', quantity: 1, clientOrderId: 'alpha-paused' })).rejects.toMatchObject({ code: 'market_closed' });
    expect(get<OrderRecord>('orders/alpha_alpha-paused')).toMatchObject({ status: 'rejected', code: 'market_closed' });
  });
});

describe('removal and movement arrows', () => {
  it('crews that started the session below the removed crew move up one place, so nobody shows movement from the removal', async () => {
    const e = await liveMarket();
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) await createCrew(name, 'pass1', 100_000_000);
    await e.startGame();
    const tick = async (t: number) => e.tickOnce(e.state.startAt! + t * e.state.tickIntervalMs + 10);
    const board = () => get<Leaderboard>('leaderboard/current').entries.map((x) => [x.teamId, x.rank, x.prevRank]);
    await tick(1); // equal values: alpha, bravo, charlie, delta
    await db.doc('teams/delta').update({ cashBalance: 400_000_000 });
    await tick(2);
    expect(board()).toEqual([['delta', 1, 4], ['alpha', 2, 1], ['bravo', 3, 2], ['charlie', 4, 3]]);

    await e.runCrewRemoval(() => removeCrew('alpha'));
    expect(board()).toEqual([['delta', 1, 3], ['bravo', 2, 1], ['charlie', 3, 2]]);
    expect(['bravo', 'charlie', 'delta'].map((id) => get<Team>(`teams/${id}`).sessionStartRank)).toEqual([1, 2, 3]);

    // After the end: the final standings, their arrows and the crews' own ranks renumber.
    await e.endGame();
    const final = () => get<Leaderboard>('leaderboard/current').final!.entries.map((x: FinalEntry) => [x.teamId, x.rank, x.prevRank]);
    expect(final()).toEqual([['delta', 1, 3], ['bravo', 2, 1], ['charlie', 3, 2]]);
    await e.runCrewRemoval(() => removeCrew('bravo'));
    expect(final()).toEqual([['delta', 1, 2], ['charlie', 2, 1]]);
    expect(board()).toEqual([['delta', 1, 2], ['charlie', 2, 1]]);
    expect([get<Team>('teams/delta').rank, get<Team>('teams/charlie').rank]).toEqual([1, 2]);
  });
});

describe('concurrent duplicate clientOrderIds', () => {
  it('share one outcome and reserve flow once: no transaction ever sees phantom flow', async () => {
    const e = await liveMarket();
    await createCrew('Alpha', 'pass1', 100_000_000);
    await e.startGame();
    const co = e.companies()[0]!;
    const netSeen: number[] = [];
    const runTransaction = db.runTransaction.bind(db);
    (db as unknown as { runTransaction: typeof runTransaction }).runTransaction = (fn) => {
      netSeen.push(e.adminMarket()[0]!.netFlow);
      return runTransaction(fn);
    };
    try {
      const order = { companyId: co.id, side: 'buy' as const, quantity: 40, clientOrderId: 'alpha-dup-1' };
      const trades = await Promise.all([1, 2, 3, 4].map(() => executeOrder(e, 'alpha', order)));
      expect(new Set(trades.map((t) => t.id)).size).toBe(1);
      expect(Math.max(...netSeen)).toBe(40);
      expect(e.adminMarket()[0]!.netFlow).toBe(40);
      expect(get<Team>('teams/alpha').tradeCount).toBe(1);

      // Duplicates of a rejected order all get the first order's rejection.
      const cap = intervalShareCap(co.sharesOutstanding);
      const big = { companyId: co.id, side: 'buy' as const, quantity: cap - 40, clientOrderId: 'alpha-dup-2' };
      const errors = await Promise.all([1, 2, 3].map(() => executeOrder(e, 'alpha', big).then(() => null, (x: unknown) => x as TradeError)));
      expect(errors.map((x) => x?.code)).toEqual(['insufficient_funds', 'insufficient_funds', 'insufficient_funds']);
      expect(new Set(errors.map((x) => x?.message)).size).toBe(1);
      expect(e.adminMarket()[0]!.netFlow).toBe(40);
      // Once settled, the same clientOrderId runs afresh (and is rejected again on its own).
      await expect(executeOrder(e, 'alpha', big)).rejects.toMatchObject({ code: 'insufficient_funds' });
    } finally {
      delete (db as unknown as { runTransaction?: unknown }).runTransaction;
    }
  });
});

function get<T>(path: string): T {
  const d = db.docs.get(path);
  if (!d) throw new Error(`missing doc ${path}`);
  return structuredClone(d) as T;
}
