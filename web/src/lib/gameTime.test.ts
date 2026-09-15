import { describe, it, expect } from 'vitest';
import type { GameState } from '@deca/shared';
import { ClockSkew, clockFromGame, countdownRemaining, sessionInfo } from './gameTime';

const HOUR = 3_600_000;
const game = (over: Partial<GameState>): GameState =>
  ({
    phase: 'live',
    gameLengthMs: 48 * HOUR,
    tickIntervalMs: 30_000,
    totalTicks: 5760,
    sessionTicks: 720,
    startAt: 1_000_000,
    endAt: 1_000_000 + 48 * HOUR,
    pausedAt: null,
    endedAt: null,
    currentTick: 0,
    serverTime: 1_000_000,
    lastTickAt: null,
    ...over,
  }) as GameState;

describe('clockFromGame', () => {
  it('prefers the server-written cadence and falls back to deriveClock', () => {
    expect(clockFromGame(game({}))).toEqual({ gameLengthMs: 48 * HOUR, tickIntervalMs: 30_000, totalTicks: 5760, sessionTicks: 720, hours: 48 });
    expect(clockFromGame(game({ gameLengthMs: HOUR, tickIntervalMs: 0, totalTicks: 0, sessionTicks: 0 }))).toEqual({
      gameLengthMs: HOUR,
      tickIntervalMs: 5000,
      totalTicks: 720,
      sessionTicks: 90,
      hours: 1,
    });
    expect(clockFromGame(null)).toBeNull();
  });
});

describe('countdownRemaining', () => {
  it('counts down while live, freezes while paused, and is zero when ended', () => {
    const g = game({});
    expect(countdownRemaining(g, 1_000_000 + HOUR)).toBe(47 * HOUR);
    expect(countdownRemaining(g, g.endAt! + 5)).toBe(0);
    expect(countdownRemaining(game({ phase: 'paused', pausedAt: 1_000_000 + 2 * HOUR }), 9e12)).toBe(46 * HOUR);
    expect(countdownRemaining(game({ phase: 'ended' }), 0)).toBe(0);
    expect(countdownRemaining(game({ phase: 'lobby', startAt: null, endAt: null }), 0)).toBe(48 * HOUR);
    expect(countdownRemaining(null, 0)).toBe(0);
  });
});

describe('ClockSkew', () => {
  it('starts at zero and tracks the largest recent server-minus-local sample', () => {
    const skew = new ClockSkew(3);
    expect(skew.offsetMs).toBe(0);
    skew.observe(10_000, 9_000); // server 1s ahead, fresh
    skew.observe(10_000, 12_000); // same serverTime again: ignored
    skew.observe(20_000, 25_000); // stale sample (−5s)
    expect(skew.offsetMs).toBe(1_000);
    skew.observe(30_000, 29_500);
    skew.observe(40_000, 39_500);
    skew.observe(50_000, 49_500); // the +1s sample has aged out of a window of 3
    expect(skew.offsetMs).toBe(500);
    expect(skew.now(100)).toBe(600);
  });
  it('reset forgets every sample', () => {
    const skew = new ClockSkew();
    skew.observe(10_000, 5_000);
    expect(skew.offsetMs).toBe(5_000);
    skew.reset();
    expect(skew.offsetMs).toBe(0);
    skew.observe(10_000, 9_000); // the same serverTime is accepted again after a reset
    expect(skew.offsetMs).toBe(1_000);
  });
  it('ignores absurd samples', () => {
    const skew = new ClockSkew();
    skew.observe(10 * 86_400_000, 0);
    expect(skew.offsetMs).toBe(0);
  });
});

describe('sessionInfo', () => {
  it('reports the 1-based session and whether it is the last', () => {
    expect(sessionInfo(0, 720)).toEqual({ session: 1, sessions: 8, startTick: 0, isFinal: false });
    expect(sessionInfo(5039, 720)).toEqual({ session: 7, sessions: 8, startTick: 4320, isFinal: false });
    expect(sessionInfo(5040, 720)).toEqual({ session: 8, sessions: 8, startTick: 5040, isFinal: true });
    expect(sessionInfo(5760, 720)).toEqual({ session: 8, sessions: 8, startTick: 5040, isFinal: true });
  });
});
