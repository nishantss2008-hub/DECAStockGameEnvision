import { describe, it, expect } from 'vitest';
import {
  deriveClock,
  tickAt,
  sessionStartTick,
  sessionNumber,
  chunkOf,
  rangeTabs,
  MINUTE_MS,
  DEFAULT_GAME_LENGTH_MS,
  GAME_LENGTH_OPTIONS_MS,
} from '@deca/shared';

describe('clock', () => {
  it('offers 10/15/20/30-minute games and defaults to 30', () => {
    expect(GAME_LENGTH_OPTIONS_MS).toEqual([10, 15, 20, 30].map((m) => m * MINUTE_MS));
    expect(DEFAULT_GAME_LENGTH_MS).toBe(30 * MINUTE_MS);
  });
  it('derives tick interval, totals and sessions per game length', () => {
    // Every option is under the 5s tick floor, so the cadence is 5s throughout.
    expect(deriveClock(30 * MINUTE_MS)).toMatchObject({ tickIntervalMs: 5_000, totalTicks: 360, sessionTicks: 45, hours: 0.5 });
    expect(deriveClock(10 * MINUTE_MS)).toMatchObject({ tickIntervalMs: 5_000, totalTicks: 120, sessionTicks: 15 });
    expect(deriveClock(15 * MINUTE_MS)).toMatchObject({ tickIntervalMs: 5_000, totalTicks: 180, sessionTicks: 23 });
    expect(deriveClock(20 * MINUTE_MS)).toMatchObject({ tickIntervalMs: 5_000, totalTicks: 240, sessionTicks: 30 });
  });
  it('computes tick from wall clock, clamped', () => {
    const c = deriveClock(30 * MINUTE_MS);
    expect(tickAt(1_000 + 12_500, 1_000, c)).toBe(2);
    expect(tickAt(0, 1_000, c)).toBe(0);
    expect(tickAt(1e12, 0, c)).toBe(360);
    expect(tickAt(5, null, c)).toBe(0);
  });
  it('session and chunk helpers', () => {
    expect(sessionStartTick(100, 45)).toBe(90);
    expect(sessionNumber(100, 45)).toBe(3);
    expect(sessionNumber(360, 45)).toBe(8);
    expect(chunkOf(119)).toBe(0); expect(chunkOf(120)).toBe(1);
  });
  it('range tabs scale with game length and always end with All', () => {
    expect(rangeTabs(deriveClock(30 * MINUTE_MS)).map((r) => r.label)).toEqual(['1M', '5M', '15M', 'All']);
    expect(rangeTabs(deriveClock(10 * MINUTE_MS)).map((r) => r.label)).toEqual(['1M', '5M', 'All']);
    expect(rangeTabs(deriveClock(30 * MINUTE_MS))[0]).toEqual({ key: '1m', label: '1M', ticks: 12 });
  });
});
