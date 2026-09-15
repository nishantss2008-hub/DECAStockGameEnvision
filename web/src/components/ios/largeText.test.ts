import { describe, it, expect } from 'vitest';
import { isLargeTextRoot, LARGE_TEXT_ROOT_PX } from './largeText';

describe('isLargeTextRoot', () => {
  it('switches rows to stacked layouts at a 23px root (xxxLarge) and above', () => {
    expect(LARGE_TEXT_ROOT_PX).toBe(23);
    expect(isLargeTextRoot(17)).toBe(false);
    expect(isLargeTextRoot(22.9)).toBe(false);
    expect(isLargeTextRoot(23)).toBe(true);
    expect(isLargeTextRoot(53)).toBe(true);
  });

  it('parses computed font-size strings', () => {
    expect(isLargeTextRoot('17px')).toBe(false);
    expect(isLargeTextRoot('28px')).toBe(true);
    expect(isLargeTextRoot('')).toBe(false);
  });
});
