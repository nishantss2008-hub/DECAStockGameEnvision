import { describe, it, expect } from 'vitest';
import { allocationSegments } from './allocation';

// BRIEF §7 / MOBILE §7.4 sample: account value Ð1,084,219.55.
const items = [
  { id: 'krkn', label: 'KRKN', value: 25_236_000, sector: 'Shipping & Salvage' as const },
  { id: 'pryl', label: 'PRYL', value: 16_992_000, sector: 'Naval Arms' as const },
  { id: 'empty', label: 'NONE', value: 0 },
  { id: 'cash', label: 'Cash', value: 24_834_955, kind: 'cash' as const },
  { id: 'rest', label: 'REST', value: 41_359_000, color: '#123456' },
];

describe('allocationSegments', () => {
  it('keeps order, drops empty slices and computes fractions of the total', () => {
    const segs = allocationSegments(items);
    expect(segs.map((s) => s.id)).toEqual(['krkn', 'pryl', 'cash', 'rest']);
    const total = segs.reduce((sum, s) => sum + s.fraction, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('writes one-decimal percentages', () => {
    const segs = allocationSegments(items);
    expect(segs.map((s) => s.percentText)).toEqual(['23.3%', '15.7%', '22.9%', '38.1%']);
  });

  it('resolves colours: explicit colour, sector crest fill, or the cash fill token', () => {
    const [krkn, pryl, cash, rest] = allocationSegments(items);
    expect(krkn!.color).toBe('#2F6F68');
    expect(pryl!.color).toBe('#7A3328');
    expect(cash!.color).toBe('var(--fill)');
    expect(rest!.color).toBe('#123456');
  });

  it('returns nothing when there is no value', () => {
    expect(allocationSegments([{ id: 'a', label: 'A', value: 0 }])).toEqual([]);
    expect(allocationSegments([])).toEqual([]);
  });
});
