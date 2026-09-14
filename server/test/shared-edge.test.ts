import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_POSITION_PCT,
  GAME_LENGTH_OPTIONS_MS,
  HOUR_MS,
  MODEL,
  POSITION_LIMIT_OPTIONS,
  SESSIONS_PER_GAME,
  chunkOf,
  computeQualityScores,
  deriveClock,
  estFillPrice,
  estimateOrder,
  feeFor,
  impactLambda,
  intervalShareCap,
  invNormCdf,
  maxAffordableShares,
  maxSharesUnderLimit,
  normCdf,
  notionalFor,
  rangeTabs,
  rankZ,
  sessionNumber,
  sessionStartTick,
  settingsSchema,
  sharesForAmount,
  spearman,
  tickAt,
  type QualityInput,
  type SectorRefs,
} from '@deca/shared';
import { Prng } from '../src/lib/prng';
const avgFill = (last: number, lam: number, p: number, sigma: number) => (sigma === 0 ? last * Math.exp(lam * p) : (last * (Math.exp(lam * (p + sigma)) - Math.exp(lam * p))) / (lam * sigma));

// ---------------------------------------------------------------- mathx

describe('rankZ edge cases', () => {
  it('N=0 and N=1 return no NaN', () => {
    expect(rankZ([])).toEqual([]);
    expect(rankZ([42])).toEqual([0]);
    expect(rankZ([undefined])).toEqual([0]);
  });

  it('N=2 is exactly ±1, a tie is 0, and undefined ranks below a value', () => {
    expect(rankZ([1, 2])).toEqual([-1, 1]);
    expect(rankZ([2, 1])).toEqual([1, -1]);
    expect(rankZ([7, 7])).toEqual([0, 0]);
    expect(rankZ([undefined, -1e9])).toEqual([-1, 1]);
  });

  it('all-undefined input ties at 0 with no NaN', () => {
    const z = rankZ([undefined, undefined, undefined, undefined]);
    expect(z).toEqual([0, 0, 0, 0]);
    for (const v of z) expect(Number.isNaN(v)).toBe(false);
  });

  it('undefined values tie among themselves below every defined value (incl. −Infinity)', () => {
    const z = rankZ([undefined, 3, -Infinity, undefined, 10]);
    expect(z[0]).toBe(z[3]);
    expect(z[0]!).toBeLessThan(z[2]!);
    expect(z[2]!).toBeLessThan(z[1]!);
    expect(z[1]!).toBeLessThan(z[4]!);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });
});

describe('normal cdf helpers', () => {
  it('normCdf is within the A&S 7.1.26 bound against reference values', () => {
    const ref: [number, number][] = [
      [1.96, 0.9750021048517794],
      [-1, 0.15865525393145713],
      [3, 0.99865010196837],
      [-5, 2.8665157187919444e-7],
      [0, 0.5],
    ];
    for (const [x, p] of ref) expect(Math.abs(normCdf(x) - p)).toBeLessThan(1.5e-7);
    expect(normCdf(-40)).toBeGreaterThanOrEqual(0);
    expect(normCdf(40)).toBeLessThanOrEqual(1);
  });

  it('invNormCdf is finite and accurate at extreme p (1e-10, 1−1e-10)', () => {
    const lo = invNormCdf(1e-10);
    const hi = invNormCdf(1 - 1e-10);
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
    expect(lo).toBeCloseTo(-6.3613409024040575, 6);
    expect(hi).toBeCloseTo(6.3613409024040575, 6);
    expect(Number.isFinite(invNormCdf(0))).toBe(true);
    expect(Number.isFinite(invNormCdf(1))).toBe(true);
    expect(invNormCdf(0)).toBeLessThan(lo);
    expect(invNormCdf(1)).toBeGreaterThan(hi);
  });

  it('invNormCdf is monotone and continuous across the Acklam region boundaries', () => {
    const ps = [1e-10, 1e-5, 0.02424, 0.02425, 0.02426, 0.5, 0.97574, 0.97575, 0.97576, 1 - 1e-5, 1 - 1e-10];
    const xs = ps.map(invNormCdf);
    for (let k = 1; k < xs.length; k++) expect(xs[k]!).toBeGreaterThan(xs[k - 1]!);
    expect(invNormCdf(0.5)).toBe(0);
    expect(invNormCdf(0.02425 - 1e-12)).toBeCloseTo(invNormCdf(0.02425 + 1e-12), 6);
    expect(invNormCdf(0.2)).toBeCloseTo(-invNormCdf(0.8), 12);
  });
});

describe('spearman', () => {
  it('uses average ranks for ties', () => {
    // ranks a = [1.5,1.5,3,4], b = [1,2.5,2.5,4] → 3.75 / 4.5
    expect(spearman([1, 1, 2, 3], [1, 2, 2, 3])).toBeCloseTo(3.75 / 4.5, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearman([5, 5, 5], [1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------- estimate

const base = {
  lastPrice: 8412,
  beta: 1,
  sharesOutstanding: 242_000_000,
  feeBps: 10,
  cash: 31_240_018,
  sharesOwned: 3000,
  avgCost: 7350,
  totalValue: 108_421_955,
};

describe('estimate edge cases', () => {
  it('a buy with zero cash is invalid, reports the whole total as shortfall and maxBuyShares 0', () => {
    const e = estimateOrder({ ...base, cash: 0, side: 'buy', quantity: 1 });
    expect(e.valid).toBe(false);
    expect(e.error).toBe('insufficient_funds');
    expect(e.total).toBeGreaterThan(0);
    expect(e.shortfall).toBe(e.total);
    expect(e.maxBuyShares).toBe(0);
    expect(e.cashAfter).toBe(-e.total);
    // selling needs no cash
    expect(estimateOrder({ ...base, cash: 0, side: 'sell', quantity: 10 }).valid).toBe(true);
  });

  it('selling exactly all shares closes the position', () => {
    const s = estimateOrder({ ...base, side: 'sell', quantity: base.sharesOwned });
    expect(s.valid).toBe(true);
    expect(s.error).toBeUndefined();
    expect(s.shortfall).toBeUndefined();
    expect(s.sharesAfter).toBe(0);
    expect(s.avgCostAfter).toBe(0);
    expect(s.positionValueAfter).toBe(0);
    expect(s.pctOfAccountAfter).toBe(0);
    expect(s.price).toBeLessThanOrEqual(base.lastPrice);
    const fill = estFillPrice('sell', base.lastPrice, impactLambda(base.beta, base.sharesOutstanding), base.sharesOwned);
    expect(s.price).toBe(Math.round(fill));
    expect(s.notional).toBe(notionalFor(base.sharesOwned, fill));
    expect(s.fee).toBe(feeFor(s.notional, base.feeBps));
    expect(s.total).toBe(s.notional - s.fee);
    expect(s.cashAfter).toBe(base.cash + s.notional - s.fee);
  });

  it('a partial buy averages cost with rounding and computes account share net of fee', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 777 });
    expect(e.avgCostAfter).toBe(Math.round((3000 * 7350 + e.notional) / 3777));
    expect(e.positionValueAfter).toBe(3777 * base.lastPrice);
    expect(e.pctOfAccountAfter).toBeCloseTo((3777 * base.lastPrice) / (base.totalValue - e.fee), 12);
  });

  it('sharesForAmount below one share (or non-positive) is 0', () => {
    expect(sharesForAmount(8411, 8412, 1, 242_000_000, 10)).toBe(0);
    expect(sharesForAmount(8412, 8412, 1, 242_000_000, 10)).toBe(0); // the fee pushes one share over
    expect(sharesForAmount(0, 8412, 1, 242_000_000, 10)).toBe(0);
    expect(sharesForAmount(-500, 8412, 1, 242_000_000, 10)).toBe(0);
    expect(sharesForAmount(8420, 8412, 1, 242_000_000, 10)).toBe(1);
  });

  it('MODEL carries the v2.1 impact knobs and no impact/tick caps', () => {
    expect(MODEL).toMatchObject({ impactY: 1.1, tickMoveSds: 3, mispriceSd: 0, surpriseWeight: 0.75, intervalAdvCap: 1 });
    expect('maxImpact' in MODEL).toBe(false);
    expect('maxTickMove' in MODEL).toBe(false);
  });

  it('impactLambda is linear in 1/ADV, rises with beta, and is 0 without shares outstanding', () => {
    expect(impactLambda(1, 2_000_000) * 2).toBeCloseTo(impactLambda(1, 1_000_000), 18);
    expect(impactLambda(1.4, 1_000_000)).toBeGreaterThan(impactLambda(0.7, 1_000_000));
    expect(impactLambda(0.7, 1_000_000)).toBeGreaterThan(0);
    expect(impactLambda(1, 0)).toBe(0);
    expect(impactLambda(1, -5)).toBe(0);
  });

  it('estFillPrice prices in pending flow from the whole interval, both sides', () => {
    const lam = impactLambda(1, 8_000_000);
    expect(estFillPrice('buy', 1_000, lam, 0)).toBe(1_000);
    expect(estFillPrice('buy', 1_000, lam, 100, -2_000)).toBeCloseTo(avgFill(1_000, lam, -2_000, 100), 6);
    expect(estFillPrice('sell', 1_000, lam, 100, 2_000)).toBeCloseTo(avgFill(1_000, lam, 2_000, -100), 6);
    // buying then selling the same size inside one interval fills at the same price (fees are the only cost)
    expect(estFillPrice('sell', 1_000, lam, 700, 700)).toBeCloseTo(estFillPrice('buy', 1_000, lam, 700), 9);
    expect(notionalFor(3, 0.5)).toBe(2);
    expect(notionalFor(3, 1000.1666)).toBe(3000);
  });

  it('interval cap: exactly 1 ADV passes, 1 more is flagged on either side, 0 shares outstanding blocks all', () => {
    const so = 1_000_000;
    const cap = intervalShareCap(so);
    expect(cap).toBe(6_666);
    expect(intervalShareCap(0)).toBe(0);
    expect(intervalShareCap(-1)).toBe(0);
    const rich = { ...base, sharesOutstanding: so, lastPrice: 100, cash: 1e15, totalValue: 1e15, sharesOwned: 50_000 };
    expect(estimateOrder({ ...rich, side: 'buy', quantity: cap }).valid).toBe(true);
    expect(estimateOrder({ ...rich, side: 'buy', quantity: cap + 1 }).error).toBe('interval_limit');
    expect(estimateOrder({ ...rich, side: 'sell', quantity: cap }).valid).toBe(true);
    expect(estimateOrder({ ...rich, side: 'sell', quantity: cap + 1 }).error).toBe('interval_limit');
    expect(estimateOrder({ ...rich, side: 'buy', quantity: 1 }).maxBuyShares).toBe(cap);
    const none = estimateOrder({ ...rich, sharesOutstanding: 0, side: 'buy', quantity: 1 });
    expect(none.error).toBe('interval_limit');
    expect(none.maxBuyShares).toBe(0);
    for (const v of [none.price, none.notional, none.fee, none.total, none.impact]) expect(Number.isFinite(v)).toBe(true);
  });

  const isMaximal = (cash: number, lastPrice: number, beta: number, so: number, feeBps: number) => {
    const m = maxAffordableShares(cash, lastPrice, beta, so, feeBps);
    const o = { side: 'buy' as const, lastPrice, beta, sharesOutstanding: so, feeBps, cash, sharesOwned: 0, avgCost: 0, totalValue: cash };
    return { m, okAtM: m === 0 || estimateOrder({ ...o, quantity: m }).valid, okAtM1: estimateOrder({ ...o, quantity: m + 1 }).valid };
  };

  it('maxAffordableShares is maximal when impact is material', () => {
    const r = isMaximal(6_300_000, 1234, 1.2, 1_000_000, 10);
    expect(r.m).toBeLessThan(intervalShareCap(1_000_000));
    expect(estFillPrice('buy', 1234, impactLambda(1.2, 1_000_000), r.m)).toBeGreaterThan(1234 * 1.005);
    expect(r.okAtM).toBe(true);
    expect(r.okAtM1).toBe(false);
    const penny = isMaximal(100_000_000, 1, 1, 1e12, 0);
    expect(penny.m).toBeGreaterThan(99_900_000);
    expect(penny.m).toBeLessThan(100_000_000);
    expect(penny.okAtM).toBe(true);
    expect(penny.okAtM1).toBe(false);
  });

  it('maxAffordableShares is maximal for any positive price, including sub-cent rounding', () => {
    for (const [cash, price] of [
      [100, 1.4],
      [100, 0.4],
      [1_000_000, 2.49],
      [31_240_018, 8412],
      [250, 0.3],
      [0, 0.3], // with no cash, one sub-cent share still rounds to a zero cost
      [0, 0.4],
    ] as const) {
      const r = isMaximal(cash, price, 1, 1e12, 0);
      expect(r.okAtM).toBe(true);
      expect(r.okAtM1).toBe(false);
    }
  });
});

describe('position limit edge cases', () => {
  it('settings accept only the limit options; the default is one of them', () => {
    expect(POSITION_LIMIT_OPTIONS).toEqual([1, 0.5, 0.35, 0.25]);
    expect(DEFAULT_MAX_POSITION_PCT).toBe(0.5);
    expect((POSITION_LIMIT_OPTIONS as readonly number[]).includes(DEFAULT_MAX_POSITION_PCT)).toBe(true);
    expect(settingsSchema.safeParse({ maxPositionPct: 0.35 }).success).toBe(true);
    expect(settingsSchema.safeParse({ maxPositionPct: 0.3 }).success).toBe(false);
    expect(settingsSchema.safeParse({}).success).toBe(true);
  });

  it('no limit (missing or ≥ 1) is unbounded; a position already over the limit allows 0 more but can still sell', () => {
    const i = { ...base, side: 'buy' as const, quantity: 1 };
    expect(maxSharesUnderLimit(i)).toBe(Infinity);
    expect(maxSharesUnderLimit({ ...i, maxPositionPct: 1 })).toBe(Infinity);
    const over = { ...i, maxPositionPct: 0.2 }; // 3000 × Ð84.12 is 23% of the account
    expect(maxSharesUnderLimit(over)).toBe(0);
    expect(estimateOrder(over).error).toBe('position_limit');
    expect(estimateOrder(over).maxBuyShares).toBe(0);
    expect(estimateOrder({ ...over, side: 'sell', quantity: 100 }).valid).toBe(true);
  });

  it('the limit is net of the fee: the boundary share count is exact', () => {
    const i = { ...base, side: 'buy' as const, quantity: 1, maxPositionPct: 0.25 };
    const lim = maxSharesUnderLimit(i);
    const at = estimateOrder({ ...i, quantity: lim });
    const past = estimateOrder({ ...i, quantity: lim + 1 });
    expect(at.sharesAfter * base.lastPrice).toBeLessThanOrEqual(0.25 * (base.totalValue - at.fee));
    expect(past.sharesAfter * base.lastPrice).toBeGreaterThan(0.25 * (base.totalValue - past.fee));
    expect(estimateOrder(i).maxBuyShares).toBe(Math.min(lim, maxAffordableShares(base.cash, base.lastPrice, 1, base.sharesOutstanding, 10)));
  });

  it('a null limit (as read from a stored document) means no limit, like a missing one', () => {
    const i = { ...base, side: 'buy' as const, quantity: 1000, maxPositionPct: null as unknown as number };
    expect(maxSharesUnderLimit(i)).toBe(Infinity);
    expect(estimateOrder(i).valid).toBe(true);
    expect(estimateOrder(i).maxBuyShares).toBe(maxAffordableShares(base.cash, base.lastPrice, 1, base.sharesOutstanding, 10));
  });
});

// ---------------------------------------------------------------- adversarial review of 1b/1c

describe('impact, fill and order-limit contracts (review of 1b/1c)', () => {
  it('impactLambda is exactly 1.10·sqrt(β²·0.18² + 0.30²)/√252/(shares/150); 1 ADV at β 1 is 0.0242', () => {
    for (const beta of [0, 0.7, 1, 1.25, 1.4]) {
      for (const so of [1_000, 8_000_000, 242_000_000, 1e12]) {
        const closed = (1.1 * Math.sqrt(beta ** 2 * 0.18 ** 2 + 0.3 ** 2)) / Math.sqrt(252) / (so / 150);
        expect(Math.abs(impactLambda(beta, so) - closed)).toBeLessThanOrEqual(closed * 1e-12);
      }
    }
    const so = 8_000_000;
    expect(((impactLambda(1, so) * so) / 150).toFixed(4)).toBe('0.0242');
    expect(impactLambda(1, so) * (so / 150)).toBeCloseTo(0.02424, 4);
  });

  it('fill signs: a buy walks the price up from pending, a sell walks it down, and pending flow is signed', () => {
    const lam = 1e-5;
    for (const p of [-3_000, 0, 3_000]) {
      expect(estFillPrice('buy', 5_000, lam, 400, p)).toBeCloseTo(avgFill(5_000, lam, p, 400), 6);
      expect(estFillPrice('sell', 5_000, lam, 400, p)).toBeCloseTo(avgFill(5_000, lam, p, -400), 6);
    }
    expect(estFillPrice('buy', 5_000, lam, 400)).toBeGreaterThan(5_000);
    expect(estFillPrice('sell', 5_000, lam, 400)).toBeLessThan(5_000);
    // earlier buys lift the next fill; earlier sells lower it
    expect(estFillPrice('buy', 5_000, lam, 400, 3_000)).toBeGreaterThan(estFillPrice('buy', 5_000, lam, 400, -3_000));
    expect(estFillPrice('sell', 5_000, lam, 400, -3_000)).toBeLessThan(estFillPrice('sell', 5_000, lam, 400, 3_000));
  });

  it('maxBuyShares is maximal under cash, position limit and interval cap (200 seeded random inputs, independent oracle)', () => {
    const rng = new Prng('max-buy-brute-force');
    const binding: Record<string, number> = {};
    for (let t = 0; t < 200; t++) {
      const lastPrice = Math.round(Math.exp(rng.range(0, Math.log(60_000))));
      const sharesOutstanding = Math.round(Math.exp(rng.range(Math.log(1e4), Math.log(1e9))));
      const cash = rng.bool(0.03) ? 0 : Math.round(Math.exp(rng.range(Math.log(1e4), Math.log(1e10))));
      const other = rng.int(0, 100_000_000);
      const sharesOwned = Math.floor((rng.range(0, 0.6) * (cash + other)) / lastPrice);
      const i = {
        side: 'buy' as const,
        quantity: 1,
        lastPrice,
        beta: rng.range(0.7, 1.4),
        sharesOutstanding,
        feeBps: rng.pick([0, 1, 10, 25, 200]),
        cash,
        sharesOwned,
        avgCost: rng.int(1, 60_000),
        totalValue: cash + other + sharesOwned * lastPrice,
        maxPositionPct: rng.pick([undefined, 1, 0.5, 0.35, 0.25]),
      };
      // Independent re-statement of the three buy rules (spec §6, plan 1b/1c).
      const lam = impactLambda(i.beta, sharesOutstanding);
      const rules = (q: number) => {
        const notional = Math.round(q * avgFill(lastPrice, lam, 0, q));
        const fee = Math.round((notional * i.feeBps) / 10_000);
        return {
          cash: notional + fee <= cash,
          cap: q <= Math.floor(sharesOutstanding / 150),
          limit: i.maxPositionPct === undefined || i.maxPositionPct >= 1 || (sharesOwned + q) * lastPrice <= i.maxPositionPct * (i.totalValue - fee),
        };
      };
      const allOk = (q: number) => Object.values(rules(q)).every(Boolean);

      const m = estimateOrder(i).maxBuyShares;
      expect(Number.isInteger(m) && m >= 0).toBe(true);
      if (m > 0) {
        expect(allOk(m)).toBe(true);
        expect(estimateOrder({ ...i, quantity: m }).valid).toBe(true);
        const inside = rng.int(1, m);
        expect(estimateOrder({ ...i, quantity: inside }).valid).toBe(allOk(inside));
      }
      expect(allOk(m + 1)).toBe(false);
      const past = estimateOrder({ ...i, quantity: m + 1 });
      expect(past.valid).toBe(false);
      binding[past.error!] = (binding[past.error!] ?? 0) + 1;

      // cash alone: maxAffordableShares is the exact affordability boundary
      const a = maxAffordableShares(cash, lastPrice, i.beta, sharesOutstanding, i.feeBps);
      expect(rules(a).cash).toBe(true);
      expect(rules(a + 1).cash).toBe(false);
    }
    // every rule is the binding one in a meaningful share of cases
    expect(binding.insufficient_funds ?? 0).toBeGreaterThanOrEqual(20);
    expect(binding.position_limit ?? 0).toBeGreaterThanOrEqual(20);
    expect(binding.interval_limit ?? 0).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------- clock

describe('clock for every game length option', () => {
  const expected: Record<number, { tickIntervalMs: number; totalTicks: number; sessionTicks: number; tabs: string[] }> = {
    1: { tickIntervalMs: 5_000, totalTicks: 720, sessionTicks: 90, tabs: ['5M', '15M', 'All'] },
    2: { tickIntervalMs: 10_000, totalTicks: 720, sessionTicks: 90, tabs: ['5M', '15M', '1H', 'All'] },
    4: { tickIntervalMs: 20_000, totalTicks: 720, sessionTicks: 90, tabs: ['5M', '15M', '1H', 'All'] },
    8: { tickIntervalMs: 30_000, totalTicks: 960, sessionTicks: 120, tabs: ['5M', '15M', '1H', 'All'] },
    12: { tickIntervalMs: 30_000, totalTicks: 1440, sessionTicks: 180, tabs: ['15M', '1H', '6H', 'All'] },
    24: { tickIntervalMs: 30_000, totalTicks: 2880, sessionTicks: 360, tabs: ['15M', '1H', '6H', 'All'] },
    48: { tickIntervalMs: 30_000, totalTicks: 5760, sessionTicks: 720, tabs: ['1H', '6H', '24H', 'All'] },
  };

  it('covers exactly the seven options', () => {
    expect(GAME_LENGTH_OPTIONS_MS).toEqual([1, 2, 4, 8, 12, 24, 48].map((h) => h * HOUR_MS));
  });

  for (const len of GAME_LENGTH_OPTIONS_MS) {
    const hours = len / HOUR_MS;
    it(`derives a consistent clock for ${hours}h`, () => {
      const c = deriveClock(len);
      const e = expected[hours]!;
      expect(c).toEqual({ gameLengthMs: len, tickIntervalMs: e.tickIntervalMs, totalTicks: e.totalTicks, sessionTicks: e.sessionTicks, hours });
      expect(c.tickIntervalMs).toBe(Math.min(30_000, Math.max(5_000, Math.round(len / 720))));
      expect(c.totalTicks).toBe(Math.floor(len / c.tickIntervalMs));
      expect(c.sessionTicks).toBe(Math.max(1, Math.round(c.totalTicks / SESSIONS_PER_GAME)));

      // wall clock → tick and session bookkeeping at the edges
      expect(tickAt(1_000 + len, 1_000, c)).toBe(c.totalTicks);
      expect(tickAt(1_000 + len * 2, 1_000, c)).toBe(c.totalTicks);
      expect(tickAt(999, 1_000, c)).toBe(0);
      expect(sessionNumber(0, c.sessionTicks)).toBe(1);
      expect(sessionNumber(c.totalTicks - 1, c.sessionTicks)).toBe(SESSIONS_PER_GAME);
      expect(sessionNumber(c.totalTicks, c.sessionTicks)).toBe(SESSIONS_PER_GAME);
      expect(sessionStartTick(c.sessionTicks + 1, c.sessionTicks)).toBe(c.sessionTicks);
      expect(chunkOf(c.totalTicks)).toBe(Math.floor(c.totalTicks / 120));

      const tabs = rangeTabs(c);
      expect(tabs.map((t) => t.label)).toEqual(e.tabs);
      expect(tabs.at(-1)).toEqual({ key: 'all', label: 'All', ticks: null });
      for (const t of tabs.slice(0, -1)) {
        expect(t.ticks).not.toBeNull();
        expect(t.ticks! * c.tickIntervalMs).toBeLessThanOrEqual(len / 2);
        expect(t.key).toBe(t.label.toLowerCase());
      }
    });
  }
});

// ---------------------------------------------------------------- quality

/** A neutral company: every item identical unless overridden. */
const co = (id: string, over: Partial<QualityInput> = {}): QualityInput => ({
  id,
  sector: 'Naval Arms',
  grossProfit: 400,
  totalAssets: 1000,
  roe: 0.1,
  operatingCashFlow: 90,
  netIncome: 60,
  debtToEquity: 1,
  currentRatio: 1.5,
  operatingIncome: 80,
  marketCap: 5000,
  totalLiabilities: 600,
  revenue: 1000,
  peRatio: 15,
  evToEbitda: 10,
  psRatio: 2,
  industryGrowthRate: 0.03,
  history: [0, 1, 2, 3].map(() => ({ revenue: 1000, netIncome: 60, eps: 100 })),
  ...over,
});

describe('quality score edge cases', () => {
  it('handles N=0, N=1 and N=2 without NaN', () => {
    expect(computeQualityScores([], {})).toEqual([]);
    const [one] = computeQualityScores([co('solo')], {});
    expect(one).toMatchObject({ id: 'solo', score: 0, q: 0 });
    for (const v of Object.values(one!.pillars)) expect(v).toBe(0);
    const two = computeQualityScores([co('lo', { grossProfit: 100 }), co('hi', { grossProfit: 900 })], {});
    expect(two.map((r) => r.q)).toEqual([-0.5, 0.5]);
    for (const r of two) for (const v of [r.score, r.q, ...Object.values(r.pillars)]) expect(Number.isFinite(v)).toBe(true);
  });

  it('a loss-maker (peRatio ≤ 0) ranks worst on VAL, below even the most expensive profitable company', () => {
    const profitable = [8, 12, 16, 20, 30, 45].map((pe, i) => co(`p${i}`, { peRatio: pe }));
    const inputs = [
      ...profitable,
      co('lossZero', { netIncome: -10, peRatio: 0 }),
      co('lossNeg', { netIncome: -10, peRatio: -5 }),
    ];
    const refSets: Record<string, SectorRefs>[] = [{}, { 'Naval Arms': { pe: 18, evEbitda: 12, ps: 2.5 } }];
    for (const refs of refSets) {
      const res = computeQualityScores(inputs, refs);
      const worstProfitableVal = Math.min(...res.slice(0, 6).map((r) => r.pillars.val));
      expect(res[6]!.pillars.val).toBeLessThan(worstProfitableVal);
      expect(res[7]!.pillars.val).toBeLessThan(worstProfitableVal);
      expect(res[6]!.pillars.val).toBe(res[7]!.pillars.val);
      // cheaper P/E still ranks better among the profitable
      expect(res[0]!.pillars.val).toBeGreaterThan(res[5]!.pillars.val);
    }
  });

  it('equal rank sums tie exactly inside a pillar (no floating-point tie-breaking)', () => {
    // GROW item ranks (CAGR, NI change, industry growth), 0-based, N=4:
    //   A=(0,1,3) sum 4, B=(3,0,1) sum 4, C=(1,2,0) sum 3, D=(2,3,2) sum 7.
    // Summed as rank-z floats, A and B differ by one ulp; the spec requires them to tie.
    const growCo = (id: string, [rCagr, rNi, rInd]: [number, number, number]) =>
      co(id, {
        industryGrowthRate: 0.01 * rInd,
        history: [
          { revenue: 1000, netIncome: 0, eps: 100 },
          { revenue: 1000, netIncome: 0, eps: 100 },
          { revenue: 1000, netIncome: 0, eps: 100 },
          { revenue: 1000 + 100 * rCagr, netIncome: 10 * rNi, eps: 100 },
        ],
      });
    const res = computeQualityScores(
      [growCo('A', [0, 1, 3]), growCo('B', [3, 0, 1]), growCo('C', [1, 2, 0]), growCo('D', [2, 3, 2])],
      {},
    );
    const [a, b, c, d] = res as [(typeof res)[0], (typeof res)[0], (typeof res)[0], (typeof res)[0]];
    expect(a.pillars.grow).toBe(b.pillars.grow);
    expect(a.pillars.grow).toBe(0);
    expect(a.score).toBe(b.score);
    expect(a.q).toBe(b.q);
    expect(a.grade).toBe(b.grade);
    expect(c.pillars.grow).toBeLessThan(a.pillars.grow);
    expect(d.pillars.grow).toBeGreaterThan(a.pillars.grow);
  });

  it('missing data (NA) is neutral: rank-z 0, not worst', () => {
    // Only revenue CAGR differs; first-year revenue 0 makes it NA for 'na'.
    const cagr = (id: string, h0: number) =>
      co(id, { history: [h0, 1000, 1000, 1000].map((revenue) => ({ revenue, netIncome: 60, eps: 100 })) });
    const res = computeQualityScores([cagr('a', 1300), cagr('b', 1100), cagr('na', 0), cagr('c', 900), cagr('d', 700)], {});
    const grow = res.map((r) => r.pillars.grow);
    expect(grow[2]).toBe(0);
    expect(grow[1]!).toBeLessThan(0);
    expect(grow[3]!).toBeGreaterThan(0);
    for (const v of grow) expect(Number.isFinite(v)).toBe(true);
  });

  it('VAL WORST is keyed on earnings, not the reported multiple', () => {
    // A loss-maker with a (stale) cheap P/E and cheap EV/EBITDA still ranks below every profitable company.
    const inputs = [
      co('p0', { peRatio: 40, evToEbitda: 25 }),
      co('p1', { peRatio: 20, evToEbitda: 12 }),
      co('lossNi', { netIncome: -5, peRatio: 6, evToEbitda: 25 }),
      co('lossOi', { peRatio: 40, operatingIncome: -1, evToEbitda: 4 }),
    ];
    const val = computeQualityScores(inputs, {}).map((r) => r.pillars.val);
    expect(val[2]!).toBeLessThan(val[0]!);
    expect(val[3]!).toBeLessThan(val[0]!);
  });

  it('PROF uses ROA (netIncome/totalAssets), not the reported ROE', () => {
    // Accruals (OCF − NI) are held equal, so ROE would exactly offset ROA+CFOA if it were still an item.
    const res = computeQualityScores(
      [co('hiRoe', { roe: 0.9, netIncome: 10, operatingCashFlow: 40 }), co('loRoe', { roe: 0.01, netIncome: 90, operatingCashFlow: 120 })],
      {},
    );
    expect(res[1]!.pillars.prof).toBeGreaterThan(res[0]!.pillars.prof);
  });

  it('negative equity (debt-to-equity below 0) ranks least safe, not safest', () => {
    const res = computeQualityScores(
      [co('low', { debtToEquity: 0.1 }), co('mid', { debtToEquity: 1 }), co('high', { debtToEquity: 3 }), co('negEquity', { debtToEquity: -2 })],
      {},
    );
    const safe = res.map((r) => r.pillars.safe);
    expect(safe[3]!).toBeLessThan(safe[2]!);
    expect(safe[2]!).toBeLessThan(safe[1]!);
    expect(safe[1]!).toBeLessThan(safe[0]!);
  });

  it('a company with no liabilities is never ranked least safe', () => {
    const inputs = [
      co('a', { debtToEquity: 0 }),
      co('b', { debtToEquity: 0 }),
      co('c', { debtToEquity: 0 }),
      co('debtFree', { debtToEquity: 0, totalLiabilities: 0 }),
    ];
    const res = computeQualityScores(inputs, {});
    const others = res.slice(0, 3).map((r) => r.pillars.safe);
    expect(res[3]!.pillars.safe).toBeGreaterThanOrEqual(Math.max(...others));
  });
});
