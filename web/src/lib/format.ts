/**
 * Display formatting helpers (presentation only, no money math).
 *
 * Money is stored everywhere as INTEGER CENTS of the themed currency (Ð). These
 * helpers are the boundary where cents become text. Every negative number uses
 * the true minus sign `−` (U+2212), never an ASCII hyphen (COPY §0.5 rule 7).
 */

import { CURRENCY } from '@deca/shared';

/** True minus sign (U+2212). */
export const MINUS = '−';

const GROUPED = new Map<number, Intl.NumberFormat>();

/** Cached en-US formatter with a fixed number of decimals and thousands grouping. */
function grouped(digits: number): Intl.NumberFormat {
  let f = GROUPED.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    GROUPED.set(digits, f);
  }
  return f;
}

/** Non-finite input is displayed as zero rather than "NaN". */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rounds half away from zero to `digits` decimals (BRIEF §7: half-up), without binary drift
 * (1.005 → 1.01, −0.5 → −1). Non-finite input is 0 and the result is never negative zero.
 * Every display helper in the app rounds through this, so a value prints the same everywhere.
 */
export function roundHalfUp(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return 0;
  const clean = Number(Math.abs(value).toPrecision(15));
  // Shift the decimal point in the string form so 1.005 does not become 100.49999…; values that
  // already print in exponent form (below 1e-6 or from 1e21) are far from a rounding edge.
  const text = String(clean);
  const magnitude = text.includes('e')
    ? Math.round(clean * 10 ** digits) / 10 ** digits
    : Number(`${Math.round(Number(`${text}e${digits}`))}e-${digits}`);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  return value < 0 ? -magnitude : magnitude;
}

/** Sign prefix for an already-rounded value: '−' for negatives, '+' only when `signed`. */
function signFor(rounded: number, signed: boolean): string {
  if (rounded < 0) return MINUS;
  if (rounded > 0 && signed) return '+';
  return '';
}

/**
 * Absolute money in whole currency units as a rounded `number + unit` per COPY `moneyCompact`.
 * The unit is picked by size, then moves up one when the 2-decimal number rounds to 100 of it,
 * so Ð99,999.99 reads 'Ð0.10M', never 'Ð100.00K'.
 */
function compactUnits(absUnits: number): { value: number; unit: string } {
  const b = { value: roundHalfUp(absUnits / 1_000_000_000, 2), unit: 'B' };
  const m = { value: roundHalfUp(absUnits / 1_000_000, 2), unit: 'M' };
  const k = { value: roundHalfUp(absUnits / 1_000, 2), unit: 'K' };
  if (absUnits >= 100_000_000) return b;
  if (absUnits >= 100_000) return m.value >= 100 ? b : m;
  if (absUnits >= 1_000) return k.value >= 100 ? m : k;
  return { value: absUnits, unit: '' };
}

export interface MoneyOptions {
  /** Currency symbol; defaults to `Ð`. Pass the host's symbol when it was renamed, or '' for none. */
  symbol?: string;
  /** Prefix positives with '+'. Negatives always carry '−'. */
  signed?: boolean;
  /**
   * Compact form per COPY `moneyCompact`: two decimals and a unit; B from Ð100 million,
   * M from Ð100 thousand, K from Ð1,000, plain two decimals below Ð1,000. A number that rounds
   * to 100 of its unit uses the next unit ('Ð0.10M', not 'Ð100.00K').
   */
  compact?: boolean;
}

/**
 * Integer cents as money: 123456 → 'Ð1,234.56'; signed '+Ð1.90' / '−Ð22.00';
 * compact 467_000_000_000 → 'Ð4.67B'.
 */
export function formatMoney(cents: number, opts: MoneyOptions = {}): string {
  const symbol = opts.symbol ?? CURRENCY.symbol;
  const roundedCents = roundHalfUp(cents);
  const sign = signFor(roundedCents, opts.signed ?? false);
  const absUnits = Math.abs(roundedCents) / 100;
  if (opts.compact) {
    const { value, unit } = compactUnits(absUnits);
    if (unit) return `${sign}${symbol}${grouped(2).format(value)}${unit}`;
  }
  return `${sign}${symbol}${grouped(2).format(absUnits)}`;
}

export interface PctOptions {
  signed?: boolean;
  /** Decimal places (default 2). */
  digits?: number;
}

/** Fraction as a percentage: 0.0231 → '2.31%'; signed '+2.31%' / '−0.53%' / '0.00%'. */
export function formatPct(frac: number, opts: PctOptions = {}): string {
  const digits = opts.digits ?? 2;
  const rounded = roundHalfUp(finite(frac) * 100, digits);
  const sign = signFor(rounded, opts.signed ?? false);
  return `${sign}${grouped(digits).format(Math.abs(rounded))}%`;
}

/** Plain number with thousands grouping: 1613333 → '1,613,333'. */
export function formatNumber(n: number, digits = 0): string {
  const rounded = roundHalfUp(n, digits);
  return `${rounded < 0 ? MINUS : ''}${grouped(digits).format(Math.abs(rounded))}`;
}

const COMPACT_TIERS: ReadonlyArray<readonly [number, string]> = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/**
 * Compact plain number with one decimal and a unit: 242_000_000 → '242.0M'; below 1,000 → '950'.
 * The unit moves up one when the rounded number reaches 1,000 of it: 999_950 → '1.0M', not '1,000.0K'.
 */
export function formatCompact(n: number): string {
  const v = finite(n);
  const abs = Math.abs(v);
  let tier = COMPACT_TIERS.findIndex(([limit]) => abs >= limit);
  if (tier === -1) {
    if (roundHalfUp(abs) < 1_000) return formatNumber(v);
    tier = COMPACT_TIERS.length - 1;
  } else if (tier > 0 && roundHalfUp(abs / COMPACT_TIERS[tier]![0], 1) >= 1_000) {
    tier -= 1;
  }
  const [limit, unit] = COMPACT_TIERS[tier]!;
  return `${v < 0 ? MINUS : ''}${grouped(1).format(roundHalfUp(abs / limit, 1))}${unit}`;
}

/** Index level with two decimals: 1048.618 → '1,048.62'. */
export function formatIndex(v: number): string {
  return formatNumber(v, 2);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Duration as HH:MM:SS with unbounded hours: 148_628_000 → '41:17:08'. Negative → '00:00:00'. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(finite(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Local 24-hour wall-clock time of an epoch: '14:02:30'. */
export function formatTickTime(epochMs: number): string {
  const d = new Date(finite(epochMs));
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Sign of a change. Non-finite values count as flat. */
export function direction(x: number): 'up' | 'down' | 'flat' {
  if (!Number.isFinite(x) || x === 0) return 'flat';
  return x > 0 ? 'up' : 'down';
}

export interface SpokenMoneyOptions {
  /** Currency name, e.g. the host's renamed currency; defaults to 'Doubloons'. */
  currencyName?: string;
}

/**
 * Money for accessible names (MOBILE §10): screen readers may read 'Ð' as "Eth", so the
 * currency is spelled out: 8412 → '84.12 doubloons', −2200 → 'minus 22.00 doubloons'.
 */
export function formatMoneySpoken(cents: number, opts: SpokenMoneyOptions = {}): string {
  const name = (opts.currencyName ?? CURRENCY.name).toLowerCase();
  const roundedCents = roundHalfUp(cents);
  const prefix = roundedCents < 0 ? 'minus ' : '';
  return `${prefix}${grouped(2).format(Math.abs(roundedCents) / 100)} ${name}`;
}

/** Signed change for accessible names: 'up 2.31 percent' / 'down 3.46 percent' / 'unchanged'. */
export function formatPctSpoken(frac: number, digits = 2): string {
  const rounded = roundHalfUp(finite(frac) * 100, digits);
  if (rounded === 0) return 'unchanged';
  return `${rounded > 0 ? 'up' : 'down'} ${grouped(digits).format(Math.abs(rounded))} percent`;
}

/**
 * Tiny classNames helper: joins truthy strings and the keys of truthy record entries.
 *   classNames('btn', isActive && 'btn--active', { 'is-loading': loading })
 */
export function classNames(...args: Array<string | false | null | undefined | Record<string, boolean>>): string {
  const out: string[] = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string') {
      out.push(arg);
    } else {
      for (const [key, on] of Object.entries(arg)) if (on) out.push(key);
    }
  }
  return out.join(' ');
}
