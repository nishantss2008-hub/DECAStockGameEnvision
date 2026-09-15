/**
 * Sheet (MOBILE §5.8): a bottom sheet with detents, grabber, scrim, swipe dismiss, focus trap
 * and keyboard inset, on `@base-ui/react/drawer`.
 *
 * URL-param friendly: sheets live in the URL (`?sheet=term&id=peRatio`, MOBILE §6.5), so the
 * component is always controlled. Derive `open` from the search params and close by navigating
 * in `onOpenChange(false)`. Keep rendering the last content until `onClosed` fires so the exit
 * animation never shows an empty sheet.
 *
 * ```tsx
 * const [params] = useSearchParams();
 * <Sheet open={params.get('sheet') === 'status'} onOpenChange={(o) => !o && closeSheet()} title="Market status" detents="medium" scrim="info">…</Sheet>
 * ```
 *
 * Accessibility: `role="dialog"` + `aria-modal="true"` labelled by the title; focus moves to the
 * title on open and back to the trigger on close; everything outside the sheet is `inert`.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { X } from 'lucide-react';
import {
  LARGE_SNAP,
  defaultSnapPoint,
  fillsLargeDetent,
  isResizable,
  nextSnapPoint,
  sheetLayout,
  snapPointsFor,
  toDismissReason,
  type SheetDetents,
  type SheetDismissReason,
  type SheetSnapPoint,
} from './sheetDetents';
import { useInertOutside, VISUALLY_HIDDEN } from './overlay';
import './Sheet.css';

export type { SheetDetents, SheetDismissReason } from './sheetDetents';

export interface SheetProps {
  open: boolean;
  /** Called with `false` when the student dismisses the sheet (after `dismissible` / `onDismissRequest` allow it). */
  onOpenChange: (open: boolean, reason: SheetDismissReason) => void;
  /** Labels the dialog and receives focus on open. */
  title: ReactNode;
  /** Shown under the title in the `leading` header (e.g. the finance term on an InfoTip). */
  subtitle?: ReactNode;
  /** Announced with the title (`aria-describedby`). */
  description?: ReactNode;
  /**
   * - `centered`: X (or `leading`) · centred Headline title · `trailing` (Trade, Account).
   * - `leading`: Title 2 title + subtitle · `trailing` or X (InfoTip, Crew card, Market status).
   * - `hidden`: no header row; the title stays for screen readers (Welcome).
   */
  headerLayout?: 'centered' | 'leading' | 'hidden';
  /** Replaces the Close button in the leading slot (e.g. a Back button on later ticket steps). */
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Show the 44px Close circle. Hide it while an order is placing. Default true. */
  showClose?: boolean;
  closeLabel?: string;
  detents?: SheetDetents;
  /** `modal` dims 35%/55%; `info` (explanation sheets) dims 20%/35%. */
  scrim?: 'modal' | 'info';
  /** Pinned footer (primary button). Rides above the software keyboard. */
  footer?: ReactNode;
  children: ReactNode;
  /** `false` blocks swipe, Esc, scrim and Close (ticket Placing step). Default true. */
  dismissible?: boolean;
  /**
   * Return `false` to keep the sheet open, e.g. when the ticket is dirty; show the
   * "Discard this order?" action sheet instead.
   */
  onDismissRequest?: (reason: SheetDismissReason) => boolean;
  /** Wrap in Base UI's VirtualKeyboardProvider (sheets with text fields: Choose a company, host Fire news). */
  keyboardAware?: boolean;
  /** Defaults to the title. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Defaults to the element that opened the sheet. */
  finalFocus?: RefObject<HTMLElement | null>;
  /** Fires after the exit animation; unmount URL-derived content here. */
  onClosed?: () => void;
  resizeLabel?: string;
  className?: string;
}

function measureViewport(): number {
  if (typeof window === 'undefined') return 0;
  return window.innerHeight;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  description,
  headerLayout = 'centered',
  leading,
  trailing,
  showClose = true,
  closeLabel = 'Close',
  detents = 'large',
  scrim = 'modal',
  footer,
  children,
  dismissible = true,
  onDismissRequest,
  keyboardAware = false,
  initialFocus,
  finalFocus,
  onClosed,
  resizeLabel = 'Resize sheet',
  className,
}: SheetProps) {
  const snapPoints = snapPointsFor(detents);
  const [activeSnap, setActiveSnap] = useState<SheetSnapPoint | null>(defaultSnapPoint(detents) ?? null);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  const [heights, setHeights] = useState({ contentHeight: 0, viewportHeight: 0, maxHeight: 0 });
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Every opening starts at the default detent.
  useEffect(() => {
    if (open) setActiveSnap(defaultSnapPoint(detents) ?? null);
  }, [open, detents]);

  useLayoutEffect(() => {
    if (!popupEl) return undefined;
    const measure = () =>
      setHeights((prev) => {
        const next = {
          contentHeight: popupEl.offsetHeight,
          viewportHeight: measureViewport(),
          maxHeight: Number.parseFloat(window.getComputedStyle(popupEl).maxHeight) || 0,
        };
        return prev.contentHeight === next.contentHeight && prev.viewportHeight === next.viewportHeight && prev.maxHeight === next.maxHeight
          ? prev
          : next;
      });
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(popupEl);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [popupEl]);

  useInertOutside(open, popupEl);

  const resizable = isResizable(detents, heights);
  // A content-height sheet snapped to "large" stays an inset card until it really reaches the large detent.
  const attachedRef = useRef(false);
  const fillsLarge = fillsLargeDetent({ contentHeight: heights.contentHeight, maxHeight: heights.maxHeight, attached: attachedRef.current });
  const layout = sheetLayout(detents, { activeSnapPoint: activeSnap, resizable, fillsLarge });
  attachedRef.current = layout === 'attached';

  const handleOpenChange = useCallback(
    (next: boolean, details: Drawer.Root.ChangeEventDetails) => {
      if (next) {
        onOpenChange(true, 'other');
        return;
      }
      const reason = toDismissReason(details.reason);
      if (!dismissible || (onDismissRequest && onDismissRequest(reason) === false)) {
        details.cancel();
        return;
      }
      onOpenChange(false, reason);
    },
    [dismissible, onDismissRequest, onOpenChange],
  );

  const titleNode = (
    <Drawer.Title
      ref={titleRef}
      tabIndex={-1}
      className={`ios-sheet__title ios-sheet__title--${headerLayout}`}
      style={headerLayout === 'hidden' ? VISUALLY_HIDDEN : undefined}
    >
      {title}
    </Drawer.Title>
  );

  const closeButton = showClose ? (
    <Drawer.Close className="ios-sheet__close" aria-label={closeLabel}>
      <X size={20} strokeWidth={1.75} aria-hidden="true" />
    </Drawer.Close>
  ) : null;

  let header: ReactNode;
  if (headerLayout === 'hidden') {
    header = titleNode;
  } else if (headerLayout === 'leading') {
    header = (
      <div className="ios-sheet__header ios-sheet__header--leading">
        <div className="ios-sheet__heading">
          {titleNode}
          {subtitle ? <p className="ios-sheet__subtitle">{subtitle}</p> : null}
        </div>
        <div className="ios-sheet__slot ios-sheet__slot--trailing">
          {trailing}
          {closeButton}
        </div>
      </div>
    );
  } else {
    header = (
      <div className="ios-sheet__header ios-sheet__header--centered">
        <div className="ios-sheet__slot ios-sheet__slot--leading">{leading ?? closeButton}</div>
        {titleNode}
        <div className="ios-sheet__slot ios-sheet__slot--trailing">{trailing}</div>
      </div>
    );
  }

  const portal = (
    <Drawer.Portal>
      <Drawer.Backdrop className={`ios-sheet-scrim ios-sheet-scrim--${scrim}`} />
      <Drawer.Viewport className="ios-sheet-viewport">
        <Drawer.Popup
          ref={setPopupEl}
          aria-modal="true"
          initialFocus={initialFocus ?? titleRef}
          finalFocus={finalFocus}
          className={['ios-sheet', className].filter(Boolean).join(' ')}
          data-detents={detents}
          data-layout={layout}
          data-header={headerLayout}
          data-has-footer={footer ? '' : undefined}
        >
          {resizable ? (
            <button
              type="button"
              className="ios-sheet__grabber"
              aria-label={resizeLabel}
              aria-expanded={activeSnap === LARGE_SNAP}
              onClick={() => setActiveSnap(nextSnapPoint(activeSnap))}
            >
              <span className="ios-sheet__grabber-bar" aria-hidden="true" />
            </button>
          ) : null}
          {header}
          {description ? <Drawer.Description className="ios-sheet__description">{description}</Drawer.Description> : null}
          <Drawer.Content className="ios-sheet__body">{children}</Drawer.Content>
          {footer ? <div className="ios-sheet__footer">{footer}</div> : null}
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  );

  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
      swipeDirection="down"
      snapPoints={snapPoints}
      snapPoint={snapPoints ? activeSnap : undefined}
      onSnapPointChange={snapPoints ? (point) => setActiveSnap(typeof point === 'number' ? point : null) : undefined}
      // Scrim tap dismisses medium (inset) sheets only (MOBILE §5.8).
      disablePointerDismissal={!dismissible || layout === 'attached'}
    >
      {keyboardAware ? <Drawer.VirtualKeyboardProvider>{portal}</Drawer.VirtualKeyboardProvider> : portal}
    </Drawer.Root>
  );
}
