/**
 * SwipeActions (MOBILE §5.17, §8.3): trailing Sell / Buy actions revealed by swiping a
 * Positions row, with a long-press and context-menu alternative.
 *
 * - Custom pointer events, `touch-action: pan-y`: a horizontal drag (|dx| > 10px, < 30°) moves
 *   the row; steeper drags scroll the page. Release past 50% of the actions width snaps open.
 *   No full-swipe commit; one open row at a time; tapping elsewhere or scrolling closes it.
 * - Opening an action runs `onSelect` (which opens the Trade sheet, never a trade).
 * - Alternatives (WCAG 2.2 SC 2.5.1 / 2.5.7): long press (500ms, cancelled by >10px movement),
 *   right-click, or the keyboard context-menu key / Shift+F10 on the row link opens a Menu with the
 *   same actions. The swipe buttons are hidden from screen readers; the row link leads to the
 *   company page, which has Buy and Sell buttons.
 * - Reduced motion: the row follows the finger and snaps instantly on release (§8.2).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { LucideProps } from 'lucide-react';
import { Menu } from './Menu';
import type { MenuGroupSpec } from './menuSpec';
import {
  ACTION_WIDTH,
  LONG_PRESS_MS,
  dragOffset,
  exceedsSlop,
  settleSwipe,
  swipeIntent,
  type SwipeIntent,
} from './swipeGesture';
import './SwipeActions.css';

export interface SwipeAction {
  id: string;
  label: string;
  icon: ComponentType<LucideProps>;
  tone: 'buy' | 'sell';
  onSelect: () => void;
}

export interface SwipeActionsProps {
  /** Trailing actions, left to right (MOBILE: Sell, Buy). */
  actions: SwipeAction[];
  /** The row content, usually one link with a combined accessible label. */
  children: ReactNode;
  /** Names the long-press menu, e.g. "Actions for KRKN". */
  menuLabel: string;
  /** Long-press menu; defaults to the swipe actions (add "View company" here). */
  menuGroups?: MenuGroupSpec[];
  disabled?: boolean;
  className?: string;
}

// One open row at a time across the app.
let closeOpenRow: (() => void) | null = null;

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  startOffset: number;
  intent: SwipeIntent;
}

export function SwipeActions({ actions, children, menuLabel, menuGroups, disabled = false, className }: SwipeActionsProps) {
  const width = actions.length * ACTION_WIDTH;
  const rowRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const open = offset !== 0 && !dragging;

  const close = useCallback(() => setOffset(0), []);

  const clearLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };

  useEffect(() => clearLongPress, []);

  // Register as the open row; close the previous one.
  useEffect(() => {
    if (!open) return undefined;
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    const onPointerDown = (event: PointerEvent) => {
      if (rowRef.current && event.target instanceof Node && rowRef.current.contains(event.target)) return;
      close();
    };
    const onScroll = () => close();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      if (closeOpenRow === close) closeOpenRow = null;
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open, close]);

  const openMenu = () => {
    clearLongPress();
    gesture.current = null;
    setDragging(false);
    setOffset(0);
    setMenuOpen(true);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A new gesture starts: touch browsers send no click after a swipe, so never carry the flag into a later tap.
    suppressClick.current = false;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startOffset: offset, intent: 'pending' };
    clearLongPress();
    longPress.current = setTimeout(() => {
      if (gesture.current && gesture.current.intent === 'pending') {
        suppressClick.current = true;
        openMenu();
      }
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (exceedsSlop(dx, dy)) clearLongPress();
    if (g.intent === 'pending') {
      g.intent = swipeIntent(dx, dy);
      if (g.intent === 'vertical') {
        gesture.current = null;
        return;
      }
      if (g.intent === 'horizontal') {
        suppressClick.current = true;
        setDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture can fail for synthetic events; dragging still works without it.
        }
      }
    }
    if (g.intent === 'horizontal') setOffset(dragOffset(g.startOffset, dx, width));
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    clearLongPress();
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (g.intent === 'horizontal') {
      setDragging(false);
      setOffset((current) => (settleSwipe(current, width) === 'open' ? -width : 0));
    }
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    // The click a mouse or trackpad fires at the end of a swipe or long press is not a tap: swallow it
    // and keep the row as the gesture left it. A real tap on an open row closes it.
    if (suppressClick.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = false;
      return;
    }
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    openMenu();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && offset !== 0) close();
  };

  const groups: MenuGroupSpec[] = menuGroups ?? [
    { items: actions.map((a) => ({ id: a.id, label: a.label, icon: a.icon, onSelect: a.onSelect })) },
  ];

  return (
    <div
      ref={rowRef}
      className={['ios-swipe', className].filter(Boolean).join(' ')}
      data-open={open ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
    >
      <div className="ios-swipe__actions" aria-hidden="true" style={{ width }} data-visible={offset !== 0 ? '' : undefined}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              tabIndex={-1}
              className="ios-swipe__action"
              data-tone={action.tone}
              onClick={() => {
                close();
                action.onSelect();
              }}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="ios-swipe__label">{action.label}</span>
            </button>
          );
        })}
      </div>
      <div
        className="ios-swipe__content"
        style={{ transform: offset !== 0 ? `translateX(${offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={onClickCapture}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        // A mouse or trackpad drag on the row link would start the browser's link drag and cancel the swipe.
        onDragStart={(event) => event.preventDefault()}
      >
        {children}
      </div>
      <Menu open={menuOpen} onOpenChange={setMenuOpen} anchor={rowRef} label={menuLabel} groups={groups} align="end" />
    </div>
  );
}
