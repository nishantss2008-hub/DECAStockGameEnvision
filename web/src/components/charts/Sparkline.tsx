import { useMemo } from 'react';
import { cx } from '../ios/iosCx';
import { decimateMinMax, extentOf, linePath, paddedDomain, scaleLinear } from './scale';
import './Sparkline.css';

export interface SparklineProps {
  values: readonly number[];
  /** Drawing width in px (48 in a StockRow, 96 on the composite card). Ignored when `fill` is set. */
  width?: number;
  height?: number;
  /** `auto` = gain if the last value ≥ reference (or first value), loss otherwise. */
  tone?: 'auto' | 'gain' | 'loss' | 'neutral';
  /** Dashed reference line, e.g. the session open. */
  reference?: number;
  /** Stretch to the container width (crew sheet 329×64). Stroke width stays constant. */
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}

/**
 * Sparkline (MOBILE §5.5 StockRow, §5.13): a decorative trend line. Always `aria-hidden` —
 * the row it sits in states the value and change in words (MOBILE §10).
 */
export function Sparkline({
  values,
  width = 48,
  height = 20,
  tone = 'auto',
  reference,
  fill = false,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  const drawing = useMemo(() => {
    const pts = values.map((y, x) => ({ x, y })).filter((p) => Number.isFinite(p.y));
    const ext = extentOf(pts.map((p) => p.y));
    const pad = strokeWidth;
    if (!ext || pts.length < 2) {
      return { path: `M0,${height / 2}L${width},${height / 2}`, refY: null, trend: 'neutral' as const };
    }
    const [y0, y1] = paddedDomain(ext[0], ext[1], { padFraction: 0, include: reference === undefined ? [] : [reference] });
    const x = scaleLinear([0, pts.length - 1], [0, width]);
    const y = scaleLinear([y0, y1], [height - pad, pad]);
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const up = last.y >= (reference ?? first.y);
    return {
      path: linePath(decimateMinMax(pts, Math.max(2, width)), x, y),
      refY: reference === undefined ? null : y(reference),
      trend: up ? ('up' as const) : ('down' as const),
    };
  }, [values, width, height, reference, strokeWidth]);

  const resolved = tone === 'auto' ? drawing.trend : tone === 'gain' ? 'up' : tone === 'loss' ? 'down' : 'neutral';

  return (
    <svg
      className={cx('sparkline', fill && 'sparkline--fill', className)}
      data-trend={resolved}
      width={fill ? undefined : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fill ? 'none' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {drawing.refY !== null && (
        <line className="sparkline__reference" x1={0} x2={width} y1={drawing.refY} y2={drawing.refY} />
      )}
      <path className="sparkline__line" d={drawing.path} strokeWidth={strokeWidth} />
    </svg>
  );
}
