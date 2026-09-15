import { describe, it, expect } from 'vitest';
import { isCollapsedEntry } from './navBarCollapse';

describe('isCollapsedEntry', () => {
  it('stays expanded while the sentinel is visible below the bar', () => {
    expect(isCollapsedEntry({ isIntersecting: true, top: 180 }, 103)).toBe(false);
  });

  it('collapses once the sentinel has scrolled under the bar', () => {
    expect(isCollapsedEntry({ isIntersecting: false, top: 90 }, 103)).toBe(true);
    expect(isCollapsedEntry({ isIntersecting: false, top: -400 }, 103)).toBe(true);
  });

  it('stays expanded when the sentinel is off screen below (short page, deep link)', () => {
    expect(isCollapsedEntry({ isIntersecting: false, top: 2000 }, 103)).toBe(false);
  });
});
