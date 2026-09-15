import { describe, it, expect } from 'vitest';
import { deriveClock, rangeTabs } from '@deca/shared';
import { sliceToRange, spokenRangeLabel } from './range';

describe('spokenRangeLabel', () => {
  it('spells out the short tab labels from rangeTabs', () => {
    const tabs = rangeTabs(deriveClock(48 * 3_600_000));
    expect(tabs.map((t) => t.label)).toEqual(['1H', '6H', '24H', 'All']);
    expect(tabs.map(spokenRangeLabel)).toEqual(['1 hour', '6 hours', '24 hours', 'All']);
  });
  it('handles minute tabs', () => {
    expect(spokenRangeLabel({ key: '5m', label: '5M', ticks: 60 })).toBe('5 minutes');
    expect(spokenRangeLabel({ key: '1m', label: '1M', ticks: 12 })).toBe('1 minute');
  });
});

describe('sliceToRange', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ x: 100 + i, y: i }));

  it('keeps everything for the All tab', () => {
    expect(sliceToRange(pts, null)).toBe(pts);
  });
  it('keeps the last N ticks, measured from the newest point', () => {
    expect(sliceToRange(pts, 3).map((p) => p.x)).toEqual([106, 107, 108, 109]);
  });
  it('returns the input when the range covers it all', () => {
    expect(sliceToRange(pts, 500)).toBe(pts);
    expect(sliceToRange([], 5)).toEqual([]);
  });
});
