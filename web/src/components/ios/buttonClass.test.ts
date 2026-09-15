import { describe, it, expect } from 'vitest';
import { buttonStyle } from './buttonClass';

describe('buttonStyle', () => {
  it('maps the MOBILE §5.7 styles', () => {
    expect(buttonStyle('filled', 'default')).toBe('prominent');
    expect(buttonStyle('filled', 'buy')).toBe('buy');
    expect(buttonStyle('filled', 'sell')).toBe('sell');
    expect(buttonStyle('tinted', 'default')).toBe('tinted');
    expect(buttonStyle('tinted', 'sell')).toBe('tinted-sell');
    expect(buttonStyle('tinted', 'destructive')).toBe('destructive-tinted');
    expect(buttonStyle('gray', 'default')).toBe('gray');
    expect(buttonStyle('plain', 'default')).toBe('plain');
    expect(buttonStyle('plain', 'destructive')).toBe('destructive-plain');
    expect(buttonStyle('glass', 'default')).toBe('glass');
  });

  it('never makes destructive the prominent style', () => {
    expect(buttonStyle('filled', 'destructive')).toBe('destructive-tinted');
  });

  it('keeps buy and sell colour on tinted and plain buttons without inventing styles', () => {
    expect(buttonStyle('tinted', 'buy')).toBe('tinted');
    expect(buttonStyle('plain', 'sell')).toBe('plain');
    expect(buttonStyle('gray', 'destructive')).toBe('gray');
    expect(buttonStyle('glass', 'buy')).toBe('glass');
  });
});
