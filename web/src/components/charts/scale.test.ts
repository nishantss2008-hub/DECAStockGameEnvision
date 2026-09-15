import { describe, it, expect } from 'vitest';
import {
  areaPath,
  decimateMinMax,
  extentOf,
  fractionInRange,
  linearFit,
  linePath,
  niceTicks,
  paddedDomain,
  scaleLinear,
} from './scale';

describe('scaleLinear', () => {
  it('maps a value and inverts a pixel', () => {
    const s = scaleLinear([0, 10], [0, 100]);
    expect(s(5)).toBe(50);
    expect(s.invert(25)).toBe(2.5);
  });

  it('supports an inverted range (SVG y grows downward)', () => {
    const s = scaleLinear([80, 90], [200, 0]);
    expect(s(80)).toBe(200);
    expect(s(90)).toBe(0);
    expect(s.invert(100)).toBe(85);
  });

  it('maps a zero-width domain to the middle of the range', () => {
    const s = scaleLinear([5, 5], [0, 100]);
    expect(s(5)).toBe(50);
    expect(s.invert(70)).toBe(5);
  });
});

describe('extentOf', () => {
  it('returns min and max and skips non-finite values', () => {
    expect(extentOf([3, Number.NaN, -2, 8, Number.POSITIVE_INFINITY])).toEqual([-2, 8]);
  });
  it('returns null when nothing is finite', () => {
    expect(extentOf([])).toBeNull();
    expect(extentOf([Number.NaN])).toBeNull();
  });
});

describe('paddedDomain', () => {
  it('pads both ends by a fraction of the span', () => {
    expect(paddedDomain(80, 90, { padFraction: 0.1 })).toEqual([79, 91]);
  });
  it('widens to include reference values such as the session open', () => {
    const [lo, hi] = paddedDomain(82, 84, { padFraction: 0, include: [80] });
    expect(lo).toBe(80);
    expect(hi).toBe(84);
  });
  it('gives a flat series a visible band', () => {
    expect(paddedDomain(100, 100, { padFraction: 0.1 })).toEqual([99, 101]);
    expect(paddedDomain(0, 0)).toEqual([-1, 1]);
  });
});

describe('niceTicks', () => {
  it('picks round steps inside the domain', () => {
    expect(niceTicks(81.9, 84.6, 3)).toEqual([82, 83, 84]);
    expect(niceTicks(0, 100, 3)).toEqual([0, 50, 100]);
  });
  it('avoids floating-point noise around zero', () => {
    expect(niceTicks(-0.2, 0.3, 3)).toEqual([-0.2, 0, 0.2]);
  });
  it('returns the single value for a flat domain', () => {
    expect(niceTicks(7, 7, 3)).toEqual([7]);
  });
});

describe('linePath and areaPath', () => {
  const x = scaleLinear([0, 2], [0, 100]);
  const y = scaleLinear([0, 10], [50, 0]);
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 10 },
    { x: 2, y: 5 },
  ];

  it('draws a polyline with rounded coordinates', () => {
    expect(linePath(pts, x, y)).toBe('M0,50L50,0L100,25');
  });
  it('closes the area down to the given pixel baseline', () => {
    expect(areaPath(pts, x, y, 50)).toBe('M0,50L50,0L100,25L100,50L0,50Z');
  });
  it('returns an empty path for no points', () => {
    expect(linePath([], x, y)).toBe('');
    expect(areaPath([], x, y, 50)).toBe('');
  });
});

describe('decimateMinMax', () => {
  const big = Array.from({ length: 5760 }, (_, i) => ({ x: i, y: Math.sin(i / 50) * 10 + (i === 4000 ? 99 : 0) }));

  it('keeps short series unchanged', () => {
    const short = big.slice(0, 20);
    expect(decimateMinMax(short, 50)).toEqual(short);
  });

  it('shrinks long series while keeping first, last and the extremes', () => {
    const out = decimateMinMax(big, 300);
    expect(out.length).toBeLessThanOrEqual(2 * 300 + 2);
    expect(out[0]).toEqual(big[0]);
    expect(out[out.length - 1]).toEqual(big[big.length - 1]);
    const ys = out.map((p) => p.y);
    expect(Math.max(...ys)).toBe(Math.max(...big.map((p) => p.y)));
    expect(Math.min(...ys)).toBe(Math.min(...big.map((p) => p.y)));
    for (let i = 1; i < out.length; i += 1) expect(out[i]!.x).toBeGreaterThan(out[i - 1]!.x);
  });
});

describe('linearFit', () => {
  it('fits an exact line', () => {
    const fit = linearFit([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(fit!.slope).toBeCloseTo(2, 10);
    expect(fit!.intercept).toBeCloseTo(1, 10);
  });
  it('returns null without two distinct x values', () => {
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearFit([
        { x: 1, y: 1 },
        { x: 1, y: 4 },
      ]),
    ).toBeNull();
  });
});

describe('fractionInRange', () => {
  it('places a value between low and high, clamped', () => {
    expect(fractionInRange(8190, 8460, 8325)).toBeCloseTo(0.5, 10);
    expect(fractionInRange(8190, 8460, 9000)).toBe(1);
    expect(fractionInRange(8190, 8460, 8000)).toBe(0);
  });
  it('centres the marker when low equals high', () => {
    expect(fractionInRange(100, 100, 100)).toBe(0.5);
  });
});
