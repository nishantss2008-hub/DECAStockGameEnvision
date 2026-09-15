/**
 * Edge cases for lib/format: compact tiers after rounding, negative zero, NaN and huge values.
 */
import { describe, it, expect } from 'vitest';
import { formatCompact, formatMoney, formatMoneySpoken, formatNumber, formatPct, formatPctSpoken } from './format';

describe('formatMoney compact: the unit follows the rounded number (COPY moneyCompact)', () => {
  it('never shows 100.00 of a unit that has a larger one', () => {
    expect(formatMoney(9_999_999, { compact: true })).toBe('Ð0.10M'); // Ð99,999.99
    expect(formatMoney(9_999_999_999, { compact: true })).toBe('Ð0.10B'); // Ð99,999,999.99
    expect(formatMoney(-9_999_999_999, { compact: true, signed: true })).toBe('−Ð0.10B');
  });
  it('keeps the smaller unit while the rounded number stays below 100', () => {
    expect(formatMoney(9_999_400_000, { compact: true })).toBe('Ð99.99M');
    expect(formatMoney(9_999_400, { compact: true })).toBe('Ð99.99K');
    expect(formatMoney(10_000_000_000, { compact: true })).toBe('Ð0.10B');
    expect(formatMoney(100_000, { compact: true })).toBe('Ð1.00K');
  });
  it('rounds half-up in the compact number', () => {
    expect(formatMoney(96_500_000_000, { compact: true })).toBe('Ð0.97B');
    expect(formatMoney(100_500, { compact: true })).toBe('Ð1.01K');
  });
});

describe('formatCompact: the unit follows the rounded number', () => {
  it('moves up a unit when one decimal rounds to 1,000', () => {
    expect(formatCompact(999_950)).toBe('1.0M');
    expect(formatCompact(999_949)).toBe('999.9K');
    expect(formatCompact(999_950_000)).toBe('1.0B');
    expect(formatCompact(-999_999)).toBe('−1.0M');
    expect(formatCompact(999.5)).toBe('1.0K');
    expect(formatCompact(999.4)).toBe('999');
  });
  it('keeps the largest unit for very large values', () => {
    expect(formatCompact(2e15)).toBe('2,000.0T');
  });
  it('prints no sign for negative zero and zero for NaN', () => {
    expect(formatCompact(-0)).toBe('0');
    expect(formatCompact(-0.4)).toBe('0');
    expect(formatCompact(Number.NaN)).toBe('0');
  });
});

describe('negative zero, NaN and huge values', () => {
  it('never prints a minus for values that round to zero', () => {
    expect(formatMoney(-0)).toBe('Ð0.00');
    expect(formatMoney(-0.49, { compact: true })).toBe('Ð0.00');
    expect(formatNumber(-0.004, 2)).toBe('0.00');
    expect(formatPct(-0, { signed: true })).toBe('0.00%');
    expect(formatMoneySpoken(-0.2)).toBe('0.00 doubloons');
    expect(formatPctSpoken(-0.000001)).toBe('unchanged');
  });
  it('treats non-finite input as zero everywhere', () => {
    expect(formatMoney(Number.POSITIVE_INFINITY, { compact: true })).toBe('Ð0.00');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatPct(Number.NEGATIVE_INFINITY)).toBe('0.00%');
  });
  it('formats huge values without exponent notation', () => {
    expect(formatMoney(1e17)).toBe('Ð1,000,000,000,000,000.00');
    expect(formatMoney(1e17, { compact: true })).toBe('Ð1,000,000.00B');
    expect(formatNumber(2e21)).toBe('2,000,000,000,000,000,000,000');
  });
});
