/**
 * Calibration of the price model against the research SANITY targets
 * (research-math review §SANITY, spec §12). Fixed seeds, no player flow,
 * 25 companies with rank-uniform quality q, spread 0.30 (normal edge),
 * qEff = 0.75·q + 0.25·ξ. Bands are tolerant to seed-set variation.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { mean, standardDeviation, sampleCorrelation } from 'simple-statistics';
import { deriveClock, HOUR_MS, EDGE_SPREAD, impactLambda, spearman } from '@deca/shared';
import { Prng, deriveSeed } from '../src/lib/prng';
import { derive, marketStep, companyStep, initialState, idioVolFor, surpriseFor, effectiveQuality, type ModelCompany } from '../src/engine/model';
import { buildSchedule, jumpsAtTick } from '../src/engine/news';

const NCO = 25;
const SPREAD = EDGE_SPREAD.normal;

interface GameStats { vol: number; acf1: number; pairCorr: number; spearman: number; topBeatsBottom: boolean; topMinusBottom: number }

function acf1(r: number[]): number {
  const m = mean(r); let num = 0; let den = 0;
  for (let i = 0; i < r.length; i++) { const x = r[i]! - m; den += x * x; if (i + 1 < r.length) num += x * (r[i + 1]! - m); }
  return den === 0 ? 0 : num / den;
}

function runGame(seed: string, hours: number): GameStats {
  const clock = deriveClock(hours * HOUR_MS); const d = derive(clock, SPREAD); const N = clock.totalTicks;
  const qs: number[] = []; const companies: ModelCompany[] = [];
  for (let k = 0; k < NCO; k++) {
    const id = `C${k}`; const q = -1 + (2 * (k + 0.5)) / NCO;
    const beta = new Prng(deriveSeed(seed, `beta:${id}`)).range(0.7, 1.4); const so = 50_000_000;
    qs.push(q);
    companies.push({ id, qEff: effectiveQuality(q, surpriseFor(seed, id)), beta, idioVol: idioVolFor(seed, id, q), sharesOutstanding: so, lambda: impactLambda(beta, so) });
  }
  const events = jumpsAtTick(buildSchedule(seed, clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id, sector: 'Naval Arms' })), d));
  const start = companies.map((_, i) => 1_200 + ((i * 7919) % 50_000));
  const st = companies.map((_, i) => initialState(start[i]!));
  const mk = { hM: 1 };
  const rets: number[][] = companies.map(() => new Array<number>(N));
  const prevX = st.map((s) => s.v + s.m + s.f);
  for (let t = 1; t <= N; t++) {
    const rM = marketStep(seed, t, mk, d); const evs = events.get(t) ?? [];
    for (let i = 0; i < NCO; i++) {
      const c = companies[i]!; const s = st[i]!;
      const jump = evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0);
      companyStep(seed, t, c, s, rM, jump, 0, d);
      const x = s.v + s.m + s.f; rets[i]![t - 1] = x - prevX[i]!; prevX[i] = x; // unrounded log-price returns
    }
  }
  const total = st.map((s, i) => s.v + s.m + s.f - Math.log(start[i]!));
  let cs = 0; let cn = 0;
  for (let i = 0; i < NCO; i++) for (let j = i + 1; j < NCO; j++) { cs += sampleCorrelation(rets[i]!, rets[j]!); cn++; }
  const order = qs.map((q, i) => [q, i] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const bottom = mean(order.slice(0, 5).map((i) => total[i]!)); const top = mean(order.slice(NCO - 5).map((i) => total[i]!));
  return {
    vol: mean(rets.map((r) => standardDeviation(r) * Math.sqrt(N))),
    acf1: mean(rets.map(acf1)),
    pairCorr: cs / cn,
    spearman: spearman(qs, total),
    topBeatsBottom: top > bottom,
    topMinusBottom: top - bottom,
  };
}

type Summary = { vol: number; acf1: number; pairCorr: number; spearman: number; topWins: number; spread: number };
const summary = (gs: GameStats[]): Summary => ({
  vol: mean(gs.map((g) => g.vol)), acf1: mean(gs.map((g) => g.acf1)), pairCorr: mean(gs.map((g) => g.pairCorr)),
  spearman: mean(gs.map((g) => g.spearman)), topWins: gs.filter((g) => g.topBeatsBottom).length / gs.length, spread: mean(gs.map((g) => g.topMinusBottom)),
});

describe('calibration (research SANITY bands)', () => {
  let elapsedMs = Infinity; let s1: Summary; let s48: Summary; let sAll: Summary;
  beforeAll(() => {
    const t0 = Date.now();
    const games1h = Array.from({ length: 30 }, (_, g) => runGame(`cal-1h-${g}`, 1));
    const games48h = Array.from({ length: 12 }, (_, g) => runGame(`cal-48h-${g}`, 48));
    elapsedMs = Date.now() - t0;
    s1 = summary(games1h); s48 = summary(games48h); sAll = summary([...games1h, ...games48h]);
    console.log(`calibration: ${elapsedMs} ms`, JSON.stringify({ '1h': s1, '48h': s48, all: sAll }, (_k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  }, 60_000);

  it('runs within the 20 s budget', () => {
    expect(elapsedMs).toBeLessThan(20_000);
  });
  it('per-game realized vol is in [0.34, 0.42] at 1h and 48h and scale-invariant', () => {
    for (const s of [s1, s48]) { expect(s.vol).toBeGreaterThanOrEqual(0.34); expect(s.vol).toBeLessThanOrEqual(0.42); }
    expect(Math.abs(s1.vol - s48.vol)).toBeLessThan(0.03);
  });
  it('tick returns have no linear predictability (|mean ACF1| ≤ 0.03)', () => {
    for (const s of [s1, s48]) expect(Math.abs(s.acf1)).toBeLessThanOrEqual(0.03);
  });
  it('mean pairwise tick-return correlation is in [0.15, 0.32]', () => {
    for (const s of [s1, s48]) { expect(s.pairCorr).toBeGreaterThanOrEqual(0.15); expect(s.pairCorr).toBeLessThanOrEqual(0.32); }
  });
  it('top quality quintile beats the bottom in ≥ 85% of seeds with a spread in [0.25, 0.50]', () => {
    expect(sAll.topWins).toBeGreaterThanOrEqual(0.85);
    expect(sAll.spread).toBeGreaterThanOrEqual(0.25); expect(sAll.spread).toBeLessThanOrEqual(0.5);
  });
  it('mean Spearman(q, game return) is in [0.25, 0.48]', () => {
    expect(sAll.spearman).toBeGreaterThanOrEqual(0.25); expect(sAll.spearman).toBeLessThanOrEqual(0.48);
  });
});
