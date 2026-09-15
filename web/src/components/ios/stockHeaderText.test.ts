import { describe, it, expect } from 'vitest';
import type { ChartScrubPoint } from '../charts/ChartCard';
import { asOfText, headerScrubFromChart, scrubLineText, stockBarSubtitle, stockPriceSentence } from './stockHeaderText';

const DOUBLOONS = { symbol: 'Ð', name: 'Doubloons' };

describe('stockPriceSentence', () => {
  it('reads the price block as one sentence with the currency spelled out (MOBILE §5.14)', () => {
    expect(stockPriceSentence('Kraken Shipping Lines', 8412, 0.0231, DOUBLOONS)).toBe(
      'Kraken Shipping Lines, 84.12 doubloons, up 2.31 percent this session',
    );
    expect(stockPriceSentence('Cursed Doubloon Trust', 3107, -0.0346, DOUBLOONS)).toBe(
      'Cursed Doubloon Trust, 31.07 doubloons, down 3.46 percent this session',
    );
  });

  it('says unchanged for a flat session', () => {
    expect(stockPriceSentence('Astrolabe Works', 5000, 0, DOUBLOONS)).toBe(
      'Astrolabe Works, 50.00 doubloons, unchanged this session',
    );
  });
});

describe('asOfText and scrubLineText', () => {
  it('groups the tick number', () => {
    expect(asOfText(1284, '14:02:30')).toBe('As of tick 1,284 · 14:02:30');
    expect(scrubLineText('14:01:30', 1282)).toBe('14:01:30 · tick 1,282');
  });
});

describe('stockBarSubtitle', () => {
  it('gives the collapsed bar price and session change without colour words', () => {
    expect(stockBarSubtitle(8412, 0.0231, DOUBLOONS)).toEqual({
      price: 'Ð84.12',
      change: { direction: 'up', text: '+2.31%', spoken: 'up 2.31 percent' },
    });
    expect(stockBarSubtitle(3107, -0.0346, DOUBLOONS).change.text).toBe('−3.46%');
  });
});

describe('headerScrubFromChart', () => {
  it('maps a ChartCard scrub point onto the StockHeader scrub prop (y → price, xText → time, x → tick)', () => {
    const point: ChartScrubPoint = { index: 3, x: 1282, y: 8406, xText: '14:01:30', yText: 'Ð84.06', valueText: '14:01:30, 84.06 doubloons' };
    expect(headerScrubFromChart(point)).toEqual({ price: 8406, timeText: '14:01:30', tick: 1282 });
  });

  it('releases the scrub when the chart reports null', () => {
    expect(headerScrubFromChart(null)).toBeNull();
  });
});
