import { describe, it, expect } from 'vitest';
import { formatMoneyCents, formatPercentPlain, signedParts, spokenMoney } from './signedText';

const DOUBLOONS = { symbol: 'Ð', name: 'Doubloons' };

describe('formatMoneyCents', () => {
  it('formats integer cents with grouping and two decimals', () => {
    expect(formatMoneyCents(123456, DOUBLOONS)).toBe('Ð1,234.56');
    expect(formatMoneyCents(-2200, DOUBLOONS)).toBe('−Ð22.00');
    expect(formatMoneyCents(0, DOUBLOONS)).toBe('Ð0.00');
  });
  it('adds a plus sign only when asked', () => {
    expect(formatMoneyCents(190, DOUBLOONS, { signed: true })).toBe('+Ð1.90');
    expect(formatMoneyCents(0, DOUBLOONS, { signed: true })).toBe('Ð0.00');
  });
});

describe('spokenMoney', () => {
  it('spells the currency so VoiceOver never reads the symbol', () => {
    expect(spokenMoney(8412, DOUBLOONS)).toBe('84.12 doubloons');
    expect(spokenMoney(25_236_000, DOUBLOONS)).toBe('252,360.00 doubloons');
    expect(spokenMoney(-150, DOUBLOONS)).toBe('minus 1.50 doubloons');
  });
});

describe('formatPercentPlain', () => {
  it('writes an unsigned percentage', () => {
    expect(formatPercentPlain(0.2327, 1)).toBe('23.3%');
    expect(formatPercentPlain(0.0842)).toBe('8.42%');
  });
});

describe('signedParts', () => {
  it('money: sign, true minus, direction and spoken text', () => {
    expect(signedParts(190, 'money', { currency: DOUBLOONS })).toEqual({
      direction: 'up',
      text: '+Ð1.90',
      spoken: 'up 1.90 doubloons',
    });
    expect(signedParts(-693_000, 'money', { currency: DOUBLOONS })).toEqual({
      direction: 'down',
      text: '−Ð6,930.00',
      spoken: 'down 6,930.00 doubloons',
    });
    expect(signedParts(0, 'money', { currency: DOUBLOONS })).toEqual({
      direction: 'flat',
      text: 'Ð0.00',
      spoken: 'unchanged, 0.00 doubloons',
    });
  });

  it('money: sub-cent noise is flat', () => {
    expect(signedParts(0.4, 'money', { currency: DOUBLOONS }).direction).toBe('flat');
  });

  it('pct: matches the shared change text', () => {
    expect(signedParts(0.0231, 'pct')).toEqual({ direction: 'up', text: '+2.31%', spoken: 'up 2.31 percent' });
    expect(signedParts(-0.0053, 'pct')).toEqual({ direction: 'down', text: '−0.53%', spoken: 'down 0.53 percent' });
    expect(signedParts(0.00004, 'pct').direction).toBe('flat');
  });

  it('number: index points with a chosen precision', () => {
    expect(signedParts(8.71, 'number')).toEqual({ direction: 'up', text: '+8.71', spoken: 'up 8.71' });
    expect(signedParts(-3.5, 'number', { digits: 1 })).toEqual({ direction: 'down', text: '−3.5', spoken: 'down 3.5' });
  });
});
