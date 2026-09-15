import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { isCollapsedEntry } from './navBarCollapse';
import { StatusDot, type StatusTone } from './Pill';
import { cx } from './iosCx';
import './LargeTitleNavBar.css';

const CollapsedContext = createContext(false);
/** True inside a NavBarButtonGroup: the group, not each button, carries the glass. */
const GroupedContext = createContext(false);

export interface LargeTitleNavBarProps {
  /** The screen's one <h1> (large title, under 15 characters). */
  title: string;
  /** Inline title in the collapsed bar; defaults to `title` (e.g. "KRKN" on a company page). */
  inlineTitle?: string;
  /** Collapsed-bar subtitle, e.g. "Open · 37:17:42" (aria-hidden; the status line says it once). */
  subtitle?: ReactNode;
  /** Pushed screens: Back button named "Back to {label}" (label = previous screen title). */
  back?: { label: string; onBack: () => void };
  /** Leading content when there is no Back button. */
  leading?: ReactNode;
  /** Up to two NavBarButtons, or one button plus the crew avatar. */
  trailing?: ReactNode;
  /** Slot under the large title, usually <StatusLine>. */
  statusLine?: ReactNode;
  /** Optional phase banner under the status line. */
  banner?: ReactNode;
  /** Markets: search capsule shown in the bar instead of the inline title while collapsed. */
  pinnedSearch?: ReactNode;
  /** Ref to the <h1> (tabIndex -1) so the shell can move focus to it after navigation. */
  titleRef?: Ref<HTMLHeadingElement>;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Force the expanded (`false`) or collapsed (`true`) look for previews and tests; omit to follow scrolling. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Collapsing top bar (MOBILE §5.2). A fixed 44px bar under the safe area plus a
 * large title in the content. An IntersectionObserver watches a sentinel under
 * the large title; when it scrolls under the bar the bar turns to glass with a
 * hairline edge, bar buttons lose their own glass (no glass on glass) and the
 * inline title fades in.
 */
export function LargeTitleNavBar({
  title,
  inlineTitle,
  subtitle,
  back,
  leading,
  trailing,
  statusLine,
  banner,
  pinnedSearch,
  titleRef,
  onCollapsedChange,
  collapsed: forcedCollapsed,
  className,
}: LargeTitleNavBarProps) {
  const [scrolledCollapsed, setCollapsed] = useState(false);
  const collapsed = forcedCollapsed ?? scrolledCollapsed;
  const barRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onCollapsedChange);
  onChangeRef.current = onCollapsedChange;
  const firstRun = useRef(true);

  useEffect(() => {
    const bar = barRef.current;
    const sentinel = sentinelRef.current;
    if (!bar || !sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    let observer: IntersectionObserver | null = null;
    const connect = () => {
      observer?.disconnect();
      const barHeight = Math.round(bar.getBoundingClientRect().height);
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          setCollapsed(isCollapsedEntry({ isIntersecting: Boolean(entry.isIntersecting), top: entry.boundingClientRect?.top ?? 0 }, barHeight));
        },
        { rootMargin: `-${barHeight}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(sentinel);
    };
    connect();
    // Safe-area and orientation changes alter the bar height, so re-measure.
    window.addEventListener('resize', connect);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', connect);
    };
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onChangeRef.current?.(collapsed);
  }, [collapsed]);

  const showPinnedSearch = Boolean(pinnedSearch) && collapsed;

  return (
    <CollapsedContext.Provider value={collapsed}>
      <div className={cx('ios-navbar', className)} data-collapsed={collapsed || undefined}>
        <div ref={barRef} className={cx('ios-navbar__bar', collapsed && 'glass')}>
          <div className="ios-navbar__row">
            <div className="ios-navbar__leading">
              {back ? <NavBarButton label={`Back to ${back.label}`} icon={ChevronLeft} onClick={back.onBack} /> : leading}
            </div>
            <div className="ios-navbar__center">
              {showPinnedSearch ? (
                <div className="ios-navbar__search">{pinnedSearch}</div>
              ) : (
                <div className="ios-navbar__inline" aria-hidden="true">
                  <span className="ios-navbar__inline-title">{inlineTitle ?? title}</span>
                  {subtitle && <span className="ios-navbar__subtitle">{subtitle}</span>}
                </div>
              )}
            </div>
            <div className="ios-navbar__trailing">{trailing}</div>
          </div>
        </div>
        <div className="ios-navbar__large">
          <h1 ref={titleRef} tabIndex={-1} className="ios-navbar__title">
            {title}
          </h1>
          <div ref={sentinelRef} className="ios-navbar__sentinel" aria-hidden="true" />
          {statusLine && <div className="ios-navbar__status">{statusLine}</div>}
          {banner && <div className="ios-navbar__banner">{banner}</div>}
        </div>
      </div>
    </CollapsedContext.Provider>
  );
}

export interface NavBarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Accessible name, e.g. "More options", "Trade", "Add KRKN to watchlist". */
  label: string;
  icon?: LucideIcon;
  /** avatar: a 32px crest inside the 44px target, no circle behind it. */
  variant?: 'circle' | 'avatar';
}

/**
 * 44×44 bar button: glass circle while the bar is expanded, plain fill circle when collapsed.
 * Inside a NavBarButtonGroup it has no glass of its own (the shared capsule has it).
 */
export const NavBarButton = forwardRef<HTMLButtonElement, NavBarButtonProps>(function NavBarButton(
  { label, icon: Icon, variant = 'circle', type = 'button', className, children, ...rest },
  ref,
) {
  const collapsed = useContext(CollapsedContext);
  const grouped = useContext(GroupedContext);
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      className={cx('ios-navbar-button', `ios-navbar-button--${variant}`, variant === 'circle' && !collapsed && !grouped && 'glass', className)}
    >
      {Icon ? <Icon size={20} strokeWidth={2} aria-hidden="true" /> : children}
    </button>
  );
});

export interface NavBarButtonGroupProps {
  /** Two NavBarButtons, e.g. Star + More on the company page. */
  children: ReactNode;
  className?: string;
}

/**
 * Trailing bar buttons that share one glass capsule while the bar is expanded (Star + More = 88×44,
 * MOBILE §5.2), so a pushed screen uses 2 blur layers plus the tab bar instead of 4 (§2.4). When the
 * bar collapses to glass, the capsule drops its glass and the buttons become plain fill circles.
 */
export function NavBarButtonGroup({ children, className }: NavBarButtonGroupProps) {
  const collapsed = useContext(CollapsedContext);
  return (
    <GroupedContext.Provider value>
      <div className={cx('ios-navbar-capsule', !collapsed && 'glass', className)}>{children}</div>
    </GroupedContext.Provider>
  );
}

export interface StatusLineProps {
  tone: StatusTone;
  /** e.g. "Market open · 37:17:42 left · Session 2 of 8". */
  children: ReactNode;
  /** Opens the Market status sheet; without it the line is plain text. */
  onPress?: () => void;
  className?: string;
}

/** Status line under a large title (MOBILE §5.2, §7.0): 8px dot + Subhead text, one line. */
export function StatusLine({ tone, children, onPress, className }: StatusLineProps) {
  const content = (
    <>
      <StatusDot tone={tone} />
      <span className="ios-statusline__text">{children}</span>
    </>
  );
  if (!onPress) return <p className={cx('ios-statusline', className)}>{content}</p>;
  return (
    <button type="button" className={cx('ios-statusline', 'ios-statusline--button', className)} aria-haspopup="dialog" onClick={onPress}>
      {content}
    </button>
  );
}
