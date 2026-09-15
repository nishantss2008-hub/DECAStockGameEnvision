/**
 * Pure chart geometry for the custom SVG charts (MOBILE §5.13).
 * No DOM, no React: scales, domains, ticks, paths, decimation and fits.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Scale {
  (value: number): number;
  invert(px: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

/** Linear map from a data domain to a pixel range. A zero-width domain maps to the range midpoint. */
export function scaleLinear(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const map = ((value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))) as Scale;
  map.invert = (px: number) => (r1 === r0 || span === 0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * span);
  Object.defineProperty(map, 'domain', { value: [d0, d1] as const });
  Object.defineProperty(map, 'range', { value: [r0, r1] as const });
  return map;
}

/** Min and max of the finite values, or null when there are none. */
export function extentOf(values: Iterable<number>): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Number.POSITIVE_INFINITY ? null : [min, max];
}

export interface PaddedDomainOptions {
  /** Fraction of the span added above and below (default 0.08). */
  padFraction?: number;
  /** Extra values the domain must contain, e.g. a reference line. */
  include?: readonly number[];
}

/**
 * Y domain that follows the data (HIG Charts) with breathing room. A flat series gets a
 * ±1% band (±1 around zero) so its line sits mid-plot instead of on an edge.
 */
export function paddedDomain(min: number, max: number, opts: PaddedDomainOptions = {}): [number, number] {
  const { padFraction = 0.08, include = [] } = opts;
  let lo = min;
  let hi = max;
  for (const v of include) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi === lo) {
    const band = lo === 0 ? 1 : Math.abs(lo) * 0.01;
    return [lo - band, hi + band];
  }
  const pad = (hi - lo) * padFraction;
  return [lo - pad, hi + pad];
}

/** d3-style "nice" step: 1, 2, 5 or 10 × a power of ten, for about `count` intervals. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = Math.floor(Math.log10(raw));
  const base = 10 ** power;
  const error = raw / base;
  const factor = error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1;
  return factor * base;
}

/** Round tick values inside [min, max], about `count` of them (MOBILE §5.13 uses 3). */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const step = niceStep(hi - lo, count);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const first = Math.ceil(lo / step);
  const last = Math.floor(hi / step);
  const ticks: number[] = [];
  for (let k = first; k <= last; k += 1) {
    const v = Number((k * step).toFixed(decimals));
    ticks.push(Object.is(v, -0) ? 0 : v);
  }
  return ticks;
}

const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

/** SVG polyline path through the points. */
export function linePath(points: readonly Point[], x: Scale, y: Scale): string {
  let d = '';
  points.forEach((p, i) => {
    d += `${i === 0 ? 'M' : 'L'}${r2(x(p.x))},${r2(y(p.y))}`;
  });
  return d;
}

/** Closed area under the line, down to the pixel row `baseY`. */
export function areaPath(points: readonly Point[], x: Scale, y: Scale, baseY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  return `${linePath(points, x, y)}L${r2(x(last.x))},${r2(baseY)}L${r2(x(first.x))},${r2(baseY)}Z`;
}

/**
 * Min/max decimation for drawing long series (a 48-hour game has 5,760 ticks on a
 * 329px plot). Each bucket keeps its lowest and highest point in x order, so peaks,
 * troughs and the range labels stay true. First and last points are always kept.
 */
export function decimateMinMax(points: readonly Point[], buckets: number): Point[] {
  const n = points.length;
  const b = Math.max(1, Math.floor(buckets));
  if (n <= 2 * b + 2) return points.slice();
  const out: Point[] = [points[0]!];
  const inner = n - 2;
  const size = inner / b;
  for (let k = 0; k < b; k += 1) {
    const start = 1 + Math.floor(k * size);
    const end = Math.min(n - 1, 1 + Math.floor((k + 1) * size));
    if (end <= start) continue;
    let minI = start;
    let maxI = start;
    for (let i = start + 1; i < end; i += 1) {
      if (points[i]!.y < points[minI]!.y) minI = i;
      if (points[i]!.y > points[maxI]!.y) maxI = i;
    }
    if (minI === maxI) out.push(points[minI]!);
    else if (minI < maxI) out.push(points[minI]!, points[maxI]!);
    else out.push(points[maxI]!, points[minI]!);
  }
  out.push(points[n - 1]!);
  return out;
}

/** Least-squares line y = slope·x + intercept, or null without two distinct x values. */
export function linearFit(points: readonly Point[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Where `value` sits between `low` and `high`, clamped to 0..1 (0.5 when low equals high). */
export function fractionInRange(low: number, high: number, value: number): number {
  if (high === low) return 0.5;
  const f = (value - low) / (high - low);
  return Math.min(1, Math.max(0, f));
}
