/**
 * Chunk-range math at chunk boundaries (HISTORY_CHUNK = 120): a range that starts on the last
 * tick of one chunk and ends on the first tick of another reads exactly one tick from each end
 * chunk and every tick of the chunks between, with no gaps or repeats.
 */
import { describe, it, expect } from 'vitest';
import { HISTORY_CHUNK } from '@deca/shared';
import { assemblePricePoints, assembleValuePoints, chunkIndexes, normalizeRange } from './series';

const chunk = (c: number, length = HISTORY_CHUNK) => ({
  chunk: c,
  startTick: c * HISTORY_CHUNK,
  prices: Array.from({ length }, (_, i) => c * HISTORY_CHUNK + i),
  volumes: Array.from({ length }, (_, i) => i),
});

describe('series at chunk boundaries', () => {
  it('lists exactly the chunks that hold a tick of the range', () => {
    expect(chunkIndexes({ from: 119, to: 240 })).toEqual([0, 1, 2]);
    expect(chunkIndexes({ from: 120, to: 239 })).toEqual([1]);
    expect(chunkIndexes({ from: 239, to: 240 })).toEqual([1, 2]);
    expect(chunkIndexes(normalizeRange(null, 119)!)).toEqual([0]);
    expect(chunkIndexes(normalizeRange(null, 120)!)).toEqual([0, 1]);
  });

  it('reads one tick from each end chunk and every tick between, ascending, without repeats', () => {
    const points = assemblePricePoints([chunk(2, 1), chunk(0), chunk(1)], { from: 119, to: 240 });
    expect(points.map((p) => p.tick)).toEqual(Array.from({ length: 122 }, (_, i) => 119 + i));
    expect(points[0]).toEqual({ tick: 119, price: 119, volume: 119 });
    expect(points[1]).toEqual({ tick: 120, price: 120, volume: 0 });
    expect(points.at(-1)).toEqual({ tick: 240, price: 240, volume: 0 });
  });

  it('keeps the newest partial chunk and ignores ticks it has not written yet', () => {
    const points = assemblePricePoints([chunk(0), chunk(1, 5)], { from: 118, to: 130 });
    expect(points.map((p) => p.tick)).toEqual([118, 119, 120, 121, 122, 123, 124]);
  });

  it('value series follow the same boundaries', () => {
    const values = (c: number) => ({ chunk: c, startTick: c * HISTORY_CHUNK, values: Array.from({ length: HISTORY_CHUNK }, (_, i) => c * 1000 + i) });
    const points = assembleValuePoints([values(1), values(0)], { from: 119, to: 120 });
    expect(points).toEqual([
      { tick: 119, value: 119 },
      { tick: 120, value: 1000 },
    ]);
  });
});
