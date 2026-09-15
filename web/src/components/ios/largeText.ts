/**
 * Large-text detection (MOBILE §3.5): at a root font size of 23px
 * (xxxLarge) or more, two-column rows switch to stacked layouts.
 */
import { useEffect, useState } from 'react';

export const LARGE_TEXT_ROOT_PX = 23;

export function isLargeTextRoot(rootFontSize: number | string): boolean {
  const px = typeof rootFontSize === 'number' ? rootFontSize : Number.parseFloat(rootFontSize);
  return Number.isFinite(px) && px >= LARGE_TEXT_ROOT_PX;
}

function readRoot(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  return isLargeTextRoot(window.getComputedStyle(document.documentElement).fontSize);
}

/**
 * Call once from the app shell. Keeps `html[data-large-text]` in sync with the
 * root size so row CSS can stack (`html[data-large-text] .ios-row…`).
 * Re-checks on resize, orientation change and when the page becomes visible
 * again (iOS applies a changed Text Size when Safari returns to the foreground).
 */
export function useLargeTextAttribute(): boolean {
  const [large, setLarge] = useState(readRoot);
  useEffect(() => {
    const sync = () => {
      const next = readRoot();
      document.documentElement.toggleAttribute('data-large-text', next);
      setLarge(next);
    };
    sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return large;
}

function readAttribute(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-large-text');
}

/**
 * Reads `html[data-large-text]` (kept in sync by `useLargeTextAttribute()` in the shell) and
 * re-renders when it changes. For components whose structure, not only CSS, changes at large
 * text sizes (SegmentedControl → menu button, MOBILE §3.5).
 */
export function useLargeText(): boolean {
  const [large, setLarge] = useState(readAttribute);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    setLarge(readAttribute());
    const observer = new MutationObserver(() => setLarge(readAttribute()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-large-text'] });
    return () => observer.disconnect();
  }, []);
  return large;
}
