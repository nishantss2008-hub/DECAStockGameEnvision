import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../ios/iosCx';
import { extentOf, linearFit, niceTicks, paddedDomain, scaleLinear } from './scale';
import { calloutCandidates, chooseLabelBox, trendLabelCandidates, type Box, type Size } from './labelPlacement';
import { useElementWidth } from './useElementWidth';
import '../ios/iosShared.css';
import './ScatterChart.css';

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  /** Ticker, used by callouts. */
  label: string;
  /** Your crew's holdings: filled diamonds. Others: hollow circles (shape, not just colour). */
  highlight?: boolean;
}

export interface ScatterChartProps {
  points: readonly ScatterPoint[];
  /** Visible axis titles, e.g. COPY §10 `scatter.xLabel` / `scatter.yLabel`. */
  xLabel: string;
  yLabel: string;
  /** Fixed x domain, e.g. [0, 100] for the health score. Defaults to the data extent. */
  xDomain?: readonly [number, number];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  /** Dashed "Typical return" line. Fitted by least squares when `fit` is omitted. */
  trend?: { label: string; fit?: { slope: number; intercept: number } | null };
  /** Text beside a point, e.g. "Luckiest: LVTH". */
  callouts?: ReadonlyArray<{ pointId: string; text: string }>;
  /** Legend words, e.g. COPY §10 `scatter.yourHoldings` / `scatter.others`. */
  legend?: { highlighted: string; others: string };
  /** The chart as one sentence for VoiceOver (`role="img"`). */
  summary: string;
  /** Visible caption under the plot (COPY §10 `scatter.caption`). */
  caption?: string;
  /** 280 on the results page (MOBILE §7.13). */
  height?: number;
  /** Extra content under the caption, e.g. a "View as list" link. */
  footer?: ReactNode;
  className?: string;
}

const PAD = 10;
const FALLBACK_PLOT_WIDTH = 290;
/** Marks are 4.5px circles and 6px diamonds; labels keep clear of that radius. */
const MARK_RADIUS = 6;

/** Size before the label has been measured (Caption 1 is about 6.5px per character, 16px leading). */
function estimateSize(text: string): Size {
  return { width: Math.ceil(text.length * 6.5), height: 16 };
}

function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx},${cy - r}L${cx + r},${cy}L${cx},${cy + r}L${cx - r},${cy}Z`;
}

/**
 * ScatterChart (MOBILE §7.13 page 4, spec §10): health score vs. actual return for the market
 * reveal. The plot is one image with a spoken summary; the legend and caption are real text.
 * A list view of the same data must be linked from `footer` for screen-reader users.
 */
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xDomain,
  formatX,
  formatY,
  trend,
  callouts = [],
  legend,
  summary,
  caption,
  height = 280,
  footer,
  className,
}: ScatterChartProps) {
  const [plotRef, width] = useElementWidth<HTMLDivElement>(FALLBACK_PLOT_WIDTH);

  const g = useMemo(() => {
    const xs = extentOf(points.map((p) => p.x)) ?? [0, 1];
    const [x0, x1] = xDomain ?? paddedDomain(xs[0], xs[1], { padFraction: 0.05 });
    const fit = trend ? (trend.fit === undefined ? linearFit(points) : trend.fit) : null;
    const trendYs = fit ? [fit.slope * x0 + fit.intercept, fit.slope * x1 + fit.intercept] : [];
    const ys = extentOf([...points.map((p) => p.y), ...trendYs]) ?? [0, 0];
    const [y0, y1] = paddedDomain(ys[0], ys[1], { include: [0] });
    const x = scaleLinear([x0, x1], [PAD, width - PAD]);
    const y = scaleLinear([y0, y1], [height - PAD, PAD]);
    return {
      x,
      y,
      xTicks: niceTicks(x0, x1, 3),
      yTicks: niceTicks(y0, y1, 4),
      trendLine: fit
        ? { x1: x(x0), y1: y(trendYs[0]!), x2: x(x1), y2: y(trendYs[1]!) }
        : null,
    };
  }, [points, xDomain, trend, width, height]);

  const byId = new Map(points.map((p) => [p.id, p]));

  // Measure the plot labels so placement uses their real size (it changes with Dynamic Type).
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const [labelSizes, setLabelSizes] = useState<Record<string, Size>>({});
  useLayoutEffect(() => {
    let changed = false;
    const next: Record<string, Size> = {};
    labelEls.current.forEach((el, key) => {
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      if (size.width === 0 || size.height === 0) return;
      next[key] = size;
      const prev = labelSizes[key];
      if (!prev || prev.width !== size.width || prev.height !== size.height) changed = true;
    });
    if (changed) setLabelSizes(next);
  });
  const labelRef = (key: string) => (el: HTMLSpanElement | null) => {
    if (el) labelEls.current.set(key, el);
    else labelEls.current.delete(key);
  };
  const sizeOf = (key: string, text: string) => labelSizes[key] ?? estimateSize(text);

  // Callouts first (they name a specific mark), then the trend label, each avoiding marks and earlier labels.
  const marks = points.map((p) => ({ x: g.x(p.x), y: g.y(p.y) }));
  const bounds: Box = { x: 0, y: 0, width, height };
  const placed: Box[] = [];
  const calloutBoxes = callouts.flatMap((c) => {
    const p = byId.get(c.pointId);
    if (!p) return [];
    const candidates = calloutCandidates({ x: g.x(p.x), y: g.y(p.y) }, sizeOf(`callout:${c.pointId}`, c.text), width);
    const box = candidates[chooseLabelBox(candidates, { marks, markRadius: MARK_RADIUS, placed, bounds })]!;
    placed.push(box);
    return [{ callout: c, box }];
  });
  let trendBox: Box | null = null;
  if (g.trendLine && trend) {
    const candidates = trendLabelCandidates(g.trendLine, sizeOf('trend', trend.label));
    trendBox = candidates[chooseLabelBox(candidates, { marks, markRadius: MARK_RADIUS, placed, bounds })]!;
    placed.push(trendBox);
  }
  const yTickLabels = g.yTicks.map((t) => ({ value: t, text: formatY(t) }));
  const widestTick = yTickLabels.reduce((w, t) => (t.text.length > w.length ? t.text : w), '');
  const ordered = [...points.filter((p) => !p.highlight), ...points.filter((p) => p.highlight)];

  return (
    <figure className={cx('scatter-chart', className)}>
      {legend && (
        <ul className="scatter-chart__legend" role="list">
          <li className="scatter-chart__legend-item">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path className="scatter-chart__mark scatter-chart__mark--highlight" d={diamondPath(6, 6, 5)} />
            </svg>
            {legend.highlighted}
          </li>
          <li className="scatter-chart__legend-item">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <circle className="scatter-chart__mark" cx="6" cy="6" r="4" />
            </svg>
            {legend.others}
          </li>
          {trend && (
            <li className="scatter-chart__legend-item">
              <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" focusable="false">
                <line className="scatter-chart__trend" x1="0" x2="18" y1="6" y2="6" />
              </svg>
              {trend.label}
            </li>
          )}
        </ul>
      )}

      <p className="scatter-chart__y-title" aria-hidden="true">
        {yLabel}
      </p>

      <div className="scatter-chart__body">
        <div
          ref={plotRef}
          className="scatter-chart__plot"
          style={{ blockSize: `${height}px` }}
          role="img"
          aria-label={summary}
        >
          <svg
            className="scatter-chart__svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
            focusable="false"
          >
            {g.yTicks.map((t) => (
              <line
                key={t}
                className={cx('scatter-chart__grid', t === 0 && 'scatter-chart__grid--zero')}
                x1={0}
                x2={width}
                y1={g.y(t)}
                y2={g.y(t)}
              />
            ))}
            {g.trendLine && <line className="scatter-chart__trend" {...g.trendLine} />}
            {ordered.map((p) =>
              p.highlight ? (
                <path
                  key={p.id}
                  className="scatter-chart__mark scatter-chart__mark--highlight"
                  data-point={p.id}
                  d={diamondPath(g.x(p.x), g.y(p.y), 6)}
                />
              ) : (
                <circle key={p.id} className="scatter-chart__mark" data-point={p.id} cx={g.x(p.x)} cy={g.y(p.y)} r={4.5} />
              ),
            )}
          </svg>

          {trendBox && trend && (
            <span
              ref={labelRef('trend')}
              className="scatter-chart__label scatter-chart__label--trend"
              style={{ left: `${trendBox.x}px`, top: `${trendBox.y}px` }}
              aria-hidden="true"
            >
              {trend.label}
            </span>
          )}

          {calloutBoxes.map(({ callout, box }) => (
            <span
              key={callout.pointId}
              ref={labelRef(`callout:${callout.pointId}`)}
              className="scatter-chart__label scatter-chart__callout"
              style={{ left: `${box.x}px`, top: `${box.y}px` }}
              aria-hidden="true"
            >
              {callout.text}
            </span>
          ))}
        </div>

        <div className="scatter-chart__y-axis ios-num" aria-hidden="true">
          <span className="scatter-chart__y-sizer">{widestTick}</span>
          {yTickLabels.map((t) => (
            <span key={t.value} className="scatter-chart__y-label" style={{ top: `${g.y(t.value)}px` }}>
              {t.text}
            </span>
          ))}
        </div>

        <div className="scatter-chart__x-axis ios-num" aria-hidden="true">
          {g.xTicks.map((t) => (
            <span key={t} className="scatter-chart__x-label" style={{ left: `${g.x(t)}px` }}>
              {formatX(t)}
            </span>
          ))}
        </div>
      </div>

      <p className="scatter-chart__x-title" aria-hidden="true">
        {xLabel}
      </p>
      {caption && <figcaption className="scatter-chart__caption">{caption}</figcaption>}
      {footer}
    </figure>
  );
}
