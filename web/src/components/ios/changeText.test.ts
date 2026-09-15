import { describe, it, expect } from 'vitest';
import { changeParts } from './changeText';

describe('changeParts', () => {
  it('formats a gain with plus sign, direction and spoken words', () => {
    expect(changeParts(0.0231)).toEqual({ direction: 'up', text: '+2.31%', spoken: 'up 2.31 percent' });
  });

  it('formats a loss with a true minus sign (U+2212)', () => {
    const p = changeParts(-0.0346);
    expect(p.direction).toBe('down');
    expect(p.text).toBe('−3.46%');
    expect(p.spoken).toBe('down 3.46 percent');
  });

  it('shows 0.00% with no sign when the rounded value is zero', () => {
    expect(changeParts(0)).toEqual({ direction: 'flat', text: '0.00%', spoken: 'unchanged, 0.00 percent' });
    expect(changeParts(0.00004)).toMatchObject({ direction: 'flat', text: '0.00%' });
    expect(changeParts(-0.00004)).toMatchObject({ direction: 'flat', text: '0.00%' });
  });

  it('rounds half up at two decimals', () => {
    expect(changeParts(0.14445).text).toBe('+14.45%');
    expect(changeParts(-0.00005).text).toBe('−0.01%');
  });

  it('adds thousands separators and honours digits', () => {
    expect(changeParts(12.3456).text).toBe('+1,234.56%');
    expect(changeParts(0.0231, 1).text).toBe('+2.3%');
  });

  it('treats non-finite values as flat', () => {
    expect(changeParts(Number.NaN).direction).toBe('flat');
  });
});
