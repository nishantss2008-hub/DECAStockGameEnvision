/**
 * Pure text for StockHeader and its collapsed bar (MOBILE §5.14, §10).
 */
import { changeParts, type ChangeParts } from './changeText';
import { DEFAULT_CURRENCY, formatMoneyCents, spokenMoney, type CurrencyNames } from './signedText';

const groupedInt = (n: number) => Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

/** "Kraken Shipping Lines, 84.12 doubloons, up 2.31 percent this session". */
export function stockPriceSentence(
  name: string,
  priceCents: number,
  sessionChange: number,
  currency: CurrencyNames = DEFAULT_CURRENCY,
): string {
  const change = changeParts(sessionChange);
  const changeWords = change.direction === 'flat' ? 'unchanged' : change.spoken;
  return `${name}, ${spokenMoney(priceCents, currency)}, ${changeWords} this session`;
}

/** "As of tick 1,284 · 14:02:30" (COPY §9 `lines.priceAsOf`, phone form in MOBILE §5.14). */
export function asOfText(tick: number, timeText: string): string {
  return `As of tick ${groupedInt(tick)} · ${timeText}`;
}

/** Scrub line that replaces the change line: "14:01:30 · tick 1,282". */
export function scrubLineText(timeText: string, tick: number): string {
  return `${timeText} · tick ${groupedInt(tick)}`;
}

export interface StockBarSubtitleParts {
  /** "Ð84.12" */
  price: string;
  /** "+2.31%" with its direction; drawn with a caret but no gain/loss colour (text on glass, MOBILE §2.4). */
  change: ChangeParts;
}

/** Collapsed bar subtitle parts: "Ð84.12 · ▲ +2.31%". */
export function stockBarSubtitle(
  priceCents: number,
  sessionChange: number,
  currency: CurrencyNames = DEFAULT_CURRENCY,
): StockBarSubtitleParts {
  return { price: formatMoneyCents(priceCents, currency), change: changeParts(sessionChange) };
}

/** What StockHeader shows while the chart is scrubbed (MOBILE §5.13–§5.14). */
export interface StockHeaderScrub {
  /** Scrubbed price, integer cents. */
  price: number;
  /** Time at the scrubbed tick, e.g. "14:01:30". */
  timeText: string;
  tick: number;
}

/**
 * Maps ChartCard's `onScrub` point onto StockHeader's `scrub` prop: y (cents) → price,
 * xText → timeText, x (tick) → tick. Pass a `formatX` that returns the clock time of a tick.
 * `null` (scrub released) stays `null` so the header restores the live price.
 */
export function headerScrubFromChart(point: { x: number; y: number; xText: string } | null): StockHeaderScrub | null {
  if (!point) return null;
  return { price: point.y, timeText: point.xText, tick: point.x };
}
