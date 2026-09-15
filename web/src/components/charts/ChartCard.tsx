import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { ChartLine } from 'lucide-react';
import type { RangeTab } from '@deca/shared';
import { SegmentedControl } from '../ios/SegmentedControl';
import { cx } from '../ios/iosCx';
import { areaPath, decimateMinMax, extentOf, linePath, niceTicks, paddedDomain, scaleLinear, type Point } from './scale';
import {
  clampLabelLeft,
  nearestIndex,
  resolveScrubIntent,
  scrubValueText,
  stepIndex,
  type ChartFormatters,
  type ChartSummaryText,
  type ScrubIntent,
} from './scrub';
import { sliceToRange, spokenRangeLabel } from './range';
import { useElementWidth } from './useElementWidth';
import '../ios/iosShared.css';
import './ChartCard.css';

/** Room above and below the line so the scrub dot and extremes never clip. */
const PAD_TOP = 12;
const PAD_BOTTOM = 12;
/** Plot width before measuring: 329px inner card width minus the trailing y-axis column. */
const FALLBACK_PLOT_WIDTH = 280;

/** COPY §12 `empty.chart`, `loading.prices`, `phases.countdownPaused`. */
const COPY = {
  emptyTitle: 'Not enough price history yet',
  emptyBody: 'The chart fills in as prices update.',
  loading: 'Loading prices…',
  paused: 'Clock stopped while paused',
};

export interface ChartScrubPoint {
  index: number;
  x: number;
  y: number;
  /** Visible x label, e.g. "14:01:30". */
  xText: string;
  /** Visible y label, e.g. "Ð84.06". */
  yText: string;
  /** Spoken form, e.g. "14:01:30, 84.06 doubloons". */
  valueText: string;
}

export interface ChartCardProps {
  /** Accessible name of the plot slider, e.g. "KRKN price". The active range is appended. */
  label: string;
  /** Series sorted by ascending x (ticks). Values in any unit; `formatters` turn them into text. */
  points: readonly Point[];
  /** Summary sentence above the plot; build it with `chartSummary()` so VoiceOver hears spelled-out money. */
  summary: ChartSummaryText | string;
  formatters: ChartFormatters;
  /** Y-axis tick labels; defaults to `formatters.formatY`. */
  formatAxis?: (y: number) => string;
  /** 220 company, 180 portfolio, 160 dispatch mini chart (MOBILE §5.13). */
  plotHeight?: number;
  /** Dashed reference line with a visible label, e.g. session open or starting cash. Also sets the line colour. */
  reference?: { y: number; label: string };
  /** Dashed comparison line already scaled to this chart's units (e.g. the composite rebased to starting cash). */
  compare?: { points: readonly Point[]; label: string };
  /** Tabs from `rangeTabs(clock)` in @deca/shared. */
  ranges?: readonly RangeTab[];
  /** Selected range key. Points are sliced to the tab's tick count. */
  range?: string;
  onRangeChange?: (key: string) => void;
  /** Accessible name of the range control. */
  rangeLabel?: string;
  /** Called with the scrubbed point while scrubbing and null on release, so StockHeader can swap its lines. */
  onScrub?: (point: ChartScrubPoint | null) => void;
  loading?: boolean;
  /** Visually hidden loading title (default COPY §12 `loading.prices.title`). */
  loadingLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  /** Shows "Clock stopped while paused" under the plot. */
  paused?: boolean;
  /** `auto` = gain colour if the last value ≥ reference (or first value), else loss. */
  tone?: 'auto' | 'neutral';
  className?: string;
}

/**
 * ChartCard (MOBILE §5.13): summary sentence → plot → x labels → range control.
 * The whole plot is the scrub target: mouse hover, or a touch drag that turns horizontal
 * after 6px (vertical drags keep scrolling the page). A visually hidden native range input
 * over the plot is the keyboard and VoiceOver slider: ←/→ step one point, Home/End jump,
 * `aria-valuetext` speaks the time and value, and the summary is its description.
 */
export function ChartCard({
  label,
  points,
  summary,
  formatters,
  formatAxis,
  plotHeight = 220,
  reference,
  compare,
  ranges,
  range,
  onRangeChange,
  rangeLabel = 'Chart range',
  onScrub,
  loading = false,
  loadingLabel = COPY.loading,
  emptyTitle = COPY.emptyTitle,
  emptyBody = COPY.emptyBody,
  paused = false,
  tone = 'auto',
  className,
}: ChartCardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const summaryId = `chart-summary-${uid}`;
  const gradientId = `chart-area-${uid}`;

  const activeTab = ranges?.find((tab) => tab.key === range) ?? null;
  const activeTicks = activeTab ? activeTab.ticks : null;
  const visible = useMemo(() => sliceToRange(points, activeTicks), [points, activeTicks]);
  const referenceY = reference?.y;
  const comparePoints = compare?.points;
  const hasData = visible.length >= 2;

  const [plotRef, width] = useElementWidth<HTMLDivElement>(FALLBACK_PLOT_WIDTH);
  const [scrubX, setScrubX] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const first = visible[0];
    const last = visible[visible.length - 1];
    if (!first || !last || visible.length < 2) return null;
    const compareVisible = comparePoints ? comparePoints.filter((p) => p.x >= first.x && p.x <= last.x) : [];
    const ext = extentOf([...visible.map((p) => p.y), ...compareVisible.map((p) => p.y)]) ?? [first.y, last.y];
    const [y0, y1] = paddedDomain(ext[0], ext[1], { include: referenceY === undefined ? [] : [referenceY] });
    const x = scaleLinear([first.x, last.x], [0, width]);
    const y = scaleLinear([y0, y1], [plotHeight - PAD_BOTTOM, PAD_TOP]);
    const buckets = Math.max(2, Math.floor(width));
    const drawn = decimateMinMax(visible, buckets);
    const compareLast = compareVisible[compareVisible.length - 1];
    return {
      x,
      y,
      line: linePath(drawn, x, y),
      area: areaPath(drawn, x, y, plotHeight),
      comparePath: compareVisible.length >= 2 ? linePath(decimateMinMax(compareVisible, buckets), x, y) : '',
      compareLabelY: compareLast ? y(compareLast.y) : null,
      referenceY: referenceY === undefined ? null : y(referenceY),
      ticks: niceTicks(y0, y1, 3),
      up: last.y >= (referenceY ?? first.y),
    };
  }, [visible, comparePoints, referenceY, width, plotHeight]);

  const scrubIndex = scrubX === null || !hasData ? null : nearestIndex(visible, scrubX);
  const scrubPoint = scrubIndex === null ? null : (visible[scrubIndex] ?? null);
  const sliderIndex = scrubIndex ?? visible.length - 1;
  const sliderPoint = visible[sliderIndex];
  const valueText = sliderPoint ? scrubValueText(sliderPoint, formatters) : '';

  // Report scrub changes to the parent (StockHeader swaps its price lines while scrubbing).
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const formattersRef = useRef(formatters);
  formattersRef.current = formatters;
  const sentKey = useRef<string | null>(null);
  const scrubKey = scrubPoint && scrubIndex !== null ? `${scrubIndex}|${scrubPoint.x}|${scrubPoint.y}` : null;
  useEffect(() => {
    if (scrubKey === sentKey.current) return;
    sentKey.current = scrubKey;
    const report = onScrubRef.current;
    if (!report) return;
    if (!scrubPoint || scrubIndex === null) {
      report(null);
      return;
    }
    const fmt = formattersRef.current;
    report({
      index: scrubIndex,
      x: scrubPoint.x,
      y: scrubPoint.y,
      xText: fmt.formatX(scrubPoint.x),
      yText: fmt.formatY(scrubPoint.y),
      valueText: scrubValueText(scrubPoint, fmt),
    });
  }, [scrubKey, scrubIndex, scrubPoint]);

  // Release any scrub when unmounting so the parent restores its live numbers.
  useEffect(
    () => () => {
      if (sentKey.current !== null) onScrubRef.current?.(null);
    },
    [],
  );

  // Floating value label: centre it on the scrub line but keep it inside the plot.
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const scrubPx = scrubPoint && geometry ? geometry.x(scrubPoint.x) : null;
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || scrubPx === null) return;
    bubble.style.left = `${clampLabelLeft(scrubPx, bubble.offsetWidth, width)}px`;
  }, [scrubPx, width, scrubKey]);

  // Pointer scrubbing (MOBILE §5.13, §8.3).
  const drag = useRef<{ id: number; x0: number; y0: number; intent: ScrubIntent } | null>(null);
  const scrubAtClientX = (target: HTMLElement, clientX: number) => {
    if (!geometry) return;
    const rect = target.getBoundingClientRect();
    const px = Math.min(width, Math.max(0, clientX - rect.left));
    const index = nearestIndex(visible, geometry.x.invert(px));
    const point = visible[index];
    if (point) setScrubX(point.x);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!hasData) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, intent: 'scrub' };
      scrubAtClientX(e.currentTarget, e.clientX);
      return;
    }
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, intent: 'pending' };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!hasData) return;
    const d = drag.current;
    if (!d) {
      // Mouse and trackpad scrub on hover, like a desktop stock chart.
      if (e.pointerType === 'mouse') scrubAtClientX(e.currentTarget, e.clientX);
      return;
    }
    if (d.id !== e.pointerId) return;
    if (d.intent === 'pending') {
      d.intent = resolveScrubIntent(e.clientX - d.x0, e.clientY - d.y0);
      if (d.intent === 'scrub') e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.intent === 'scrub') scrubAtClientX(e.currentTarget, e.clientX);
  };
  const endPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (e.pointerType !== 'mouse') setScrubX(null);
  };
  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && !drag.current) setScrubX(null);
  };

  // Keyboard and VoiceOver slider.
  const onSliderKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (scrubX !== null) {
        e.preventDefault();
        e.stopPropagation();
        setScrubX(null);
      }
      return;
    }
    const next = stepIndex(e.key, sliderIndex, visible.length);
    if (next === null) return;
    e.preventDefault();
    const point = visible[next];
    if (point) setScrubX(point.x);
  };
  const onSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const point = visible[Number(e.target.value)];
    if (point) setScrubX(point.x);
  };

  const onRangeSelect = (key: string) => {
    setScrubX(null);
    onRangeChange?.(key);
  };

  const summaryText = typeof summary === 'string' ? { text: summary, spoken: summary } : summary;
  const axisFormat = formatAxis ?? formatters.formatY;
  const tickLabels = geometry ? geometry.ticks.map((t) => ({ value: t, text: axisFormat(t) })) : [];
  const widestTick = tickLabels.reduce((w, t) => (t.text.length > w.length ? t.text : w), '');
  const mid = visible[Math.floor((visible.length - 1) / 2)];
  const sliderName = activeTab ? `${label}, ${spokenRangeLabel(activeTab)}` : label;
  const trend = tone === 'neutral' ? 'neutral' : geometry?.up ? 'up' : 'down';

  const rangeControl =
    ranges && ranges.length > 0 && range !== undefined ? (
      <SegmentedControl
        className="chart-card__ranges"
        ariaLabel={rangeLabel}
        options={ranges.map((tab) => ({ value: tab.key, label: tab.label }))}
        value={range}
        onChange={onRangeSelect}
      />
    ) : null;

  const style = { '--chart-plot-h': `${plotHeight}px` } as CSSProperties;

  if (loading) {
    return (
      <section className={cx('chart-card', className)} style={style} aria-busy="true">
        <span className="ios-sr-only">{loadingLabel}</span>
        <div className="chart-card__skeleton" aria-hidden="true">
          <span className="chart-card__skeleton-summary" />
          <span className="chart-card__skeleton-plot" />
          <span className="chart-card__skeleton-axis" />
        </div>
        {rangeControl}
      </section>
    );
  }

  return (
    <section className={cx('chart-card', className)} style={style}>
      {summaryText.text &&
        (summaryText.text === summaryText.spoken ? (
          <p id={summaryId} className="chart-card__summary">
            {summaryText.text}
          </p>
        ) : (
          <>
            <p className="chart-card__summary" aria-hidden="true">
              {summaryText.text}
            </p>
            <p id={summaryId} className="ios-sr-only">
              {summaryText.spoken}
            </p>
          </>
        ))}

      {geometry && sliderPoint && mid ? (
        <div className="chart-card__body">
          <div
            ref={plotRef}
            className="chart-card__plot"
            data-scrubbing={scrubPoint ? '' : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={onPointerLeave}
          >
            <svg
              className="chart-card__svg"
              data-trend={trend}
              width={width}
              height={plotHeight}
              viewBox={`0 0 ${width} ${plotHeight}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path className="chart-card__area" d={geometry.area} fill={`url(#${gradientId})`} />
              {geometry.referenceY !== null && (
                <line
                  className="chart-card__reference"
                  x1={0}
                  x2={width}
                  y1={geometry.referenceY}
                  y2={geometry.referenceY}
                />
              )}
              {geometry.comparePath && <path className="chart-card__compare" d={geometry.comparePath} />}
              <path className="chart-card__line" d={geometry.line} />
              {scrubPoint && scrubPx !== null && (
                <g className="chart-card__scrub">
                  <line className="chart-card__rule" x1={scrubPx} x2={scrubPx} y1={0} y2={plotHeight} />
                  <circle className="chart-card__dot-ring" cx={scrubPx} cy={geometry.y(scrubPoint.y)} r={6} />
                  <circle className="chart-card__dot" cx={scrubPx} cy={geometry.y(scrubPoint.y)} r={4} />
                </g>
              )}
            </svg>

            {reference && geometry.referenceY !== null && (
              <span
                className="chart-card__line-label"
                data-below={geometry.referenceY < 20 ? '' : undefined}
                style={{ top: `${geometry.referenceY}px` }}
                aria-hidden="true"
              >
                {reference.label}
              </span>
            )}
            {compare && geometry.comparePath && geometry.compareLabelY !== null && (
              <span
                className="chart-card__line-label chart-card__line-label--end"
                data-below={geometry.compareLabelY < 20 ? '' : undefined}
                style={{ top: `${geometry.compareLabelY}px` }}
                aria-hidden="true"
              >
                {compare.label}
              </span>
            )}

            {scrubPoint && (
              <div ref={bubbleRef} className="chart-card__bubble ios-num" aria-hidden="true">
                <span className="chart-card__bubble-value">{formatters.formatY(scrubPoint.y)}</span>
                <span className="chart-card__bubble-time">{formatters.formatX(scrubPoint.x)}</span>
              </div>
            )}

            <input
              className="chart-card__slider"
              type="range"
              min={0}
              max={visible.length - 1}
              step={1}
              value={sliderIndex}
              aria-label={sliderName}
              aria-valuetext={valueText}
              aria-describedby={summaryText.text ? summaryId : undefined}
              onKeyDown={onSliderKeyDown}
              onChange={onSliderChange}
              onBlur={() => setScrubX(null)}
            />
          </div>

          <div className="chart-card__y-axis ios-num" aria-hidden="true">
            <span className="chart-card__y-sizer">{widestTick}</span>
            {tickLabels.map((t) => (
              <span key={t.value} className="chart-card__y-label" style={{ top: `${geometry.y(t.value)}px` }}>
                {t.text}
              </span>
            ))}
          </div>

          <div className="chart-card__x-labels ios-num" aria-hidden="true">
            <span>{formatters.formatX(visible[0]!.x)}</span>
            <span>{formatters.formatX(mid.x)}</span>
            <span>{formatters.formatX(visible[visible.length - 1]!.x)}</span>
          </div>
        </div>
      ) : (
        <div className="chart-card__empty">
          <ChartLine className="chart-card__empty-icon" size={44} strokeWidth={1.75} aria-hidden="true" />
          <p className="chart-card__empty-title">{emptyTitle}</p>
          <p className="chart-card__empty-body">{emptyBody}</p>
        </div>
      )}

      {paused && <p className="chart-card__note">{COPY.paused}</p>}
      {rangeControl}
    </section>
  );
}
