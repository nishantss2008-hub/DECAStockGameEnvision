/** The pure projection from the live store's state onto what the hooks read. */
import { describe, it, expect } from 'vitest';
import { initialLiveState, type LiveState } from '../lib/liveStore';
import { EMPTY_LIVE, isStale, normalizeLive } from './normalizeLive';

const state = (partial: Partial<LiveState>): LiveState => ({ ...initialLiveState, ...partial });

describe('normalizeLive', () => {
  it('gives an empty, not-ready snapshot before the store exists', () => {
    expect(normalizeLive(null)).toBe(EMPTY_LIVE);
    expect(normalizeLive(initialLiveState)).toMatchObject({ ready: false, companies: [], news: [] });
    expect(normalizeLive(initialLiveState).portfolio).toEqual({ team: null, holdings: [], trades: [], orders: [] });
  });

  it('lists the roster in the order the server sent it, skipping ids with no row', () => {
    const rows = { kraken: { id: 'kraken' }, saltworks: { id: 'saltworks' } } as never;
    const live = normalizeLive(state({ ready: true, companyIds: ['saltworks', 'kraken', 'gone'], companies: rows }));
    expect(live.companies.map((c) => c.id)).toEqual(['saltworks', 'kraken']);
  });

  it('carries the game, market, standings, news and the crew rows through', () => {
    const raw = state({
      ready: true,
      status: 'open',
      serverTime: 1_700_000,
      game: { phase: 'live' } as never,
      market: { composite: 1_000 } as never,
      leaderboard: { rows: [] } as never,
      news: [{ id: 'n1' }] as never,
      team: { id: 'saltwind' } as never,
      holdings: [{ companyId: 'k', shares: 2 }] as never,
    });
    const live = normalizeLive(raw);
    expect(live).toMatchObject({ ready: true, stale: false, error: null, serverTime: 1_700_000 });
    expect(live.game).toBe(raw.game);
    expect(live.news).toBe(raw.news);
    expect(live.portfolio.holdings).toEqual([{ companyId: 'k', shares: 2 }]);
  });
});

describe('isStale', () => {
  it('is true offline, and while a painted app is not connected', () => {
    expect(isStale({ online: false, ready: true, status: 'open' })).toBe(true);
    expect(isStale({ online: true, ready: true, status: 'connecting' })).toBe(true);
    expect(isStale({ online: true, ready: true, status: 'offline' })).toBe(true);
  });

  it('is false while connected, and while the first snapshot is still on its way', () => {
    expect(isStale({ online: true, ready: true, status: 'open' })).toBe(false);
    expect(isStale({ online: true, ready: false, status: 'connecting' })).toBe(false);
  });
});
