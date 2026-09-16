import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FEE_BPS,
  DEFAULT_GAME_LENGTH_MS,
  DEFAULT_MAX_POSITION_PCT,
  DEFAULT_STARTING_CAPITAL,
  GAME_LENGTH_OPTIONS_MS,
  deriveClock,
} from '@deca/shared';
import {
  compositeValue,
  sampleSpark,
  revealLabel,
  researchGrade,
  indexQuote,
  advanceSnapshot,
  marketBreadth,
  crossedSession,
  newsDocId,
  normalizeSettings,
  mergeSettings,
  lobbyState,
  normalizeState,
  buildReveal,
  rankEntries,
  putSeriesValue,
  seriesRows,
  seriesFromValues,
  engineMessages,
  sessionStartRank,
  type Snapshot,
} from '../src/engine/loopHelpers';

describe('loop helpers', () => {
  it('composite is cap-weighted and 1000 at start', () => {
    const ids = ['a', 'b']; const starts = { a: 100, b: 1000 }; const shares = { a: 10, b: 1 };
    expect(compositeValue(starts, starts, shares, ids)).toBe(1000);
    expect(compositeValue({ a: 200, b: 1000 }, starts, shares, ids)).toBe(1500);
  });
  it('spark keeps endpoints and length', () => {
    const s = sampleSpark(Array.from({ length: 1000 }, (_, i) => i));
    expect(s).toHaveLength(40); expect(s[0]).toBe(0); expect(s[39]).toBe(999);
    expect(sampleSpark([5, 6])).toEqual([5, 6]);
  });
  it('labels and grades', () => {
    expect(revealLabel(0.5, 0.1)).toBe('compounder'); expect(revealLabel(0.5, -0.1)).toBe('unlucky_gem');
    expect(revealLabel(-0.5, 0.1)).toBe('lucky_turnaround'); expect(revealLabel(-0.5, -0.1)).toBe('decliner');
    expect(researchGrade(0.7)).toBe('A'); expect(researchGrade(0)).toBe('C'); expect(researchGrade(-0.9)).toBe('F');
  });
});

describe('loop helpers: composite and index edge cases', () => {
  it('composite rounds to 2 dp, ignores unknown ids and is 1000 with no weight', () => {
    const starts = { a: 300, b: 700 }; const shares = { a: 1, b: 1 };
    expect(compositeValue({ a: 301, b: 700 }, starts, shares, ['a', 'b'])).toBe(1001);
    expect(compositeValue({ a: 333, b: 700 }, starts, shares, ['a', 'b', 'zz'])).toBe(1033);
    expect(compositeValue({ a: 1 }, starts, shares, ['a'])).toBe(3.33);
    expect(compositeValue({}, {}, {}, [])).toBe(1000);
  });
  it('research grade thresholds are inclusive at the boundaries', () => {
    expect(researchGrade(0.6)).toBe('A'); expect(researchGrade(0.5999)).toBe('B');
    expect(researchGrade(0.2)).toBe('B'); expect(researchGrade(-0.2)).toBe('C');
    expect(researchGrade(-0.6)).toBe('D'); expect(researchGrade(-0.6001)).toBe('F');
  });
  it('labels treat q = 0 and luck = 0 as the non-negative side', () => {
    expect(revealLabel(0, 0)).toBe('compounder');
    expect(revealLabel(-0.01, 0)).toBe('lucky_turnaround');
  });
  it('spark with fewer points than asked is a copy; empty stays empty', () => {
    const src = [1, 2, 3];
    const out = sampleSpark(src, 40);
    expect(out).toEqual([1, 2, 3]); expect(out).not.toBe(src);
    expect(sampleSpark([])).toEqual([]);
    expect(sampleSpark(Array.from({ length: 100 }, (_, i) => i), 5)).toEqual([0, 25, 50, 74, 99]);
  });
  it('index quote is measured from 1000 and from the session open', () => {
    const iq = indexQuote(1100, 1050);
    expect(iq).toMatchObject({ value: 1100, open: 1000, sessionOpen: 1050 });
    expect(iq.change).toBeCloseTo(0.1, 12); expect(iq.sessionChange).toBeCloseTo(1100 / 1050 - 1, 12);
    expect(indexQuote(1000, 0).sessionChange).toBe(0);
  });
});

function snap(price: number, extra: Partial<Snapshot> = {}): Snapshot {
  return {
    currentPrice: price, startPrice: price, sessionOpen: price, sessionHigh: price, sessionLow: price, sessionVolume: 0,
    voyageHigh: price, voyageLow: price, sessionChange: 0, voyageChange: 0, marketCap: price * 10, sharesOutstanding: 10, lastTick: 0,
    ...extra,
  };
}

describe('loop helpers: company snapshot', () => {
  it('tracks session and voyage high/low, volume and changes', () => {
    const s = snap(1000);
    advanceSnapshot(s, 1, 1100, 5, 90);
    advanceSnapshot(s, 2, 950, 7, 90);
    expect(s).toMatchObject({ currentPrice: 950, sessionOpen: 1000, sessionHigh: 1100, sessionLow: 950, sessionVolume: 12, voyageHigh: 1100, voyageLow: 950, lastTick: 2, marketCap: 9500 });
    expect(s.sessionChange).toBeCloseTo(-0.05, 12); expect(s.voyageChange).toBeCloseTo(-0.05, 12);
  });
  it('resets the session at t % sessionTicks === 0 but keeps voyage extremes', () => {
    const s = snap(1000);
    advanceSnapshot(s, 89, 1200, 9, 90);
    advanceSnapshot(s, 90, 1150, 4, 90);
    expect(s).toMatchObject({ sessionOpen: 1150, sessionHigh: 1150, sessionLow: 1150, sessionVolume: 0, sessionChange: 0, voyageHigh: 1200 });
    expect(s.voyageChange).toBeCloseTo(0.15, 12);
    advanceSnapshot(s, 91, 1161, 3, 90);
    expect(s.sessionVolume).toBe(3);
  });
  it('breadth counts signs, touched voyage extremes and session volume', () => {
    const up = snap(1000); advanceSnapshot(up, 1, 1100, 10, 90);
    const down = snap(1000); advanceSnapshot(down, 1, 900, 4, 90);
    const flat = snap(1000); advanceSnapshot(flat, 1, 1000, 1, 90);
    const retraced = snap(1000); advanceSnapshot(retraced, 1, 1200, 0, 90); advanceSnapshot(retraced, 2, 1100, 0, 90);
    expect(marketBreadth([up, down, flat, retraced])).toEqual({
      advancers: 2, decliners: 1, unchanged: 1, voyageHighs: 1, voyageLows: 1, sessionVolume: 15, advancingVolume: 10, decliningVolume: 4,
    });
  });
});

describe('loop helpers: tick bookkeeping and value series', () => {
  it('detects session boundary crossings, including catch-up', () => {
    expect(crossedSession(undefined, 90, 90)).toBe(true);
    expect(crossedSession(undefined, 91, 90)).toBe(false);
    expect(crossedSession(85, 95, 90)).toBe(true);
    expect(crossedSession(90, 95, 90)).toBe(false);
    expect(crossedSession(95, 95, 90)).toBe(false);
  });
  it('crew value series fills gaps, starts at the chunk start and turns into rows', () => {
    let s = putSeriesValue(undefined, 125, 5000);
    expect(s.start).toBe(120); expect(s.values).toEqual([5000, 5000, 5000, 5000, 5000, 5000]);
    s = putSeriesValue(s, 128, 5100);
    expect(s.values.slice(-3)).toEqual([5000, 5000, 5100]);
    // Rows are clamped to what the series covers: nothing before its start, nothing after its end.
    expect(seriesRows(s, 126, 128)).toEqual([{ tick: 126, value: 5000 }, { tick: 127, value: 5000 }, { tick: 128, value: 5100 }]);
    expect(seriesRows(s, 0, 1_000)).toHaveLength(9);
    expect(seriesRows(s, 200, 300)).toEqual([]);
    s = putSeriesValue(s, 126, 4000);
    expect(s.start + s.values.length - 1).toBe(126);
  });
  it('a stored crew_history series round-trips through seriesFromValues', () => {
    expect(seriesFromValues([])).toBeUndefined();
    const s = seriesFromValues([10, 20, 30])!;
    expect(s).toEqual({ start: 0, values: [10, 20, 30] });
    expect(seriesRows(s, 0, 2)).toEqual([{ tick: 0, value: 10 }, { tick: 1, value: 20 }, { tick: 2, value: 30 }]);
    expect(seriesFromValues([5, 6], 120)).toEqual({ start: 120, values: [5, 6] });
  });
  it('news ids are stable per source, tick, first company and sequence', () => {
    expect(newsDocId('scheduled', 12, 'kraken', 0)).toBe('scheduled-12-kraken-0');
    expect(newsDocId('macro', 400, undefined, 2)).toBe('macro-400-market-2');
  });
});

describe('loop helpers: settings and state', () => {
  it('normalizes missing settings to the defaults, including the position limit', () => {
    expect(normalizeSettings(undefined)).toEqual({
      gameLengthMs: DEFAULT_GAME_LENGTH_MS, startingCapital: DEFAULT_STARTING_CAPITAL, feeBps: DEFAULT_FEE_BPS,
      researchEdge: 'normal', maxPositionPct: DEFAULT_MAX_POSITION_PCT, currency: { name: 'Doubloons', symbol: 'Ð' },
    });
    expect(normalizeSettings({ gameLengthMs: 123, maxPositionPct: 0.25 }).gameLengthMs).toBe(DEFAULT_GAME_LENGTH_MS);
    const shortest = GAME_LENGTH_OPTIONS_MS[0]!;
    expect(normalizeSettings({ gameLengthMs: shortest, maxPositionPct: 0.25 })).toMatchObject({ gameLengthMs: shortest, maxPositionPct: 0.25 });
  });
  it('merges a settings input field by field, including currency parts', () => {
    const base = normalizeSettings(undefined);
    const out = mergeSettings(base, { startingCapital: 50_000_000, maxPositionPct: 1, currencySymbol: '$' });
    expect(out).toMatchObject({ startingCapital: 50_000_000, maxPositionPct: 1, feeBps: DEFAULT_FEE_BPS, currency: { name: 'Doubloons', symbol: '$' } });
    expect(base.currency.symbol).toBe('Ð');
  });
  it('lobby state carries the derived clock', () => {
    const len = GAME_LENGTH_OPTIONS_MS[0]!;
    const { tickIntervalMs, totalTicks, sessionTicks } = deriveClock(len);
    const st = lobbyState(normalizeSettings({ gameLengthMs: len }), 42);
    expect(st).toMatchObject({ phase: 'lobby', startAt: null, endAt: null, pausedAt: null, endedAt: null, currentTick: 0, tickIntervalMs, totalTicks, sessionTicks, serverTime: 42, lastTickAt: null, marketCreatedAt: 42, maxPositionPct: DEFAULT_MAX_POSITION_PCT });
  });
  it('normalizeState keeps persisted fields and rederives the clock from the length', () => {
    const len = GAME_LENGTH_OPTIONS_MS.at(-1)!;
    const { tickIntervalMs, totalTicks, sessionTicks } = deriveClock(len);
    const st = normalizeState({ phase: 'live', startAt: 10, endAt: 20, currentTick: 7, gameLengthMs: len, lastTickAt: 15, marketCreatedAt: 3 }, 99);
    expect(st).toMatchObject({ phase: 'live', startAt: 10, endAt: 20, currentTick: 7, tickIntervalMs, totalTicks, sessionTicks, lastTickAt: 15, marketCreatedAt: 3, maxPositionPct: DEFAULT_MAX_POSITION_PCT });
    expect(normalizeState(undefined, 5)).toMatchObject({ phase: 'lobby', marketCreatedAt: 0, serverTime: 5 });
  });
});

describe('loop helpers: reveal and standings', () => {
  it('reveal uses the closing mark and the expected return passed in', () => {
    const r = buildReveal({ quality: 0.9, q: 0.6, qEff: 0.5, surprise: 0.2, grade: 'A', pillars: { prof: 1, grow: 0, safe: 0.5, val: -0.2 }, v: Math.log(1234.4), closePrice: 1500, startPrice: 1000, expectedReturn: 0.21 });
    expect(r.fairValue).toBe(1234);
    expect(r.actualReturn).toBeCloseTo(Math.log(1.5), 12);
    expect(r.luck).toBeCloseTo(Math.log(1.5) - 0.21, 12);
    expect(r).toMatchObject({ quality: 0.9, q: 0.6, qEff: 0.5, surprise: 0.2, grade: 'A', expectedReturn: 0.21, label: 'compounder' });
  });
  it('ranks by value, carries previous ranks and computes percentages as fractions', () => {
    const rows = [
      { teamId: 'a', name: 'Alpha', totalValue: 900, cash: 900, holdingsCount: 0, sessionOpenValue: 1000, series: [1000, 900] },
      { teamId: 'b', name: 'Bravo', totalValue: 1200, cash: 300, holdingsCount: 2, sessionOpenValue: 1000, series: [1000, 1200] },
      { teamId: 'c', name: 'Charlie', totalValue: 900, cash: 0, holdingsCount: 1, sessionOpenValue: 0, series: [] },
    ];
    const e = rankEntries(rows, { a: 1, b: 3 }, 1000);
    expect(e.map((x) => [x.teamId, x.rank, x.prevRank])).toEqual([['b', 1, 3], ['a', 2, 1], ['c', 3, 3]]);
    expect(e[0]).toMatchObject({ name: 'Bravo', totalValue: 1200, cashPct: 0.25, holdings: 2, spark: [1000, 1200] });
    expect(e[0]!.returnPct).toBeCloseTo(0.2, 12); expect(e[0]!.sessionChangePct).toBeCloseTo(0.2, 12);
    expect(e[1]!.returnPct).toBeCloseTo(-0.1, 12);
    expect(e[2]).toMatchObject({ sessionChangePct: 0, cashPct: 0, spark: [900] });
  });
  it('movement is measured from the rank at the start of the session: a new session or a crew with no stored start uses its current rank', () => {
    expect(sessionStartRank(3, 1, false)).toBe(3); // same session: the stored start rank stays, so the arrow persists
    expect(sessionStartRank(3, 1, true)).toBe(1); // a session just opened: movement restarts from here
    expect(sessionStartRank(undefined, 2, false)).toBe(2); // first standings for this crew
    expect(sessionStartRank(0, 2, false)).toBe(2); // 0 = not set (new crew, new game)
    expect(sessionStartRank(Number.NaN, 4, false)).toBe(4);
    expect(sessionStartRank(1.5, 4, false)).toBe(4);
  });
});

describe('loop helpers: engine messages', () => {
  it('uses the COPY.md wording for engine errors', () => {
    expect(engineMessages.marketClosed('lobby')).toBe('Trading opens when the host starts the game. You can research companies and preview orders now.');
    expect(engineMessages.marketClosed('paused')).toBe('The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.');
    expect(engineMessages.marketClosed('ended')).toBe("The game has ended, so trading is closed. See how every crew finished and what drove each company's price.");
    expect(engineMessages.unknownCompany).toBe("We couldn't find a company with that symbol. Pick one from the search list, like KRKN.");
    expect(engineMessages.intervalLimit({ cap: 1_613_333, used: 0, ticker: 'KRKN', seconds: 30 })).toBe('You can trade up to 1,613,333 shares of KRKN per price update. Lower the shares, or place the rest after the next update in about 30 seconds.');
    // COPY §9 interval_limit.messageOneSecond: "about 1 second", never "about 1 seconds".
    expect(engineMessages.intervalLimit({ cap: 1_613_333, used: 0, ticker: 'KRKN', seconds: 1 })).toBe('You can trade up to 1,613,333 shares of KRKN per price update. Lower the shares, or place the rest after the next update in about 1 second.');
    expect(engineMessages.intervalLimit({ cap: 1_613_333, used: 0, ticker: 'KRKN', seconds: 2 })).toMatch(/in about 2 seconds\.$/);
    expect(engineMessages.intervalLimit({ cap: 1_613_333, used: 13_333, ticker: 'KRKN', seconds: 30 })).toBe('You already traded 13,333 shares of KRKN in this price update. You can trade 1,600,000 more now, or the rest after the next update.');
    expect(engineMessages.notLobby).toBe('Locked while the game is running. You can change settings only in the lobby.');
  });
});
