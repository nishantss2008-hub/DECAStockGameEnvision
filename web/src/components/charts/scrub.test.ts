import { describe, it, expect } from 'vitest';
import {
  chartSummary,
  clampLabelLeft,
  moneyFormatters,
  nearestIndex,
  resolveScrubIntent,
  scrubValueText,
  seriesStats,
  stepIndex,
} from './scrub';

describe('nearestIndex', () => {
  const pts = [0, 10, 20, 30].map((x) => ({ x, y: x }));

  it('finds the point closest to an x value', () => {
    expect(nearestIndex(pts, 14)).toBe(1);
    expect(nearestIndex(pts, 16)).toBe(2);
    expect(nearestIndex(pts, 30)).toBe(3);
  });
  it('gives ties to the earlier point', () => {
    expect(nearestIndex(pts, 15)).toBe(1);
  });
  it('clamps outside the data and handles empty series', () => {
    expect(nearestIndex(pts, -5)).toBe(0);
    expect(nearestIndex(pts, 99)).toBe(3);
    expect(nearestIndex([], 3)).toBe(-1);
  });
});

describe('resolveScrubIntent', () => {
  it('waits until the finger moves more than 6px', () => {
    expect(resolveScrubIntent(3, 2)).toBe('pending');
    expect(resolveScrubIntent(6, 0)).toBe('pending');
  });
  it('scrubs on a mostly horizontal drag', () => {
    expect(resolveScrubIntent(7, 2)).toBe('scrub');
    expect(resolveScrubIntent(-9, 3)).toBe('scrub');
  });
  it('leaves vertical and diagonal drags to page scrolling', () => {
    expect(resolveScrubIntent(2, 7)).toBe('scroll');
    expect(resolveScrubIntent(7, 7)).toBe('scroll');
  });
});

describe('stepIndex', () => {
  it('steps one point with the arrow keys and clamps', () => {
    expect(stepIndex('ArrowRight', 3, 10)).toBe(4);
    expect(stepIndex('ArrowUp', 3, 10)).toBe(4);
    expect(stepIndex('ArrowLeft', 3, 10)).toBe(2);
    expect(stepIndex('ArrowDown', 0, 10)).toBe(0);
    expect(stepIndex('ArrowRight', 9, 10)).toBe(9);
  });
  it('jumps with Home, End, PageUp and PageDown', () => {
    expect(stepIndex('Home', 5, 10)).toBe(0);
    expect(stepIndex('End', 5, 10)).toBe(9);
    expect(stepIndex('PageUp', 0, 100)).toBe(10);
    expect(stepIndex('PageDown', 5, 100)).toBe(0);
  });
  it('ignores other keys and empty series', () => {
    expect(stepIndex('Enter', 3, 10)).toBeNull();
    expect(stepIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('clampLabelLeft', () => {
  it('centres the label on the scrub line but keeps it inside the plot', () => {
    expect(clampLabelLeft(150, 60, 300)).toBe(120);
    expect(clampLabelLeft(5, 60, 300)).toBe(0);
    expect(clampLabelLeft(295, 60, 300)).toBe(240);
  });
  it('pins a label wider than the plot to the leading edge', () => {
    expect(clampLabelLeft(50, 400, 300)).toBe(0);
  });
});

describe('formatters and value text', () => {
  const money = moneyFormatters({ symbol: 'Ð', name: 'Doubloons' });

  it('formats cents for the eye and for VoiceOver', () => {
    expect(money.formatY(8406)).toBe('Ð84.06');
    expect(money.spokenY(8406)).toBe('84.06 doubloons');
    expect(money.formatY(100_000_000)).toBe('Ð1,000,000.00');
  });

  it('builds the slider value text from the x and y hooks', () => {
    const fmt = { ...money, formatX: (tick: number) => (tick === 1282 ? '14:01:30' : `t${tick}`) };
    expect(scrubValueText({ x: 1282, y: 8406 }, fmt)).toBe('14:01:30, 84.06 doubloons');
  });

  it('prefers a spoken x hook when given', () => {
    const fmt = { ...money, formatX: () => '14:01', spokenX: () => '2:01 PM' };
    expect(scrubValueText({ x: 1, y: 100 }, fmt)).toBe('2:01 PM, 1.00 doubloons');
  });
});

describe('seriesStats', () => {
  const pts = [8222, 8190, 8460, 8412].map((y, x) => ({ x, y }));

  it('measures change against the reference when given', () => {
    const s = seriesStats(pts, 8222)!;
    expect(s).toMatchObject({ first: 8222, last: 8412, min: 8190, max: 8460, change: 190, direction: 'up' });
    expect(s.changeFraction).toBeCloseTo(190 / 8222, 12);
  });

  it('falls back to the first point and reports flat moves', () => {
    const flat = seriesStats([{ x: 0, y: 5 }, { x: 1, y: 5 }])!;
    expect(flat.direction).toBe('flat');
    expect(seriesStats([])).toBeNull();
  });

  it('treats a change that rounds to 0.00% as flat', () => {
    expect(seriesStats([{ x: 0, y: 1_000_000 }, { x: 1, y: 1_000_000.4 }])!.direction).toBe('flat');
  });
});

describe('chartSummary', () => {
  const money = moneyFormatters({ symbol: 'Ð', name: 'Doubloons' });

  it('writes the portfolio total sentence', () => {
    const stats = seriesStats([{ x: 0, y: 100_000_000 }, { x: 1, y: 108_421_955 }], 100_000_000)!;
    expect(chartSummary('total', stats, money)).toEqual({
      text: 'Up 8.42% since the game began',
      spoken: 'Up 8.42 percent since the game began',
    });
  });

  it('writes the company session sentence with the range', () => {
    const stats = seriesStats([8222, 8190, 8460, 8412].map((y, x) => ({ x, y })), 8222)!;
    expect(chartSummary('session', stats, money)).toEqual({
      text: 'Up 2.31% this session. Range Ð81.90 to Ð84.60.',
      spoken: 'Up 2.31 percent this session. Range 81.90 doubloons to 84.60 doubloons.',
    });
  });

  it('says Down for losses and Unchanged for flat series', () => {
    const down = seriesStats([{ x: 0, y: 3218 }, { x: 1, y: 3107 }])!;
    expect(chartSummary('total', down, money).text).toBe('Down 3.45% since the game began');
    const flat = seriesStats([{ x: 0, y: 500 }, { x: 1, y: 500 }])!;
    expect(chartSummary('session', flat, money).text).toBe('Unchanged this session. Range Ð5.00 to Ð5.00.');
  });
});
