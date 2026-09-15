import { describe, it, expect } from 'vitest';
import {
  MEDIUM_FRACTION,
  LARGE_SNAP,
  defaultSnapPoint,
  fillsLargeDetent,
  isResizable,
  nextSnapPoint,
  sheetLayout,
  snapPointsFor,
  toDismissReason,
} from './sheetDetents';

describe('sheet detents', () => {
  it('maps detents to Base UI snap points', () => {
    expect(snapPointsFor('medium')).toBeUndefined();
    expect(snapPointsFor('large')).toBeUndefined();
    expect(snapPointsFor('medium-large')).toEqual([MEDIUM_FRACTION, LARGE_SNAP]);
    expect(snapPointsFor('fit')).toEqual([MEDIUM_FRACTION, LARGE_SNAP]);
    expect(MEDIUM_FRACTION).toBe(0.5);
  });

  it('opens medium-large sheets at medium and explanation sheets at their content height (up to large)', () => {
    expect(defaultSnapPoint('medium-large')).toBe(MEDIUM_FRACTION);
    expect(defaultSnapPoint('fit')).toBe(LARGE_SNAP);
    expect(defaultSnapPoint('medium')).toBeUndefined();
    expect(defaultSnapPoint('large')).toBeUndefined();
  });

  it('is resizable (shows the grabber) only when content is taller than the medium detent', () => {
    // iPhone 15: 852 viewport → medium = 426
    expect(isResizable('fit', { contentHeight: 380, viewportHeight: 852 })).toBe(false);
    expect(isResizable('fit', { contentHeight: 428, viewportHeight: 852 })).toBe(true);
    // iPhone SE: 667 viewport → medium = 333.5; a 420px InfoTip needs the grabber
    expect(isResizable('medium-large', { contentHeight: 420, viewportHeight: 667 })).toBe(true);
    // within 1px of medium counts as the same detent (Base UI dedupes snap points ≤1px apart)
    expect(isResizable('medium-large', { contentHeight: 427, viewportHeight: 852 })).toBe(false);
    expect(isResizable('large', { contentHeight: 800, viewportHeight: 852 })).toBe(false);
    expect(isResizable('medium', { contentHeight: 800, viewportHeight: 852 })).toBe(false);
    expect(isResizable('fit', { contentHeight: 0, viewportHeight: 0 })).toBe(false);
  });

  it('grabber tap cycles medium ↔ large', () => {
    expect(nextSnapPoint(MEDIUM_FRACTION)).toBe(LARGE_SNAP);
    expect(nextSnapPoint(LARGE_SNAP)).toBe(MEDIUM_FRACTION);
    expect(nextSnapPoint(null)).toBe(LARGE_SNAP);
  });

  it('insets medium sheets 8px with the medium radius and attaches large sheets to the edges', () => {
    expect(sheetLayout('medium', { activeSnapPoint: null, resizable: false })).toBe('inset');
    expect(sheetLayout('large', { activeSnapPoint: null, resizable: false })).toBe('attached');
    expect(sheetLayout('medium-large', { activeSnapPoint: MEDIUM_FRACTION, resizable: true })).toBe('inset');
    expect(sheetLayout('medium-large', { activeSnapPoint: LARGE_SNAP, resizable: true })).toBe('attached');
    // short explanation sheet (no grabber) stays an inset card
    expect(sheetLayout('fit', { activeSnapPoint: LARGE_SNAP, resizable: false })).toBe('inset');
    expect(sheetLayout('fit', { activeSnapPoint: LARGE_SNAP, resizable: true })).toBe('attached');
    expect(sheetLayout('fit', { activeSnapPoint: MEDIUM_FRACTION, resizable: true })).toBe('inset');
  });

  it('keeps a content-height sheet inset until its content reaches the large detent (kit .sheet.is-content)', () => {
    // 428px InfoTip on an 852px phone: taller than medium (grabber) but far below large → inset card, not attached
    expect(sheetLayout('fit', { activeSnapPoint: LARGE_SNAP, resizable: true, fillsLarge: false })).toBe('inset');
    expect(sheetLayout('medium-large', { activeSnapPoint: LARGE_SNAP, resizable: true, fillsLarge: false })).toBe('inset');
    expect(sheetLayout('fit', { activeSnapPoint: LARGE_SNAP, resizable: true, fillsLarge: true })).toBe('attached');
    // the large-only detent always attaches, whatever its content
    expect(sheetLayout('large', { activeSnapPoint: null, resizable: false, fillsLarge: false })).toBe('attached');
  });

  it('decides whether content fills the large detent, with hysteresis so the width change cannot flip-flop', () => {
    // inset sheet capped at its max height (content scrolls) → fills
    expect(fillsLargeDetent({ contentHeight: 834, maxHeight: 834, attached: false })).toBe(true);
    expect(fillsLargeDetent({ contentHeight: 600, maxHeight: 834, attached: false })).toBe(false);
    // once attached (16px wider, so text reflows shorter) it stays attached unless clearly shorter
    expect(fillsLargeDetent({ contentHeight: 800, maxHeight: 842, attached: true })).toBe(true);
    expect(fillsLargeDetent({ contentHeight: 600, maxHeight: 842, attached: true })).toBe(false);
    // not measured yet: behave like the large detent
    expect(fillsLargeDetent({ contentHeight: 0, maxHeight: 0, attached: false })).toBe(true);
  });

  it('names the Base UI close reasons for dirty-sheet guards', () => {
    expect(toDismissReason('swipe')).toBe('swipe');
    expect(toDismissReason('escape-key')).toBe('escape');
    expect(toDismissReason('close-watcher')).toBe('escape');
    expect(toDismissReason('outside-press')).toBe('scrim');
    expect(toDismissReason('close-press')).toBe('close-button');
    expect(toDismissReason('imperative-action')).toBe('other');
    expect(toDismissReason('focus-out')).toBe('other');
  });
});
