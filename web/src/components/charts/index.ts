/**
 * Custom SVG charts (MOBILE §5.13, §7.13). Plain CSS co-located with each chart; pure math in
 * `scale.ts`, `scrub.ts`, `range.ts` and `allocation.ts`.
 */

export { ChartCard, type ChartCardProps, type ChartScrubPoint } from './ChartCard';
export { Sparkline, type SparklineProps } from './Sparkline';
export { RangeBar, type RangeBarProps } from './RangeBar';
export { AllocationBar, type AllocationBarProps } from './AllocationBar';
export { ScatterChart, type ScatterChartProps, type ScatterPoint } from './ScatterChart';

export {
  scaleLinear,
  extentOf,
  paddedDomain,
  niceTicks,
  linePath,
  areaPath,
  decimateMinMax,
  linearFit,
  fractionInRange,
  type Point,
  type Scale,
  type PaddedDomainOptions,
} from './scale';
export {
  SCRUB_THRESHOLD_PX,
  nearestIndex,
  resolveScrubIntent,
  stepIndex,
  clampLabelLeft,
  moneyFormatters,
  scrubValueText,
  seriesStats,
  chartSummary,
  type ChartFormatters,
  type ChartSummaryText,
  type ScrubIntent,
  type SeriesStats,
} from './scrub';
export { sliceToRange, spokenRangeLabel } from './range';
export { allocationSegments, type AllocationItem, type AllocationSegment } from './allocation';
export { chooseLabelBox, trendLabelCandidates, calloutCandidates, type Box, type Size, type PlacementContext } from './labelPlacement';
export { useElementWidth } from './useElementWidth';
