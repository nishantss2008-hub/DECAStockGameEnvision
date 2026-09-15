import { describe, it, expect } from 'vitest';
import { SECTORS } from '@deca/shared';
import { crestLetters, crestFill, crestMetrics, CREST_CREW_FILL } from './crestStyle';

describe('crestLetters', () => {
  it('uses the first two letters of a ticker', () => {
    expect(crestLetters({ ticker: 'KRKN' })).toBe('KR');
    expect(crestLetters({ ticker: 'brth' })).toBe('BR');
  });

  it('uses host-set crew initials, at most two characters', () => {
    expect(crestLetters({ initials: 'sw' })).toBe('SW');
    expect(crestLetters({ initials: ' abc ' })).toBe('AB');
  });

  it('prefers initials over a ticker and returns an empty string when neither exists', () => {
    expect(crestLetters({ initials: 'SW', ticker: 'KRKN' })).toBe('SW');
    expect(crestLetters({})).toBe('');
  });
});

describe('crestFill', () => {
  it('has a BRIEF §2 fill for every sector', () => {
    for (const sector of SECTORS) expect(crestFill(sector), sector).toMatch(/^#[0-9A-F]{6}$/);
    expect(crestFill('Shipping & Salvage')).toBe('#2F6F68');
    expect(crestFill('Naval Arms')).toBe('#7A3328');
  });

  it('uses the hull fill for crews and unknown sectors', () => {
    expect(crestFill(undefined)).toBe(CREST_CREW_FILL);
    expect(CREST_CREW_FILL).toBe('#232A26');
  });
});

describe('crestMetrics', () => {
  it('scales type and ring with the diameter', () => {
    expect(crestMetrics(36)).toEqual({ fontSize: 12.96, ring: 1.62 });
    expect(crestMetrics(28)).toEqual({ fontSize: 10.08, ring: 1.5 });
    expect(crestMetrics(64)).toEqual({ fontSize: 23.04, ring: 2.88 });
  });
});
