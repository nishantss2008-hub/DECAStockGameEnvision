import { describe, it, expect } from 'vitest';
import { Prng, deriveSeed, hashString } from '../src/lib/prng';
import { feeFor, shareValue, clampPositive, toCents } from '../src/lib/money';

describe('Prng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Prng('blackbeard');
    const b = new Prng('blackbeard');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds and derived seeds', () => {
    expect(new Prng('a').next()).not.toEqual(new Prng('b').next());
    expect(deriveSeed('seed', 'x')).not.toEqual(deriveSeed('seed', 'y'));
    expect(hashString('abc')).toEqual(hashString('abc'));
  });

  it('range/int/pick/shuffle stay in bounds and preserve elements', () => {
    const r = new Prng(42);
    for (let i = 0; i < 1000; i++) {
      const f = r.range(2, 5);
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThan(5);
      const n = r.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
    const arr = [1, 2, 3, 4, 5];
    expect(r.shuffle(arr).slice().sort()).toEqual(arr);
  });
});

describe('money', () => {
  it('computes fees, notionals, floors and conversions', () => {
    expect(toCents(1_000_000)).toBe(100_000_000);
    expect(shareValue(10, 2500)).toBe(25_000);
    expect(feeFor(100_000, 10)).toBe(100); // 0.10%
    expect(clampPositive(0)).toBe(1);
    expect(clampPositive(2500.4)).toBe(2500);
  });
});
