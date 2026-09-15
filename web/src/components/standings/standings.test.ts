import { describe, it, expect } from 'vitest';
import type { LeaderboardEntry } from '@deca/shared';
import { placeSummary, resultsPageFromSearch, resultsSeenKey, shouldAutoOpenResults, sortStandings, podiumEntries, standingRowSpoken } from './standings';

const e = (teamId: string, rank: number, totalValue: number, over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  teamId,
  name: teamId === 'sw' ? 'Saltwind Traders' : `Crew ${teamId}`,
  totalValue,
  rank,
  prevRank: rank,
  returnPct: totalValue / 1_000_000_00 - 1,
  sessionChangePct: 0,
  cashPct: 0.3,
  holdings: 4,
  spark: [],
  ...over,
});

const board = [
  e('qa', 1, 112_080_410, { sessionChangePct: 0.0094 }),
  e('tc', 2, 109_770_000, { sessionChangePct: 0.014 }),
  e('sw', 3, 108_421_955, { sessionChangePct: 0.0079 }),
  e('kk', 4, 97_941_075, { sessionChangePct: 0.0033 }),
];

describe('sortStandings', () => {
  it('keeps rank order for total return and re-sorts by session change for this session', () => {
    expect(sortStandings([...board].reverse(), 'total').map((x) => x.teamId)).toEqual(['qa', 'tc', 'sw', 'kk']);
    expect(sortStandings(board, 'session').map((x) => x.teamId)).toEqual(['tc', 'qa', 'sw', 'kk']);
  });
});

describe('placeSummary', () => {
  it('says your place and the gap to the crew just above', () => {
    expect(placeSummary(board, 'sw', 'Ð')).toEqual({ rank: 3, count: 4, title: "You're 3rd of 4", gap: 'Ð13,480.45 behind Crew tc' });
  });
  it('says the lead over second place when first', () => {
    expect(placeSummary(board, 'qa', 'Ð')!.gap).toBe("You're in the lead by Ð23,104.10");
  });
  it('has no gap line alone and no summary for a crew not in the standings', () => {
    expect(placeSummary([board[0]!], 'qa', 'Ð')!.gap).toBeNull();
    expect(placeSummary(board, 'nobody', 'Ð')).toBeNull();
  });
});

describe('standingRowSpoken', () => {
  it('reads rank, crew, you, value, change and movement in one label', () => {
    const row = { ...board[2]!, prevRank: 2 };
    expect(standingRowSpoken(row, { you: true, view: 'total', symbol: 'Ð' })).toBe(
      'Rank 3, Saltwind Traders, You, Ð1,084,219.55, up 8.42% since the game began, down 1 place',
    );
    expect(standingRowSpoken(board[1]!, { you: false, view: 'session', symbol: 'Ð' })).toBe(
      'Rank 2, Crew tc, Ð1,097,700.00, up 1.40% this session, no change',
    );
  });
});

describe('podiumEntries', () => {
  it('takes the top 3 by rank with initials and value text', () => {
    const p = podiumEntries(board, 'Ð');
    expect(p.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(p[2]).toMatchObject({ id: 'sw', initials: 'ST', valueText: 'Ð1,084,219.55' });
  });
});

describe('results paging and first view', () => {
  it('reads ?page=n clamped to 1–5', () => {
    expect(resultsPageFromSearch('')).toBe(1);
    expect(resultsPageFromSearch('?page=3')).toBe(3);
    expect(resultsPageFromSearch('?page=9')).toBe(5);
    expect(resultsPageFromSearch('?page=abc')).toBe(1);
  });
  it('opens the results once per game after the game ends, never over a sheet or the results', () => {
    const key = resultsSeenKey(1234);
    expect(key).toBe('bx.resultsSeen.1234');
    expect(shouldAutoOpenResults({ phase: 'ended', seen: false, pathname: '/portfolio', sheetOpen: false })).toBe(true);
    expect(shouldAutoOpenResults({ phase: 'ended', seen: true, pathname: '/portfolio', sheetOpen: false })).toBe(false);
    expect(shouldAutoOpenResults({ phase: 'live', seen: false, pathname: '/portfolio', sheetOpen: false })).toBe(false);
    expect(shouldAutoOpenResults({ phase: 'ended', seen: false, pathname: '/standings/results', sheetOpen: false })).toBe(false);
    expect(shouldAutoOpenResults({ phase: 'ended', seen: false, pathname: '/portfolio', sheetOpen: true })).toBe(false);
  });
});
