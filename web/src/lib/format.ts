/**
 * Display formatting helpers.
 *
 * MONEY is stored everywhere as integer CENTS of the themed currency (Ð).
 * Divide by 100 only at the very edge — here — for display. Never do money
 * math in these helpers; they are presentation-only.
 */

import { CURRENCY } from '@deca/shared';

const SYMBOL = CURRENCY.symbol; // 'Ð'

/**
 * Format integer cents as a currency string, e.g. 123456 -> 'Ð1,234.56'.
 * Pass `symbol` to override (or '' for a bare number with grouping).
 */
export function formatMoney(cents: number, symbol: string = SYMBOL): string {
  const value = (cents ?? 0) / 100;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol}${formatted}`;
}

/**
 * Format a share/instrument price (integer cents). Same shape as money but
 * named for intent at call sites, e.g. 4287 -> 'Ð42.87'.
 */
export function formatPrice(cents: number, symbol: string = SYMBOL): string {
  return formatMoney(cents, symbol);
}

/**
 * Format a signed fraction as a percentage with an explicit sign,
 * e.g. 0.0123 -> '+1.23%', -0.05 -> '-5.00%'.
 */
export function formatPct(frac: number, digits = 2): string {
  const pct = (frac ?? 0) * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/** Format a plain integer/number with thousands grouping, e.g. 1234567 -> '1,234,567'. */
export function formatNumber(n: number, digits = 0): string {
  return (n ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Abbreviate a large money amount (integer cents) for compact display,
 * e.g. market caps: 120000000000 -> 'Ð1.2B', 95000000000 -> 'Ð950.0M',
 * 1230000 -> 'Ð12.3K'.
 */
export function formatMarketCap(cents: number, symbol: string = SYMBOL): string {
  const value = (cents ?? 0) / 100; // whole currency units
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  const tiers: Array<{ limit: number; suffix: string }> = [
    { limit: 1_000_000_000_000, suffix: 'T' },
    { limit: 1_000_000_000, suffix: 'B' },
    { limit: 1_000_000, suffix: 'M' },
    { limit: 1_000, suffix: 'K' },
  ];

  for (const { limit, suffix } of tiers) {
    if (abs >= limit) {
      return `${sign}${symbol}${(abs / limit).toFixed(1)}${suffix}`;
    }
  }
  // Below 1,000 units — show with two decimals like normal money.
  return `${sign}${symbol}${abs.toFixed(2)}`;
}

/**
 * Tiny classNames helper: joins truthy string/array args, drops falsy values.
 * Supports strings and conditional records, e.g.
 *   classNames('btn', isActive && 'btn--active', { 'is-loading': loading })
 */
export function classNames(
  ...args: Array<string | false | null | undefined | Record<string, boolean>>
): string {
  const out: string[] = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string') {
      out.push(arg);
    } else {
      for (const [key, on] of Object.entries(arg)) {
        if (on) out.push(key);
      }
    }
  }
  return out.join(' ');
}
