import { describe, it, expect } from 'vitest';
import type { GameState, Team, Trade } from '@deca/shared';
import { ApiRequestError } from '../../lib/api';
import {
  agoText,
  derivedText,
  feePctText,
  filterCrews,
  filterTape,
  headlineAnnouncement,
  heartbeat,
  heartbeatLine,
  hostError,
  hostStatusText,
  limitLabel,
  magnitudeLabel,
  parseFeeBps,
  parseMoneyInput,
  previewPrice,
  publishLabel,
  crewFormProblem,
  returnPct,
  qualityScore,
  signedShares,
  tickProgress,
} from './adminFormat';

describe('heartbeat edge cases', () => {
  it('is idle when the game is not live or has not ticked', () => {
    expect(heartbeat({ phase: 'paused', tickIntervalMs: 30_000, lastTickAt: 1 } as GameState, 10)).toEqual({ tone: 'idle', label: 'Engine idle' });
    expect(heartbeat({ phase: 'lobby', tickIntervalMs: 30_000, lastTickAt: null } as GameState, 10).label).toBe('Engine idle');
  });
  it('labels each tone with COPY §11 words and treats the exact boundary as the better tone', () => {
    const g = { phase: 'live', tickIntervalMs: 10_000, lastTickAt: 0 } as GameState;
    expect(heartbeat(g, 20_000)).toEqual({ tone: 'ok', label: 'Engine healthy' });
    expect(heartbeat(g, 60_000)).toEqual({ tone: 'warn', label: 'Engine running slow' });
    expect(heartbeat(g, 60_001)).toEqual({ tone: 'bad', label: 'Engine not responding' });
  });
  it('live with no tick yet is healthy (the first tick is on its way)', () => {
    expect(heartbeat({ phase: 'live', tickIntervalMs: 5_000, lastTickAt: null } as GameState, 99).tone).toBe('ok');
  });
});

describe('text helpers', () => {
  it('magnitude rounds half away from zero and shows 0% unsigned', () => {
    expect(magnitudeLabel(0)).toBe('0%');
    expect(magnitudeLabel(0.5)).toBe('+50%');
    expect(magnitudeLabel(-0.005)).toBe('−1%');
  });
  it('tick progress line', () => {
    expect(tickProgress(1_284, 5_760)).toEqual({ fraction: 1_284 / 5_760, text: 'Tick 1,284 of 5,760 · 22.3% complete' });
    expect(tickProgress(0, 0).fraction).toBe(0);
    expect(tickProgress(900, 720).fraction).toBe(1);
  });
  it('ago text', () => {
    expect(agoText(3_400)).toBe('3s ago');
    expect(agoText(-50)).toBe('0s ago');
    expect(agoText(125_000)).toBe('2m ago');
    expect(agoText(7_300_000)).toBe('2h ago');
  });
  it('heartbeat line', () => {
    expect(heartbeatLine({ tone: 'ok', label: 'Engine healthy' }, 3_000, 0)).toBe('Engine healthy · last tick 3s ago · 0 ticks behind');
    expect(heartbeatLine({ tone: 'warn', label: 'Engine running slow' }, 90_000, 1)).toBe('Engine running slow · last tick 1m ago · 1 tick behind');
    expect(heartbeatLine({ tone: 'idle', label: 'Engine idle' }, null, 0)).toBe('Engine idle');
  });
  it('host status line', () => {
    expect(hostStatusText('live')).toBe('LIVE · Market open · Sails up');
    expect(hostStatusText('paused')).toBe('PAUSED · Trading paused · Becalmed');
    expect(hostStatusText('lobby')).toBe('LOBBY · In the lobby · Anchored in port');
    expect(hostStatusText('ended')).toBe('ENDED · Game ended · Anchors dropped');
  });
  it('settings values', () => {
    expect(derivedText(172_800_000)).toBe('48-hour game · updates every 30 seconds · 5,760 ticks');
    expect(derivedText(3_600_000)).toBe('1-hour game · updates every 5 seconds · 720 ticks');
    expect(feePctText(10)).toBe('0.10%');
    expect(feePctText(0)).toBe('0.00%');
    expect(limitLabel(1)).toBe('Off');
    expect(limitLabel(0.35)).toBe('35%');
    expect(publishLabel(1_284)).toBe('Publish at tick 1,285');
  });
  it('parses money and fee entries within the server limits', () => {
    expect(parseMoneyInput('1,000,000')).toBe(100_000_000);
    expect(parseMoneyInput(' Ð250000.5 ')).toBe(25_000_050);
    expect(parseMoneyInput('999')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('1.234')).toBeNull();
    expect(parseFeeBps('10')).toBe(10);
    expect(parseFeeBps('200')).toBe(200);
    expect(parseFeeBps('201')).toBeNull();
    expect(parseFeeBps('2.5')).toBeNull();
    expect(parseFeeBps('')).toBeNull();
  });
  it('previews a news move on a price', () => {
    expect(previewPrice(8_412, 0.08)).toBe(9_085);
    expect(previewPrice(1_824, 0.08)).toBe(1_970);
    expect(previewPrice(100, -0.5)).toBe(50);
  });
  it('announces the headline counter only at 80 and 90', () => {
    expect(headlineAnnouncement(79, 90)).toBeNull();
    expect(headlineAnnouncement(80, 90)).toBe('80 of 90 characters');
    expect(headlineAnnouncement(90, 90)).toBe('90 of 90 characters');
  });
  it('return on starting cash', () => {
    expect(returnPct(112_000_000, 100_000_000)).toBeCloseTo(0.12);
    expect(returnPct(5, 0)).toBe(0);
  });
});

describe('market figures', () => {
  it('turns q (−1…1) into a 0–100 quality score', () => {
    expect(qualityScore(0.56)).toBe(78);
    expect(qualityScore(-1)).toBe(0);
    expect(qualityScore(1)).toBe(100);
    expect(qualityScore(Number.NaN)).toBe(0);
  });
  it('signs net order flow in shares', () => {
    expect(signedShares(1200)).toBe('+1,200');
    expect(signedShares(-40)).toBe('−40');
    expect(signedShares(0)).toBe('0');
  });
});

describe('host errors (COPY §11.1)', () => {
  it('maps known codes to title and message', () => {
    const e = new ApiRequestError(409, { error: 'exists', message: 'server words' }, 'x');
    expect(hostError(e).title).toBe('Name already taken');
    expect(hostError(e).message).toMatch(/^A crew with this name already exists/);
  });
  it('keeps the server message for engine codes and falls back to internal', () => {
    const e = new ApiRequestError(409, { error: 'not_lobby', message: 'Locked while the game is running. You can change settings only in the lobby.' }, 'x');
    expect(hostError(e)).toEqual({ title: 'Locked while the game is running. You can change settings only in the lobby.', message: undefined });
    expect(hostError(new Error('')).title).toBe('Something went wrong');
    expect(hostError(new ApiRequestError(0, { error: 'network', message: 'Network request failed' }, 'x')).title).toBe("You're offline");
  });
});

describe('crew form and lists', () => {
  it('validates the add-crew form like the server', () => {
    expect(crewFormProblem('  ', 'pass')).toBe('name');
    expect(crewFormProblem('admin', 'pass')).toBe('name');
    expect(crewFormProblem('!!!', 'pass')).toBe('name');
    expect(crewFormProblem('Black Pearl', 'abc')).toBe('password');
    expect(crewFormProblem('Black Pearl', 'abcd')).toBeNull();
  });
  const teams = [
    { id: 'a', name: "Queen Anne's Revenue", totalValue: 2 },
    { id: 'b', name: 'Black Pearl Traders', totalValue: 3 },
  ] as Team[];
  it('filters crews ignoring capitals and punctuation', () => {
    expect(filterCrews(teams, 'queen annes').map((t) => t.id)).toEqual(['a']);
    expect(filterCrews(teams, '').map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('filters the tape by crew and company', () => {
    const trades = [
      { id: '1', teamId: 'a', companyId: 'k' },
      { id: '2', teamId: 'b', companyId: 'k' },
      { id: '3', teamId: 'a', companyId: 's' },
    ] as Trade[];
    expect(filterTape(trades, { teamId: 'a' }).map((t) => t.id)).toEqual(['1', '3']);
    expect(filterTape(trades, { teamId: 'a', companyId: 'k' }).map((t) => t.id)).toEqual(['1']);
    expect(filterTape(trades, {}).length).toBe(3);
  });
});
