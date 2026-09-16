/**
 * Calibration of the price model against the research SANITY targets
 * (research-math review §SANITY, spec §12). Fixed seeds, no player flow,
 * 15 companies with rank-uniform quality q, spread 0.39 (normal edge),
 * qEff = 0.75·q + 0.25·ξ.
 *
 * Games are the shortest and longest host options (10 and 30 minutes, i.e. 120
 * and 360 ticks). The model is scale-free, so the price-path bands are the ones
 * the 1h/48h runs met before Wave A0.
 *
 * BANDS WERE RE-DERIVED FOR N = 15 AT EDGE_SPREAD.normal = 0.39 (2026-09-16: roster
 * 25 → 15, then the spread raised 0.30 → 0.39 to put the research hit rate back at 95%).
 * Each band is the measured mean ± ~5–9 sd of the run statistic, where that sd is the
 * spread of the statistic across 10–20 INDEPENDENT seed families of this same size:
 *
 *   statistic                      N=15 sp=0.39      N=15 sp=0.30      N=25 sp=0.30      band
 *   mean vol, 10m / 30m            0.3802 / 0.3825   0.3802 / 0.3825   0.3800 / 0.3824   [0.36, 0.40]
 *   sd of that                     0.0021 / 0.0011   0.0021 / 0.0011   0.0018 / 0.0011
 *   |vol10 − vol30|                0.0029 (≤0.0048)  0.0029 (≤0.0048)  0.0029 (≤0.0052)  < 0.015
 *   mean ACF1, 10m / 30m          −0.0087 / −0.0032 −0.0087 / −0.0032 −0.0083 / −0.0032  |·| ≤ 0.03
 *   sd of that                     0.0023 / 0.0015   0.0023 / 0.0015   0.0022 / 0.0012
 *   mean pair corr, 10m / 30m      0.2751 / 0.2736   0.2751 / 0.2736   0.2752 / 0.2738   [0.24, 0.32]
 *   sd of that                     0.0057 / 0.0043   0.0057 / 0.0043   0.0054 / 0.0035
 *   Spearman(q, game return)       0.4489 ± 0.0098   0.3621 ± 0.0104   0.3620 ± 0.0084   [0.40, 0.50]
 *   top-tile − bottom-tile spread  0.4621 ± 0.0173   0.3590 ± 0.0163   0.3594 ± 0.0100   [0.38, 0.55]
 *   seeds where top tile wins      0.9500 ± 0.0105   0.9043 ± 0.0140   0.9530 ± 0.0118   ≥ 0.90
 *
 * Two facts the columns show. First, the smaller roster costs PRECISION, not price
 * realism: vol, ACF1 and pairwise correlation are per-company and did not move at all,
 * while the PER-GAME sd of Spearman rose 0.176 → 0.234 and of the top-minus-bottom
 * spread 0.220 → 0.264. Second, the spread enters only the deterministic drift, so
 * raising it to 0.39 moved the three quality statistics and nothing else — the vol,
 * ACF1 and correlation columns are identical to four decimals at 0.30 and at 0.39.
 * GAMES is 250 per length (not 30) so the run statistics stay as tight as at N = 25.
 *
 * FUNDS CHANGE NOTHING HERE (2026-09-16). The three tradeable funds are baskets of these same
 * 15 companies: they add no company, no state and no randomness, and a fund order's impact is
 * applied to its constituents, exactly as a direct order would be. Every statistic below is
 * per company, so all six bands are unmoved. The funds' own measured statistic — realized vol
 * of the basket against the companies it holds — has its own bands in `test/funds.test.ts` §4
 * (broad 0.2045 · ARMS 0.2577 · SHIPS 0.2768 · average single company 0.3736, over 300 games).
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { mean, standardDeviation, sampleCorrelation } from 'simple-statistics';
import { deriveClock, MINUTE_MS, EDGE_SPREAD, impactLambda, spearman } from '@deca/shared';
import { Prng, deriveSeed } from '../src/lib/prng';
import { derive, marketStep, companyStep, initialState, idioVolFor, surpriseFor, effectiveQuality, type ModelCompany } from '../src/engine/model';
import { buildSchedule, jumpsAtTick } from '../src/engine/news';

const NCO = 15;
/** Top/bottom tile compared by quality: a fifth of the roster, so 3 of 15. */
const TILE = Math.round(NCO / 5);
/** Seeds per game length. 250 keeps the run statistics as tight as 30 seeds were at N = 25. */
const GAMES = 250;
const SPREAD = EDGE_SPREAD.normal;

interface GameStats { vol: number; acf1: number; pairCorr: number; spearman: number; topBeatsBottom: boolean; topMinusBottom: number }

function acf1(r: number[]): number {
  const m = mean(r); let num = 0; let den = 0;
  for (let i = 0; i < r.length; i++) { const x = r[i]! - m; den += x * x; if (i + 1 < r.length) num += x * (r[i + 1]! - m); }
  return den === 0 ? 0 : num / den;
}

function runGame(seed: string, minutes: number): GameStats {
  const clock = deriveClock(minutes * MINUTE_MS); const d = derive(clock, SPREAD); const N = clock.totalTicks;
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
  const bottom = mean(order.slice(0, TILE).map((i) => total[i]!)); const top = mean(order.slice(NCO - TILE).map((i) => total[i]!));
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
  let elapsedMs = Infinity; let s10: Summary; let s30: Summary; let sAll: Summary;
  beforeAll(() => {
    const t0 = Date.now();
    const games10m = Array.from({ length: GAMES }, (_, g) => runGame(`cal-10m-${g}`, 10));
    const games30m = Array.from({ length: GAMES }, (_, g) => runGame(`cal-30m-${g}`, 30));
    elapsedMs = Date.now() - t0;
    s10 = summary(games10m); s30 = summary(games30m); sAll = summary([...games10m, ...games30m]);
    console.log(`calibration: ${elapsedMs} ms`, JSON.stringify({ '10m': s10, '30m': s30, all: sAll }, (_k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  }, 120_000); // generous: parallel agents and CI load can slow the simulation several-fold

  it('runs within the 45 s budget', () => {
    expect(elapsedMs).toBeLessThan(45_000);
  });
  it('per-game realized vol is in [0.36, 0.40] at 10 and 30 minutes and scale-invariant', () => {
    for (const s of [s10, s30]) { expect(s.vol).toBeGreaterThanOrEqual(0.36); expect(s.vol).toBeLessThanOrEqual(0.4); }
    expect(Math.abs(s10.vol - s30.vol)).toBeLessThan(0.015);
  });
  it('tick returns have no linear predictability (|mean ACF1| ≤ 0.03)', () => {
    // Centred near −1/(ticks − 1), the small-sample bias of the estimator, not on 0.
    for (const s of [s10, s30]) expect(Math.abs(s.acf1)).toBeLessThanOrEqual(0.03);
  });
  it('mean pairwise tick-return correlation is in [0.24, 0.32]', () => {
    for (const s of [s10, s30]) { expect(s.pairCorr).toBeGreaterThanOrEqual(0.24); expect(s.pairCorr).toBeLessThanOrEqual(0.32); }
  });
  it('the top 3 of 15 by quality beat the bottom 3 in ≥ 90% of seeds with a spread in [0.38, 0.55]', () => {
    expect(sAll.topWins).toBeGreaterThanOrEqual(0.9);
    expect(sAll.spread).toBeGreaterThanOrEqual(0.38); expect(sAll.spread).toBeLessThanOrEqual(0.55);
  });
  it('mean Spearman(q, game return) is in [0.40, 0.50]', () => {
    expect(sAll.spearman).toBeGreaterThanOrEqual(0.4); expect(sAll.spearman).toBeLessThanOrEqual(0.5);
  });
});
