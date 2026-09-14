import { describe, it, expect } from 'vitest';
import { deriveClock, HOUR_MS, impactLambda } from '@deca/shared';
import { derive, garchStep, marketStep, companyStep, initialState, drift, idioVolFor, fillPriceExact, closePrice, effectiveQuality, surpriseFor, type ModelCompany } from '../src/engine/model';
import { replayFairValue, recoverImpact, serializeState } from '../src/engine/state';
import { buildSchedule, jumpsAtTick } from '../src/engine/news';

const cos = (n: number): ModelCompany[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, qEff: -1 + 2 * (i + 0.5) / n, beta: 1, idioVol: 0.3, sharesOutstanding: 50_000_000, lambda: impactLambda(1, 50_000_000) }));
function run(seed: string, hours: number, companies: ModelCompany[], flowAt?: (t: number, id: string) => number, stopAt?: number) {
  const clock = deriveClock(hours * HOUR_MS); const d = derive(clock, 0.3);
  const events = jumpsAtTick(buildSchedule(seed, clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id.toUpperCase(), sector: 'Naval Arms' })), d));
  const mk = { hM: 1 }; const st = Object.fromEntries(companies.map((c) => [c.id, initialState(10_000)]));
  const prices: Record<string, number[]> = Object.fromEntries(companies.map((c) => [c.id, [10_000]]));
  const end = stopAt ?? clock.totalTicks;
  for (let t = 1; t <= end; t++) {
    const rM = marketStep(seed, t, mk, d);
    const evs = events.get(t) ?? [];
    for (const c of companies) {
      const jump = evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0);
      prices[c.id]!.push(companyStep(seed, t, c, st[c.id]!, rM, jump, flowAt?.(t, c.id) ?? 0, d));
    }
  }
  return { clock, d, mk, st, prices };
}

describe('model parameters', () => {
  it('GARCH per-tick parameters are stationary with finite kurtosis for every game length', () => {
    for (const h of [1, 2, 4, 8, 12, 24, 48]) {
      const d = derive(deriveClock(h * HOUR_MS), 0.3);
      expect(d.alpha + d.beta).toBeLessThan(1);
      expect(3 * d.alpha ** 2 + 2 * d.alpha * d.beta + d.beta ** 2).toBeLessThan(1);
    }
  });
  it('GARCH h stays within [0.1, 10] and has mean ~1 under z²=1', () => {
    const d = derive(deriveClock(48 * HOUR_MS), 0.3);
    expect(garchStep(1, 1, d)).toBeCloseTo(1, 10);
    expect(garchStep(9.9, 50, d)).toBeLessThanOrEqual(10);
  });
  it('impact half-life is 5% of the game and the diffusion clamp scales as 3·√dt', () => {
    for (const h of [1, 12, 48]) { const c = deriveClock(h * HOUR_MS); const d = derive(c, 0.3);
      expect(d.decay ** Math.round(0.05 * c.totalTicks)).toBeCloseTo(0.5, 2); expect(d.moveCap).toBeCloseTo(3 * Math.sqrt(1 / c.totalTicks), 12); }
  });
  it('hidden surprise mixes 25% seeded noise into quality', () => {
    const x = surpriseFor('s', 'a'); expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(1);
    expect(effectiveQuality(0.8, x)).toBeCloseTo(0.75 * 0.8 + 0.25 * x, 12); expect(surpriseFor('s', 'a')).toBe(x);
  });
  it('compensated drift gives expected quality return spread·q regardless of K', () => {
    const d = derive(deriveClock(48 * HOUR_MS), 0.3);
    const c = { id: 'x', qEff: 0.5, beta: 1, idioVol: 0.3, sharesOutstanding: 1e7, lambda: impactLambda(1, 1e7) };
    const jumpDrift = d.K * (2 * (0.5 + 0.3 * c.qEff) - 1) * d.truncMean;
    expect(drift(c, d) + jumpDrift).toBeCloseTo(0.15, 10);
  });
  it('idiosyncratic vol is lower for quality and seeded', () => {
    expect(idioVolFor('s', 'a', 1)).toBeLessThanOrEqual(0.29);
    expect(idioVolFor('s', 'a', -1)).toBeGreaterThanOrEqual(0.31);
    expect(idioVolFor('s', 'a', 0)).toBe(idioVolFor('s', 'a', 0));
  });
});

describe('determinism and resume', () => {
  it('same seed → identical prices; different seed → different', () => {
    const a = run('seed-a', 1, cos(5)); const b = run('seed-a', 1, cos(5)); const c = run('seed-b', 1, cos(5));
    expect(a.prices).toEqual(b.prices); expect(a.prices.c0).not.toEqual(c.prices.c0);
  });
  it('stop, JSON round-trip, continue → byte-identical prices (with player flow)', () => {
    const companies = cos(4); const flow = (t: number, id: string) => (t % 37 === 0 && id === 'c1' ? 200_000 : 0);
    const full = run('resume', 1, companies, flow);
    const clock = full.clock; const d = full.d;
    const part = run('resume', 1, companies, flow, 300);
    const saved = JSON.parse(JSON.stringify({ mk: part.mk, st: serializeState({ lastTick: 300, hM: part.mk.hM, companies: part.st }) }));
    const events = jumpsAtTick(buildSchedule('resume', clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id, sector: 'Naval Arms' })), d));
    const mk = { hM: saved.st.hM }; const st = saved.st.companies;
    for (let t = 301; t <= clock.totalTicks; t++) {
      const rM = marketStep('resume', t, mk, d); const evs = events.get(t) ?? [];
      for (const c of companies) {
        const p = companyStep('resume', t, c, st[c.id], rM, evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0), flow(t, c.id), d);
        expect(p).toBe(full.prices[c.id]![t]);
      }
    }
  });
  it('fair value v and GARCH h do not depend on player flow', () => {
    const noFlow = run('flow', 1, cos(3)); const withFlow = run('flow', 1, cos(3), () => 1_000_000);
    for (const id of ['c0', 'c1', 'c2']) { expect(withFlow.st[id]!.v).toBe(noFlow.st[id]!.v); expect(withFlow.st[id]!.h).toBe(noFlow.st[id]!.h); }
  });
  it('replay + recoverImpact reconstructs state from persisted prices', () => {
    const companies = cos(3); const r = run('rec', 1, companies, (t) => (t === 100 ? 500_000 : 0), 400);
    const d = r.d; const events = buildSchedule('rec', r.clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id, sector: 'Naval Arms' })), d);
    const replay = replayFairValue('rec', r.clock, 0.3, companies, { c0: 10_000, c1: 10_000, c2: 10_000 }, events, 400);
    const rec = recoverImpact(replay, { c0: r.prices.c0![400]!, c1: r.prices.c1![400]!, c2: r.prices.c2![400]! });
    for (const id of ['c0', 'c1', 'c2']) {
      expect(rec.companies[id]!.v).toBeCloseTo(r.st[id]!.v, 9);
      expect(Math.round(Math.exp(rec.companies[id]!.v + rec.companies[id]!.m + rec.companies[id]!.f))).toBe(r.prices[id]![400]);
    }
  });
});

describe('anti-manipulation (zero noise, linear transient impact)', () => {
  const clock = deriveClock(48 * HOUR_MS); const d = derive(clock, 0.3); const so = 8_000_000;
  const quiet: ModelCompany = { id: 'z', qEff: 0, beta: 1, idioVol: 0, sharesOutstanding: so, lambda: impactLambda(1, so) };
  // deterministic zero-noise stepper: rM = 0, jump = 0, idioVol = 0, qEff = 0 → v constant; only f moves
  const step = (s: ReturnType<typeof initialState>, net: number) => companyStep('am', 1, quiet, s, 0, 0, net, d);
  function roundTrip(plan: number[]) { // plan[t] = signed shares traded in interval t (sum must be 0)
    const s = initialState(1_200); let cash = 0; let gross = 0;
    for (const q of plan) { if (q !== 0) { const px = fillPriceExact(s, quiet.lambda, 0, q); cash -= q * px; gross += Math.abs(q) * px; } step(s, q); }
    return { cash, gross };
  }
  it('update order dec·(f + λQ) makes any long-only round trip unprofitable before fees', () => {
    let worst = -Infinity;
    for (let k = 0; k < 2_000; k++) {
      const n = 3 + (k % 20); const buys = Array.from({ length: n }, (_, i) => ((k * 7919 + i * 104729) % 40_000));
      const total = buys.reduce((a, b) => a + b, 0); const plan = [...buys, 0, -total];
      const r = roundTrip(plan); worst = Math.max(worst, r.cash / Math.max(1, r.gross));
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });
  it('accumulate for 10 intervals then dump loses money before fees', () => {
    const r = roundTrip([...Array(10).fill(8_333), -83_330]); expect(r.cash).toBeLessThan(0);
  });
  it('impact decays after adding flow: f = dec·(f + λQ), so a buy-then-sell next interval costs money', () => {
    const s = initialState(1_200); step(s, 83_333);
    expect(s.f).toBeCloseTo(d.decay * quiet.lambda * 83_333, 15);
    step(s, 0); expect(s.f).toBeCloseTo(d.decay ** 2 * quiet.lambda * 83_333, 15);
    const r = roundTrip([83_333, -83_333]); expect(r.cash).toBeLessThan(-1); // wrong order f = dec·f + λQ breaks even here
  });
  it('closing mark excludes impact', () => {
    const s = initialState(1_200); step(s, 50_000); expect(closePrice(s)).toBe(1_200);
    expect(Math.round(Math.exp(s.v + s.m + s.f))).toBeGreaterThan(1_200);
  });
});
