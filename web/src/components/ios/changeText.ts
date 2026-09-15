/**
 * Pure text for signed percentage changes (BRIEF §4, MOBILE §3.4, §10):
 * sign + true minus (U+2212) + half-up rounding, and the spoken form
 * "up 2.31 percent" so the SVG triangle is never announced.
 * Rounding and the minus sign come from lib/format, so the visible text always equals
 * `formatPct(fraction, { signed: true })` (format.consistency.test.ts).
 */
import { MINUS, roundHalfUp } from '../../lib/format';

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface ChangeParts {
  direction: ChangeDirection;
  /** Visible text, e.g. "+2.31%", "−3.46%", "0.00%". */
  text: string;
  /** Screen-reader text, e.g. "up 2.31 percent". */
  spoken: string;
}

/** @param fraction signed change as a fraction (0.0231 = +2.31%). */
export function changeParts(fraction: number, digits = 2): ChangeParts {
  const pct = Number.isFinite(fraction) ? fraction * 100 : 0;
  const rounded = roundHalfUp(Math.abs(pct), digits);
  const number = rounded.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (rounded === 0) {
    return { direction: 'flat', text: `${number}%`, spoken: `unchanged, ${number} percent` };
  }
  const up = pct > 0;
  return {
    direction: up ? 'up' : 'down',
    text: `${up ? '+' : MINUS}${number}%`,
    spoken: `${up ? 'up' : 'down'} ${number} percent`,
  };
}
