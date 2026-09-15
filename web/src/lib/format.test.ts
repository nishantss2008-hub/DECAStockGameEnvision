import { describe, it, expect } from 'vitest';
import { formatMoney, formatPct, formatCompact, formatClock, direction } from './format';
describe('format', () => {
  it('money with true minus and sign', () => {
    expect(formatMoney(123456)).toBe('Ð1,234.56');
    expect(formatMoney(-2200, { signed: true })).toBe('−Ð22.00');
    expect(formatMoney(190, { signed: true })).toBe('+Ð1.90');
    expect(formatMoney(467_000_000_000, { compact: true })).toBe('Ð4.67B');
  });
  it('percent', () => { expect(formatPct(0.0231, { signed: true })).toBe('+2.31%'); expect(formatPct(-0.0053, { signed: true })).toBe('−0.53%'); expect(formatPct(0, { signed: true })).toBe('0.00%'); });
  it('compact numbers and clock', () => { expect(formatCompact(242_000_000)).toBe('242.0M'); expect(formatClock(148_628_000)).toBe('41:17:08'); });
  it('direction', () => { expect(direction(1)).toBe('up'); expect(direction(-1)).toBe('down'); expect(direction(0)).toBe('flat'); });
});
