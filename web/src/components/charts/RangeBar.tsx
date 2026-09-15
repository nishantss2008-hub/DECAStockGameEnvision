import type { CSSProperties } from 'react';
import { cx } from '../ios/iosCx';
import { fractionInRange } from './scale';
import '../ios/iosShared.css';
import './RangeBar.css';

export interface RangeBarProps {
  low: number;
  high: number;
  value: number;
  /** Visible end labels, e.g. cents → "Ð81.90". */
  formatter: (v: number) => string;
  /** Spoken values, e.g. cents → "81.90 doubloons". Defaults to `formatter`. */
  spokenFormatter?: (v: number) => string;
  /** Names the range for VoiceOver, e.g. "Session range" (COPY §1.1 `company.sessionRange.short`). */
  label: string;
  /** Names the marker, e.g. "Price" (COPY §1.1 `company.currentPrice.short`). */
  valueLabel: string;
  className?: string;
}

/**
 * RangeBar (MOBILE §5.13): 4px track with an 8px marker showing where the price sits between
 * the low and high, end labels beneath. No gain/loss colour: a position in a range is not a
 * price change. Exposed as one image with a spoken summary; the row around it owns the "?".
 */
export function RangeBar({ low, high, value, formatter, spokenFormatter, label, valueLabel, className }: RangeBarProps) {
  const speak = spokenFormatter ?? formatter;
  const position = fractionInRange(low, high, value);
  const style = { '--range-pos': position } as CSSProperties;
  return (
    <div
      className={cx('range-bar', className)}
      role="img"
      aria-label={`${label}: ${speak(low)} to ${speak(high)}. ${valueLabel}: ${speak(value)}.`}
    >
      <div className="range-bar__track" style={style} aria-hidden="true">
        <span className="range-bar__marker" />
      </div>
      <div className="range-bar__ends ios-num" aria-hidden="true">
        <span>{formatter(low)}</span>
        <span>{formatter(high)}</span>
      </div>
    </div>
  );
}
