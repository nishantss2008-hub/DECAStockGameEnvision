import { describe, it, expect } from 'vitest';
import { TOTAL_TICKS } from '@deca/shared';
import { Prng, deriveSeed, hashString } from '../src/lib/prng';
import { feeFor, shareValue, clampPositive, toCents } from '../src/lib/money';
import { generateIntrinsicPath, companySigma } from '../src/engine/intrinsic';
import { assignArchetypes } from '../src/engine/archetypes';
import { OrderFlowBook } from '../src/engine/orderflow';
import { stepPrice } from '../src/engine/engine';

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

describe('intrinsic paths', () => {
  const seed = 'blackbeard-2026';

  it('starts at 1.0 and stays positive', () => {
    const p = generateIntrinsicPath(seed, 'co', 'compounder', 500);
    expect(p[0]).toBeCloseTo(1, 6);
    expect(Math.min(...p)).toBeGreaterThan(0);
    expect(p.length).toBe(501);
  });

  it('ends in the archetype-appropriate direction', () => {
    const end = (a: Parameters<typeof generateIntrinsicPath>[2]) =>
      generateIntrinsicPath(seed, `co-${a}`, a, 2000).at(-1) as number;
    expect(end('compounder')).toBeGreaterThan(1);
    expect(end('turnaround')).toBeGreaterThan(1);
    expect(end('decliner')).toBeLessThan(1);
    expect(end('value_trap')).toBeLessThan(1);
  });

  it('is deterministic', () => {
    const a = generateIntrinsicPath(seed, 'co', 'steady', 300);
    const b = generateIntrinsicPath(seed, 'co', 'steady', 300);
    expect(a).toEqual(b);
  });

  it('assigns a balanced spread of archetypes', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `c${i}`);
    const map = assignArchetypes(new Prng(seed), ids);
    expect(Object.keys(map)).toHaveLength(25);
    const counts = new Set(Object.values(map));
    expect(counts.size).toBe(5); // all five archetypes present
  });

  it('derives a positive per-company sigma', () => {
    expect(companySigma(seed, 'co', 'compounder', 0.004)).toBeGreaterThan(0);
  });
});

describe('order flow', () => {
  it('buys push impact positive, then it decays', () => {
    const book = new OrderFlowBook();
    book.record('co', 'buy', 100_000);
    const i1 = book.step('co');
    expect(i1).toBeGreaterThan(0);
    const i2 = book.step('co'); // no new flow → decays toward 0
    expect(i2).toBeLessThan(i1);
    expect(i2).toBeGreaterThan(0);
  });

  it('sells push impact negative and report volume', () => {
    const book = new OrderFlowBook();
    book.record('co', 'sell', 50_000);
    expect(book.step('co')).toBeLessThan(0);
    expect(book.drainVolume('co')).toBe(50_000);
    expect(book.drainVolume('co')).toBe(0);
  });
});

describe('stepPrice', () => {
  const rng = new Prng(1);

  it('mean-reverts toward intrinsic value', () => {
    const prev = 10_000;
    const intrinsic = 12_000;
    const next = stepPrice({ prevCents: prev, intrinsicCents: intrinsic, sigma: 0, flowImpact: 0, newsJumpFrac: 0, rng });
    expect(next).toBeGreaterThan(prev);
    expect(Math.abs(intrinsic - next)).toBeLessThan(Math.abs(intrinsic - prev));
  });

  it('order-flow impact pushes price up', () => {
    const base = stepPrice({ prevCents: 10_000, intrinsicCents: 10_000, sigma: 0, flowImpact: 0, newsJumpFrac: 0, rng: new Prng(2) });
    const pushed = stepPrice({ prevCents: 10_000, intrinsicCents: 10_000, sigma: 0, flowImpact: 0.02, newsJumpFrac: 0, rng: new Prng(2) });
    expect(pushed).toBeGreaterThan(base);
  });

  it('applies news jumps beyond the per-tick clamp', () => {
    const next = stepPrice({ prevCents: 10_000, intrinsicCents: 10_000, sigma: 0, flowImpact: 0, newsJumpFrac: 0.2, rng: new Prng(3) });
    expect(next).toBe(12_000); // +20% gap, unclamped
  });

  it('floors at 1 cent and is deterministic', () => {
    const args = { prevCents: 5, intrinsicCents: 1, sigma: 0, flowImpact: 0, newsJumpFrac: -0.9, rng: new Prng(4) } as const;
    expect(stepPrice({ ...args, rng: new Prng(4) })).toBeGreaterThanOrEqual(1);
    expect(stepPrice({ ...args, rng: new Prng(4) })).toEqual(stepPrice({ ...args, rng: new Prng(4) }));
  });
});
