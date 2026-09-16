/**
 * Crew management (services/crews.ts) with the order path it guards, against a real `:memory:`
 * store and a stub engine. No emulator, no network, no credentials.
 *
 * - host error wording comes from COPY.md §11.1 host-errors
 * - a password reset and a removal bump the crew's token version, so its devices are signed out
 * - orders from a removed crew fail with no_team and the COPY §9 message, write nothing and
 *   move no price
 * - after a removal the standings renumber and nobody's movement arrow moves
 * - a removed crew's rejected orders leave no order row, whatever the rejection
 * - concurrent duplicates of one clientOrderId share one outcome and reserve flow once
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Leaderboard } from '@deca/shared';
import { openStore, useStore, type Store } from '../src/store';
import { verifyPassword } from '../src/lib/password';
import { HOST_ERRORS } from '../src/lib/hostCopy';
import { CrewError, createCrew, crewError, removeCrew, resetCrewPassword, setCrewTrading } from '../src/services/crews';
import { executeOrder, TradeError, type TradingEngine } from '../src/services/trading';
import { KRKN, seedWorld } from './helpers/apiFixtures';

let store: Store;
let reserved = 0;

/** The smallest engine `executeOrder` needs: a live phase, one company and a fixed fill price. */
function stubEngine(phase = 'live'): TradingEngine {
  return {
    state: {
      phase,
      currentTick: 12,
      feeBps: 10,
      maxPositionPct: 1,
      tickIntervalMs: 5000,
      startAt: Date.now() - 60_000,
      currency: { name: 'Doubloon', symbol: '⌬' },
    },
    getCompany: (id: string) => (id === KRKN ? { id: KRKN, ticker: 'KRKN', sharesOutstanding: 1_000_000 } : undefined),
    getPrice: () => 1000,
    reserveFlow: () => {
      reserved += 1;
      return { fillPrice: 1000, lastPrice: 1000, impactBps: 2, tick: 12, release: () => (reserved -= 1) };
    },
  } as unknown as TradingEngine;
}

const order = (clientOrderId: string, extra: Record<string, unknown> = {}): never =>
  ({ companyId: KRKN, side: 'buy', quantity: 5, clientOrderId, ...extra }) as never;

beforeEach(() => {
  reserved = 0;
  store = openStore(':memory:');
  useStore(store);
  seedWorld(store);
});

afterEach(() => {
  useStore(null);
  store.close();
});

describe('crew errors use the COPY.md host-errors wording', () => {
  it.each(['exists', 'bad_name', 'not_found'] as const)('%s', (code) => {
    const err = crewError(code);
    expect(err).toBeInstanceOf(CrewError);
    expect(err.message).toBe(HOST_ERRORS[code].message);
  });

  it('refuses a name that slugifies to nothing, and a duplicate', async () => {
    await expect(createCrew('   ', 'password-123', 1000)).rejects.toMatchObject({ code: 'bad_name' });
    await expect(createCrew('admin', 'password-123', 1000)).rejects.toMatchObject({ code: 'bad_name' });
    await createCrew('Gale Runners', 'password-123', 1000);
    await expect(createCrew('gale runners', 'password-123', 1000)).rejects.toMatchObject({ code: 'exists' });
  });

  it('refuses a path-shaped or unknown crew id', async () => {
    for (const id of ['../admin', 'Saltwind!', 'ghost']) {
      await expect(resetCrewPassword(id, 'password-123')).rejects.toMatchObject({ code: 'not_found' });
      await expect(setCrewTrading(id, false)).rejects.toMatchObject({ code: 'not_found' });
    }
  });
});

describe('a new crew', () => {
  it('starts with the configured capital and a working login hash', async () => {
    const crew = await createCrew('Gale Runners', 'anchors-aweigh', 750_000);
    expect(crew.id).toBe('gale-runners');
    const row = store.crews.get('gale-runners')!;
    expect(row).toMatchObject({ cashBalance: 750_000, totalValue: 750_000, tradingDisabled: false, holdingsCount: 0 });
    expect(verifyPassword('anchors-aweigh', store.crews.passwordHash('gale-runners')!)).toBe(true);
  });
});

describe('a password reset', () => {
  it('replaces the hash and bumps the token version', async () => {
    const before = store.crews.tokenVersion('saltwind')!;
    await resetCrewPassword('saltwind', 'brand-new-pass');
    expect(verifyPassword('brand-new-pass', store.crews.passwordHash('saltwind')!)).toBe(true);
    expect(store.crews.tokenVersion('saltwind')).toBe(before + 1);
  });
});

describe('removing a crew', () => {
  it('takes its holdings, trades, orders and history with it, and leaves every other crew alone', async () => {
    await removeCrew('saltwind');
    expect(store.crews.get('saltwind')).toBeNull();
    expect(store.crews.tokenVersion('saltwind')).toBeNull();
    expect(store.holdings.forCrew('saltwind')).toEqual([]);
    expect(store.trades.forCrew('saltwind', 50)).toEqual([]);
    expect(store.orders.forCrew('saltwind', 50)).toEqual([]);
    expect(store.crewHistory.range('saltwind', 0, 100)).toEqual([]);

    expect(store.crews.get('blackfin')).not.toBeNull();
    expect(store.holdings.forCrew('blackfin')).toHaveLength(1);
    expect(store.trades.forCrew('blackfin', 50)).toHaveLength(1);
  });

  it('renumbers the standings with no gap, live and final', async () => {
    const lb = store.leaderboard.get()!;
    const final: Leaderboard['final'] = {
      endedAt: Date.now(),
      entries: lb.entries.map((e) => ({ ...e, researchScore: 1, researchGrade: 'B' as const })),
    };
    store.leaderboard.set({ ...lb, final });

    await removeCrew('saltwind');
    const after = store.leaderboard.get()!;
    expect(after.entries.map((e) => [e.teamId, e.rank])).toEqual([['blackfin', 1]]);
    expect(after.final!.entries.map((e) => [e.teamId, e.rank])).toEqual([['blackfin', 1]]);
    // The final standings are the last word, so the crew row follows them.
    expect(store.crews.get('blackfin')!.rank).toBe(1);
  });

  it('moves crews that started the session below it up one place, so the removal shows no movement', async () => {
    store.crews.update('saltwind', { sessionStartRank: 1 });
    store.crews.update('blackfin', { sessionStartRank: 2 });
    await removeCrew('saltwind');
    expect(store.crews.get('blackfin')!.sessionStartRank).toBe(1);
  });

  it('is not found twice', async () => {
    await removeCrew('saltwind');
    await expect(removeCrew('saltwind')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('orders from a removed crew', () => {
  it('fail with no_team, write nothing and release the flow', async () => {
    await removeCrew('saltwind');
    const engine = stubEngine();
    await expect(executeOrder(engine, 'saltwind', order('gone-order-1'))).rejects.toMatchObject({ code: 'no_team' });
    expect(store.orders.byClientId('saltwind', 'gone-order-1')).toBeNull();
    expect(store.trades.forCrew('saltwind', 10)).toEqual([]);
    expect(store.holdings.forCrew('saltwind')).toEqual([]);
    expect(reserved).toBe(0);
  });

  it('leave no order row for any rejection: validation, an unknown company or a closed market', async () => {
    await removeCrew('saltwind');
    const live = stubEngine();
    const paused = stubEngine('paused');
    const attempts: [TradingEngine, never][] = [
      [live, order('gone-order-2', { quantity: 0 })],
      [live, order('gone-order-3', { companyId: 'nope' })],
      [paused, order('gone-order-4')],
    ];
    for (const [engine, req] of attempts) {
      await expect(executeOrder(engine, 'saltwind', req)).rejects.toBeInstanceOf(TradeError);
    }
    expect(store.orders.forCrew('saltwind', 50)).toEqual([]);
    expect(reserved).toBe(0);
  });
});

describe('a crew whose trading the host turned off', () => {
  it('gets the COPY message and a rejected order row it can see', async () => {
    await setCrewTrading('saltwind', false);
    await expect(executeOrder(stubEngine(), 'saltwind', order('disabled-order-1'))).rejects.toMatchObject({
      code: 'trading_disabled',
    });
    const rec = store.orders.byClientId('saltwind', 'disabled-order-1')!;
    expect(rec).toMatchObject({ status: 'rejected', code: 'trading_disabled', teamId: 'saltwind' });
    expect(rec.reason).toContain('Trading turned off for your crew');
    expect(reserved).toBe(0);
  });
});

describe('concurrent duplicates of one clientOrderId', () => {
  it('share one outcome and reserve flow once', async () => {
    const engine = stubEngine();
    const [a, b] = await Promise.all([
      executeOrder(engine, 'saltwind', order('twin-order-1')),
      executeOrder(engine, 'saltwind', order('twin-order-1')),
    ]);
    expect(a.id).toBe(b.id);
    expect(store.trades.forCrew('saltwind', 50).filter((t) => t.clientOrderId === 'twin-order-1')).toHaveLength(1);
    // One reservation, still held by the single fill (the engine releases it at the next tick).
    expect(reserved).toBe(1);
    expect(store.crews.get('saltwind')!.tradeCount).toBe(1);
  });
});
