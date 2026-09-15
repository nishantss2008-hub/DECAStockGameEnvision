/**
 * Collision-aware placement for text drawn on a plot (ScatterChart's "Typical return" label and
 * "Luckiest: …" callouts). Each label has a few candidate boxes in preference order; the chosen
 * box covers the fewest marks and already-placed labels, and stays inside the plot when it can.
 * All coordinates are plot pixels (origin top-left).
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PlacementContext {
  marks: ReadonlyArray<{ x: number; y: number }>;
  /** Marks count as circles of this radius (the diamond and circle marks are 4.5–6px). */
  markRadius: number;
  /** Labels placed before this one; overlapping them costs more than covering a mark. */
  placed?: readonly Box[];
  /** The plot area; a box that leaves it is used only when every other box does too. */
  bounds?: Box;
}

/** Gap between a label and the line or mark it names. */
const LINE_GAP = 2;
const CALLOUT_GAP_X = 8;
const CALLOUT_GAP_Y = 4;
/** Callouts closer than this to the top edge try below the mark first. */
const TOP_EDGE = 24;

function circleHitsBox(cx: number, cy: number, r: number, b: Box): boolean {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.width));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.height));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inside(b: Box, bounds: Box): boolean {
  return b.x >= bounds.x && b.y >= bounds.y && b.x + b.width <= bounds.x + bounds.width && b.y + b.height <= bounds.y + bounds.height;
}

/** Index of the best candidate: fewest covered marks (placed labels count double), inside the plot; ties keep the earlier one. */
export function chooseLabelBox(candidates: readonly Box[], ctx: PlacementContext): number {
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((box, index) => {
    let score = 0;
    for (const m of ctx.marks) if (circleHitsBox(m.x, m.y, ctx.markRadius, box)) score += 1;
    for (const p of ctx.placed ?? []) if (boxesOverlap(box, p)) score += 2;
    if (ctx.bounds && !inside(box, ctx.bounds)) score += 100;
    if (score < bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Trend label: right-aligned above, then below, the line's end; then left-aligned above and below its start. */
export function trendLabelCandidates(line: { x1: number; y1: number; x2: number; y2: number }, size: Size): Box[] {
  const { width, height } = size;
  return [
    { x: line.x2 - width, y: line.y2 - height - LINE_GAP, width, height },
    { x: line.x2 - width, y: line.y2 + LINE_GAP, width, height },
    { x: line.x1, y: line.y1 - height - LINE_GAP, width, height },
    { x: line.x1, y: line.y1 + LINE_GAP, width, height },
  ];
}

/**
 * Callout beside a mark: on the side facing the plot centre (so it stays inside), above then below;
 * then the other side. Marks near the top edge try below first.
 */
export function calloutCandidates(point: { x: number; y: number }, size: Size, plotWidth: number): Box[] {
  const { width, height } = size;
  const startX = point.x - CALLOUT_GAP_X - width;
  const endX = point.x + CALLOUT_GAP_X;
  const aboveY = point.y - height - CALLOUT_GAP_Y;
  const belowY = point.y + CALLOUT_GAP_Y;
  const sides = point.x > plotWidth / 2 ? [startX, endX] : [endX, startX];
  const rows = point.y < TOP_EDGE ? [belowY, aboveY] : [aboveY, belowY];
  return sides.flatMap((x) => rows.map((y) => ({ x, y, width, height })));
}
