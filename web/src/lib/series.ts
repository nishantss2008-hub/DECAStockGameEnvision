/** Pure helpers for chunked tick series (`history/{chunk}` docs of HISTORY_CHUNK ticks). */

import { HISTORY_CHUNK, type HistoryChunk, type ValueChunk } from '@deca/shared';

export interface TickRange {
  from: number;
  to: number;
}

/** Clamps and floors a requested range; `from` null means tick 0. Null when empty or invalid. */
export function normalizeRange(fromTick: number | null, toTick: number): TickRange | null {
  if (!Number.isFinite(toTick) || (fromTick !== null && !Number.isFinite(fromTick))) return null;
  const from = Math.max(0, Math.floor(fromTick ?? 0));
  const to = Math.floor(toTick);
  return to >= from ? { from, to } : null;
}

/** Chunk indexes that hold any tick of the range. */
export function chunkIndexes(range: TickRange): number[] {
  const first = Math.floor(range.from / HISTORY_CHUNK);
  const last = Math.floor(range.to / HISTORY_CHUNK);
  const out: number[] = [];
  for (let c = first; c <= last; c++) out.push(c);
  return out;
}

const byStart = <T extends { startTick: number }>(chunks: ReadonlyArray<T | null | undefined>): T[] =>
  chunks.filter((c): c is T => Boolean(c) && Number.isFinite(c!.startTick)).sort((a, b) => a.startTick - b.startTick);

/** Price and volume per tick inside the range, ascending by tick. */
export function assemblePricePoints(
  chunks: ReadonlyArray<HistoryChunk | null | undefined>,
  range: TickRange,
): { tick: number; price: number; volume: number }[] {
  const out: { tick: number; price: number; volume: number }[] = [];
  for (const chunk of byStart(chunks)) {
    const prices = Array.isArray(chunk.prices) ? chunk.prices : [];
    const volumes = Array.isArray(chunk.volumes) ? chunk.volumes : [];
    for (let i = 0; i < prices.length; i++) {
      const tick = chunk.startTick + i;
      if (tick < range.from || tick > range.to) continue;
      out.push({ tick, price: prices[i]!, volume: volumes[i] ?? 0 });
    }
  }
  return out;
}

/** Value per tick inside the range, ascending by tick. */
export function assembleValuePoints(
  chunks: ReadonlyArray<ValueChunk | null | undefined>,
  range: TickRange,
): { tick: number; value: number }[] {
  const out: { tick: number; value: number }[] = [];
  for (const chunk of byStart(chunks)) {
    const values = Array.isArray(chunk.values) ? chunk.values : [];
    for (let i = 0; i < values.length; i++) {
      const tick = chunk.startTick + i;
      if (tick < range.from || tick > range.to) continue;
      out.push({ tick, value: values[i]! });
    }
  }
  return out;
}
