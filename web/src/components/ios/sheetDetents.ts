/**
 * Pure detent math for Sheet (MOBILE §5.8).
 *
 * Base UI Drawer snap points are heights: a number ≤ 1 is a fraction of the viewport,
 * clamped to the popup's own height. The popup is its content height, capped by CSS at
 * the large detent (top = safe-area-inset-top + 10px). So:
 * - snap `1` ("large") shows the whole popup: content height, at most the large detent;
 * - snap `0.5` ("medium") shows half the dynamic viewport;
 * - when the content is no taller than medium, Base UI dedupes the two points and the sheet
 *   simply sits at its content height with no grabber.
 */

/**
 * - `medium`: fixed at up to half the viewport (Market status).
 * - `large`: always the large detent (Trade, Account, Welcome, host Fire news).
 * - `medium-large`: opens at medium, grabber and drag reach large.
 * - `fit`: explanation sheets (InfoTip, Crew card): open at the smaller of content height and large;
 *   the grabber appears only when the content is taller than medium.
 */
export type SheetDetents = 'medium' | 'large' | 'medium-large' | 'fit';

export type SheetSnapPoint = number;

export const MEDIUM_FRACTION: SheetSnapPoint = 0.5;
export const LARGE_SNAP: SheetSnapPoint = 1;

/** Snap points closer than this are the same detent (matches Base UI's dedupe). */
const SAME_DETENT_PX = 1;

export function snapPointsFor(detents: SheetDetents): SheetSnapPoint[] | undefined {
  return detents === 'medium-large' || detents === 'fit' ? [MEDIUM_FRACTION, LARGE_SNAP] : undefined;
}

export function defaultSnapPoint(detents: SheetDetents): SheetSnapPoint | undefined {
  if (detents === 'medium-large') return MEDIUM_FRACTION;
  if (detents === 'fit') return LARGE_SNAP;
  return undefined;
}

export function isResizable(
  detents: SheetDetents,
  { contentHeight, viewportHeight }: { contentHeight: number; viewportHeight: number },
): boolean {
  if (detents !== 'medium-large' && detents !== 'fit') return false;
  if (contentHeight <= 0 || viewportHeight <= 0) return false;
  return contentHeight - viewportHeight * MEDIUM_FRACTION > SAME_DETENT_PX;
}

/** Grabber tap: medium → large → medium. */
export function nextSnapPoint(current: SheetSnapPoint | null): SheetSnapPoint {
  return current === LARGE_SNAP ? MEDIUM_FRACTION : LARGE_SNAP;
}

/**
 * `inset`: 8px from the sides and bottom with the 32px medium radius.
 * `attached`: touches the side edges with 24px top corners (large).
 *
 * A sheet snapped to "large" whose content is shorter than the large detent sits at its content
 * height, which iOS (and the canvas kit's `.sheet.is-content`) draws as an inset card; it attaches
 * only when it really reaches the large detent (`fillsLarge`, see `fillsLargeDetent`).
 */
export function sheetLayout(
  detents: SheetDetents,
  {
    activeSnapPoint,
    resizable,
    fillsLarge = true,
  }: { activeSnapPoint: SheetSnapPoint | null; resizable: boolean; fillsLarge?: boolean },
): 'inset' | 'attached' {
  if (detents === 'large') return 'attached';
  if (detents === 'medium') return 'inset';
  if (!resizable) return 'inset';
  return activeSnapPoint === LARGE_SNAP && fillsLarge ? 'attached' : 'inset';
}

/**
 * Attached sheets are 16px wider than inset ones, so their text reflows a little shorter. Once
 * attached, a sheet stays attached until its content is clearly shorter than the large detent;
 * otherwise a sheet right at the threshold would flip between the two layouts on every measure.
 */
export const ATTACHED_HYSTERESIS_PX = 64;

/** True when the popup's content reaches its max height (the large detent). Unmeasured → true. */
export function fillsLargeDetent({
  contentHeight,
  maxHeight,
  attached,
}: {
  contentHeight: number;
  maxHeight: number;
  attached: boolean;
}): boolean {
  if (contentHeight <= 0 || maxHeight <= 0) return true;
  const threshold = attached ? maxHeight - ATTACHED_HYSTERESIS_PX : maxHeight - SAME_DETENT_PX;
  return contentHeight >= threshold;
}

export type SheetDismissReason = 'swipe' | 'escape' | 'scrim' | 'close-button' | 'other';

/** Base UI change reasons → the dismiss gestures MOBILE §5.8 talks about. */
export function toDismissReason(reason: string): SheetDismissReason {
  switch (reason) {
    case 'swipe':
      return 'swipe';
    case 'escape-key':
    case 'close-watcher':
      return 'escape';
    case 'outside-press':
      return 'scrim';
    case 'close-press':
      return 'close-button';
    default:
      return 'other';
  }
}
