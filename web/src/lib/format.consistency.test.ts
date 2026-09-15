/**
 * One rounding rule app-wide (BRIEF §7: "Percentages round half-up to 2 decimals").
 * lib/format.ts is the single source; the iOS components' text helpers (changeText, signedText)
 * must print exactly the same strings for the same numbers.
 */
import { describe, it, expect } from 'vitest';
import { formatMoney, formatMoneySpoken, formatNumber, formatPct, formatPctSpoken, roundHalfUp } from './format';
import { changeParts } from '../components/ios/changeText';
import { DEFAULT_CURRENCY, formatMoneyCents, formatPercentPlain, spokenMoney } from '../components/ios/signedText';

describe('roundHalfUp', () => {
  it('rounds half away from zero without binary drift', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(-1.005, 2)).toBe(-1.01);
    expect(roundHalfUp(14.445, 2)).toBe(14.45);
    expect(roundHalfUp(-0.5, 0)).toBe(-1);
    expect(roundHalfUp(0.4, 0)).toBe(0);
    expect(roundHalfUp(2.5, 0)).toBe(3);
  });
  it('never returns negative zero and treats non-finite input as zero', () => {
    expect(Object.is(roundHalfUp(-0.004, 2), -0)).toBe(false);
    expect(roundHalfUp(Number.NaN, 2)).toBe(0);
    expect(roundHalfUp(Number.POSITIVE_INFINITY, 2)).toBe(0);
  });
  it('handles numbers that print in exponent form', () => {
    expect(roundHalfUp(1e-9, 2)).toBe(0);
    expect(roundHalfUp(-1e-9, 2)).toBe(0);
    expect(roundHalfUp(2e21, 0)).toBe(2e21);
    expect(formatPct(1e-9, { signed: true })).toBe('0.00%');
  });
});

describe('percent rounding is half-up everywhere', () => {
  it('formatPct rounds half away from zero', () => {
    expect(formatPct(0.01005)).toBe('1.01%');
    expect(formatPct(-0.00005, { signed: true })).toBe('−0.01%');
    expect(formatPct(0.14445, { signed: true })).toBe('+14.45%');
    expect(formatPctSpoken(-0.00005)).toBe('down 0.01 percent');
  });
  it('formatNumber rounds half away from zero', () => {
    expect(formatNumber(-2.5)).toBe('−3');
    expect(formatNumber(1.005, 2)).toBe('1.01');
  });

  const fractions = [0, 0.0231, -0.0346, 0.14445, -0.00005, 0.00004, -0.00004, 0.01005, 12.3456, -0.1824];
  it.each(fractions)('ChangePill text matches formatPct for %s', (f) => {
    expect(changeParts(f).text).toBe(formatPct(f, { signed: true }));
    expect(formatPercentPlain(f)).toBe(formatPct(Math.abs(f)));
  });
});

describe('money text is identical in lib/format and the iOS helpers', () => {
  const cents = [0, 190, -2200, 123456, 8412, -150, 25_236_000, 108_421_955, -693_000];
  it.each(cents)('formats %s cents the same way', (c) => {
    expect(formatMoneyCents(c, DEFAULT_CURRENCY)).toBe(formatMoney(c));
    expect(formatMoneyCents(c, DEFAULT_CURRENCY, { signed: true })).toBe(formatMoney(c, { signed: true }));
    expect(spokenMoney(c, DEFAULT_CURRENCY)).toBe(formatMoneySpoken(c));
  });
  it('honours a renamed currency', () => {
    const coins = { symbol: '¢', name: 'Coins' };
    expect(formatMoneyCents(8412, coins)).toBe(formatMoney(8412, { symbol: '¢' }));
    expect(spokenMoney(8412, coins)).toBe(formatMoneySpoken(8412, { currencyName: 'Coins' }));
  });
});
