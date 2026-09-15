import { GESTURE } from '../../theme/motion';
import { describe, it, expect } from 'vitest';
import {
  ACTION_WIDTH,
  INTENT_THRESHOLD_PX,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  dragOffset,
  exceedsSlop,
  settleSwipe,
  swipeIntent,
} from './swipeGesture';

describe('swipe intent', () => {
  it('waits until the finger moves more than 10px', () => {
    expect(INTENT_THRESHOLD_PX).toBe(10);
    expect(swipeIntent(0, 0)).toBe('pending');
    expect(swipeIntent(-10, 0)).toBe('pending');
    expect(swipeIntent(-7, 7)).toBe('pending');
  });

  it('claims horizontal drags under 30 degrees', () => {
    expect(swipeIntent(-11, 0)).toBe('horizontal');
    expect(swipeIntent(-40, 20)).toBe('horizontal'); // 26.6°
    expect(swipeIntent(30, -10)).toBe('horizontal');
  });

  it('leaves steeper drags to page scrolling', () => {
    expect(swipeIntent(-20, 12)).toBe('vertical'); // 31°
    expect(swipeIntent(0, 11)).toBe('vertical');
    expect(swipeIntent(-5, -40)).toBe('vertical');
  });
});

describe('drag offset and release', () => {
  const width = 2 * ACTION_WIDTH; // Sell + Buy = 152px
  it('uses 76px per action', () => expect(ACTION_WIDTH).toBe(76));

  it('follows the finger between closed and fully open', () => {
    expect(dragOffset(0, -50, width)).toBe(-50);
    expect(dragOffset(-width, 30, width)).toBe(-width + 30);
  });

  it('never opens past the actions (no full-swipe commit) or drags the row the other way', () => {
    expect(dragOffset(0, -400, width)).toBe(-width);
    expect(dragOffset(0, 40, width)).toBe(0);
    expect(dragOffset(-width, 400, width)).toBe(0);
  });

  it('snaps open past half the action width, otherwise closes', () => {
    expect(settleSwipe(-76, width)).toBe('open');
    expect(settleSwipe(-75, width)).toBe('closed');
    expect(settleSwipe(0, width)).toBe('closed');
    expect(settleSwipe(-width, width)).toBe('open');
    expect(settleSwipe(-10, 0)).toBe('closed');
  });
});

describe('long press', () => {
  it('fires after 500ms and cancels when the finger moves more than 10px', () => {
    expect(LONG_PRESS_MS).toBe(500);
    expect(LONG_PRESS_SLOP_PX).toBe(10);
    expect(LONG_PRESS_MS).toBe(GESTURE.longPressMs);
    expect(LONG_PRESS_SLOP_PX).toBe(GESTURE.longPressMoveTolerancePx);
    expect(exceedsSlop(6, 8)).toBe(false); // exactly 10px
    expect(exceedsSlop(8, 8)).toBe(true);
    expect(exceedsSlop(0, -11)).toBe(true);
  });
});
