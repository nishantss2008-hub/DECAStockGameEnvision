/**
 * Adversarial edge tests for the market generator (spec §4): accounting identities
 * beyond the plan's gate, sector grounding in research.json, the price of quality,
 * hidden-quality leaks through public fields, determinism, and the sectorRefs wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import * as shared from '@deca/shared';
import { SECTORS, rankZ, spearman, type QualityInput, type Sector } from '@deca/shared';
import { generateMarket, sectorRefs, type GeneratedCompany } from '../src/seed/generateMarket';
import { idioVolFor } from '../src/engine/model';
import research from '../src/seed/research.json';

vi.mock('@deca/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deca/shared')>();
  return { ...actual, computeQualityScores: vi.fn(actual.computeQualityScores) };
});

type Profile = (typeof research.sectorProfiles)[number];
const profile = (s: Sector): Profile => research.sectorProfiles.find((p) => p.sector === s)!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
/** Q = rz(PROF + GROW + SAFE), the quality composite before the value tilt. */
const qComposite = (cs: GeneratedCompany[]) => rankZ(cs.map((g) => g.quality.pillars.prof + g.quality.pillars.grow + g.quality.pillars.safe));
const meanTenure = (g: GeneratedCompany) => mean(g.fundamentals.management.map((p) => p.tenureYears));

/** The reveal path: rebuild the score inputs from the stored public fundamentals only. */
function inputsFrom(cs: GeneratedCompany[]): QualityInput[] {
  return cs.map(({ company: c, fundamentals: f }) => ({
    id: c.id,
    sector: c.sector,
    grossProfit: f.grossProfit,
    totalAssets: f.totalAssets,
    roe: f.roe,
    operatingCashFlow: f.operatingCashFlow,
    netIncome: f.netIncome,
    debtToEquity: f.debtToEquity,
    currentRatio: f.currentRatio,
    operatingIncome: f.operatingIncome,
    marketCap: f.marketCap,
    totalLiabilities: f.totalLiabilities,
    revenue: f.revenue,
    peRatio: f.peRatio,
    evToEbitda: f.evToEbitda,
    psRatio: f.psRatio,
    industryGrowthRate: f.industry.growthRate,
    history: f.history.map((h) => ({ revenue: h.revenue, netIncome: h.netIncome, eps: h.eps })),
  }));
}

/** Heavy seeded loops: generous timeout so a loaded CI machine does not flake. */
const SLOW = 30_000;

describe('generateMarket edge: accounting identities', () => {
  it('every derived ratio matches its definition within display rounding (40 seeds)', () => {
    const r4 = 5e-5 + 1e-12; // round4 fields
    const r2 = 5e-3 + 1e-9; // round2 fields
    for (let s = 0; s < 40; s++) {
      for (const { company: c, fundamentals: f } of generateMarket(`edge-id${s}`).companies) {
        for (const v of [f.marketCap, f.revenue, f.costOfRevenue, f.grossProfit, f.operatingIncome, f.netIncome, f.ebitda, f.cash, f.totalAssets, f.totalDebt, f.totalLiabilities, f.equity, f.operatingCashFlow, f.capex, f.freeCashFlow, f.eps, f.float, f.week52High, f.week52Low, f.analyst.priceTarget, f.industry.tam, c.sharesOutstanding, c.adv]) {
          expect(Number.isSafeInteger(v)).toBe(true);
        }
        expect(f.totalAssets).toBe(f.equity + f.totalLiabilities);
        expect(f.totalDebt).toBe(Math.round(f.debtToEquity * f.equity));
        expect(f.totalLiabilities).toBeGreaterThanOrEqual(f.totalDebt);
        expect(f.equity).toBeGreaterThan(0);
        expect(f.cash).toBeGreaterThanOrEqual(0);
        expect(f.cash).toBeLessThanOrEqual(f.totalAssets);
        // Returns and margins
        expect(Math.abs(f.roe - f.netIncome / f.equity)).toBeLessThanOrEqual(r4);
        expect(Math.abs(f.roa - f.netIncome / f.totalAssets)).toBeLessThanOrEqual(r4);
        expect(Math.abs(f.grossMargin - f.grossProfit / f.revenue)).toBeLessThanOrEqual(r4);
        expect(Math.abs(f.operatingMargin - f.operatingIncome / f.revenue)).toBeLessThanOrEqual(r4);
        expect(Math.abs(f.netMargin - f.netIncome / f.revenue)).toBeLessThanOrEqual(r4);
        // EBITDA sits between operating income and gross profit
        expect(f.ebitda).toBeGreaterThanOrEqual(f.operatingIncome);
        expect(f.ebitda).toBeLessThanOrEqual(f.grossProfit);
        // EV/EBITDA = (marketCap + debt − cash)/EBITDA, 0 when undefined
        const ev = f.marketCap + f.totalDebt - f.cash;
        if (f.ebitda > 0 && ev > 0) expect(Math.abs(f.evToEbitda - ev / f.ebitda)).toBeLessThanOrEqual(r2);
        else expect(f.evToEbitda).toBe(0);
        // Multiples
        expect(Math.abs(f.psRatio - f.marketCap / f.revenue)).toBeLessThanOrEqual(r2);
        expect(Math.abs(f.pbRatio - f.marketCap / f.equity)).toBeLessThanOrEqual(r2);
        if (f.netIncome > 0) {
          expect(Math.abs(f.peRatio - f.marketCap / f.netIncome)).toBeLessThanOrEqual(r2);
          expect(f.forwardPe).toBeGreaterThan(0);
          expect(f.forwardPe).toBeLessThanOrEqual(f.peRatio * 1.06);
        } else {
          expect(f.peRatio).toBe(0);
          expect(f.forwardPe).toBe(0);
          expect(f.payoutRatio).toBe(0);
        }
        // dividendYield = payout·NI/marketCap
        expect(Math.abs(f.dividendYield - (f.payoutRatio * f.netIncome) / f.marketCap)).toBeLessThanOrEqual(r4);
        expect(f.payoutRatio).toBeGreaterThanOrEqual(0);
        expect(f.payoutRatio).toBeLessThanOrEqual(1);
        // EPS = NI/shares in whole cents, never 0 or sign-flipped for a non-zero result
        expect(Math.abs(f.eps - f.netIncome / c.sharesOutstanding)).toBeLessThanOrEqual(1);
        expect(Math.sign(f.eps)).toBe(Math.sign(f.netIncome));
        // Latest fiscal year is the headline statement
        const latest = f.history[f.history.length - 1]!;
        expect([latest.revenue, latest.netIncome, latest.eps]).toEqual([f.revenue, f.netIncome, f.eps]);
        expect(f.history.map((h) => h.period)).toEqual(['FY2022', 'FY2023', 'FY2024', 'FY2025']);
        // Company doc
        expect(f.week52Low).toBeLessThan(c.startPrice);
        expect(f.week52High).toBeGreaterThan(c.startPrice);
        expect(c.adv).toBe(Math.round(c.sharesOutstanding / 150));
        expect(f.sharesOutstanding).toBe(c.sharesOutstanding);
      }
    }
  }, SLOW);
});

describe('generateMarket edge: sector grounding in research.json', () => {
  const SEEDS = 300;
  const bySector = new Map<Sector, GeneratedCompany[]>();
  for (let s = 0; s < SEEDS; s++) {
    for (const g of generateMarket(`edge-sector${s}`).companies) {
      const list = bySector.get(g.company.sector) ?? [];
      list.push(g);
      bySector.set(g.company.sector, list);
    }
  }

  it('sector medians of P/E, net margin, revenue growth and dividend yield sit in the research bands', () => {
    for (const [sector, cs] of bySector) {
      const p = profile(sector);
      const profitable = cs.filter((g) => g.fundamentals.netIncome > 0);
      const pe = median(profitable.map((g) => g.fundamentals.peRatio));
      expect(pe, `${sector} P/E ${pe}`).toBeGreaterThanOrEqual(p.peLow);
      expect(pe, `${sector} P/E ${pe}`).toBeLessThanOrEqual(p.peHigh);
      const nm = median(cs.map((g) => g.fundamentals.netMargin));
      // Some research bands are only 2pp wide (Treasure Banking 27–29%); the loss tail pulls the median a little.
      expect(nm, `${sector} net margin ${nm}`).toBeGreaterThanOrEqual(p.netMarginLow - 0.015);
      expect(nm, `${sector} net margin ${nm}`).toBeLessThanOrEqual(p.netMarginHigh + 0.015);
      const cagr = median(cs.map(({ fundamentals: { history: h } }) => (h[3]!.revenue / h[0]!.revenue) ** (1 / 3) - 1));
      expect(cagr, `${sector} CAGR ${cagr}`).toBeGreaterThanOrEqual(p.revGrowthLow - 0.01);
      expect(cagr, `${sector} CAGR ${cagr}`).toBeLessThanOrEqual(p.revGrowthHigh + 0.01);
      const dy = median(cs.map((g) => g.fundamentals.dividendYield));
      expect(dy, `${sector} dividend yield ${dy} vs ${p.divYield}`).toBeGreaterThanOrEqual(0.5 * p.divYield);
      expect(dy, `${sector} dividend yield ${dy} vs ${p.divYield}`).toBeLessThanOrEqual(1.5 * p.divYield);
    }
  });

  it('EV/EBITDA is centred on the sector reference, so no sector looks cheap by construction', () => {
    // Every sector holds exactly 3 roster companies, so each has 3·SEEDS samples.
    // Before the fix Cartography & Navigation sat at ln(EV/EBITDA ÷ ref) ≈ −0.22 with a mean VAL pillar ≈ +0.3.
    const refs = sectorRefs();
    for (const [sector, cs] of bySector) {
      const ev = median(cs.filter((g) => g.fundamentals.evToEbitda > 0).map((g) => g.fundamentals.evToEbitda));
      const evBound = 0.05 + 1.5 / Math.sqrt(cs.length);
      expect(Math.abs(Math.log(ev / refs[sector]!.evEbitda)), `${sector} EV/EBITDA ${ev} vs ${refs[sector]!.evEbitda}`).toBeLessThan(evBound);
      const val = mean(cs.map((g) => g.quality.pillars.val));
      const valBound = 0.05 + 2.5 / Math.sqrt(cs.length);
      expect(Math.abs(val), `${sector} mean VAL pillar ${val}`).toBeLessThan(valBound);
    }
  });

  it('P/E respects the sector bounds for almost every profitable company and is never absurd', () => {
    let inside = 0;
    let profitable = 0;
    for (const [sector, cs] of bySector) {
      const p = profile(sector);
      for (const { fundamentals: f } of cs) {
        if (f.netIncome <= 0) continue;
        profitable++;
        expect(f.peRatio).toBeGreaterThanOrEqual(0.6 * p.peLow - 0.01);
        expect(f.peRatio, `${sector} P/E ${f.peRatio}`).toBeLessThan(1000);
        if (f.peRatio <= 1.6 * p.peHigh + 0.01) inside++;
      }
    }
    expect(inside / profitable).toBeGreaterThan(0.99);
    expect(profitable).toBeGreaterThan(4000);
  });
});

describe('generateMarket edge: price of quality (30 seeds)', () => {
  const rows = Array.from({ length: 30 }, (_, s) => {
    const cs = generateMarket(`edge-pq${s}`).companies;
    const Q = qComposite(cs);
    const idx = cs.map((_, i) => i).filter((i) => cs[i]!.fundamentals.netIncome > 0);
    const pick = <T>(xs: T[]) => idx.map((i) => xs[i]!);
    const pe = cs.map((g) => g.fundamentals.peRatio);
    return {
      qPe: spearman(pick(Q), pick(pe)),
      scorePe: spearman(pick(cs.map((g) => g.quality.score)), pick(pe)),
      qVal: spearman(pick(Q), pick(cs.map((g) => g.quality.pillars.val))),
      qValAll: spearman(Q, cs.map((g) => g.quality.pillars.val)),
    };
  });

  it('quality trades at a mild P/E premium among companies with earnings', () => {
    // Batches: corr(Q, P/E) mean 0.35 in [0.29, 0.41]; corr(score, P/E) mean 0.12 in [0.05, 0.18].
    const qPe = mean(rows.map((r) => r.qPe));
    expect(qPe).toBeGreaterThan(0.15);
    expect(qPe).toBeLessThan(0.5);
    const scorePe = mean(rows.map((r) => r.scorePe));
    expect(scorePe).toBeGreaterThan(0);
    expect(scorePe).toBeLessThan(0.3);
  });

  it('quality and value are mildly negatively related among companies with earnings', () => {
    // Measured over 30 disjoint 30-seed batches: mean −0.23, range [−0.29, −0.15].
    const qVal = mean(rows.map((r) => r.qVal));
    expect(qVal).toBeGreaterThan(-0.4);
    expect(qVal).toBeLessThan(-0.1);
    // Loss-makers rank WORST on P/E by the frozen score contract, which pulls the all-company
    // figure toward 0 (batches: mean −0.06, range [−0.12, +0.03]); it must not turn clearly positive.
    const all = mean(rows.map((r) => r.qValAll));
    expect(all).toBeLessThan(0.1);
    expect(all).toBeGreaterThan(-0.35);
  });
});

describe('generateMarket edge: public fields do not leak hidden quality', () => {
  const markets = Array.from({ length: 30 }, (_, s) => generateMarket(`edge-leak${s}`).companies);
  const pooled = (f: (g: GeneratedCompany) => number) => spearman(markets.flat().map((g) => g.quality.q), markets.flat().map(f));

  it('management tenure is unrelated to q', () => {
    // Per market (N = 15) an independent field still reaches |rho| ≥ 0.6 by chance about 1.8% of the time,
    // so the per-market check allows a stray seed; the mean and pooled checks catch any real tie
    // (the original generator: mean tenure rho ≈ 0.37 per market and pooled).
    const perSeed = markets.map((cs) => spearman(cs.map((g) => g.quality.q), cs.map(meanTenure)));
    const ceo = markets.map((cs) => spearman(cs.map((g) => g.quality.q), cs.map((g) => g.fundamentals.management[0]!.tenureYears)));
    expect(perSeed.filter((r) => Math.abs(r) < 0.6).length / perSeed.length).toBeGreaterThanOrEqual(0.9);
    expect(ceo.filter((r) => Math.abs(r) < 0.6).length / ceo.length).toBeGreaterThanOrEqual(0.9);
    expect(Math.abs(mean(perSeed))).toBeLessThan(0.15);
    expect(Math.abs(mean(ceo))).toBeLessThan(0.15);
    expect(Math.abs(pooled(meanTenure))).toBeLessThan(0.2);
  });

  it('competitive position and overview text are not graded by the hidden score', () => {
    const strong = (g: GeneratedCompany) => (/dominant|defensible/.test(g.fundamentals.industry.competitivePosition) ? 1 : 0);
    const profitable = markets.flat().filter((g) => g.fundamentals.netIncome > 0);
    const rho = spearman(profitable.map((g) => g.quality.q), profitable.map(strong));
    expect(Math.abs(rho)).toBeLessThan(0.15);
    for (const g of markets.flat()) expect(g.fundamentals.businessOverview).toContain(g.fundamentals.industry.competitivePosition.toLowerCase());
  });

  it('payout is at most a weak hint, weaker than the analyst view', () => {
    const profitable = markets.flat().filter((g) => g.fundamentals.netIncome > 0);
    const payout = spearman(profitable.map((g) => g.quality.q), profitable.map((g) => g.fundamentals.payoutRatio));
    const analyst = pooled((g) => g.fundamentals.analyst.priceTarget / g.company.startPrice);
    expect(payout).toBeLessThan(0.45);
    expect(payout).toBeLessThan(analyst);
  });

  it('the analyst target is a noisy hint, never a function of q', () => {
    for (const cs of markets) {
      expect(spearman(cs.map((g) => g.quality.q), cs.map((g) => g.fundamentals.analyst.priceTarget / g.company.startPrice))).toBeLessThan(0.95);
    }
  });
});

describe('generateMarket edge: determinism and score wiring', () => {
  it('is a pure function of the seed (including the empty seed) and JSON-stable', () => {
    for (const seed of ['', 'edge-det', 'Ð unicode ☠']) {
      const a = generateMarket(seed);
      expect(generateMarket(seed)).toEqual(a);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      expect(a.seed).toBe(seed);
      // q is the rank of s mapped into (−1, 1); exact score ties share an average rank, so the mean stays 0.
      const qs = a.companies.map((g) => g.quality.q);
      for (const q of qs) { expect(q).toBeGreaterThan(-1); expect(q).toBeLessThan(1); }
      expect(Math.abs(mean(qs))).toBeLessThan(1e-12);
    }
    const a = generateMarket('edge-a').companies.map((g) => g.quality.q);
    const b = generateMarket('edge-b').companies.map((g) => g.quality.q);
    expect(a).not.toEqual(b);
  }, SLOW);

  it('calls computeQualityScores exactly once, with sectorRefs()', () => {
    const spy = vi.mocked(shared.computeQualityScores);
    spy.mockClear();
    const m = generateMarket('edge-refs');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toEqual(sectorRefs());
    expect(spy.mock.results[0]!.value).toEqual(m.companies.map((g) => g.quality));
  });

  it('the stored quality recomputes exactly from public fundamentals with sectorRefs(), and the refs matter', () => {
    let refsMatter = false;
    for (let s = 0; s < 10; s++) {
      const cs = generateMarket(`edge-reveal${s}`).companies;
      const inputs = inputsFrom(cs);
      expect(shared.computeQualityScores(inputs, sectorRefs())).toEqual(cs.map((g) => g.quality));
      const without = shared.computeQualityScores(inputs, {});
      if (JSON.stringify(without) !== JSON.stringify(cs.map((g) => g.quality))) refsMatter = true;
    }
    expect(refsMatter).toBe(true);
  }, SLOW);

  it('sectorRefs covers every sector with the research midpoints', () => {
    const refs = sectorRefs();
    expect(Object.keys(refs).sort()).toEqual([...SECTORS].sort());
    for (const sector of SECTORS) {
      const p = profile(sector);
      expect(refs[sector]).toEqual({ pe: (p.peLow + p.peHigh) / 2, evEbitda: p.evEbitda, ps: (p.psLow + p.psHigh) / 2 });
    }
  });

  it('idioVol comes from idioVolFor with the MEASURED q', () => {
    const m = generateMarket('edge-vol');
    for (const g of m.companies) expect(g.idioVol).toBe(idioVolFor('edge-vol', g.company.id, g.quality.q));
  });
});
