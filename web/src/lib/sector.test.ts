import { describe, it, expect } from 'vitest';
import { SECTORS } from '@deca/shared';
import { CREW_CREST_COLOR, SECTOR_COLORS, initials, sectorFromSlug, sectorSlug, tickerMonogram } from './sector';

describe('sector', () => {
  it('has a BRIEF §2 crest fill for every sector', () => {
    for (const s of SECTORS) expect(SECTOR_COLORS[s]).toMatch(/^#[0-9A-F]{6}$/);
    expect(SECTOR_COLORS['Shipping & Salvage']).toBe('#2F6F68');
    expect(SECTOR_COLORS['Cartography & Navigation']).toBe(SECTOR_COLORS['Maps & Instruments']);
    expect(CREW_CREST_COLOR).toBe('#232A26');
  });
  it('initials', () => {
    expect(initials('Kraken Shipping Lines')).toBe('KS');
    expect(initials('Saltwind Traders')).toBe('ST');
    expect(initials('  anne\'s   revenge ')).toBe('AR');
    expect(initials('Tortuga')).toBe('TO');
    expect(initials('')).toBe('');
  });
  it('ticker monogram is the first two letters (MOBILE §5.21)', () => {
    expect(tickerMonogram('KRKN')).toBe('KR');
    expect(tickerMonogram('x')).toBe('X');
  });
  it('round-trips sector slugs for /markets/sector/:sectorId', () => {
    expect(sectorSlug('Letters of Marque (Insurance)')).toBe('letters-of-marque-insurance');
    expect(sectorSlug('Shipping & Salvage')).toBe('shipping-salvage');
    for (const s of SECTORS) expect(sectorFromSlug(sectorSlug(s))).toBe(s);
    expect(sectorFromSlug('nope')).toBeNull();
  });
});
