/**
 * Pure text for money and signed values (BRIEF §4, MOBILE §3.4 and §10).
 *
 * - Money is integer cents; display is symbol + 2 decimals with grouping.
 * - Signed values use "+" or the true minus (U+2212); the SVG caret is drawn by the component.
 * - Spoken text spells the currency ("84.12 doubloons") because VoiceOver may read "Ð" as "Eth".
 * - Percentages delegate to `changeText.ts` so every change reads the same app-wide.
 * - Money and plain percentages are thin wrappers over lib/format (one rounding rule app-wide,
 *   format.consistency.test.ts); this module adds the host-renamable currency and signed parts.
 */
import { CURRENCY } from '@deca/shared';
import { MINUS, formatMoney, formatMoneySpoken, formatPct, roundHalfUp } from '../../lib/format';
import { changeParts, type ChangeDirection, type ChangeParts } from './changeText';

export { MINUS };

export interface CurrencyNames {
  /** Display symbol, e.g. "Ð". */
  symbol: string;
  /** Currency name as configured by the host, e.g. "Doubloons". Spoken in lowercase. */
  name: string;
}

export const DEFAULT_CURRENCY: CurrencyNames = { symbol: CURRENCY.symbol, name: CURRENCY.name };

export type SignedKind = 'money' | 'pct' | 'number';
export type SignedDirection = ChangeDirection;
export type SignedParts = ChangeParts;

function grouped(abs: number, digits: number): string {
  return abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 123456 → "Ð1,234.56"; negative → "−Ð22.00"; `signed` adds "+" to positive amounts. */
export function formatMoneyCents(
  cents: number,
  currency: CurrencyNames = DEFAULT_CURRENCY,
  opts: { signed?: boolean } = {},
): string {
  return formatMoney(cents, { symbol: currency.symbol, signed: opts.signed });
}

/** 8412 → "84.12 doubloons"; negative → "minus 1.50 doubloons". */
export function spokenMoney(cents: number, currency: CurrencyNames = DEFAULT_CURRENCY): string {
  return formatMoneySpoken(cents, { currencyName: currency.name });
}

/** Unsigned percentage: 0.2327 → "23.3%" (digits 1), 0.0842 → "8.42%". */
export function formatPercentPlain(fraction: number, digits = 2): string {
  return formatPct(Number.isFinite(fraction) ? Math.abs(fraction) : 0, { digits });
}

export interface SignedOptions {
  currency?: CurrencyNames;
  /** Decimal places (default 2). */
  digits?: number;
}

/**
 * Visible text, direction and spoken text for a signed value.
 * - money: `value` in integer cents → "+Ð1.90" / "up 1.90 doubloons"
 * - pct: `value` as a fraction → "+2.31%" / "up 2.31 percent"
 * - number: plain value such as index points → "+8.71" / "up 8.71"
 * A value that rounds to zero at the shown precision is flat (no sign, no caret).
 */
export function signedParts(value: number, kind: SignedKind, opts: SignedOptions = {}): SignedParts {
  const digits = opts.digits ?? 2;
  if (kind === 'pct') return changeParts(value, digits);

  const currency = opts.currency ?? DEFAULT_CURRENCY;
  const raw = Number.isFinite(value) ? (kind === 'money' ? value / 100 : value) : 0;
  const abs = roundHalfUp(Math.abs(raw), digits);
  const number = grouped(abs, digits);
  const visible = kind === 'money' ? `${currency.symbol}${number}` : number;
  const spokenValue = kind === 'money' ? `${number} ${currency.name.toLowerCase()}` : number;

  if (abs === 0) return { direction: 'flat', text: visible, spoken: `unchanged, ${spokenValue}` };
  const up = raw > 0;
  return {
    direction: up ? 'up' : 'down',
    text: `${up ? '+' : MINUS}${visible}`,
    spoken: `${up ? 'up' : 'down'} ${spokenValue}`,
  };
}
