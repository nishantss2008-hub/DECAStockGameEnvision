import { describe, it, expect } from 'vitest';
import type { GameSettings, Trade } from '@deca/shared';
import {
  auditActionLabel,
  auditDetails,
  controlActions,
  fireNewsProblem,
  HEADLINE_MAX,
  HOST_METRIC_TERMS,
  hostTermEntry,
  settingsSummary,
  sizeSegmentValue,
  stepMagnitude,
  tapeLine,
  trackPrimaryLabel,
} from './hostLogic';

const settings: GameSettings = {
  gameLengthMs: 172_800_000,
  startingCapital: 100_000_000,
  feeBps: 10,
  researchEdge: 'normal',
  maxPositionPct: 0.5,
  currency: { name: 'Doubloons', symbol: 'Ð' },
};

describe('control actions per phase (MOBILE §7.17)', () => {
  it('lobby starts, live pauses or ends, paused resumes or ends, ended offers a new game', () => {
    expect(controlActions('lobby')).toEqual({ primary: 'start', secondary: null });
    expect(controlActions('live')).toEqual({ primary: 'pause', secondary: 'end' });
    expect(controlActions('paused')).toEqual({ primary: 'resume', secondary: 'end' });
    expect(controlActions('ended')).toEqual({ primary: 'newGame', secondary: null });
  });
  it('labels the primary button with the phone words', () => {
    expect(trackPrimaryLabel('pause')).toBe('Pause trading');
    expect(trackPrimaryLabel('resume')).toBe('Resume trading');
    expect(trackPrimaryLabel('start')).toBe('Start game');
    expect(trackPrimaryLabel('newGame')).toBe('New game…');
  });
});

describe('fire news form', () => {
  it('snaps to the size segments and steps by 1% within ±50%', () => {
    expect(sizeSegmentValue(0.25)).toBe('0.25');
    expect(sizeSegmentValue(-0.5)).toBe('-0.5');
    expect(sizeSegmentValue(0)).toBe('0');
    expect(sizeSegmentValue(0.08)).toBeNull();
    expect(stepMagnitude(0.07, 1)).toBe(0.08);
    expect(stepMagnitude(0.5, 1)).toBe(0.5);
    expect(stepMagnitude(-0.5, -1)).toBe(-0.5);
    expect(stepMagnitude(0.01, -1)).toBe(0);
  });
  it('names the first problem, in form order', () => {
    const ok = { phase: 'live' as const, companyIds: ['krkn'], magnitude: 0.08, headline: 'Kraken wins the convoy contract' };
    expect(fireNewsProblem(ok)).toBeNull();
    expect(fireNewsProblem({ ...ok, phase: 'lobby' })).toBe('phase');
    expect(fireNewsProblem({ ...ok, companyIds: [] })).toBe('companies');
    expect(fireNewsProblem({ ...ok, magnitude: 0 })).toBe('zero');
    expect(fireNewsProblem({ ...ok, headline: '   ' })).toBe('headline');
    expect(fireNewsProblem({ ...ok, headline: 'x'.repeat(HEADLINE_MAX + 1) })).toBe('headline');
    expect(HEADLINE_MAX).toBe(90);
  });
});

describe('settings summary (COPY §11)', () => {
  it('lists every setting with a plain value and a glossary term where one exists', () => {
    const rows = settingsSummary(settings);
    expect(rows.map((r) => [r.id, r.label, r.value])).toEqual([
      ['gameLength', 'Game length', '48 hours'],
      ['startingCash', 'Starting cash', 'Ð1,000,000.00'],
      ['tradingFee', 'Trading fee', '0.10%'],
      ['researchEdge', 'Research edge', 'Normal'],
      ['positionLimit', 'Position limit', '50%'],
      ['currency', 'Currency', 'Doubloons (Ð)'],
    ]);
    expect(rows.find((r) => r.id === 'tradingFee')?.termId).toBe('fee');
    expect(rows.find((r) => r.id === 'positionLimit')?.termId).toBe('positionLimit');
  });
});

describe('explanations for every host metric', () => {
  it('resolves each metric term to a glossary or host entry with all three lines', () => {
    for (const id of HOST_METRIC_TERMS) {
      const entry = hostTermEntry(id);
      expect(entry, id).not.toBeNull();
      expect(entry!.whatItIs.length).toBeGreaterThan(10);
      expect(entry!.whyItMatters.length).toBeGreaterThan(10);
      expect(entry!.usuallyGoodWhen.length).toBeGreaterThan(5);
    }
    expect(hostTermEntry('nope')).toBeNull();
  });
});

describe('audit and tape text', () => {
  it('labels audit actions and details in plain words', () => {
    expect(auditActionLabel('game.start')).toBe('Game started');
    expect(auditActionLabel('team.remove')).toBe('Crew removed');
    expect(auditActionLabel('custom.thing')).toBe('custom.thing');
    const names = { t1: 'Black Pearl' };
    expect(auditDetails({ action: 'team.trading', payload: { teamId: 't1', enabled: false } }, names)).toBe('Black Pearl · Trading off');
    expect(auditDetails({ action: 'game.pause', payload: { tick: 1284 } }, names)).toBe('Tick 1,284');
    expect(auditDetails({ action: 'news.queue', payload: { headline: 'Storm', magnitude: -0.04 } }, names)).toBe('−4% · Storm');
    expect(auditDetails({ action: 'game.new', payload: { keepCrews: true } }, names)).toBe('Crews kept');
  });
  it('writes a tape row as Bought/Sold with quantity and symbol', () => {
    const t = { side: 'buy', quantity: 1200, price: 5703, fee: 684 } as Trade;
    expect(tapeLine(t, 'LVTH')).toEqual({ action: 'Bought', text: 'Bought 1,200 LVTH', amount: 6_843_600 });
    expect(tapeLine({ ...t, side: 'sell' }, 'LVTH').action).toBe('Sold');
  });
});

describe('crew initials', () => {
  it('takes the first letters of the first two words, else the first two letters', async () => {
    const { crewInitials } = await import('./hostLogic');
    expect(crewInitials('Black Pearl Traders')).toBe('BP');
    expect(crewInitials("Queen Anne's Revenue")).toBe('QA');
    expect(crewInitials('krakens')).toBe('KR');
    expect(crewInitials('  ')).toBe('');
  });
});
