import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_WATCHLIST, useWatchlist } from './watchlist';

describe('useWatchlist', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists per crew and keeps every hook instance in sync', () => {
    const a = renderHook(() => useWatchlist('crew-a'));
    const b = renderHook(() => useWatchlist('crew-a'));
    expect(a.result.current.symbols).toEqual(DEFAULT_WATCHLIST);
    act(() => a.result.current.toggle('kraken'));
    expect(a.result.current.has('kraken')).toBe(false);
    expect(b.result.current.has('kraken')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('bx.watchlist.crew-a')!)).not.toContain('kraken');
    const other = renderHook(() => useWatchlist('crew-b'));
    expect(other.result.current.has('kraken')).toBe(true);
  });

  it('picks up changes made in another tab', () => {
    const a = renderHook(() => useWatchlist('crew-c'));
    act(() => {
      window.localStorage.setItem('bx.watchlist.crew-c', '["astrolabe"]');
      window.dispatchEvent(new StorageEvent('storage', { key: 'bx.watchlist.crew-c', newValue: '["astrolabe"]' }));
    });
    expect(a.result.current.symbols).toEqual(['astrolabe']);
  });

  it('works in memory without a crew and when storage throws', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => result.current.toggle('astrolabe'));
    expect(result.current.has('astrolabe')).toBe(false);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      const d = renderHook(() => useWatchlist('crew-d'));
      act(() => d.result.current.toggle('kraken'));
      expect(d.result.current.has('kraken')).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
