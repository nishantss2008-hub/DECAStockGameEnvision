import { describe, it, expect } from 'vitest';
import { splitLastWord } from './labelText';

describe('splitLastWord', () => {
  it('splits a label before its last word so the "?" can stay glued to that word', () => {
    expect(splitLastWord('Debt vs. owner equity (debt-to-equity)')).toEqual(['Debt vs. owner equity ', '(debt-to-equity)']);
    expect(splitLastWord('Fee (0.10%)')).toEqual(['Fee ', '(0.10%)']);
  });

  it('keeps one-word labels whole and trims trailing spaces', () => {
    expect(splitLastWord('Tick')).toEqual(['', 'Tick']);
    expect(splitLastWord('Share price  ')).toEqual(['Share ', 'price']);
    expect(splitLastWord('')).toEqual(['', '']);
  });
});
