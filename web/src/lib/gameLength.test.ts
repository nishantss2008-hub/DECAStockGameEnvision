import { describe, it, expect } from 'vitest';
import { GAME_LENGTH_OPTIONS_MS } from '@deca/shared';
import { lengthLabel, lengthPhrase } from './gameLength';

describe('game length wording (10–30 minute games)', () => {
  it('labels every length the host can pick in minutes', () => {
    expect(GAME_LENGTH_OPTIONS_MS.map(lengthLabel)).toEqual(['10 minutes', '15 minutes', '20 minutes', '30 minutes']);
  });

  it('never says "0.2 hours" for a sub-hour game', () => {
    for (const ms of GAME_LENGTH_OPTIONS_MS) expect(lengthLabel(ms)).not.toMatch(/hour/);
  });

  it('still labels hour-long lengths for older games', () => {
    expect(lengthLabel(3_600_000)).toBe('1 hour');
    expect(lengthLabel(172_800_000)).toBe('48 hours');
  });

  it('gives an adjective phrase for the derived line', () => {
    expect(lengthPhrase(600_000)).toBe('10-minute');
    expect(lengthPhrase(1_800_000)).toBe('30-minute');
    expect(lengthPhrase(3_600_000)).toBe('1-hour');
    expect(lengthPhrase(172_800_000)).toBe('48-hour');
  });

  it('keeps a singular minute singular', () => {
    expect(lengthLabel(60_000)).toBe('1 minute');
    expect(lengthPhrase(60_000)).toBe('1-minute');
  });
});
