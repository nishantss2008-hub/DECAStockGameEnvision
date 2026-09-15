/**
 * Pure geometry for the custom ornaments (MOBILE §5.22–§5.23, spec: CompassRose, WaxSeal, Medallion).
 * All shapes are original and deterministic (no randomness).
 */

export interface Pt {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

/**
 * Star polygon for the compass rose: `points` tips at `outer` radius, alternating with
 * notches at `inner` radius, first tip pointing north.
 */
export function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < points * 2; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / points;
    const radius = k % 2 === 0 ? outer : inner;
    out.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return out;
}

export function polygonPath(pts: readonly Pt[]): string {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r2(p.x)},${r2(p.y)}`).join('')}Z`;
}

// Fixed irregularity so the seal looks hand-pressed but renders identically everywhere.
const VALLEY_JITTER = [0.4, -0.7, 0.9, -0.2, 0.6, -0.9, 0.1, 0.8, -0.5, 0.3, -0.8, 0.7, -0.1, 0.5];
const ANGLE_JITTER = [0.3, -0.5, 0.1, 0.7, -0.4, 0.2, -0.8, 0.5, -0.2, 0.6, -0.1, -0.6, 0.4, -0.3];
const PEAK_JITTER = [0.2, 0.9, -0.4, 0.5, -0.9, 0.7, 0.1, -0.6, 0.8, -0.2, 0.4, -0.7, 0.6, 0.0];

const at = (table: readonly number[], i: number) => table[i % table.length] ?? 0;

/**
 * Lobed disc for the wax seal: valley points between lobes and one quadratic control per
 * lobe. Valleys sit at 85–91% of `r`; each lobe's outermost point (the curve midpoint)
 * sits at 95.5–99.5% of `r`, so the outline never leaves the circle.
 */
export function sealLobes(cx: number, cy: number, r: number, lobes = 14): { valleys: Pt[]; controls: Pt[] } {
  const slice = TAU / lobes;
  const valleyAngles: number[] = [];
  const valleyRadii: number[] = [];
  for (let i = 0; i < lobes; i += 1) {
    valleyAngles.push(-Math.PI / 2 + i * slice + at(ANGLE_JITTER, i) * slice * 0.18);
    valleyRadii.push(r * (0.88 + at(VALLEY_JITTER, i) * 0.03));
  }
  const valleys = valleyAngles.map((a, i) => ({
    x: cx + valleyRadii[i]! * Math.cos(a),
    y: cy + valleyRadii[i]! * Math.sin(a),
  }));

  const controls: Pt[] = [];
  for (let i = 0; i < lobes; i += 1) {
    const aA = valleyAngles[i]!;
    let aB = valleyAngles[(i + 1) % lobes]!;
    if (aB <= aA) aB += TAU;
    const bisector = (aA + aB) / 2;
    const peak = r * (0.975 + at(PEAK_JITTER, i) * 0.02);
    const along = 0.25 * (valleyRadii[i]! * Math.cos(aA - bisector) + valleyRadii[(i + 1) % lobes]! * Math.cos(aB - bisector));
    const c = 2 * (peak - along);
    controls.push({ x: cx + c * Math.cos(bisector), y: cy + c * Math.sin(bisector) });
  }
  return { valleys, controls };
}

/** Closed SVG path through `sealLobes`. */
export function sealPath(cx: number, cy: number, r: number, lobes = 14): string {
  const { valleys, controls } = sealLobes(cx, cy, r, lobes);
  const first = valleys[0]!;
  let d = `M${r2(first.x)},${r2(first.y)}`;
  for (let i = 0; i < lobes; i += 1) {
    const c = controls[i]!;
    const next = valleys[(i + 1) % lobes]!;
    d += `Q${r2(c.x)},${r2(c.y)} ${r2(next.x)},${r2(next.y)}`;
  }
  return `${d}Z`;
}

/** Visual podium column for a rank: 2nd on the leading side, 1st centre, 3rd trailing. */
export function podiumOrder(rank: number): number {
  if (rank === 1) return 2;
  if (rank === 2) return 1;
  return 3;
}

export type MedalMetal = 'gold' | 'silver' | 'bronze' | 'plain';

/** Medallion size and metal for a rank (MOBILE §5.22): 96px gold, 80px silver and bronze, else a 64px hull disc. */
export function medallionSpec(rank: number): { metal: MedalMetal; diameter: 96 | 80 | 64; crestSize: 64 | 52 | 44 } {
  if (rank === 1) return { metal: 'gold', diameter: 96, crestSize: 64 };
  if (rank === 2) return { metal: 'silver', diameter: 80, crestSize: 52 };
  if (rank === 3) return { metal: 'bronze', diameter: 80, crestSize: 52 };
  return { metal: 'plain', diameter: 64, crestSize: 44 };
}

/** Podium step height (MOBILE §5.22): 96 / 72 / 56. */
export function podiumStepHeight(rank: number): 96 | 72 | 56 {
  if (rank === 1) return 96;
  if (rank === 2) return 72;
  return 56;
}

/** 1 → "1st", 12 → "12th", 23 → "23rd". */
export function ordinal(n: number): string {
  const whole = Math.trunc(n);
  const mod100 = Math.abs(whole) % 100;
  const mod10 = Math.abs(whole) % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${whole}${suffix}`;
}

/** Rotates an arm-local point (north = −y) clockwise by `deg` around (cx, cy). */
function rotateLocal(cx: number, cy: number, x: number, y: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
}

/**
 * Compass-rose arms: `count` kite-shaped points of `length`, the first at `rotationDeg`
 * clockwise from north. Each arm is two triangles (tip → shoulder → centre) so one half can be
 * lit and the other shaded, like an engraved rose.
 */
export function roseArms(
  cx: number,
  cy: number,
  length: number,
  halfWidth: number,
  count: number,
  rotationDeg: number,
): Array<{ light: string; dark: string }> {
  const arms: Array<{ light: string; dark: string }> = [];
  for (let k = 0; k < count; k += 1) {
    const deg = rotationDeg + (k * 360) / count;
    const tip = rotateLocal(cx, cy, 0, -length, deg);
    const right = rotateLocal(cx, cy, halfWidth, -halfWidth, deg);
    const left = rotateLocal(cx, cy, -halfWidth, -halfWidth, deg);
    const centre = { x: cx, y: cy };
    arms.push({ light: polygonPath([tip, right, centre]), dark: polygonPath([tip, left, centre]) });
  }
  return arms;
}

/** Radial tick marks between radii `inner` and `outer`; the four cardinal ticks are full length, the rest half. */
export function ringTicks(cx: number, cy: number, inner: number, outer: number, count: number): string {
  const quarter = count % 4 === 0 ? count / 4 : 0;
  let d = '';
  for (let k = 0; k < count; k += 1) {
    const deg = (k * 360) / count;
    const cardinal = quarter > 0 && k % quarter === 0;
    const end = cardinal ? outer : inner + (outer - inner) / 2;
    const a = rotateLocal(cx, cy, 0, -inner, deg);
    const b = rotateLocal(cx, cy, 0, -end, deg);
    d += `M${r2(a.x)},${r2(a.y)}L${r2(b.x)},${r2(b.y)}`;
  }
  return d;
}
