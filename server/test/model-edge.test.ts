/**
 * Adversarial edge tests for the engine model, news schedule, state and flow
 * (Task 2 review). Complements model.test.ts / news.test.ts / calibration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { mean, standardDeviation } from 'simple-statistics';
import { deriveClock, HOUR_MS, MODEL, impactLambda, intervalShareCap, estFillPrice } from '@deca/shared';
import { Prng, deriveSeed } from '../src/lib/prng';
import {
  derive, garchStep, marketStep, companyStep, initialState, idioVolFor, fillPriceExact, closePrice,
  type CompanyState, type Derived, type ModelCompany,
} from '../src/engine/model';
import { buildSchedule, hostEvent, jumpsAtTick, type NewsCompany, type ScheduledEvent } from '../src/engine/news';
import { replayFairValue, recoverImpact } from '../src/engine/state';
import { FlowBook } from '../src/engine/flow';

const SO = 8_000_000;
const cos = (n: number, seed = 'edge'): ModelCompany[] =>
  Array.from({ length: n }, (_, i) => {
    const q = -1 + (2 * (i + 0.5)) / n;
    return { id: `c${i}`, qEff: q, beta: 1, idioVol: idioVolFor(seed, `c${i}`, q), sharesOutstanding: SO, lambda: impactLambda(1, SO) };
  });
const news = (companies: ModelCompany[]): NewsCompany[] =>
  companies.map((c) => ({ id: c.id, qEff: c.qEff, beta: c.beta, name: `Company ${c.id}`, ticker: c.id.toUpperCase(), sector: 'Naval Arms' }));

interface Run { st: Record<string, CompanyState>; prices: Record<string, number[]>; rets: Record<string, number[]>; d: Derived }
function run(
  seed: string, hours: number, companies: ModelCompany[],
  opts: { flowAt?: (t: number, id: string) => number; events?: ScheduledEvent[]; stopAt?: number } = {},
): Run {
  const clock = deriveClock(hours * HOUR_MS); const d = derive(clock, 0.3);
  const byTick = jumpsAtTick(opts.events ?? buildSchedule(seed, clock, news(companies), d));
  const mk = { hM: 1 };
  const st: Record<string, CompanyState> = Object.fromEntries(companies.map((c) => [c.id, initialState(10_000)]));
  const prices: Record<string, number[]> = Object.fromEntries(companies.map((c) => [c.id, [10_000]]));
  const rets: Record<string, number[]> = Object.fromEntries(companies.map((c) => [c.id, []]));
  for (let t = 1; t <= (opts.stopAt ?? clock.totalTicks); t++) {
    const rM = marketStep(seed, t, mk, d); const evs = byTick.get(t) ?? [];
    for (const c of companies) {
      const s = st[c.id]!; const x0 = s.v + s.m + s.f;
      const jump = evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0);
      prices[c.id]!.push(companyStep(seed, t, c, s, rM, jump, opts.flowAt?.(t, c.id) ?? 0, d));
      rets[c.id]!.push(s.v + s.m + s.f - x0);
    }
  }
  return { st, prices, rets, d };
}

describe('scale invariance', () => {
  it('per-game realized vol at 1h and 48h agree within 0.04 (6 seeds each)', () => {
    const companies = cos(25);
    const perGame = (hours: number) => Array.from({ length: 6 }, (_, g) => {
      const r = run(`scale-${g}`, hours, companies); const N = deriveClock(hours * HOUR_MS).totalTicks;
      return mean(companies.map((c) => standardDeviation(r.rets[c.id]!) * Math.sqrt(N)));
    });
    const v1 = mean(perGame(1)); const v48 = mean(perGame(48));
    expect(v1).toBeGreaterThan(0.3); expect(v48).toBeGreaterThan(0.3);
    expect(Math.abs(v1 - v48)).toBeLessThan(0.04);
  });
});

describe('per-tick mechanics (spec §5.3 line by line)', () => {
  const clock = deriveClock(HOUR_MS); const d = derive(clock, 0.3);
  it('draws zM from mkt:t, then z and zO (in that order) from co:id:t; GARCH uses z only', () => {
    const c: ModelCompany = { id: 'abc', qEff: 0, beta: 0, idioVol: 0.3, sharesOutstanding: SO, lambda: impactLambda(0, SO) };
    const mk = { hM: 1.7 }; const rM = marketStep('lab', 42, mk, d);
    const zM = new Prng(deriveSeed('lab', 'mkt:42')).gauss();
    expect(rM).toBe(MODEL.mktDrift * d.dt + MODEL.mktVol * Math.sqrt(1.7 * d.dt) * zM);
    expect(mk.hM).toBe(garchStep(1.7, zM, d));
    const r = new Prng(deriveSeed('lab', 'co:abc:42')); const z = r.gauss(); const zO = r.gauss();
    const dOu: Derived = { ...d, ouSd: 0.01 }; // exercise the (off-by-default) exact OU path
    const s: CompanyState = { v: Math.log(5_000), m: 0.002, f: 0, h: 1.3 };
    companyStep('lab', 42, c, s, 0, 0.05, 123_456, dOu);
    // qEff 0 → drift 0; beta 0 → no market term
    expect(s.v).toBeCloseTo(Math.log(5_000) + 0.3 * Math.sqrt(1.3 * d.dt) * z + 0.05, 12);
    expect(s.h).toBe(garchStep(1.3, z, d));
    expect(s.m).toBe(0.002 * d.decay + 0.01 * zO);
  });
  it('clamps only the diffusive move to ±3·√dt; the news jump gaps past it', () => {
    const wild: ModelCompany = { id: 'w', qEff: 0, beta: 1, idioVol: 1_000, sharesOutstanding: SO, lambda: impactLambda(1, SO) };
    let up = 0; let down = 0;
    for (let t = 1; t <= 40; t++) {
      const s = initialState(10_000); const v0 = s.v; const jump = Math.log(1.25);
      companyStep('clamp', t, wild, s, 0, jump, 0, d);
      const dv = s.v - v0 - jump;
      expect(Math.abs(Math.abs(dv) - d.moveCap)).toBeLessThan(1e-12);
      if (dv > 0) up++; else down++;
    }
    expect(up).toBeGreaterThan(0); expect(down).toBeGreaterThan(0);
    expect(d.moveCap).toBeCloseTo(3 * Math.sqrt(1 / clock.totalTicks), 15);
  });
});

describe('net flow sign symmetry', () => {
  it('+Q and −Q leave v and h identical and give exactly opposite impact f', () => {
    const companies = cos(3); const flow = (sign: number) => (t: number, id: string) => (t % 11 === 0 && id !== 'c2' ? sign * 40_000 : 0);
    const buy = run('sym', 1, companies, { flowAt: flow(1) }); const sell = run('sym', 1, companies, { flowAt: flow(-1) });
    const none = run('sym', 1, companies);
    for (const c of companies) {
      expect(buy.st[c.id]!.v).toBe(sell.st[c.id]!.v); expect(buy.st[c.id]!.v).toBe(none.st[c.id]!.v);
      expect(buy.st[c.id]!.h).toBe(sell.st[c.id]!.h);
      expect(buy.st[c.id]!.f === -sell.st[c.id]!.f).toBe(true); // exact negation (+0 === −0 for untouched names)
      for (let t = 1; t < buy.prices[c.id]!.length; t++) {
        expect(buy.prices[c.id]![t]!).toBeGreaterThanOrEqual(none.prices[c.id]![t]!);
        expect(sell.prices[c.id]![t]!).toBeLessThanOrEqual(none.prices[c.id]![t]!);
      }
    }
    expect(buy.st.c0!.f).toBeGreaterThan(0); expect(buy.st.c2!.f).toBe(0);
  });
  it('buy and sell fills are mirror images in log space', () => {
    const s: CompanyState = { v: Math.log(2_500), m: 0, f: 0, h: 1 }; const lam = impactLambda(1.1, SO);
    for (const [p, q] of [[0, 30_000], [12_000, 5_000], [-40_000, 53_000]] as const) {
      const buy = fillPriceExact(s, lam, p, q); const sell = fillPriceExact(s, lam, -p, -q); const x = lam * q;
      if (p === 0) { expect(buy).toBeGreaterThan(2_500); expect(sell).toBeLessThan(2_500); }
      expect((buy * sell) / 2_500 ** 2).toBeCloseTo(Math.exp(-x) * (Math.expm1(x) / x) ** 2, 12);
    }
  });
  it('FlowBook nets opposite crews to zero but counts gross volume and each crew', () => {
    const fb = new FlowBook(); fb.reserve('a', 'x', 10_000); fb.reserve('b', 'x', -10_000);
    expect(fb.pendingNet('x')).toBe(0); expect(fb.teamGross('a', 'x')).toBe(10_000); expect(fb.teamGross('b', 'x')).toBe(10_000);
    expect(fb.drain('x')).toEqual({ net: 0, volume: 20_000 });
  });
});

describe('a jump on the last tick', () => {
  it('applies at tick N, moves only fair value, and shows in the closing mark', () => {
    const companies = cos(3); const clock = deriveClock(HOUR_MS); const N = clock.totalTicks; const d = derive(clock, 0.3);
    const base = buildSchedule('last', clock, news(companies), d);
    const host = hostEvent(N, news(companies), { companyIds: ['c1'], type: 'merger', magnitude: 0.1, headline: 'H', body: '' });
    const withJump = run('last', 1, companies, { events: [...base, host] }); const without = run('last', 1, companies, { events: base });
    expect(withJump.prices.c1![N - 1]).toBe(without.prices.c1![N - 1]);
    expect(withJump.st.c1!.v - without.st.c1!.v).toBeCloseTo(Math.log(1.1), 12);
    expect(withJump.st.c1!.h).toBe(without.st.c1!.h);
    expect(withJump.st.c0!.v).toBe(without.st.c0!.v);
    expect(closePrice(withJump.st.c1!) / closePrice(without.st.c1!)).toBeCloseTo(1.1, 3);
    expect(withJump.prices.c1![N]).toBe(closePrice(withJump.st.c1!));
    const replay = replayFairValue('last', clock, 0.3, companies, { c0: 10_000, c1: 10_000, c2: 10_000 }, [...base, host], N + 50);
    expect(replay.lastTick).toBe(N); expect(replay.companies.c1!.v).toBe(withJump.st.c1!.v);
  });
  it('the schedule can place company news on tick N and never past it', () => {
    const companies = cos(25); const clock = deriveClock(HOUR_MS); const d = derive(clock, 0.3); const N = clock.totalTicks;
    let atN: { seed: string; all: ScheduledEvent[]; e: ScheduledEvent } | undefined;
    for (let s = 0; s < 400 && !atN; s++) {
      const ev = buildSchedule(`n${s}`, clock, news(companies), d);
      for (const e of ev) { expect(e.tick).toBeGreaterThanOrEqual(1); expect(e.tick).toBeLessThanOrEqual(N); }
      const hit = ev.find((e) => e.tick === N && e.source === 'scheduled'); if (hit) atN = { seed: `n${s}`, all: ev, e: hit };
    }
    expect(atN).toBeDefined();
    const { seed, all, e } = atN!; const id = e.companyIds[0]!;
    const starts = Object.fromEntries(companies.map((c) => [c.id, 10_000]));
    const a = replayFairValue(seed, clock, 0.3, companies, starts, all, N);
    const b = replayFairValue(seed, clock, 0.3, companies, starts, all.filter((x) => x !== e), N);
    expect(a.companies[id]!.v - b.companies[id]!.v).toBeCloseTo(e.jumps[id]!, 12);
  });
});

describe('fillPriceExact', () => {
  it('equals shared estFillPrice(side, exp(v+m+f), λ, |σ|, p) exactly', () => {
    const r = new Prng('fill-eq');
    for (let k = 0; k < 2_000; k++) {
      const s: CompanyState = { v: Math.log(r.range(100, 90_000)), m: r.range(-0.01, 0.01), f: r.range(-0.03, 0.03), h: 1 };
      const lam = impactLambda(r.range(0.6, 1.5), Math.floor(r.range(1e6, 9e7)));
      const p = Math.floor(r.range(-200_000, 200_000)); const sigma = Math.floor(r.range(-80_000, 80_000));
      expect(fillPriceExact(s, lam, p, sigma)).toBe(estFillPrice(sigma < 0 ? 'sell' : 'buy', Math.exp(s.v + s.m + s.f), lam, Math.abs(sigma), p));
    }
    const s: CompanyState = { v: Math.log(1_500), m: 0, f: 0.01, h: 1 };
    expect(fillPriceExact(s, 3e-7, 20_000, 0)).toBeCloseTo(Math.exp(s.v + s.f + 3e-7 * 20_000), 9);
  });
  it('50 small orders with pending flow cost the same as one order (relative error < 1e-6)', () => {
    const s: CompanyState = { v: Math.log(3_210), m: 0, f: 0.004, h: 1 }; const lam = impactLambda(1.3, SO); const cap = intervalShareCap(SO);
    for (const [q, p0] of [[cap, 0], [40_000, 12_345], [-cap, 7_000], [-25_000, -30_000]] as const) {
      const one = q * fillPriceExact(s, lam, p0, q);
      let split = 0; let pending = p0;
      for (let k = 0; k < 50; k++) { split += (q / 50) * fillPriceExact(s, lam, pending, q / 50); pending += q / 50; }
      expect(Math.abs(split - one) / Math.abs(one)).toBeLessThan(1e-6);
    }
  });
});

describe('impact update order regression guard', () => {
  const setup = (hours: number) => {
    const clock = deriveClock(hours * HOUR_MS); const d = derive(clock, 0.3); const lam = impactLambda(1, SO);
    const quiet: ModelCompany = { id: 'z', qEff: 0, beta: 1, idioVol: 0, sharesOutstanding: SO, lambda: lam };
    const right = (s: CompanyState, q: number) => { companyStep('ord', 1, quiet, s, 0, 0, q, d); };
    // WRONG order: f = decay·f + λQ (impact of the last interval arrives undecayed)
    const wrong = (s: CompanyState, q: number) => { companyStep('ord', 1, quiet, s, 0, 0, 0, d); s.f += lam * q; };
    /** plan[t] = the signed orders placed during interval t (priced with pending flow); returns profit / gross. */
    const trade = (plan: number[][], step: (s: CompanyState, q: number) => void) => {
      const s = initialState(1_200); let cash = 0; let gross = 0;
      for (const orders of plan) {
        let pending = 0;
        for (const q of orders) { if (q === 0) continue; const px = fillPriceExact(s, lam, pending, q); cash -= q * px; gross += Math.abs(q) * px; pending += q; }
        step(s, pending);
      }
      return { cash, rel: gross > 0 ? cash / gross : 0 };
    };
    return { d, lam, right, wrong, trade, cap: intervalShareCap(SO) };
  };
  it('companyStep implements dec·(f + λQ), not dec·f + λQ', () => {
    const { d, lam, right, wrong } = setup(1);
    const a: CompanyState = { v: 7, m: 0, f: 0.01, h: 1 }; right(a, 50_000); expect(a.f).toBe(d.decay * (0.01 + lam * 50_000));
    const b: CompanyState = { v: 7, m: 0, f: 0.01, h: 1 }; wrong(b, 50_000); expect(b.f).toBeCloseTo(d.decay * 0.01 + lam * 50_000, 15);
    expect(a.f).not.toBeCloseTo(b.f, 6);
  });
  it('the wrong order admits a profitable long-only sequence; the correct order does not', () => {
    const { right, wrong, trade, cap } = setup(1);
    const alternate = Array.from({ length: 10 }, (_, i) => [i % 2 === 0 ? cap : -cap]);
    expect(trade(alternate, wrong).cash).toBeGreaterThan(100); // > Ð1 profit before fees
    expect(trade(alternate, right).cash).toBeLessThan(0);
  });
  it('no long-only sequence (with in-interval splits and pending flow) profits under the correct order', () => {
    for (const hours of [1, 48]) {
      const { right, wrong, trade, cap } = setup(hours); const r = new Prng(`guard-${hours}`);
      let worstRight = -Infinity; let bestWrong = -Infinity;
      for (let k = 0; k < 1_500; k++) {
        const n = 2 + r.int(0, 40); let hold = 0; const plan: number[][] = [];
        for (let i = 0; i < n; i++) {
          const m = 1 + r.int(0, 3); const orders: number[] = [];
          for (let j = 0; j < m; j++) {
            const sign = i % 2 === 0 ? 1 : -1;
            let q = k % 3 === 0 ? sign * Math.floor((cap * r.next()) / m) : k % 3 === 1 ? Math.floor(((r.next() * 2 - 1) * cap) / m) : sign * Math.floor(cap / m);
            if (hold + q < 0) q = -hold;
            hold += q; orders.push(q);
          }
          plan.push(orders);
        }
        while (hold > 0) { const q = Math.min(hold, cap); plan.push([-q]); hold -= q; }
        worstRight = Math.max(worstRight, trade(plan, right).rel); bestWrong = Math.max(bestWrong, trade(plan, wrong).rel);
      }
      expect(worstRight).toBeLessThanOrEqual(1e-9);
      expect(bestWrong).toBeGreaterThan(1e-7);
    }
  });
});

describe('news schedule ordering and host events', () => {
  const clock = deriveClock(48 * HOUR_MS); const d = derive(clock, 0.3);
  it('does not depend on the order of the companies passed in; ties break by company id', () => {
    const list = news(cos(25));
    for (let s = 0; s < 10; s++) {
      const a = buildSchedule(`ord${s}`, clock, list, d);
      const b = buildSchedule(`ord${s}`, clock, new Prng(`shuffle${s}`).shuffle(list), d);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      for (let i = 1; i < a.length; i++) {
        const x = a[i - 1]!; const y = a[i]!;
        if (x.tick === y.tick && x.source === 'scheduled' && y.source === 'scheduled') expect(x.companyIds[0]! <= y.companyIds[0]!).toBe(true);
      }
    }
  });
  it('host events reject a non-finite magnitude and ignore duplicate or unknown ids', () => {
    const list = news(cos(3));
    expect(() => hostEvent(5, list, { companyIds: ['c0'], type: 'storm', magnitude: Number.NaN, headline: 'H', body: '' })).toThrow();
    const e = hostEvent(5, list, { companyIds: ['c0', 'c0', 'nope', 'c2'], type: 'storm', magnitude: -0.2, headline: 'H', body: '' });
    expect(e.companyIds).toEqual(['c0', 'c2']); expect(e.jumps.c0).toBeCloseTo(Math.log(0.8), 12); expect(e.sentiment).toBe('bearish');
  });
  it('fills names literally, even with replacement patterns in them', () => {
    const odd: NewsCompany[] = [{ id: 'q', name: 'Cash $& {port} Co', ticker: 'CSH', sector: 'Naval Arms', qEff: 0.5, beta: 1 }];
    const ev = buildSchedule('odd', clock, odd, d).filter((e) => e.source === 'scheduled');
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) { expect(e.headline.includes('Cash $& {port} Co')).toBe(true); expect(e.body.startsWith('Cash $& {port} Co (CSH, Naval Arms) — ')).toBe(true); }
  });
});

describe('recovery continues the game', () => {
  it('replay + recoverImpact continues within 1 cent of the uninterrupted run', () => {
    const companies = cos(3); const clock = deriveClock(HOUR_MS); const d = derive(clock, 0.3);
    const flowAt = (t: number, id: string) => (t % 7 === 0 ? (id === 'c0' ? 30_000 : -20_000) : 0);
    const full = run('cont', 1, companies, { flowAt });
    const events = buildSchedule('cont', clock, news(companies), d); const byTick = jumpsAtTick(events);
    const rec = recoverImpact(
      replayFairValue('cont', clock, 0.3, companies, { c0: 10_000, c1: 10_000, c2: 10_000 }, events, 400),
      { c0: full.prices.c0![400]!, c1: full.prices.c1![400]!, c2: full.prices.c2![400]! },
    );
    const mk = { hM: rec.hM };
    for (let t = 401; t <= clock.totalTicks; t++) {
      const rM = marketStep('cont', t, mk, d); const evs = byTick.get(t) ?? [];
      for (const c of companies) {
        const p = companyStep('cont', t, c, rec.companies[c.id]!, rM, evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0), flowAt(t, c.id), d);
        expect(Math.abs(p - full.prices[c.id]![t]!)).toBeLessThanOrEqual(1);
      }
    }
    for (const c of companies) { expect(rec.companies[c.id]!.v).toBe(full.st[c.id]!.v); expect(rec.companies[c.id]!.h).toBe(full.st[c.id]!.h); }
  });
});
