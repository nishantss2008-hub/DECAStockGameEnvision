/**
 * Pure helpers for Crest (MOBILE §5.21, BRIEF §2 crest roundel fills).
 * Crest text #F8F6F0 passes 5.41–9.51:1 on every fill below (MOBILE §2.2).
 */
import type { Sector } from '@deca/shared';
import { CREW_CREST_COLOR, SECTOR_COLORS } from '../../lib/sector';

export const CREST_CREW_FILL = CREW_CREST_COLOR;

export type CrestSize = 28 | 32 | 36 | 44 | 64;

/** Company = first two letters of the ticker; crew = host-set initials (max 2). */
export function crestLetters(source: { ticker?: string; initials?: string }): string {
  const raw = source.initials?.trim() || source.ticker?.trim() || '';
  return raw.slice(0, 2).toUpperCase();
}

/** Sector fill, or the hull fill for crews (no sector). */
export function crestFill(sector: Sector | undefined): string {
  return (sector && SECTOR_COLORS[sector]) || CREST_CREW_FILL;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Font size = 0.36 × diameter; brass ring = max(1.5px, 0.045 × diameter). */
export function crestMetrics(size: number): { fontSize: number; ring: number } {
  return { fontSize: round2(size * 0.36), ring: round2(Math.max(1.5, size * 0.045)) };
}
