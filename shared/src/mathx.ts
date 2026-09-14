/**
 * Small pure math helpers shared by the generator, engine, quality score and UI.
 */

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Standard normal CDF via Abramowitz & Stegun 7.1.26 (erf approximation,
 * |error| < 1.5e-7).
 */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// Acklam's rational approximation coefficients.
const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
] as const;
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
] as const;
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
] as const;
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416] as const;
const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;
/** Keeps the result finite when a caller passes exactly 0 or 1. */
const P_EPS = 1e-15;

/** Inverse standard normal CDF (Acklam). Defined for p in (0,1); p is clamped to [1e-15, 1−1e-15]. */
export function invNormCdf(p: number): number {
  const pp = clamp(p, P_EPS, 1 - P_EPS);
  if (pp < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(pp));
    return (
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
    );
  }
  if (pp <= P_HIGH) {
    const q = pp - 0.5;
    const r = q * q;
    return (
      ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
      (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - pp));
  return -(
    (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
    ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
  );
}

function isMissing(v: number | undefined): v is undefined {
  return v === undefined || Number.isNaN(v);
}

/**
 * 1-based ascending ranks with ties averaged. Missing values (undefined/NaN)
 * rank below every present value and tie among themselves.
 */
function averageRanks(values: Array<number | undefined>): number[] {
  const n = values.length;
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const am = isMissing(a.v);
      const bm = isMissing(b.v);
      if (am || bm) return am === bm ? a.i - b.i : am ? -1 : 1;
      return (a.v as number) - (b.v as number) || a.i - b.i;
    });
  const ranks = new Array<number>(n);
  let k = 0;
  while (k < n) {
    let j = k;
    const vk = order[k]!.v;
    while (j + 1 < n) {
      const vj = order[j + 1]!.v;
      const same = isMissing(vk) ? isMissing(vj) : !isMissing(vj) && vj === vk;
      if (!same) break;
      j++;
    }
    const avg = (k + j) / 2 + 1; // positions k..j → 1-based ranks k+1..j+1
    for (let m = k; m <= j; m++) ranks[order[m]!.i] = avg;
    k = j + 1;
  }
  return ranks;
}

/**
 * AQR rank-z: rz_i = (rank_i − (N+1)/2) / sqrt((N²−1)/12).
 * Mean 0, sd 1 (no ties); ties take the average rank, undefined ranks worst.
 */
export function rankZ(values: Array<number | undefined>): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const mid = (n + 1) / 2;
  const sd = Math.sqrt((n * n - 1) / 12);
  return averageRanks(values).map((r) => (r - mid) / sd);
}

/** Spearman rank correlation (Pearson on tie-averaged ranks). 0 when either side has no variance. */
export function spearman(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ra = averageRanks(a.slice(0, n));
  const rb = averageRanks(b.slice(0, n));
  const mean = (n + 1) / 2;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = ra[i]! - mean;
    const y = rb[i]! - mean;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}
