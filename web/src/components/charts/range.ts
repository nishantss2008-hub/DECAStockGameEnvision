/**
 * Chart range helpers around `rangeTabs()` from @deca/shared (BRIEF §4: tabs derive from game length).
 */
import type { RangeTab } from '@deca/shared';
import type { Point } from './scale';

const UNITS: Record<string, [string, string]> = {
  m: ['minute', 'minutes'],
  h: ['hour', 'hours'],
};

/** "1H" → "1 hour", "15M" → "15 minutes", "All" stays "All" (VoiceOver would say "1 H"). */
export function spokenRangeLabel(tab: RangeTab): string {
  const match = /^(\d+)([mh])$/i.exec(tab.key);
  if (!match) return tab.label;
  const count = Number(match[1]);
  const unit = UNITS[match[2]!.toLowerCase()];
  if (!unit) return tab.label;
  return `${count} ${count === 1 ? unit[0] : unit[1]}`;
}

/**
 * The points inside a range tab: the last `ticks` ticks counted back from the newest point.
 * `null` (the All tab) or a range covering the whole series returns the input unchanged.
 */
export function sliceToRange<T extends Point>(points: readonly T[], ticks: number | null): readonly T[] {
  const last = points[points.length - 1];
  const first = points[0];
  if (ticks === null || !last || !first) return points;
  const fromX = last.x - ticks;
  if (first.x >= fromX) return points;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.x < fromX) lo = mid + 1;
    else hi = mid;
  }
  return points.slice(lo);
}
