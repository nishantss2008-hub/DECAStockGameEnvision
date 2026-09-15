import { describe, it, expect } from 'vitest';
import { assemblePricePoints, assembleValuePoints, chunkIndexes, normalizeRange } from './series';

describe('series chunk math', () => {
  it('normalizes the requested tick range', () => {
    expect(normalizeRange(null, 250)).toEqual({ from: 0, to: 250 });
    expect(normalizeRange(-4, 10)).toEqual({ from: 0, to: 10 });
    expect(normalizeRange(12.7, 30.2)).toEqual({ from: 12, to: 30 });
    expect(normalizeRange(50, 10)).toBeNull();
    expect(normalizeRange(0, Number.NaN)).toBeNull();
  });
  it('lists the 120-tick chunks covering a range', () => {
    expect(chunkIndexes({ from: 0, to: 0 })).toEqual([0]);
    expect(chunkIndexes({ from: 119, to: 120 })).toEqual([0, 1]);
    expect(chunkIndexes({ from: 250, to: 600 })).toEqual([2, 3, 4, 5]);
  });
  it('assembles in-range price points from chunks in any order, skipping missing chunks', () => {
    const chunks = [
      { chunk: 1, startTick: 120, prices: [300, 310], volumes: [5, 6] },
      null,
      { chunk: 0, startTick: 0, prices: [100, 110, 120], volumes: [1, 2, 3] },
    ];
    expect(assemblePricePoints(chunks, { from: 1, to: 120 })).toEqual([
      { tick: 1, price: 110, volume: 2 },
      { tick: 2, price: 120, volume: 3 },
      { tick: 120, price: 300, volume: 5 },
    ]);
  });
  it('assembles value points and tolerates short volume arrays', () => {
    expect(assembleValuePoints([{ chunk: 0, startTick: 0, values: [1, 2, 3] }], { from: 2, to: 9 })).toEqual([{ tick: 2, value: 3 }]);
    expect(assemblePricePoints([{ chunk: 0, startTick: 0, prices: [7, 8], volumes: [] }], { from: 0, to: 5 })).toEqual([
      { tick: 0, price: 7, volume: 0 },
      { tick: 1, price: 8, volume: 0 },
    ]);
  });
});
