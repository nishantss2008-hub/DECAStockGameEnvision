/**
 * Money helpers. All money is stored as INTEGER CENTS of the themed currency
 * to avoid floating-point drift (1,000,000 Ð => 100_000_000 cents).
 */

import { ORDER_FEE_BPS } from '@deca/shared';

/** Whole currency units → integer cents. */
export function toCents(units: number): number {
  return Math.round(units * 100);
}

/** Integer cents → whole currency units (float, for display only). */
export function toUnits(cents: number): number {
  return cents / 100;
}

/** Notional value of `shares` at `pricePerShareCents`, in cents. */
export function shareValue(shares: number, pricePerShareCents: number): number {
  return Math.round(shares * pricePerShareCents);
}

/** Trading fee in cents for a notional in cents, at a basis-point rate. */
export function feeFor(notionalCents: number, bps: number = ORDER_FEE_BPS): number {
  return Math.round((notionalCents * bps) / 10_000);
}

/** Floor a price at 1 cent and round to an integer. */
export function clampPositive(cents: number): number {
  return cents < 1 ? 1 : Math.round(cents);
}

/** Format integer cents as a themed currency string. */
export function formatMoney(cents: number, symbol = 'Ð'): string {
  return `${symbol}${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
