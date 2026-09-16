/**
 * The folding rules: a tick carries prices only, so the store has to keep every derived field the
 * screens read honest until the next snapshot corrects it.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Company, NewsEvent } from '@deca/shared';
import {
  appendPoint,
  applyPrice,
  createTestLiveStore,
  mergeNews,
  selectCompanies,
  selectCompany,
  type Snapshot,
} from './liveStore';

const company = (over: Partial<Company> = {}): Company =>
  ({
    id: 'kraken',
    name: 'Kraken Shipping',
    ticker: 'KRK',
    sector: 'shipping',
    description: '',
    currentPrice: 1000,
    startPrice: 800,
    sessionOpen: 1000,
    sessionHigh: 1100,
    sessionLow: 900,
    sessionVolume: 0,
    voyageHigh: 1200,
    voyageLow: 700,
    sessionChange: 0,
    voyageChange: 0.25,
    sharesOutstanding: 10,
    marketCap: 10_000,
    beta: 1,
    adv: 100,
    lastTick: 3,
    ...over,
  }) as Company;

const news = (id: string, firedAt: number): NewsEvent =>
  ({ id, headline: id, body: '', companyIds: [], type: 'earnings', sentiment: 'bullish', source: 'scheduled', tick: firedAt, firedAt, priceAtFire: {} }) as NewsEvent;

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  serverTime: 5,
  game: null,
  companies: [company()],
  market: null,
  leaderboard: null,
  news: [],
  portfolio: null,
  ...over,
});

describe('applyPrice', () => {
  it('re-derives session and voyage fields from a new last price', () => {
    const next = applyPrice(company(), 1300, 4);
    expect(next).toMatchObject({
      currentPrice: 1300,
      lastTick: 4,
      sessionHigh: 1300,
      sessionLow: 900,
      voyageHigh: 1300,
      voyageLow: 700,
      marketCap: 13_000,
    });
    expect(next.sessionChange).toBeCloseTo(0.3);
    expect(next.voyageChange).toBeCloseTo(0.625);
  });

  it('keeps the lows when the price falls back, and never rewinds lastTick', () => {
    const next = applyPrice(company({ lastTick: 9 }), 500, 4);
    expect(next).toMatchObject({ sessionLow: 500, voyageLow: 500, sessionHigh: 1100, lastTick: 9 });
  });

  it('ignores a price that did not move or is not a number', () => {
    const base = company();
    expect(applyPrice(base, 1000, 3)).toBe(base);
    expect(applyPrice(base, Number.NaN, 3)).toBe(base);
  });
});

describe('appendPoint', () => {
  it('appends, replaces a repeat of the same tick, and stays bounded', () => {
    const one = appendPoint([], { tick: 1, value: 10 });
    const two = appendPoint(one, { tick: 2, value: 20 });
    expect(appendPoint(two, { tick: 2, value: 25 })).toEqual([
      { tick: 1, value: 10 },
      { tick: 2, value: 25 },
    ]);
    let series: { tick: number; value: number }[] = [];
    for (let t = 0; t < 10; t += 1) series = appendPoint(series, { tick: t, value: t }, 3);
    expect(series).toEqual([
      { tick: 7, value: 7 },
      { tick: 8, value: 8 },
      { tick: 9, value: 9 },
    ]);
  });

  it('keeps an out-of-order point in tick order', () => {
    const series = appendPoint([{ tick: 5, value: 1 }], { tick: 2, value: 9 });
    expect(series.map((p) => p.tick)).toEqual([2, 5]);
  });
});

describe('mergeNews', () => {
  it('keeps newest first, drops duplicate ids and caps the list', () => {
    const merged = mergeNews([news('a', 1)], [news('c', 3), news('a', 1), news('b', 2)]);
    expect(merged.map((n) => n.id)).toEqual(['c', 'b', 'a']);
    expect(mergeNews(merged, [news('d', 4)], 2).map((n) => n.id)).toEqual(['d', 'c']);
  });

  it('returns the same list when nothing fired', () => {
    const current = [news('a', 1)];
    expect(mergeNews(current, [])).toBe(current);
  });
});

describe('live store', () => {
  it('seeds from a snapshot and notifies subscribers', () => {
    const store = createTestLiveStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.apply({ type: 'snapshot', data: snapshot({ news: [news('a', 1)] }) });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().ready).toBe(true);
    expect(store.select(selectCompanies)).toHaveLength(1);
    expect(store.select(selectCompany('kraken'))?.currentPrice).toBe(1000);
    expect(store.getState().prices).toEqual({ kraken: 1000 });
    off();
    store.apply({ type: 'news', data: [news('b', 2)] });
    expect(listener).toHaveBeenCalledTimes(1); // unsubscribed
    expect(store.getState().news.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('folds a tick into prices, companies and the live series', () => {
    const store = createTestLiveStore();
    store.apply({ type: 'snapshot', data: snapshot() });
    store.apply({
      type: 'tick',
      data: {
        tick: 4,
        serverTime: 6,
        prices: { kraken: 1200 },
        market: { composite: { value: 105 } } as never,
        leaderboard: null,
        game: null,
      },
    });
    const state = store.getState();
    expect(state.tick).toBe(4);
    expect(state.prices.kraken).toBe(1200);
    expect(state.companies.kraken?.currentPrice).toBe(1200);
    expect(state.priceSeries.kraken).toEqual([{ tick: 4, price: 1200, volume: 0 }]);
    expect(state.compositeSeries).toEqual([{ tick: 4, value: 105 }]);
  });

  it('keeps the crew rows a portfolio event carries, and clears them on sign-out', () => {
    const store = createTestLiveStore();
    store.patch({ tick: 7 });
    store.apply({
      type: 'portfolio',
      data: { team: { id: 'saltwind', totalValue: 5000 } as never, holdings: [], trades: [], orders: [] },
    });
    expect(store.getState().team?.totalValue).toBe(5000);
    expect(store.getState().teamSeries).toEqual([{ tick: 7, value: 5000 }]);
    store.clearPortfolio();
    expect(store.getState()).toMatchObject({ team: null, holdings: [], trades: [], orders: [], teamSeries: [] });
  });

  it('a phase event moves the game without disturbing prices', () => {
    const store = createTestLiveStore();
    store.apply({ type: 'snapshot', data: snapshot() });
    store.apply({ type: 'phase', data: { phase: 'ended', currentTick: 12 } as never });
    expect(store.getState().game?.phase).toBe('ended');
    expect(store.getState().tick).toBe(12);
    expect(store.getState().prices.kraken).toBe(1000);
  });

  it('patch touches connection state only, and reset returns to empty', () => {
    const store = createTestLiveStore({ status: 'open' });
    store.apply({ type: 'snapshot', data: snapshot() });
    store.patch({ status: 'offline', online: false });
    expect(store.getState()).toMatchObject({ status: 'offline', online: false, ready: true });
    store.reset();
    expect(store.getState()).toMatchObject({ status: 'idle', ready: false, companyIds: [] });
  });

  it('ignores an unknown or malformed event', () => {
    const store = createTestLiveStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ type: 'nope' } as never);
    store.apply(null as never);
    expect(listener).not.toHaveBeenCalled();
  });
});
