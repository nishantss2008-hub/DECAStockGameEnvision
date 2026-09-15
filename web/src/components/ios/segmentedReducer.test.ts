import { describe, it, expect } from 'vitest';
import { segmentedReducer, keyToSegmentedAction, type SegmentedState, segmentedMenuButtonText, segmentedPresentation } from './segmentedReducer';

const s = (selected: number, disabled: boolean[]): SegmentedState => ({ selected, disabled });

describe('segmentedReducer', () => {
  it('moves to the next and previous segment', () => {
    expect(segmentedReducer(s(0, [false, false, false]), { type: 'next' }).selected).toBe(1);
    expect(segmentedReducer(s(2, [false, false, false]), { type: 'prev' }).selected).toBe(1);
  });

  it('wraps around at both ends', () => {
    expect(segmentedReducer(s(2, [false, false, false]), { type: 'next' }).selected).toBe(0);
    expect(segmentedReducer(s(0, [false, false, false]), { type: 'prev' }).selected).toBe(2);
  });

  it('skips disabled segments in both directions', () => {
    expect(segmentedReducer(s(0, [false, true, false]), { type: 'next' }).selected).toBe(2);
    expect(segmentedReducer(s(2, [false, true, false]), { type: 'prev' }).selected).toBe(0);
    expect(segmentedReducer(s(2, [true, false, false]), { type: 'next' }).selected).toBe(1);
  });

  it('jumps to the first and last enabled segment', () => {
    expect(segmentedReducer(s(1, [true, false, false, true]), { type: 'first' }).selected).toBe(1);
    expect(segmentedReducer(s(1, [true, false, false, true]), { type: 'last' }).selected).toBe(2);
  });

  it('selects an enabled index and ignores disabled or out-of-range ones', () => {
    expect(segmentedReducer(s(0, [false, false, false]), { type: 'select', index: 2 }).selected).toBe(2);
    expect(segmentedReducer(s(0, [false, true, false]), { type: 'select', index: 1 }).selected).toBe(0);
    expect(segmentedReducer(s(0, [false, false]), { type: 'select', index: 5 }).selected).toBe(0);
    expect(segmentedReducer(s(0, [false, false]), { type: 'select', index: -1 }).selected).toBe(0);
  });

  it('stays put when every segment is disabled', () => {
    expect(segmentedReducer(s(0, [true, true]), { type: 'next' }).selected).toBe(0);
    expect(segmentedReducer(s(0, [true, true]), { type: 'first' }).selected).toBe(0);
  });

  it('starts from the first enabled segment when nothing is selected', () => {
    expect(segmentedReducer(s(-1, [true, false, false]), { type: 'next' }).selected).toBe(1);
    expect(segmentedReducer(s(-1, [false, false, true]), { type: 'prev' }).selected).toBe(1);
  });

  it('returns the same state object when nothing changes', () => {
    const state = s(0, [false, true]);
    expect(segmentedReducer(state, { type: 'select', index: 1 })).toBe(state);
  });
});

describe('keyToSegmentedAction', () => {
  it('maps arrow, Home and End keys', () => {
    expect(keyToSegmentedAction('ArrowRight')).toEqual({ type: 'next' });
    expect(keyToSegmentedAction('ArrowDown')).toEqual({ type: 'next' });
    expect(keyToSegmentedAction('ArrowLeft')).toEqual({ type: 'prev' });
    expect(keyToSegmentedAction('ArrowUp')).toEqual({ type: 'prev' });
    expect(keyToSegmentedAction('Home')).toEqual({ type: 'first' });
    expect(keyToSegmentedAction('End')).toEqual({ type: 'last' });
  });

  it('flips left and right in right-to-left layouts', () => {
    expect(keyToSegmentedAction('ArrowRight', 'rtl')).toEqual({ type: 'prev' });
    expect(keyToSegmentedAction('ArrowLeft', 'rtl')).toEqual({ type: 'next' });
    expect(keyToSegmentedAction('ArrowDown', 'rtl')).toEqual({ type: 'next' });
  });

  it('ignores other keys', () => {
    expect(keyToSegmentedAction('Enter')).toBeNull();
    expect(keyToSegmentedAction(' ')).toBeNull();
    expect(keyToSegmentedAction('a')).toBeNull();
  });
});

describe('segmentedPresentation (MOBILE §3.5)', () => {
  it('turns more than 3 segments into a menu button only at large text sizes', () => {
    expect(segmentedPresentation(5, true)).toBe('menu');
    expect(segmentedPresentation(4, true)).toBe('menu');
    expect(segmentedPresentation(3, true)).toBe('segments');
    expect(segmentedPresentation(5, false)).toBe('segments');
    expect(segmentedPresentation(2, false)).toBe('segments');
  });

  it('writes the menu button as "{prefix}: {selected}"', () => {
    expect(segmentedMenuButtonText('View', 'Basics')).toBe('View: Basics');
    expect(segmentedMenuButtonText('Show', 'All')).toBe('Show: All');
  });
});
