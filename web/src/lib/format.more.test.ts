import { describe, it, expect } from 'vitest';
import {
  classNames,
  direction,
  formatClock,
  formatCompact,
  formatIndex,
  formatMoney,
  formatMoneySpoken,
  formatNumber,
  formatPct,
  formatPctSpoken,
  formatTickTime,
  MINUS,
} from './format';

describe('formatMoney (more)', () => {
  it('uses a true minus sign for unsigned negatives and no sign for zero', () => {
    expect(MINUS).toBe('−');
    expect(formatMoney(-2200)).toBe('−Ð22.00');
    expect(formatMoney(0, { signed: true })).toBe('Ð0.00');
    expect(formatMoney(-0.4, { signed: true })).toBe('Ð0.00');
  });
  it('accepts a renamed currency symbol', () => {
    expect(formatMoney(8412, { symbol: '$' })).toBe('$84.12');
    expect(formatMoney(8412, { symbol: '' })).toBe('84.12');
  });
  it('compact follows COPY moneyCompact (B from 100 million, M from 100 thousand, K from 1,000)', () => {
    expect(formatMoney(96_000_000_000, { compact: true })).toBe('Ð0.96B');
    expect(formatMoney(2_035_704_000_000, { compact: true })).toBe('Ð20.36B');
    expect(formatMoney(52_000_000_000, { compact: true })).toBe('Ð0.52B');
    expect(formatMoney(25_000_000, { compact: true })).toBe('Ð0.25M');
    expect(formatMoney(420_000, { compact: true })).toBe('Ð4.20K');
    expect(formatMoney(99_900, { compact: true })).toBe('Ð999.00');
    expect(formatMoney(-15_000_000_000, { compact: true })).toBe('−Ð0.15B');
    expect(formatMoney(-15_000_000_000, { compact: true, signed: true })).toBe('−Ð0.15B');
    expect(formatMoney(15_000_000_000, { compact: true, signed: true })).toBe('+Ð0.15B');
  });
  it('treats non-finite input as zero instead of printing NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('Ð0.00');
  });
});

describe('formatPct (more)', () => {
  it('defaults to unsigned with a true minus and honours digits', () => {
    expect(formatPct(0.14)).toBe('14.00%');
    expect(formatPct(-0.031, { digits: 1 })).toBe('−3.1%');
    expect(formatPct(0.1445, { signed: true, digits: 1 })).toBe('+14.5%');
  });
  it('never prints a signed zero after rounding', () => {
    expect(formatPct(-0.00001, { signed: true })).toBe('0.00%');
    expect(formatPct(0.00001, { signed: true })).toBe('0.00%');
  });
});

describe('numbers', () => {
  it('formatNumber groups thousands', () => {
    expect(formatNumber(1_613_333)).toBe('1,613,333');
    expect(formatNumber(1.5, 2)).toBe('1.50');
    expect(formatNumber(-3000)).toBe('−3,000');
  });
  it('formatCompact uses one decimal and units', () => {
    expect(formatCompact(184_200)).toBe('184.2K');
    expect(formatCompact(4_670_000_000)).toBe('4.7B');
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(-2_500_000)).toBe('−2.5M');
  });
  it('formatIndex has two decimals and grouping', () => {
    expect(formatIndex(1048.618)).toBe('1,048.62');
  });
});

describe('time', () => {
  it('formatClock pads and never goes negative', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(-5000)).toBe('00:00:00');
    expect(formatClock(59_999)).toBe('00:00:59');
    expect(formatClock(3_600_000)).toBe('01:00:00');
  });
  it('formatTickTime prints 24-hour local time', () => {
    const d = new Date(2026, 8, 14, 14, 2, 30);
    expect(formatTickTime(d.getTime())).toBe('14:02:30');
    expect(formatTickTime(new Date(2026, 8, 14, 9, 5, 7).getTime())).toBe('09:05:07');
  });
});

describe('spoken forms for accessible names', () => {
  it('spells the currency and the direction', () => {
    expect(formatMoneySpoken(8412)).toBe('84.12 doubloons');
    expect(formatMoneySpoken(-2200)).toBe('minus 22.00 doubloons');
    expect(formatMoneySpoken(25_236_000, { currencyName: 'Coins' })).toBe('252,360.00 coins');
    expect(formatPctSpoken(0.0231)).toBe('up 2.31 percent');
    expect(formatPctSpoken(-0.0346)).toBe('down 3.46 percent');
    expect(formatPctSpoken(0)).toBe('unchanged');
  });
});

describe('helpers', () => {
  it('direction treats non-finite as flat', () => {
    expect(direction(Number.NaN)).toBe('flat');
  });
  it('classNames joins strings and truthy record keys', () => {
    expect(classNames('a', false, null, undefined, { b: true, c: false }, 'd')).toBe('a b d');
  });
});
