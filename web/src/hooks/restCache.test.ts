/** The read-through cache behind the ranged reads (history, fundamentals). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { REST_CACHE_LIMIT, invalidateRest, restCacheSize, restEntry } from './restCache';

beforeEach(() => invalidateRest());

describe('restEntry', () => {
  it('de-duplicates requests in flight and caches the answer', async () => {
    const load = vi.fn(async () => 'value');
    const a = restEntry('k', load);
    const b = restEntry('k', load);
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    await a.promise;
    expect(restEntry('k', load).value).toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps entries apart by key', async () => {
    const load = vi.fn(async (n: number) => n);
    await restEntry('a', () => load(1)).promise;
    await restEntry('b', () => load(2)).promise;
    expect(restEntry('a', () => load(0)).value).toBe(1);
    expect(restEntry('b', () => load(0)).value).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('drops a failed entry so the next caller retries, and records the message', async () => {
    const load = vi.fn(async () => {
      throw new Error('boom');
    });
    const first = restEntry('k', load);
    await expect(first.promise).rejects.toThrow('boom');
    expect(first.error).toBe('boom');
    const second = restEntry('k', load);
    expect(second).not.toBe(first);
    await expect(second.promise).rejects.toThrow('boom');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidates by prefix and drops everything when no prefix is given', async () => {
    await restEntry('companies/a/history?from=0', async () => 1).promise;
    await restEntry('companies/b/history?from=0', async () => 2).promise;
    await restEntry('fundamentals', async () => 3).promise;
    invalidateRest('companies/');
    expect(restCacheSize()).toBe(1);
    invalidateRest();
    expect(restCacheSize()).toBe(0);
  });

  it('never grows past the cache limit as a chart range moves', async () => {
    for (let i = 0; i < REST_CACHE_LIMIT + 25; i++) await restEntry(`r${i}`, async () => i).promise;
    expect(restCacheSize()).toBeLessThanOrEqual(REST_CACHE_LIMIT);
    // The newest range is still cached; the oldest was evicted.
    expect(restEntry(`r${REST_CACHE_LIMIT + 24}`, async () => -1).value).toBe(REST_CACHE_LIMIT + 24);
  });
});
