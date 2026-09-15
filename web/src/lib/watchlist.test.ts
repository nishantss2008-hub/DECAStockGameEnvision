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
    expect(DEFAULT_WATCHLIST).toEqual(['kraken', 'port-royal', 'cursed-doubloon', 'astrolabe', 'galleon-goods']);
  });
});
