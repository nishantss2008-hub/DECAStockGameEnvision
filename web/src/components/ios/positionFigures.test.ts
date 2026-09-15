import { describe, it, expect } from 'vitest';
import { cashAvailableText, derivePositionFigures, positionSummaryCells } from './positionFigures';

// BRIEF §7 KRKN position: 3,000 shares, paid Ð73.50, price Ð84.12, session open Ð82.22,
// account value Ð1,084,219.55.
describe('derivePositionFigures', () => {
  it('computes the six PositionSummary numbers in integer cents', () => {
    const f = derivePositionFigures({ shares: 3000, avgCost: 7350 }, { price: 8412, sessionOpen: 8222 }, 108_421_955)!;
    expect(f.shares).toBe(3000);
    expect(f.avgCost).toBe(7350);
    expect(f.value).toBe(25_236_000);
    expect(f.costBasis).toBe(22_050_000);
    expect(f.totalGain).toBe(3_186_000);
    expect(f.totalGainFraction!).toBeCloseTo(0.1444898, 6);
    expect(f.sessionChange).toBe(570_000);
    expect(f.shareOfAccount!).toBeCloseTo(0.23276, 5);
  });

  it('returns null when nothing is owned', () => {
    expect(derivePositionFigures({ shares: 0, avgCost: 7350 }, { price: 8412, sessionOpen: 8222 }, 1)).toBeNull();
    expect(derivePositionFigures(null, { price: 8412, sessionOpen: 8222 }, 1)).toBeNull();
  });

  it('leaves percentages empty when their denominator is zero', () => {
    const f = derivePositionFigures({ shares: 10, avgCost: 0 }, { price: 100, sessionOpen: 100 }, 0)!;
    expect(f.totalGainFraction).toBeNull();
    expect(f.shareOfAccount).toBeNull();
  });
});

describe('positionSummaryCells', () => {
  const DOUBLOONS = { symbol: 'Ð', name: 'Doubloons' };
  const krkn = derivePositionFigures({ shares: 3000, avgCost: 7350 }, { price: 8412, sessionOpen: 8222 }, 108_421_955)!;

  it('lists the six cells in reading order with MOBILE §5.15 labels and glossary ids', () => {
    const cells = positionSummaryCells(krkn, DOUBLOONS);
    expect(cells.map((c) => c.label)).toEqual([
      'Shares owned',
      'Current value',
      'Avg. price paid',
      'Total gain/loss',
      'Session change',
      'Share of account',
    ]);
    expect(cells.map((c) => c.termId)).toEqual(['stock', 'invested', 'avgCost', 'totalGain', 'sessionChange', 'pctOfAccount']);
  });

  it('formats plain values for the eye and for VoiceOver', () => {
    const [shares, value, avg, , , pct] = positionSummaryCells(krkn, DOUBLOONS);
    expect(shares).toMatchObject({ kind: 'plain', text: '3,000', spoken: '3,000 shares' });
    expect(value).toMatchObject({ kind: 'plain', text: 'Ð252,360.00', spoken: '252,360.00 doubloons' });
    expect(avg).toMatchObject({ kind: 'plain', text: 'Ð73.50', spoken: '73.50 doubloons' });
    expect(pct).toMatchObject({ kind: 'plain', text: '23.3%', spoken: '23.3 percent' });
  });

  it('marks gain cells as signed money with the companion percent', () => {
    const cells = positionSummaryCells(krkn, DOUBLOONS);
    expect(cells[3]).toMatchObject({ kind: 'signed', value: 3_186_000 });
    expect((cells[3] as { pct: number }).pct).toBeCloseTo(0.1444898, 6);
    expect(cells[4]).toMatchObject({ kind: 'signed', value: 570_000, pct: null });
  });

  it('shows a dash when a percentage has no denominator', () => {
    const f = derivePositionFigures({ shares: 10, avgCost: 0 }, { price: 100, sessionOpen: 100 }, 0)!;
    const cells = positionSummaryCells(f, DOUBLOONS);
    expect(cells[5]).toMatchObject({ text: '—', spoken: 'not available' });
    expect(cells[3]).toMatchObject({ kind: 'signed', pct: null });
    expect(positionSummaryCells({ ...f, shares: 1 }, DOUBLOONS)[0]).toMatchObject({ text: '1', spoken: '1 share' });
  });
});

describe('cashAvailableText', () => {
  it('writes the card footer (COPY §1.3 portfolio.cashAvailable)', () => {
    expect(cashAvailableText(24_834_955, { symbol: 'Ð', name: 'Doubloons' })).toEqual({
      label: 'Cash available to trade',
      text: 'Ð248,349.55',
      spoken: '248,349.55 doubloons',
    });
  });
});
