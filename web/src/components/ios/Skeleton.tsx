/**
 * Skeleton loading (MOBILE §5.19).
 *
 * Same geometry as the loaded view, `--fill-2` shapes with the element's radius, a 1.2s shimmer
 * (static at 60% opacity under reduced motion). Shapes appear after 150ms so fast loads never
 * flash. The container is `aria-busy="true"` with a visually hidden COPY §12 `loading.*` title,
 * e.g. "Loading prices…".
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { VISUALLY_HIDDEN } from './overlay';
import './Skeleton.css';

export const SKELETON_DELAY_MS = 150;

type Radius = 'card' | 'inner' | 'tile' | 'capsule' | 'circle' | 'text' | number;

const RADIUS: Record<Exclude<Radius, number>, string> = {
  card: 'var(--r-card, 24px)',
  inner: 'var(--r-inner, 16px)',
  tile: 'var(--r-tile, 8px)',
  capsule: '999px',
  circle: '50%',
  text: '4px',
};

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: Radius;
  className?: string;
  style?: CSSProperties;
}

/** One placeholder shape. Always decorative. */
export function Skeleton({ width = '100%', height = 16, radius = 'text', className, style }: SkeletonProps) {
  return (
    <span
      className={['ios-skeleton', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{ width, height, borderRadius: typeof radius === 'number' ? radius : RADIUS[radius], ...style }}
    />
  );
}

export interface SkeletonGroupProps {
  /** COPY §12 loading title, read by screen readers ("Loading prices…"). */
  label: string;
  children: ReactNode;
  delayMs?: number;
  className?: string;
}

/** Busy container: announces its label to screen readers and reveals the shapes after 150ms. */
export function SkeletonGroup({ label, children, delayMs = SKELETON_DELAY_MS, className }: SkeletonGroupProps) {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return undefined;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return (
    <div className={['ios-skeleton-group', className].filter(Boolean).join(' ')} aria-busy="true" data-visible={visible ? '' : undefined}>
      <span style={VISUALLY_HIDDEN}>{label}</span>
      {visible ? children : null}
    </div>
  );
}

/** 64px list row: crest circle, two text bars, trailing value bars (StockRow / HoldingRow geometry). */
export function SkeletonRow({ height = 64, crest = 36 }: { height?: number; crest?: number }) {
  return (
    <div className="ios-skeleton-row" style={{ minHeight: height }} aria-hidden="true">
      <Skeleton width={crest} height={crest} radius="circle" />
      <div className="ios-skeleton-row__lines">
        <Skeleton width="40%" height={14} />
        <Skeleton width="60%" height={12} />
      </div>
      <div className="ios-skeleton-row__trail">
        <Skeleton width={72} height={14} />
        <Skeleton width={56} height={20} radius="capsule" />
      </div>
    </div>
  );
}

/** Rows inside an inset card, with hairlines, for lists that are loading. */
export function SkeletonList({ rows = 5, rowHeight = 64 }: { rows?: number; rowHeight?: number }) {
  return (
    <div className="ios-skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} height={rowHeight} />
      ))}
    </div>
  );
}

/** Chart card: summary line, plot and range control (company 220px, portfolio 180px). */
export function SkeletonChart({ plotHeight = 220 }: { plotHeight?: number }) {
  return (
    <div className="ios-skeleton-chart" aria-hidden="true">
      <Skeleton width="70%" height={14} />
      <Skeleton height={plotHeight} radius="inner" />
      <Skeleton height={32} radius="capsule" />
    </div>
  );
}

/** Large figures (account value, price) as 60%-width bars. */
export function SkeletonHeader() {
  return (
    <div className="ios-skeleton-header" aria-hidden="true">
      <Skeleton width="60%" height={34} radius={8} />
      <Skeleton width="45%" height={16} />
    </div>
  );
}
