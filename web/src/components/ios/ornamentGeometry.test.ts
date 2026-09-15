import { describe, it, expect } from 'vitest';
import { medallionSpec, ordinal, podiumOrder, podiumStepHeight, ringTicks, roseArms, sealLobes, sealPath, starPoints } from './ornamentGeometry';

const dist = (p: { x: number; y: number }, c = { x: 50, y: 50 }) => Math.hypot(p.x - c.x, p.y - c.y);

describe('starPoints (compass rose)', () => {
  it('alternates outer and inner radii, starting at north', () => {
    const pts = starPoints(50, 50, 40, 10, 8);
    expect(pts).toHaveLength(16);
    expect(pts[0]!.x).toBeCloseTo(50, 10);
    expect(pts[0]!.y).toBeCloseTo(10, 10);
    pts.forEach((p, i) => expect(dist(p)).toBeCloseTo(i % 2 === 0 ? 40 : 10, 10));
  });
});

describe('sealLobes / sealPath (wax seal)', () => {
  it('draws 14 irregular lobes that never leave the radius', () => {
    const { valleys, controls } = sealLobes(50, 50, 48, 14);
    expect(valleys).toHaveLength(14);
    expect(controls).toHaveLength(14);
    valleys.forEach((v) => {
      expect(dist(v)).toBeGreaterThanOrEqual(48 * 0.84);
      expect(dist(v)).toBeLessThanOrEqual(48 * 0.92);
    });
    // The quadratic midpoint is the outermost point of each lobe.
    for (let i = 0; i < 14; i += 1) {
      const a = valleys[i]!;
      const b = valleys[(i + 1) % 14]!;
      const c = controls[i]!;
      const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
      expect(dist(mid)).toBeLessThanOrEqual(48);
      expect(dist(mid)).toBeGreaterThan(48 * 0.93);
    }
  });

  it('is deterministic and closed', () => {
    const d = sealPath(50, 50, 48);
    expect(d).toBe(sealPath(50, 50, 48));
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(14);
  });
});

describe('podiumOrder', () => {
  it('places 2nd, 1st, 3rd from the leading edge while DOM order stays 1-2-3', () => {
    expect([1, 2, 3].map(podiumOrder)).toEqual([2, 1, 3]);
  });
});

describe('medallionSpec', () => {
  it('uses gold, silver and bronze at 96 / 80 / 80 with 64 / 52 / 52 crests (MOBILE §5.22)', () => {
    expect(medallionSpec(1)).toEqual({ metal: 'gold', diameter: 96, crestSize: 64 });
    expect(medallionSpec(2)).toEqual({ metal: 'silver', diameter: 80, crestSize: 52 });
    expect(medallionSpec(3)).toEqual({ metal: 'bronze', diameter: 80, crestSize: 52 });
  });
  it('falls back to a plain hull disc below the podium', () => {
    expect(medallionSpec(4)).toEqual({ metal: 'plain', diameter: 64, crestSize: 44 });
    expect(medallionSpec(0)).toEqual({ metal: 'plain', diameter: 64, crestSize: 44 });
  });
});

describe('podiumStepHeight', () => {
  it('is 96 / 72 / 56 for ranks 1 / 2 / 3', () => {
    expect([1, 2, 3].map(podiumStepHeight)).toEqual([96, 72, 56]);
  });
});

describe('ordinal', () => {
  it('writes English ordinals, including the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '14th', '21st', '22nd', '23rd', '101st', '111th', '112th',
    ]);
  });
});

describe('roseArms (compass rose)', () => {
  it('draws each arm as a light and a dark half that meet at the tip and the centre', () => {
    const arms = roseArms(0, 0, 40, 7, 4, 0);
    expect(arms).toHaveLength(4);
    const north = arms[0]!;
    expect(north.light.startsWith('M0,-40')).toBe(true);
    expect(north.dark.startsWith('M0,-40')).toBe(true);
    expect(north.light.endsWith('L0,0Z')).toBe(true);
    expect(north.dark.endsWith('L0,0Z')).toBe(true);
    expect(north.light).not.toBe(north.dark);
  });
  it('rotates the arms, e.g. 45° for the intercardinal points', () => {
    const [ne] = roseArms(50, 50, 20, 4, 4, 45);
    const tip = /^M([\d.-]+),([\d.-]+)/.exec(ne!.light)!;
    expect(Number(tip[1])).toBeCloseTo(50 + 20 * Math.SQRT1_2, 1);
    expect(Number(tip[2])).toBeCloseTo(50 - 20 * Math.SQRT1_2, 1);
  });
});

describe('ringTicks', () => {
  it('draws one radial tick per step, longer on the cardinal points', () => {
    const d = ringTicks(0, 0, 40, 45, 32);
    expect(d.match(/M/g)).toHaveLength(32);
    expect(d.startsWith('M0,-40L0,-45')).toBe(true);
  });
});
