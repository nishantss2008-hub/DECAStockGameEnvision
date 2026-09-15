import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHostAppearance } from './hostAppearance';

describe('useHostAppearance', () => {
  it('forces the dark appearance on the root element while the host area is mounted', () => {
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    const { unmount } = renderHook(() => useHostAppearance());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
