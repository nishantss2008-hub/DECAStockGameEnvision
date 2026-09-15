/**
 * Pure gesture math for SwipeActions rows and long-press menus (MOBILE §5.17, §8.3).
 * Long-press timing and slop come from theme/motion `GESTURE`, the one source for §8.3 thresholds.
 */
import { GESTURE } from '../../theme/motion';

/** Width of one trailing action button (Sell, Buy). */
export const ACTION_WIDTH = 76;
/** The finger must travel this far before the row decides between swiping and scrolling. */
export const INTENT_THRESHOLD_PX = 10;
/** Drags steeper than this belong to page scrolling. */
export const MAX_SWIPE_ANGLE_DEG = 30;
export const LONG_PRESS_MS = GESTURE.longPressMs;
/** A long press is cancelled when the finger moves further than this. */
export const LONG_PRESS_SLOP_PX = GESTURE.longPressMoveTolerancePx;

export type SwipeIntent = 'pending' | 'horizontal' | 'vertical';

export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= INTENT_THRESHOLD_PX && ay <= INTENT_THRESHOLD_PX) return 'pending';
  const angle = (Math.atan2(ay, ax) * 180) / Math.PI;
  return ax > INTENT_THRESHOLD_PX && angle < MAX_SWIPE_ANGLE_DEG ? 'horizontal' : 'vertical';
}

/**
 * Row offset while dragging. Negative opens the trailing actions. Clamped to
 * [−actionsWidth, 0]: no full-swipe commit and no leading actions.
 */
export function dragOffset(startOffset: number, dx: number, actionsWidth: number): number {
  return Math.min(0, Math.max(-actionsWidth, startOffset + dx));
}

/** Release past 50% of the actions width snaps open. */
export function settleSwipe(offset: number, actionsWidth: number): 'open' | 'closed' {
  if (actionsWidth <= 0) return 'closed';
  return -offset >= actionsWidth / 2 ? 'open' : 'closed';
}

export function exceedsSlop(dx: number, dy: number, slop: number = LONG_PRESS_SLOP_PX): boolean {
  return Math.hypot(dx, dy) > slop;
}
