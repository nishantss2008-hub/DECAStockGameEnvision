/**
 * Wording for a game's length.
 *
 * A game now runs 10 to 30 minutes (2026-09-15 requirement), so the old hour-only wording
 * ("0.2 hours") no longer reads. Anything an hour or longer keeps the hour wording, because
 * a game stored before the cap still has to render.
 */

import { formatNumber, roundHalfUp } from './format';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

function parts(ms: number): { value: number; unit: 'minute' | 'hour' } {
  if (ms < HOUR_MS) return { value: roundHalfUp(ms / MINUTE_MS, 0), unit: 'minute' };
  return { value: roundHalfUp(ms / HOUR_MS, 1), unit: 'hour' };
}

/** 600000 → '10 minutes', 3600000 → '1 hour', 172800000 → '48 hours'. */
export function lengthLabel(ms: number): string {
  const { value, unit } = parts(ms);
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} ${unit}${value === 1 ? '' : 's'}`;
}

/** The adjective form for the derived line: 600000 → '10-minute', 3600000 → '1-hour'. */
export function lengthPhrase(ms: number): string {
  const { value, unit } = parts(ms);
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}-${unit}`;
}
