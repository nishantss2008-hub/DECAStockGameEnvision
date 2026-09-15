import { describe, expect, it } from 'vitest';
import type { GameState } from '@deca/shared';
import { shellBanner, shouldShowSailsUp, statusLine, statusSheetModel, staleAgo } from './marketStatus';

const HOUR = 3_600_000;
const NOW = new Date(2026, 8, 14, 14, 2, 40).getTime();

function game(over: Partial<GameState> = {}): GameState {
  return {
    phase: 'live',
    gameLengthMs: 48 * HOUR,
    startingCapital: 100_000_000,
    feeBps: 10,
    researchEdge: 'normal',
    maxPositionPct: 0.5,
    currency: { name: 'doubloons', symbol: 'Ð' },
    startAt: NOW - 10 * HOUR,
    endAt: NOW + (37 * HOUR + 17 * 60_000 + 42_000),
    pausedAt: null,
    endedAt: null,
    currentTick: 1284,
    tickIntervalMs: 30_000,
    totalTicks: 5760,
    sessionTicks: 720,
    serverTime: NOW,
    lastTickAt: new Date(2026, 8, 14, 14, 2, 30).getTime(),
    marketCreatedAt: 0,
    ...over,
  } as GameState;
}

describe('statusLine', () => {
  it('live: pill · time left · session', () => {
    expect(statusLine(game(), NOW)).toEqual({ tone: 'open', text: 'Market open · 37:17:42 left · Session 2 of 8', collapsed: 'Open · 37:17:42' });
  });
  it('final session uses its own pill', () => {
    expect(statusLine(game({ currentTick: 5100 }), NOW).text).toBe('Final session · 37:17:42 left · Session 8 of 8');
  });
  it('paused, lobby, ended, loading', () => {
    expect(statusLine(game({ phase: 'paused', pausedAt: NOW }), NOW)).toMatchObject({ tone: 'paused', text: 'Trading paused · Clock stopped while paused' });
    expect(statusLine(game({ phase: 'lobby', endAt: null }), NOW)).toMatchObject({ tone: 'idle', text: 'In the lobby · 48:00:00 left' });
    expect(statusLine(game({ phase: 'ended' }), NOW)).toMatchObject({ tone: 'idle', text: 'Game ended' });
    expect(statusLine(null, NOW)).toMatchObject({ tone: 'idle', text: 'Loading…' });
  });
});

describe('shellBanner', () => {
  const base = { online: true, tradingDisabled: false, now: NOW };
  it('no banner while live and healthy', () => {
    expect(shellBanner({ ...base, game: game() })).toBeNull();
  });
  it('offline beats everything', () => {
    expect(shellBanner({ ...base, online: false, game: game({ phase: 'paused' }) })).toMatchObject({ tone: 'offline', title: "You're offline" });
  });
  it('phase banners with COPY text', () => {
    expect(shellBanner({ ...base, game: game({ phase: 'paused', pausedAt: NOW }) })).toEqual({
      tone: 'paused',
      title: 'Trading paused',
      flavor: 'Becalmed',
      body: "The host paused the market at tick 1,284. You can preview orders, but you can't place them until trading resumes.",
    });
    expect(shellBanner({ ...base, game: game({ phase: 'lobby' }) })).toMatchObject({ tone: 'lobby', title: 'Market not open yet' });
    expect(shellBanner({ ...base, game: game({ phase: 'ended' }) })).toMatchObject({ tone: 'ended', title: 'Game ended' });
  });
  it('trading turned off for the crew', () => {
    expect(shellBanner({ ...base, tradingDisabled: true, game: game() })).toMatchObject({ tone: 'tradingDisabled', title: 'Trading turned off for your crew' });
  });
  it('stale prices when the last tick is well overdue', () => {
    const stale = shellBanner({ ...base, game: game({ lastTickAt: NOW - 150_000 }) });
    expect(stale).toMatchObject({ tone: 'stale', title: 'Prices may be out of date', action: 'reload' });
    expect(stale?.body).toBe('The last price update was 2 minutes ago. Wait a moment, or tap Reload.');
  });
  it('staleAgo', () => {
    expect(staleAgo(45_000)).toBe('45 seconds');
    expect(staleAgo(61_000)).toBe('1 minute');
    expect(staleAgo(3 * 60_000 + 5_000)).toBe('3 minutes');
  });
});

describe('statusSheetModel', () => {
  it('matches MOBILE §7.9', () => {
    const m = statusSheetModel(game(), NOW);
    expect(m.title).toBe('Market open');
    expect(m.flavor).toBe('Sails up');
    expect(m.timeLeft).toBe('37:17:42 left');
    expect(m.session).toBe(2);
    expect(m.sessionLine).toBe('Session 2 of 8 · ends in 01:17:42');
    expect(m.tickLine).toBe('Tick 1,284 of 5,760 · 22.3% · as of 14:02:30');
    expect(m.body).toBe('Trading is open. Prices update every 30 seconds.');
  });
  it('paused sheet', () => {
    const m = statusSheetModel(game({ phase: 'paused', pausedAt: NOW }), NOW);
    expect(m.title).toBe('Trading paused');
    expect(m.timeLeft).toBe('Clock stopped while paused');
    expect(m.sessionLine).toBe('Session 2 of 8');
  });
});

describe('shouldShowSailsUp', () => {
  const ok = { prevPhase: 'lobby', phase: 'live', reducedMotion: false, sheetOpen: false, fieldFocused: false } as const;
  it('only when the phase changes to live while the app is open', () => {
    expect(shouldShowSailsUp(ok)).toBe(true);
    expect(shouldShowSailsUp({ ...ok, prevPhase: 'paused' })).toBe(true);
    expect(shouldShowSailsUp({ ...ok, prevPhase: undefined })).toBe(false);
    expect(shouldShowSailsUp({ ...ok, prevPhase: 'live' })).toBe(false);
    expect(shouldShowSailsUp({ ...ok, phase: 'ended' })).toBe(false);
  });
  it('skipped under reduced motion, over sheets and focused fields', () => {
    expect(shouldShowSailsUp({ ...ok, reducedMotion: true })).toBe(false);
    expect(shouldShowSailsUp({ ...ok, sheetOpen: true })).toBe(false);
    expect(shouldShowSailsUp({ ...ok, fieldFocused: true })).toBe(false);
  });
});
