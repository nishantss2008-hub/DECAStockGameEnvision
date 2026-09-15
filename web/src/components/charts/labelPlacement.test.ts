import { describe, it, expect } from 'vitest';
import { calloutCandidates, chooseLabelBox, trendLabelCandidates, type Box } from './labelPlacement';

const bounds: Box = { x: 0, y: 0, width: 300, height: 280 };

describe('chooseLabelBox', () => {
  it('keeps the first candidate when nothing is in the way', () => {
    const candidates: Box[] = [
      { x: 10, y: 10, width: 80, height: 16 },
      { x: 10, y: 40, width: 80, height: 16 },
    ];
    expect(chooseLabelBox(candidates, { marks: [], markRadius: 6, bounds })).toBe(0);
  });

  it('moves away from marks that the preferred box would cover', () => {
    const candidates: Box[] = [
      { x: 200, y: 20, width: 90, height: 16 },
      { x: 200, y: 60, width: 90, height: 16 },
    ];
    const marks = [{ x: 250, y: 28 }];
    expect(chooseLabelBox(candidates, { marks, markRadius: 6, bounds })).toBe(1);
  });

  it('counts a mark whose radius only grazes the box', () => {
    const candidates: Box[] = [
      { x: 100, y: 100, width: 50, height: 16 },
      { x: 0, y: 200, width: 50, height: 16 },
    ];
    expect(chooseLabelBox(candidates, { marks: [{ x: 155, y: 108 }], markRadius: 6, bounds })).toBe(1);
    expect(chooseLabelBox(candidates, { marks: [{ x: 157, y: 108 }], markRadius: 6, bounds })).toBe(0);
  });

  it('avoids boxes already placed and boxes that leave the plot', () => {
    const placed: Box[] = [{ x: 0, y: 0, width: 120, height: 20 }];
    const candidates: Box[] = [
      { x: 50, y: 5, width: 60, height: 16 },
      { x: 260, y: 5, width: 60, height: 16 },
      { x: 150, y: 5, width: 60, height: 16 },
    ];
    expect(chooseLabelBox(candidates, { marks: [], markRadius: 6, placed, bounds })).toBe(2);
  });

  it('prefers the least crowded box when every candidate hits something', () => {
    const candidates: Box[] = [
      { x: 0, y: 0, width: 100, height: 20 },
      { x: 0, y: 50, width: 100, height: 20 },
    ];
    const marks = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 30, y: 60 },
    ];
    expect(chooseLabelBox(candidates, { marks, markRadius: 4, bounds })).toBe(1);
  });
});

describe('candidate boxes', () => {
  it('offers the trend label above and below both ends of the line, end first', () => {
    const boxes = trendLabelCandidates({ x1: 10, y1: 200, x2: 290, y2: 40 }, { width: 80, height: 16 });
    expect(boxes[0]).toEqual({ x: 210, y: 22, width: 80, height: 16 });
    expect(boxes[1]).toEqual({ x: 210, y: 42, width: 80, height: 16 });
    expect(boxes[2]).toEqual({ x: 10, y: 182, width: 80, height: 16 });
    expect(boxes[3]).toEqual({ x: 10, y: 202, width: 80, height: 16 });
  });

  it('offers callouts on the side facing the plot centre first, above before below', () => {
    const size = { width: 90, height: 16 };
    const right = calloutCandidates({ x: 250, y: 100 }, size, 300);
    expect(right[0]).toEqual({ x: 152, y: 80, width: 90, height: 16 });
    expect(right[1]).toEqual({ x: 152, y: 104, width: 90, height: 16 });
    const left = calloutCandidates({ x: 40, y: 100 }, size, 300);
    expect(left[0]).toEqual({ x: 48, y: 80, width: 90, height: 16 });
    // Near the top edge, below comes first.
    expect(calloutCandidates({ x: 40, y: 10 }, size, 300)[0]).toEqual({ x: 48, y: 14, width: 90, height: 16 });
  });
});
