import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { changeParts, type ChangeDirection } from './changeText';
import { badgeText } from './tabBarMatch';
import { cx } from './iosCx';
import './iosShared.css';
import './Pill.css';

/** 8px (beside 11–15px text) or 10px (beside 17px+) gain/loss triangle, never announced (MOBILE §3.4). */
export function ChangeTriangle({ direction, size = 8 }: { direction: Exclude<ChangeDirection, 'flat'>; size?: 8 | 10 }) {
  return (
    <svg
      className="ios-triangle"
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direction === 'up' ? 'M4 1 7.6 7H.4Z' : 'M4 7 .4 1h7.2Z'} fill="currentColor" />
    </svg>
  );
}

export interface ChangePillProps {
  /** Signed change as a fraction (0.0231 = +2.31%). Sets direction and default text. */
  value: number;
  digits?: number;
  /** Visible text override (e.g. a money change); direction still follows `value`. */
  text?: string;
  /** Spoken override matching `text`, e.g. "up 1.90 doubloons". */
  spoken?: string;
  className?: string;
}

/** ChangePill (MOBILE §5.20): sign + triangle + colour on a tinted capsule. */
export function ChangePill({ value, digits = 2, text, spoken, className }: ChangePillProps) {
  const parts = changeParts(value, digits);
  return (
    <span className={cx('ios-pill ios-pill--change ios-num', className)} data-direction={parts.direction}>
      <span className="ios-pill__visual" aria-hidden="true">
        {parts.direction !== 'flat' && <ChangeTriangle direction={parts.direction} />}
        <span>{text ?? parts.text}</span>
      </span>
      <span className="ios-sr-only">{spoken ?? parts.spoken}</span>
    </span>
  );
}

/** TagPill (MOBILE §5.20): gray label, e.g. "You own this" or a news type. Never on a tint-soft row. */
export function TagPill({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('ios-pill ios-pill--tag', className)}>
      {Icon && <Icon size={12} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** YouPill (MOBILE §5.20): the crew's own row marker in Standings and the crew sheet. */
export function YouPill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('ios-pill ios-pill--you', className)}>{children}</span>;
}

/** CountBadge (MOBILE §5.20): hull capsule, never red. `label` is what screen readers hear. */
export function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  const text = badgeText(count);
  if (text === null) return null;
  return (
    <span className={cx('ios-badge ios-num', className)}>
      <span aria-hidden="true">{text}</span>
      <span className="ios-sr-only">{label}</span>
    </span>
  );
}

export type StatusTone = 'open' | 'paused' | 'idle';

/** StatusDot (MOBILE §5.20): decorative; the status text beside it carries the meaning. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span className={cx('ios-status-dot', className)} data-tone={tone} aria-hidden="true" />;
}
