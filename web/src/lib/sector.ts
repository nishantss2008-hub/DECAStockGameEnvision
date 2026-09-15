/** Sector crest colours and monogram helpers (BRIEF §2, MOBILE §5.21). */

import { SECTORS, type Sector } from '@deca/shared';

/** Crest roundel fills by sector (text #F8F6F0 passes ≥5.41:1 on every fill). */
export const SECTOR_COLORS: Record<Sector, string> = {
  'Shipping & Salvage': '#2F6F68',
  'Provisions & Spice': '#7A5A2E',
  'Naval Arms': '#7A3328',
  'Cartography & Navigation': '#4C5B40',
  'Treasure Banking': '#6F5A2E',
  'Cursed Relics': '#3F3F52',
  'Tortuga Hospitality': '#5B4A63',
  'Parrot & Livestock': '#4E6B3A',
  'Maps & Instruments': '#4C5B40',
  'Letters of Marque (Insurance)': '#3E5566',
};

/** Crest fill for crews (hull). */
export const CREW_CREST_COLOR = '#232A26';

/** Crest letter colour on every fill. */
export const CREST_TEXT_COLOR = '#F8F6F0';

/** Two-letter initials: first letters of the first two words, or the first two letters of one word. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Company crest letters: the first two letters of the ticker ('KRKN' → 'KR'). */
export function tickerMonogram(ticker: string): string {
  return ticker.trim().slice(0, 2).toUpperCase();
}

/** URL slug for `/markets/sector/:sectorId`: 'Shipping & Salvage' → 'shipping-salvage'. */
export function sectorSlug(sector: Sector | string): string {
  return sector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Inverse of sectorSlug; null for an unknown slug. */
export function sectorFromSlug(slug: string): Sector | null {
  return SECTORS.find((s) => sectorSlug(s) === slug) ?? null;
}
