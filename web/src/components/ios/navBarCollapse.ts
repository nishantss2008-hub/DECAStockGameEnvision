/**
 * Pure collapse rule for LargeTitleNavBar (MOBILE §5.2). A sentinel sits just
 * under the large title; the observer's root margin removes the fixed bar
 * (safe area + 44px) from the top. The bar collapses when the sentinel has
 * left the visible area *upwards*, i.e. scrolled under the bar.
 */
export function isCollapsedEntry(entry: { isIntersecting: boolean; top: number }, barHeight: number): boolean {
  return !entry.isIntersecting && entry.top < barHeight;
}
