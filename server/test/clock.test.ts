import { describe, it, expect } from 'vitest';
import { deriveClock, tickAt, sessionStartTick, sessionNumber, chunkOf, rangeTabs, HOUR_MS } from '@deca/shared';
describe('clock', () => {
  it('derives tick interval, totals and sessions per game length', () => {
    expect(deriveClock(48 * HOUR_MS)).toMatchObject({ tickIntervalMs: 30_000, totalTicks: 5760, sessionTicks: 720, hours: 48 });
    expect(deriveClock(1 * HOUR_MS)).toMatchObject({ tickIntervalMs: 5_000, totalTicks: 720, sessionTicks: 90 });
    expect(deriveClock(2 * HOUR_MS).tickIntervalMs).toBe(10_000);
    expect(deriveClock(12 * HOUR_MS).tickIntervalMs).toBe(30_000);
  });
  it('computes tick from wall clock, clamped', () => {
    const c = deriveClock(HOUR_MS);
    expect(tickAt(1_000 + 12_500, 1_000, c)).toBe(2);
    expect(tickAt(0, 1_000, c)).toBe(0);
    expect(tickAt(1e12, 0, c)).toBe(720);
    expect(tickAt(5, null, c)).toBe(0);
  });
  it('session and chunk helpers', () => {
    expect(sessionStartTick(1284, 720)).toBe(720);
    expect(sessionNumber(1284, 720)).toBe(2);
    expect(sessionNumber(5760, 720)).toBe(8);
    expect(chunkOf(119)).toBe(0); expect(chunkOf(120)).toBe(1);
  });
  it('range tabs scale with game length and always end with All', () => {
    expect(rangeTabs(deriveClock(48 * HOUR_MS)).map((r) => r.label)).toEqual(['1H', '6H', '24H', 'All']);
    expect(rangeTabs(deriveClock(1 * HOUR_MS)).map((r) => r.label)).toEqual(['5M', '15M', 'All']);
    expect(rangeTabs(deriveClock(48 * HOUR_MS))[0]).toEqual({ key: '1h', label: '1H', ticks: 120 });
  });
});
