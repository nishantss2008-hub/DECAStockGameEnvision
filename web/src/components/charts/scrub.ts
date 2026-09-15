/**
 * Pure scrubbing logic and value-formatting hooks for ChartCard (MOBILE §5.13, §8.3, §10).
 */
import { GESTURE } from '../../theme/motion';
import { changeParts } from '../ios/changeText';
import { formatMoneyCents, spokenMoney, type CurrencyNames } from '../ios/signedText';
import type { Point } from './scale';

/** Horizontal travel (px) before a touch drag becomes a scrub (MOBILE §5.13); theme/motion `GESTURE`. */
export const SCRUB_THRESHOLD_PX = GESTURE.scrubThresholdPx;

/**
 * Index of the point nearest to `x` in a series sorted by ascending x (binary search).
 * Ties go to the earlier point. Returns -1 for an empty series.
 */
export function nearestIndex(points: readonly Point[], x: number): number {
  const n = points.length;
  if (n === 0) return -1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.x <= x) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(points[lo]!.x - x);
  const dHi = Math.abs(points[hi]!.x - x);
  return dHi < dLo ? hi : lo;
}

export type ScrubIntent = 'pending' | 'scrub' | 'scroll';

/**
 * Decides what a touch drag means. More than `threshold` px of mostly horizontal travel
 * scrubs; vertical or diagonal travel is left to page scrolling (`touch-action: pan-y`).
 */
export function resolveScrubIntent(dx: number, dy: number, threshold = SCRUB_THRESHOLD_PX): ScrubIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= threshold && ay <= threshold) return 'pending';
  return ax > ay ? 'scrub' : 'scroll';
}

/**
 * Keyboard slider steps: ←/↓ one point back, →/↑ one point forward, Home/End to the ends,
 * PageUp/PageDown by `page` points (default a tenth of the series). Null for other keys.
 */
export function stepIndex(key: string, index: number, length: number, page?: number): number | null {
  if (length <= 0) return null;
  const last = length - 1;
  const jump = page ?? Math.max(1, Math.round(length / 10));
  const clamp = (i: number) => Math.min(last, Math.max(0, i));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(index + 1);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(index - 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'PageUp':
      return clamp(index + jump);
    case 'PageDown':
      return clamp(index - jump);
    default:
      return null;
  }
}

/** Left edge (px) for a floating label centred on `anchor`, kept inside a plot `plotWidth` wide. */
export function clampLabelLeft(anchor: number, labelWidth: number, plotWidth: number): number {
  const maxLeft = plotWidth - labelWidth;
  if (maxLeft <= 0) return 0;
  return Math.min(maxLeft, Math.max(0, anchor - labelWidth / 2));
}

/** Formatting hooks a chart needs. Spoken hooks default to the visible ones. */
export interface ChartFormatters {
  /** x value (usually a tick) → visible label, e.g. "14:01:30". */
  formatX(x: number): string;
  /** y value → visible label, e.g. "Ð84.06". */
  formatY(y: number): string;
  /** x value → words for VoiceOver. */
  spokenX?(x: number): string;
  /** y value → words for VoiceOver, e.g. "84.06 doubloons". */
  spokenY?(y: number): string;
}

/** y hooks for integer-cent series (prices, account value). */
export function moneyFormatters(currency: CurrencyNames): Required<Pick<ChartFormatters, 'formatY' | 'spokenY'>> {
  return {
    formatY: (cents) => formatMoneyCents(cents, currency),
    spokenY: (cents) => spokenMoney(cents, currency),
  };
}

/** Slider `aria-valuetext`: "14:01:30, 84.06 doubloons". */
export function scrubValueText(point: Point, fmt: Pick<ChartFormatters, 'formatX' | 'spokenX' | 'formatY' | 'spokenY'>): string {
  const x = (fmt.spokenX ?? fmt.formatX)(point.x);
  const y = (fmt.spokenY ?? fmt.formatY)(point.y);
  return `${x}, ${y}`;
}

export interface SeriesStats {
  first: number;
  last: number;
  min: number;
  max: number;
  /** last − reference (reference defaults to the first point). */
  change: number;
  /** change ÷ reference, 0 when the reference is 0. */
  changeFraction: number;
  /** Direction at the displayed 2-decimal percent precision. */
  direction: 'up' | 'down' | 'flat';
}

export function seriesStats(points: readonly Point[], reference?: number): SeriesStats | null {
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  }
  const ref = reference ?? firstPoint.y;
  const change = lastPoint.y - ref;
  const changeFraction = ref === 0 ? 0 : change / ref;
  return {
    first: firstPoint.y,
    last: lastPoint.y,
    min,
    max,
    change,
    changeFraction,
    direction: changeParts(changeFraction).direction,
  };
}

export interface ChartSummaryText {
  /** Visible sentence (Subhead, `--label-2`). */
  text: string;
  /** Same sentence for VoiceOver, with the currency spelled out. */
  spoken: string;
}

/**
 * Chart card summary sentences (COPY-TBD `mobile.chartSummaryTotal` / `chartSummarySession`):
 * - total: "Up 8.42% since the game began"
 * - session: "Up 2.31% this session. Range Ð81.90 to Ð84.60."
 * "Down" when negative; "Unchanged" when the change rounds to 0.00%.
 */
export function chartSummary(
  kind: 'total' | 'session',
  stats: SeriesStats,
  fmt: Pick<ChartFormatters, 'formatY' | 'spokenY'>,
): ChartSummaryText {
  const parts = changeParts(stats.changeFraction);
  const pct = parts.text.replace(/^[+−]/, '');
  const spokenPct = `${pct.slice(0, -1)} percent`;
  const lead = parts.direction === 'up' ? 'Up' : parts.direction === 'down' ? 'Down' : 'Unchanged';
  const leadText = lead === 'Unchanged' ? lead : `${lead} ${pct}`;
  const leadSpoken = lead === 'Unchanged' ? lead : `${lead} ${spokenPct}`;

  if (kind === 'total') {
    return { text: `${leadText} since the game began`, spoken: `${leadSpoken} since the game began` };
  }
  const spokenY = fmt.spokenY ?? fmt.formatY;
  return {
    text: `${leadText} this session. Range ${fmt.formatY(stats.min)} to ${fmt.formatY(stats.max)}.`,
    spoken: `${leadSpoken} this session. Range ${spokenY(stats.min)} to ${spokenY(stats.max)}.`,
  };
}
