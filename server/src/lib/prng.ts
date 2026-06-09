/**
 * Deterministic seeded pseudo-random number generator (mulberry32).
 *
 * The entire hidden market — intrinsic value paths, news schedule, fundamentals
 * — is generated from a single game seed so runs are reproducible and the
 * "future" is a pure function of the seed (never sent to clients).
 */

export class Prng {
  private s: number;

  constructor(seed: number | string) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Pick a random element. Caller guarantees a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)] as T;
  }

  /** True with probability p. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Gaussian sample via Box–Muller. */
  gauss(mean = 0, sd = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Fisher–Yates shuffle returning a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

/** FNV-1a string hash → uint32. */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Derive a stable child seed from a base seed + a label. */
export function deriveSeed(base: number | string, label: string): number {
  const b = (typeof base === 'string' ? hashString(base) : base) >>> 0;
  return (hashString(label) ^ Math.imul(b, 2654435761)) >>> 0;
}
