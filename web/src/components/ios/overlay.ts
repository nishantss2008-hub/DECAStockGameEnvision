/**
 * Shared helpers for scrim overlays (Sheet, ActionSheet, Alert).
 *
 * MOBILE §4.6 / §5.8 / §10: while a scrim is shown, everything beneath it (page, top bar,
 * tab bar, other sheets) gets `inert`, because VoiceOver on iOS does not reliably honour
 * `aria-modal` alone. Base UI only sets `aria-hidden` on outside elements.
 */
import { useLayoutEffect, type CSSProperties } from 'react';

/** Elements marked with this attribute are never made inert (the polite live region). */
export const INERT_EXEMPT_ATTR = 'data-inert-exempt';

const inertCounts = new WeakMap<Element, number>();

function addInert(el: Element): void {
  const n = inertCounts.get(el) ?? 0;
  if (n === 0) {
    // Remember an inert attribute that was already there so we never remove someone else's.
    if (el.hasAttribute('inert')) {
      inertCounts.set(el, Number.POSITIVE_INFINITY);
      return;
    }
    el.setAttribute('inert', '');
  }
  inertCounts.set(el, n + 1);
}

function removeInert(el: Element): void {
  const n = inertCounts.get(el);
  if (n === undefined || n === Number.POSITIVE_INFINITY) return;
  if (n <= 1) {
    inertCounts.delete(el);
    el.removeAttribute('inert');
  } else {
    inertCounts.set(el, n - 1);
  }
}

/**
 * While `active`, makes every direct child of `<body>` inert except the one that contains
 * `keep` (the overlay's own portal) and elements marked `data-inert-exempt`.
 * Nested overlays stack: each keeps a reference count per element.
 *
 * Runs as a layout effect so `inert` is removed in the same commit that closes the overlay,
 * before Base UI returns focus to the trigger (focus cannot land on an inert element).
 */
export function useInertOutside(active: boolean, keep: Element | null): void {
  useLayoutEffect(() => {
    if (!active || !keep || typeof document === 'undefined') return undefined;
    const marked: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child.contains(keep)) continue;
      if (child.hasAttribute(INERT_EXEMPT_ATTR)) continue;
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') continue;
      addInert(child);
      marked.push(child);
    }
    return () => marked.forEach(removeInert);
  }, [active, keep]);
}

/** Visually hidden but read by screen readers (no dependency on a global `.sr-only` class). */
export const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};
