/**
 * services/market.ts on the SQLite store: a fresh market lands in the lobby with
 * 15 companies, the hidden data goes to `company_secret` / `meta.seed` only, and a
 * re-run is idempotent (same seed → identical market, nothing left from the last one).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_LENGTH_MS, DEFAULT_STARTING_CAPITAL, deriveClock, MINUTE_MS } from '@deca/shared';
import { openStore, useStore, type Store } from '../src/store';
import { ADMIN_PASSWORD_KEY, clearDynamicData, createMarket, MARKET_CREATED_KEY, SEED_KEY } from '../src/services/market';
import { verifyPassword } from '../src/lib/password';
import { ROSTER } from '../src/seed/roster';

let store: Store;

beforeEach(() => {
  store = openStore(':memory:');
  useStore(store);
});
afterEach(() => {
  useStore(null);
  store.close();
});

const SEED = 'market-test-seed';

describe('createMarket', () => {
  it('writes every roster company with fundamentals and a tick-0 price', async () => {
    const result = await createMarket({ seed: SEED, keepCrews: false });

    expect(result.companies).toBe(15);
    expect(ROSTER).toHaveLength(15);
    expect(store.companies.all()).toHaveLength(15);
    expect(Object.keys(store.fundamentals.all())).toHaveLength(15);
    expect(store.companies.all().map((c) => c.id).sort()).toEqual(ROSTER.map((r) => r.id).sort());

    for (const c of store.companies.all()) {
      expect(c.currentPrice).toBeGreaterThan(0);
      expect(Number.isInteger(c.currentPrice)).toBe(true);
      expect(c.currentPrice).toBe(c.startPrice);
      expect(c.lastTick).toBe(0);
      expect(store.history.range(c.id, 0, 0)).toEqual([{ tick: 0, price: c.startPrice, volume: 0 }]);
      expect(store.history.latestTick(c.id)).toBe(0);
    }
  });

  it('opens in the lobby with a 30-minute clock and a tick-0 index of 1000', async () => {
    await createMarket({ seed: SEED, keepCrews: false });
    const clock = deriveClock(DEFAULT_GAME_LENGTH_MS);
    expect(store.game.get()).toMatchObject({
      phase: 'lobby',
      currentTick: 0,
      startAt: null,
      endAt: null,
      gameLengthMs: 30 * MINUTE_MS,
      totalTicks: clock.totalTicks,
      sessionTicks: clock.sessionTicks,
      tickIntervalMs: clock.tickIntervalMs,
      startingCapital: DEFAULT_STARTING_CAPITAL,
    });
    expect(clock.totalTicks).toBe(360);

    const market = store.market.get();
    expect(market).toMatchObject({ lastTick: 0, composite: { value: 1000, open: 1000, sessionOpen: 1000 } });
    expect(Object.keys(market!.sectors).length).toBeGreaterThan(0);
    expect(market!.breadth.unchanged).toBe(15);
    expect(store.market.historyRange(0, 0)).toEqual([{ tick: 0, value: 1000 }]);
  });

  it('keeps the hidden data out of every public row', async () => {
    await createMarket({ seed: SEED, keepCrews: false });

    const secrets = store.secrets.all();
    expect(Object.keys(secrets)).toHaveLength(15);
    const first = Object.values(secrets)[0]!;
    expect(first.q).toBeGreaterThanOrEqual(-1);
    expect(first.q).toBeLessThanOrEqual(1);
    expect(first.qEff).toBeGreaterThanOrEqual(-1);
    expect(first.pillars).toBeTruthy();
    expect('ABCDF').toContain(first.grade);
    expect(first.startPriceCents).toBe(store.companies.get(first.companyId)!.startPrice);

    // nothing hidden leaks into companies, fundamentals or the game state
    const publicJson = JSON.stringify({
      companies: store.companies.all(),
      fundamentals: store.fundamentals.all(),
      game: store.game.get(),
      market: store.market.get(),
    });
    for (const hidden of ['"q"', 'qEff', 'surprise', 'pillars', 'fairValue', 'reveal', SEED]) {
      expect(publicJson).not.toContain(hidden);
    }
    // the seed is server-only
    expect(store.meta.get(SEED_KEY)).toBe(SEED);
    expect(Number(store.meta.get(MARKET_CREATED_KEY))).toBeGreaterThan(0);
  });

  it('generates a high-entropy seed when none is given', async () => {
    const a = await createMarket({ keepCrews: false });
    const b = await createMarket({ keepCrews: false });
    expect(a.seed).not.toBe(b.seed);
    expect(a.seed.length).toBeGreaterThanOrEqual(16);
    expect(store.meta.get(SEED_KEY)).toBe(b.seed);
  });

  it('is idempotent: the same seed rebuilds the same market and leaves nothing behind', async () => {
    await createMarket({ seed: SEED, keepCrews: false });
    const before = store.companies.all();
    const secretsBefore = store.secrets.all();

    // dirty the market, then rebuild it
    store.companies.update(before[0]!.id, { currentPrice: 1 });
    store.history.append([{ companyId: before[0]!.id, tick: 5, price: 1, volume: 7 }]);
    store.news.insert([
      {
        id: 'n1',
        headline: 'h',
        body: 'b',
        companyIds: [before[0]!.id],
        type: 'earnings',
        sentiment: 'bullish',
        source: 'scheduled',
        tick: 3,
        firedAt: 30,
        priceAtFire: {},
      },
    ]);
    store.engine.set({ lastTick: 5, hM: 1.3, companies: {} });

    const again = await createMarket({ seed: SEED, keepCrews: false });
    expect(again.companies).toBe(15);
    expect(store.companies.all()).toEqual(before);
    expect(store.secrets.all()).toEqual(secretsBefore);
    expect(store.companies.all()).toHaveLength(15);
    expect(store.history.range(before[0]!.id, 0, 100)).toHaveLength(1);
    expect(store.news.recent(10)).toEqual([]);
    expect(store.engine.get()).toBeNull();
  });

  it('carries the stored settings forward and applies the given overrides', async () => {
    await createMarket({ seed: SEED, keepCrews: false, settings: { gameLengthMs: 10 * MINUTE_MS, feeBps: 25 } });
    expect(store.game.get()).toMatchObject({ gameLengthMs: 10 * MINUTE_MS, feeBps: 25, totalTicks: 120 });

    // a second market with no settings keeps them
    await createMarket({ seed: SEED, keepCrews: false });
    expect(store.game.get()).toMatchObject({ gameLengthMs: 10 * MINUTE_MS, feeBps: 25 });

    // undefined fields do not overwrite
    await createMarket({ seed: SEED, keepCrews: false, settings: { feeBps: undefined, maxPositionPct: 0.25 } });
    expect(store.game.get()).toMatchObject({ gameLengthMs: 10 * MINUTE_MS, feeBps: 25, maxPositionPct: 0.25 });

    // an invalid length falls back to the default
    await createMarket({ seed: SEED, keepCrews: false, settings: { gameLengthMs: 99 } });
    expect(store.game.get()).toMatchObject({ gameLengthMs: DEFAULT_GAME_LENGTH_MS });
  });

  it('keeps or deletes crews as asked, resetting the kept ones to the starting capital', async () => {
    await createMarket({ seed: SEED, keepCrews: false, settings: { startingCapital: 500_000 } });
    store.crews.create({ id: 'sea-dogs', name: 'Sea Dogs', passwordHash: 'salt:hash', startingCapital: 500_000 });
    store.crews.update('sea-dogs', { cashBalance: 1, totalValue: 2, tradeCount: 9 });
    store.holdings.upsert('sea-dogs', { companyId: store.companies.all()[0]!.id, shares: 3, avgCost: 10 });

    await createMarket({ seed: SEED, keepCrews: true });
    expect(store.crews.get('sea-dogs')).toMatchObject({ cashBalance: 500_000, totalValue: 500_000, tradeCount: 0 });
    expect(store.holdings.forCrew('sea-dogs')).toEqual([]);
    expect(store.crews.passwordHash('sea-dogs')).toBe('salt:hash');

    await createMarket({ seed: SEED, keepCrews: false });
    expect(store.crews.all()).toEqual([]);
  });

  describe('host password', () => {
    it('generates one when no host login exists yet', async () => {
      const result = await createMarket({ seed: SEED, keepCrews: false });
      expect(result.adminPasswordSet).toBe(true);
      expect(result.generatedAdminPassword).toBeTruthy();
      expect(verifyPassword(result.generatedAdminPassword!, store.meta.get(ADMIN_PASSWORD_KEY)!)).toBe(true);
    });

    it('leaves an existing host login alone', async () => {
      const first = await createMarket({ seed: SEED, keepCrews: false });
      const hash = store.meta.get(ADMIN_PASSWORD_KEY);
      const second = await createMarket({ seed: SEED, keepCrews: false });
      expect(second.adminPasswordSet).toBe(false);
      expect(second.generatedAdminPassword).toBeUndefined();
      expect(store.meta.get(ADMIN_PASSWORD_KEY)).toBe(hash);
      expect(verifyPassword(first.generatedAdminPassword!, store.meta.get(ADMIN_PASSWORD_KEY)!)).toBe(true);
    });

    it('applies the password it is given and never stores it in the clear', async () => {
      const result = await createMarket({ seed: SEED, keepCrews: false, adminPassword: 'a-long-host-password' });
      expect(result.adminPasswordSet).toBe(true);
      expect(result.generatedAdminPassword).toBeUndefined();
      const stored = store.meta.get(ADMIN_PASSWORD_KEY)!;
      expect(stored).not.toContain('a-long-host-password');
      expect(verifyPassword('a-long-host-password', stored)).toBe(true);
      expect(verifyPassword('wrong', stored)).toBe(false);
    });
  });
});

describe('clearDynamicData', () => {
  it('empties the market but keeps the game state and the host login', async () => {
    await createMarket({ seed: SEED, keepCrews: false, adminPassword: 'a-long-host-password' });
    await clearDynamicData({ keepCrews: false, startingCapital: DEFAULT_STARTING_CAPITAL });

    expect(store.companies.all()).toEqual([]);
    expect(store.secrets.all()).toEqual({});
    expect(store.fundamentals.all()).toEqual({});
    expect(store.market.get()).toBeNull();
    expect(store.meta.get(SEED_KEY)).toBeNull();
    expect(store.game.get()).not.toBeNull();
    expect(store.meta.get(ADMIN_PASSWORD_KEY)).not.toBeNull();
  });
});
