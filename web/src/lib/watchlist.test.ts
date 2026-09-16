import { describe, it, expect } from 'vitest';
import { DEFAULT_WATCHLIST, parseWatchlist, toggleInList, watchlistKey } from './watchlist';

describe('watchlist (pure parts)', () => {
  it('uses the per-crew key', () => {
    expect(watchlistKey('saltwind-traders')).toBe('bx.watchlist.saltwind-traders');
  });
  it('defaults only when nothing was ever stored', () => {
    expect(parseWatchlist(null)).toEqual(DEFAULT_WATCHLIST);
    expect(parseWatchlist('[]')).toEqual([]);
    expect(parseWatchlist('["kraken","kraken","astrolabe"]')).toEqual(['kraken', 'astrolabe']);
  });
  it('falls back to the default on corrupt storage', () => {
    expect(parseWatchlist('{oops')).toEqual(DEFAULT_WATCHLIST);
    expect(parseWatchlist('{"a":1}')).toEqual(DEFAULT_WATCHLIST);
    expect(parseWatchlist('[1,"kraken",null]')).toEqual(['kraken']);
  });
  it('toggles without mutating', () => {
    const list = ['kraken'];
    expect(toggleInList(list, 'astrolabe')).toEqual(['kraken', 'astrolabe']);
    expect(toggleInList(list, 'kraken')).toEqual([]);
    expect(list).toEqual(['kraken']);
  });
  it('default matches the plan', () => {
    // The broad fund leads: funds are starrable exactly like companies (spec 2026-09-16 §3).
    expect(DEFAULT_WATCHLIST).toEqual(['grand-fleet', 'kraken', 'port-royal', 'galleon-goods']);
  });
});
