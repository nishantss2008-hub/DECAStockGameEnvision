import { useLayoutEffect, useState } from 'react';

/**
 * Tracks an element's content width with ResizeObserver (charts are responsive, MOBILE §5.13).
 * Returns a callback ref, so it keeps working when the measured element mounts late
 * (for example after a loading skeleton). Until a real width is known — first paint, or jsdom —
 * the `fallback` width is used (329px is the inner card width on a 393pt phone).
 */
export function useElementWidth<T extends HTMLElement>(fallback: number): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!node) return undefined;
    setWidth(Math.round(node.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined) setWidth(Math.round(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, width > 0 ? width : fallback];
}
