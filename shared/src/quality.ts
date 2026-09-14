/**
 * AQR Quality-Minus-Junk style quality score (spec §3). Pure: the same function
 * serves market generation, tests and the end-game reveal.
 *
 * Every item is rank-z normalized across the N companies; each pillar is the
 * rank-z of the sum of its items' rank-z. Q = rz(PROF+GROW+SAFE),
 * s = rz(0.70·Q + 0.30·VAL), q = −1 + 2·(rank0(s)+0.5)/N.
 */

import { GRADES, type Grade, type Sector } from './constants.js';
import { rankZ } from './mathx.js';

export interface QualityInput {
  id: string;
  sector: Sector;
  grossProfit: number;
  totalAssets: number;
  roe: number;
  operatingCashFlow: number;
  netIncome: number;
  debtToEquity: number;
  currentRatio: number;
  operatingIncome: number;
  marketCap: number;
  totalLiabilities: number;
  revenue: number;
  peRatio: number;
  evToEbitda: number;
  psRatio: number;
  industryGrowthRate: number;
  /** Fiscal years, oldest → newest (length 4). */
  history: { revenue: number; netIncome: number; eps: number }[];
}

export interface SectorRefs {
  pe: number;
  evEbitda: number;
  ps: number;
}

export interface QualityPillars {
  prof: number;
  grow: number;
  safe: number;
  val: number;
}

export interface QualityResult {
  id: string;
  /** s: the combined rank-z score. */
  score: number;
  /** Engine input in (−1, 1). */
  q: number;
  grade: Grade;
  pillars: QualityPillars;
}

type Item = number | undefined;

/** Finite a/b, or undefined when b is 0 or the result is not finite. */
function div(a: number, b: number): Item {
  if (b === 0) return undefined;
  const r = a / b;
  return Number.isFinite(r) ? r : undefined;
}

function finite(x: number): Item {
  return Number.isFinite(x) ? x : undefined;
}

function sum(...xs: Item[]): Item {
  let s = 0;
  for (const x of xs) {
    if (x === undefined) return undefined;
    s += x;
  }
  return s;
}

function sampleSd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
}

function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** ln(ref/x); a non-positive multiple (e.g. negative earnings) ranks worst. */
function logRelative(ref: number | undefined, x: number): Item {
  if (ref === undefined || !(ref > 0) || !(x > 0)) return undefined;
  return finite(Math.log(ref / x));
}

/**
 * Integer form of a rank-z column: rz = (rank − (N+1)/2)/sd, so 2·sd·rz = 2·rank − (N+1)
 * is an exact integer. Summing these integers instead of rz floats orders totals
 * identically (positive scaling) but keeps equal rank sums exactly equal, so they tie
 * and take the average rank. Float sums of rz break such ties by one ulp.
 */
function rankUnits(z: number[], n: number): number[] {
  const twoSd = 2 * Math.sqrt((n * n - 1) / 12);
  return z.map((v) => Math.round(v * twoSd));
}

/** Rank-z of the element-wise sum of each item's rank-z (summed exactly, see rankUnits). */
function pillar(items: Item[][], n: number): number[] {
  const cols = items.map((col) => rankUnits(rankZ(col), n));
  const totals = Array.from({ length: n }, (_, i) => cols.reduce((a, c) => a + c[i]!, 0));
  return rankZ(totals);
}

/** 0-based ascending rank of xs[i]; exact ties share the average rank. */
function rank0(xs: number[], i: number): number {
  const x = xs[i]!;
  let below = 0;
  let equal = 0;
  for (const y of xs) {
    if (y < x) below++;
    else if (y === x) equal++;
  }
  return below + (equal - 1) / 2;
}

/** Quintile grade. rankIndex0 counts from the best (0 = best). */
export function gradeFor(rankIndex0: number, n: number): Grade {
  if (n <= 0) return GRADES[GRADES.length - 1]!;
  const idx = Math.min(GRADES.length - 1, Math.max(0, Math.floor((GRADES.length * rankIndex0) / n)));
  return GRADES[idx]!;
}

export function computeQualityScores(
  inputs: QualityInput[],
  refs: Record<string, SectorRefs>,
): QualityResult[] {
  const n = inputs.length;
  if (n === 0) return [];

  // Universe-median fallbacks for sectors missing from `refs`.
  const positive = (pick: (c: QualityInput) => number) => inputs.map(pick).filter((v) => v > 0 && Number.isFinite(v));
  const fallback = {
    pe: median(positive((c) => c.peRatio)),
    evEbitda: median(positive((c) => c.evToEbitda)),
    ps: median(positive((c) => c.psRatio)),
  };
  const refFor = (c: QualityInput, key: keyof SectorRefs): number | undefined => {
    const v = refs[c.sector]?.[key];
    return v !== undefined && v > 0 && Number.isFinite(v) ? v : fallback[key];
  };

  // PROF: gross profitability, ROE, cash-flow profitability, low accruals.
  const prof = pillar(
    [
      inputs.map((c) => div(c.grossProfit, c.totalAssets)),
      inputs.map((c) => finite(c.roe)),
      inputs.map((c) => div(c.operatingCashFlow, c.totalAssets)),
      inputs.map((c) => div(c.operatingCashFlow - c.netIncome, c.totalAssets)),
    ],
    n,
  );

  // GROW: revenue CAGR h0→h3, net-income change scaled by assets, industry growth.
  const grow = pillar(
    [
      inputs.map((c) => {
        const h = c.history;
        const first = h[0];
        const last = h[h.length - 1];
        const years = h.length - 1;
        if (!first || !last || years < 1 || !(first.revenue > 0) || last.revenue < 0) return undefined;
        return finite((last.revenue / first.revenue) ** (1 / years) - 1);
      }),
      inputs.map((c) => {
        const h = c.history;
        const first = h[0];
        const last = h[h.length - 1];
        if (!first || !last || h.length < 2) return undefined;
        return div(last.netIncome - first.netIncome, c.totalAssets);
      }),
      inputs.map((c) => finite(c.industryGrowthRate)),
    ],
    n,
  );

  // SAFE: low leverage, liquidity (capped), steady EPS growth, Altman-lite.
  const safe = pillar(
    [
      inputs.map((c) => finite(-c.debtToEquity)),
      inputs.map((c) => finite(Math.min(c.currentRatio, 3))),
      inputs.map((c) => {
        const h = c.history;
        if (h.length < 2) return undefined;
        const growth: number[] = [];
        for (let k = 1; k < h.length; k++) {
          const prev = h[k - 1]!.eps;
          growth.push((h[k]!.eps - prev) / Math.max(Math.abs(prev), 1));
        }
        return finite(-sampleSd(growth));
      }),
      inputs.map((c) =>
        sum(
          div(3.3 * c.operatingIncome, c.totalAssets),
          // No liabilities is the safest case: mktCap/TL → +∞ (ranks best), not missing (worst).
          c.totalLiabilities === 0 && c.marketCap > 0 ? Infinity : div(0.6 * c.marketCap, c.totalLiabilities),
          div(1.0 * c.revenue, c.totalAssets),
        ),
      ),
    ],
    n,
  );

  // VAL (sector-relative): cheaper than the sector reference ranks higher.
  const val = pillar(
    [
      inputs.map((c) => logRelative(refFor(c, 'pe'), c.peRatio)),
      inputs.map((c) => logRelative(refFor(c, 'evEbitda'), c.evToEbitda)),
      inputs.map((c) => logRelative(refFor(c, 'ps'), c.psRatio)),
    ],
    n,
  );

  // Same ordering as rz(PROF+GROW+SAFE) and rz(0.70·Q + 0.30·VAL), in exact integer units.
  const [profU, growU, safeU, valU] = [prof, grow, safe, val].map((z) => rankUnits(z, n)) as [
    number[],
    number[],
    number[],
    number[],
  ];
  const Q = rankZ(inputs.map((_, i) => profU[i]! + growU[i]! + safeU[i]!));
  const QU = rankUnits(Q, n);
  const s = rankZ(inputs.map((_, i) => 7 * QU[i]! + 3 * valU[i]!));

  return inputs.map((c, i) => {
    const rankAsc0 = rank0(s, i);
    const q = -1 + (2 * (rankAsc0 + 0.5)) / n;
    return {
      id: c.id,
      score: s[i]!,
      q,
      grade: gradeFor(n - 1 - rankAsc0, n),
      pillars: { prof: prof[i]!, grow: grow[i]!, safe: safe[i]!, val: val[i]! },
    };
  });
}
