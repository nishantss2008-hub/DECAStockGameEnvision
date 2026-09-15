import { describe, it, expect } from 'vitest';
import { lengthLabel, ticksFor, heartbeat, magnitudeLabel } from './adminFormat';
describe('admin format', () => {
  it('labels lengths and ticks', () => { expect(lengthLabel(3_600_000)).toBe('1 hour'); expect(lengthLabel(172_800_000)).toBe('48 hours'); expect(ticksFor(3_600_000)).toEqual({ tickIntervalMs: 5000, totalTicks: 720 }); });
  it('heartbeat tones', () => {
    const g = { phase: 'live', tickIntervalMs: 30_000, lastTickAt: 1_000_000 } as any;
    expect(heartbeat(g, 1_050_000).tone).toBe('ok'); expect(heartbeat(g, 1_150_000).tone).toBe('warn'); expect(heartbeat(g, 1_300_000).tone).toBe('bad');
  });
  it('magnitude label', () => { expect(magnitudeLabel(0.08)).toBe('+8%'); expect(magnitudeLabel(-0.125)).toBe('−13%'); });
});
