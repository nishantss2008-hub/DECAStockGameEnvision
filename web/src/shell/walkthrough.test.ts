import { describe, expect, it } from 'vitest';
import { INITIAL_WALKTHROUGH, parseWalkthrough, walkthroughKey, walkthroughReducer } from './walkthrough';

describe('walkthroughReducer', () => {
  it('starts new, so the Welcome sheet is pending', () => {
    expect(INITIAL_WALKTHROUGH).toEqual({ status: 'new', step: 0 });
  });

  it('start → step 1; next/back clamp to 3 steps', () => {
    let s = walkthroughReducer(INITIAL_WALKTHROUGH, { type: 'start' });
    expect(s).toEqual({ status: 'active', step: 0 });
    s = walkthroughReducer(s, { type: 'back' });
    expect(s.step).toBe(0);
    s = walkthroughReducer(walkthroughReducer(walkthroughReducer(s, { type: 'next' }), { type: 'next' }), { type: 'next' });
    expect(s.step).toBe(2);
    expect(walkthroughReducer(s, { type: 'back' }).step).toBe(1);
  });

  it('hide (Skip for now, Got it) never shows automatically again; show reopens at step 1', () => {
    const hidden = walkthroughReducer({ status: 'active', step: 2 }, { type: 'hide' });
    expect(hidden).toEqual({ status: 'hidden', step: 2 });
    expect(walkthroughReducer(hidden, { type: 'next' })).toEqual(hidden);
    expect(walkthroughReducer(hidden, { type: 'show' })).toEqual({ status: 'active', step: 0 });
    expect(walkthroughReducer(INITIAL_WALKTHROUGH, { type: 'hide' }).status).toBe('hidden');
  });

  it('restore (Undo) brings back an earlier state', () => {
    expect(walkthroughReducer({ status: 'hidden', step: 1 }, { type: 'restore', state: { status: 'active', step: 1 } })).toEqual({ status: 'active', step: 1 });
  });
});

describe('persistence', () => {
  it('keys by crew', () => {
    expect(walkthroughKey('saltwind-traders')).toBe('bx.walkthrough.saltwind-traders');
  });

  it.each([
    [null, INITIAL_WALKTHROUGH],
    ['not json', INITIAL_WALKTHROUGH],
    ['{"status":"weird","step":1}', INITIAL_WALKTHROUGH],
    ['{"status":"active","step":9}', { status: 'active', step: 2 }],
    ['{"status":"hidden","step":1}', { status: 'hidden', step: 1 }],
    ['"dismissed"', { status: 'hidden', step: 0 }],
  ] as const)('%s', (raw, expected) => {
    expect(parseWalkthrough(raw)).toEqual(expected);
  });
});
