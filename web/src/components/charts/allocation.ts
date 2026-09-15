/**
 * Pure segment math for AllocationBar (MOBILE §5.13, §7.4 "Where your money is").
 */
import type { Sector } from '@deca/shared';
import { crestFill } from '../ios/crestStyle';
import { formatPercentPlain } from '../ios/signedText';

export interface AllocationItem {
  id: string;
  /** Legend text, e.g. "KRKN" or "Cash". */
  label: string;
  /** Value in integer cents. */
  value: number;
  /** Holding colour = its sector crest fill (BRIEF §2). */
  sector?: Sector;
  /** Explicit colour; wins over `sector`. */
  color?: string;
  /** Cash is drawn with the neutral `--fill` token. */
  kind?: 'holding' | 'cash';
}

export interface AllocationSegment extends AllocationItem {
  color: string;
  /** Share of the total, 0..1. */
  fraction: number;
  /** One-decimal percent, e.g. "23.3%". */
  percentText: string;
}

/** Keeps input order, drops empty slices, and resolves each colour. */
export function allocationSegments(items: readonly AllocationItem[]): AllocationSegment[] {
  const kept = items.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const total = kept.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];
  return kept.map((item) => {
    const fraction = item.value / total;
    const color = item.color ?? (item.kind === 'cash' ? 'var(--fill)' : crestFill(item.sector));
    return { ...item, color, fraction, percentText: formatPercentPlain(fraction, 1) };
  });
}
