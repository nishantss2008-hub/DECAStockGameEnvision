import { describe, it, expect, beforeEach } from 'vitest';
import { SNAPSHOT_CACHE_LIMIT, clearSnapshotCache, readSnapshot, snapshotCacheSize, writeSnapshot } from './snapshotCache';

describe('snapshotCache', () => {
  beforeEach(() => clearSnapshotCache());

  it('stores the last snapshot per listener key, including known-missing documents', () => {
    expect(readSnapshot('game/state')).toBeUndefined();
    writeSnapshot('game/state', { data: { phase: 'live' }, fromCache: false });
    writeSnapshot('leaderboard/current', { data: null, fromCache: true });
    expect(readSnapshot('game/state')).toEqual({ data: { phase: 'live' }, fromCache: false });
    expect(readSnapshot('leaderboard/current')).toEqual({ data: null, fromCache: true });
    writeSnapshot('game/state', { data: { phase: 'paused' }, fromCache: false });
    expect(readSnapshot('game/state')!.data).toEqual({ phase: 'paused' });
  });

  it('evicts the least recently written key beyond the limit', () => {
    for (let i = 0; i <= SNAPSHOT_CACHE_LIMIT; i++) writeSnapshot(`companies/c${i}/history/0`, { data: i, fromCache: false });
    expect(snapshotCacheSize()).toBe(SNAPSHOT_CACHE_LIMIT);
    expect(readSnapshot('companies/c0/history/0')).toBeUndefined();
    expect(readSnapshot(`companies/c${SNAPSHOT_CACHE_LIMIT}/history/0`)!.data).toBe(SNAPSHOT_CACHE_LIMIT);
    // Rewriting an old key makes it the newest, so the next eviction takes the one after it.
    writeSnapshot('companies/c1/history/0', { data: 'again', fromCache: false });
    writeSnapshot('extra', { data: 1, fromCache: false });
    expect(readSnapshot('companies/c1/history/0')!.data).toBe('again');
    expect(readSnapshot('companies/c2/history/0')).toBeUndefined();
  });

  it('clears everything (sign-out)', () => {
    writeSnapshot('teams/saltwind', { data: { cashBalance: 1 }, fromCache: false });
    clearSnapshotCache();
    expect(readSnapshot('teams/saltwind')).toBeUndefined();
    expect(snapshotCacheSize()).toBe(0);
  });
});
