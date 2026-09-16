/**
 * The projector scoreboard's model (MOBILE §7.19): what a room reads from across it.
 *
 * Every rule here exists because a projector cannot be scrolled, tapped or asked a question:
 * the board has to fit, the phase has to be said out loud, and a dead stream has to admit it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FinalEntry, GameState, Leaderboard, LeaderboardEntry, MarketSummary, NewsEvent } from '@deca/shared';
import type { InstrumentQuote } from '@deca/shared';
import {
  BOARD_HEIGHT,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  ROW_HEIGHT_FIT_MIN,
  ROW_HEIGHT_MAX,
  ROW_HEIGHT_MIN,
  availableBoardHeight,
  bigClock,
  buildProjector,
  designScale,
  fitBoard,
  pickMovers,
} from './projector';
import { PROJECTOR } from './projectorCopy';

const START = 1_700_000_000_000;

const game = (over: Partial<GameState> = {}): GameState => ({
  gameLengthMs: 1_800_000,
  startingCapital: 25_000_000,
  feeBps: 10,
  researchEdge: 'normal',
  maxPositionPct: 0.5,
  currency: { name: 'Doubloons', symbol: 'Ð' },
  phase: 'live',
  startAt: START,
  endAt: START + 1_800_000,
  pausedAt: null,
  endedAt: null,
  currentTick: 86,
  tickIntervalMs: 5_000,
  totalTicks: 360,
  sessionTicks: 45,
  serverTime: START,
  lastTickAt: START,
  marketCreatedAt: START - 60_000,
  ...over,
});

const entry = (rank: number, name: string, over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  teamId: `crew-${rank}`,
  name,
  totalValue: 28_000_000 - rank * 500_000,
  rank,
  prevRank: rank,
  returnPct: 0.12 - rank * 0.02,
  sessionChangePct: 0.0094,
  cashPct: 0.208,
  holdings: 7,
  spark: [],
  ...over,
});

const board = (entries: LeaderboardEntry[], final?: FinalEntry[]): Leaderboard => ({
  updatedAt: START,
  tick: 86,
  entries,
  ...(final ? { final: { endedAt: START + 1_800_000, entries: final } } : {}),
});

const market: MarketSummary = {
  lastTick: 86,
  updatedAt: START,
  composite: { value: 1048.62, open: 1000, sessionOpen: 1039.91, change: 0.0486, sessionChange: 0.0084 },
  sectors: {},
  breadth: { advancers: 9, decliners: 5, unchanged: 1, voyageHighs: 2, voyageLows: 1, sessionVolume: 184_200, advancingVolume: 120_000, decliningVolume: 64_200 },
};

const dispatch = (over: Partial<NewsEvent> = {}): NewsEvent => ({
  id: 'n-1',
  headline: 'Cannonbright Foundries posts blowout quarterly doubloons',
  body: 'Earnings beat forecasts.',
  companyIds: ['cannonbright'],
  type: 'earnings',
  sentiment: 'bullish',
  source: 'scheduled',
  tick: 85,
  firedAt: START - 60_000,
  priceAtFire: {},
  ...over,
});

const three = [entry(2, 'Tortuga Capital'), entry(1, "Queen Anne's Revenue"), entry(3, 'Saltwind Traders')];

const input = (over: Partial<Parameters<typeof buildProjector>[0]> = {}) => ({
  game: game(),
  leaderboard: board(three),
  market,
  news: [dispatch()],
  now: START + 430_000,
  stale: false,
  ready: true,
  ...over,
});

describe('bigClock', () => {
  it.each([
    [1_370_000, '22:50'],
    [0, '00:00'],
    [3_900_000, '1:05:00'],
    [148_628_000, '41:17:08'],
  ])('%i ms → %s', (ms, expected) => {
    expect(bigClock(ms)).toBe(expected);
  });
});

describe('designScale is the JS twin of the stylesheet', () => {
  it('fits the 16:9 frame inside the viewport, letterboxing rather than cropping', () => {
    expect(designScale(1920, 1080)).toBe(1);
    expect(designScale(1280, 720)).toBeCloseTo(2 / 3, 6);
    expect(designScale(1920, 1200)).toBe(1);
    expect(designScale(1024, 768)).toBeCloseTo(1024 / 1920, 6);
  });

  it('is the same formula projector.css writes into --px', () => {
    const css = readFileSync(fileURLToPath(new URL('./projector.css', import.meta.url)), 'utf8');
    expect(css).toContain(`min(${(100 / FRAME_WIDTH).toFixed(7)}vw, ${(100 / FRAME_HEIGHT).toFixed(7)}vh)`);
  });
});

/**
 * Ground truth: the height of `.bx-proj__stage` in design pixels, read out of a headless Chrome
 * render of the projector markup at both projector sizes. The budget in `availableBoardHeight` has
 * to land on these numbers, because every pixel it over-reserves is a crew that a room cannot see
 * itself in. Re-measure these if the header, the band or the alert changes shape.
 */
const MEASURED_STAGE = [
  { state: 'live', opts: { band: false, winner: false, alert: false, session: true }, at1920: 779, at1280: 778 },
  { state: 'live, stream down', opts: { band: false, winner: false, alert: true, session: true }, at1920: 688, at1280: 686 },
  { state: 'ended, stream down', opts: { band: true, winner: true, alert: true, session: false }, at1920: 511, at1280: 511 },
  { state: 'ended', opts: { band: true, winner: true, alert: false, session: false }, at1920: 602, at1280: 603 },
  { state: 'paused', opts: { band: true, winner: false, alert: false, session: true }, at1920: 641, at1280: 641 },
] as const;

describe('the board uses the height it actually has', () => {
  it.each(MEASURED_STAGE)('$state: the budget leaves under one row unused, at 1920×1080 and 1280×720', ({ opts, at1920, at1280 }) => {
    const budget = availableBoardHeight(opts);
    for (const measured of [at1920, at1280]) {
      // Never promise more room than there is (rows would be clipped)…
      expect(budget).toBeLessThanOrEqual(measured);
      // …and never leave a whole row of black under the last crew.
      expect(measured - budget).toBeLessThan(ROW_HEIGHT_MIN);
    }
  });

  it('leaves under one row of black under the last crew, at 1920×1080 and 1280×720', () => {
    for (const { opts, at1920, at1280 } of MEASURED_STAGE) {
      for (const measured of [at1920, at1280]) {
        // The height the page measures for itself is the one the board is actually packed into.
        const fit = fitBoard(24, measured);
        expect(measured - fit.shown * fit.rowHeight).toBeLessThan(fit.rowHeight);
        expect(fit.overflow).toBe(true);
        // The written budget is the first-frame fallback: never more, and never a row short of it.
        const budgeted = fitBoard(24, availableBoardHeight(opts));
        expect(budgeted.shown).toBeLessThanOrEqual(fit.shown);
        expect(fit.shown - budgeted.shown).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is the height of the plain running board', () => {
    expect(availableBoardHeight({ band: false, winner: false, alert: false, session: true })).toBe(BOARD_HEIGHT);
  });
});

describe('fitBoard: fit every crew if it can be done legibly, else big rows and a top N', () => {
  /** Every board the screen can actually have, at both projector sizes. */
  const HEIGHTS = MEASURED_STAGE.flatMap(({ state, at1920, at1280 }) => [
    { state: `${state} @1920×1080`, height: at1920 },
    { state: `${state} @1280×720`, height: at1280 },
  ]);

  it('gives a small field the tallest rows, not the whole column', () => {
    const fit = fitBoard(4);
    expect(fit).toEqual({ shown: 4, total: 4, rowHeight: ROW_HEIGHT_MAX, overflow: false });
  });

  it('shows a whole class period — 14 crews on a running board — with no footer', () => {
    for (const height of [779, 778]) {
      const fit = fitBoard(14, height);
      expect(fit.shown, `${height}`).toBe(14);
      expect(fit.overflow).toBe(false);
      expect(fit.rowHeight).toBeGreaterThanOrEqual(ROW_HEIGHT_FIT_MIN);
      expect(fit.rowHeight).toBeLessThan(ROW_HEIGHT_MIN);
    }
  });

  it.each(HEIGHTS)('$state: fits everyone down to the squeeze floor', ({ height }) => {
    const mostThatFit = Math.floor(height / ROW_HEIGHT_FIT_MIN);
    const fit = fitBoard(mostThatFit, height);
    expect(fit.shown).toBe(mostThatFit);
    expect(fit.overflow).toBe(false);
    expect(fit.rowHeight).toBeGreaterThanOrEqual(ROW_HEIGHT_FIT_MIN);
    expect(fit.rowHeight * fit.shown).toBeLessThanOrEqual(height);
  });

  it.each(HEIGHTS)('$state: one crew past it, rows go back up to the big floor and the footer appears', ({ height }) => {
    const tooMany = Math.floor(height / ROW_HEIGHT_FIT_MIN) + 1;
    const fit = fitBoard(tooMany, height);
    expect(fit.rowHeight).toBe(ROW_HEIGHT_MIN);
    expect(fit.shown).toBe(Math.floor(height / ROW_HEIGHT_MIN));
    expect(fit.shown).toBeLessThan(tooMany);
    expect(fit.overflow).toBe(true);
    expect(fit.total).toBe(tooMany);
  });

  it.each(HEIGHTS)('$state: the boundary picks one branch and stays there', ({ height }) => {
    const edge = Math.floor(height / ROW_HEIGHT_FIT_MIN);
    // Same inputs, same answer: nothing here can flip between renders.
    expect(fitBoard(edge, height)).toEqual(fitBoard(edge, height));
    // And crossing it is one-way: a bigger field never puts more crews on the wall.
    let previous = Infinity;
    for (let crews = 2; crews <= edge + 6; crews += 1) {
      const fit = fitBoard(crews, height);
      expect(fit.shown).toBeLessThanOrEqual(crews);
      expect(fit.shown).toBeLessThanOrEqual(previous === Infinity ? crews : Math.max(previous, fit.shown));
      expect(fit.overflow).toBe(fit.shown < crews);
      previous = fit.shown;
    }
  });

  it('never goes below the big floor, however large the field', () => {
    const fit = fitBoard(30);
    expect(fit.rowHeight).toBe(ROW_HEIGHT_MIN);
    expect(fit.shown).toBe(Math.floor(BOARD_HEIGHT / ROW_HEIGHT_MIN));
    expect(fit.overflow).toBe(true);
    expect(fit.total).toBe(30);
  });

  it('handles an empty and a nonsense field without dividing by zero', () => {
    expect(fitBoard(0).shown).toBe(0);
    expect(fitBoard(-3).overflow).toBe(false);
    expect(Number.isFinite(fitBoard(0).rowHeight)).toBe(true);
  });
});

describe('buildProjector: the standings', () => {
  it('lists crews in rank order with value and total return', () => {
    const model = buildProjector(input());
    expect(model.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(model.rows.map((r) => r.name)).toEqual(["Queen Anne's Revenue", 'Tortuga Capital', 'Saltwind Traders']);
    expect(model.rows[0]!.value).toBe('Ð275,000.00');
    expect(model.rows[0]!.change).toBe('+10.00%');
    expect(model.rows[0]!.dir).toBe('up');
    expect(model.overflowNote).toBeNull();
  });

  it('marks how far a crew has moved since the session began', () => {
    const model = buildProjector(input({ leaderboard: board([entry(1, 'Risen', { prevRank: 4 }), entry(2, 'Sunk', { prevRank: 1 }), entry(3, 'Still')]) }));
    expect(model.rows.map((r) => r.move)).toEqual([
      { dir: 'up', by: 3 },
      { dir: 'down', by: 1 },
      { dir: 'flat', by: 0 },
    ]);
  });

  it('shows the top N and says how many are off the board when there are too many crews', () => {
    const many = Array.from({ length: 24 }, (_, i) => entry(i + 1, `Crew ${i + 1}`));
    const model = buildProjector(input({ leaderboard: board(many) }));
    expect(model.rows).toHaveLength(model.fit.shown);
    expect(model.fit.shown).toBeLessThan(24);
    expect(model.rows[0]!.rank).toBe(1);
    expect(model.overflowNote).toBe(`Showing the top ${model.fit.shown} of 24 crews`);
  });

  it('puts a whole class period on the wall with no footer, at both projector sizes', () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => entry(i + 1, `Crew ${i + 1}`));
    for (const height of [779, 778]) {
      const model = buildProjector(input({ leaderboard: board(fourteen), boardHeight: height }));
      expect(model.rows).toHaveLength(14);
      expect(model.rows[13]!.name).toBe('Crew 14');
      expect(model.overflowNote).toBeNull();
      expect(model.fit.overflow).toBe(false);
    }
  });

  it('keeps the board on one screen: the bands above it take rows, not scrollbars', () => {
    const many = Array.from({ length: 24 }, (_, i) => entry(i + 1, `Crew ${i + 1}`));
    const running = buildProjector(input({ leaderboard: board(many) }));
    const crowded = buildProjector(input({ leaderboard: board(many), game: game({ phase: 'paused' }), stale: true }));
    expect(crowded.fit.shown).toBeLessThan(running.fit.shown);
    expect(crowded.overflowNote).toBe(`Showing the top ${crowded.fit.shown} of 24 crews`);
  });

  it('says the board is empty rather than drawing nothing', () => {
    const model = buildProjector(input({ leaderboard: board([]) }));
    expect(model.rows).toHaveLength(0);
    expect(model.notice?.title).toBe(PROJECTOR.empty);
  });

  it('waits plainly when no market has been set up yet', () => {
    expect(buildProjector(input({ game: null, leaderboard: null, ready: false })).notice).toEqual(PROJECTOR.waiting);
  });
});

describe('buildProjector: the clock, the composite and the dispatch', () => {
  it('counts the game down and names the session', () => {
    const model = buildProjector(input());
    expect(model.clock).toBe('22:50 left');
    expect(model.session).toBe('Session 2 of 8');
  });

  it('stops the clock when the host pauses, and says so', () => {
    const model = buildProjector(input({ game: game({ phase: 'paused', pausedAt: START + 430_000 }) }));
    expect(model.clock).toBe(PROJECTOR.clock.paused);
    expect(model.phaseNote).toEqual(PROJECTOR.phases.paused);
  });

  it('shows the full clock in the lobby and names the phase large', () => {
    const model = buildProjector(input({ game: game({ phase: 'lobby', startAt: null, endAt: null }) }));
    expect(model.clock).toBe('30:00 on the clock');
    expect(model.phaseNote).toEqual(PROJECTOR.phases.lobby);
  });

  it('says nothing about the phase while the game is simply running', () => {
    expect(buildProjector(input()).phaseNote).toBeNull();
  });

  it('carries the Pirate Composite and its session change', () => {
    const model = buildProjector(input());
    expect(model.composite).toEqual({ label: 'Pirate Composite', value: '1,048.62', change: '+0.84% this session', dir: 'up' });
  });

  it('carries the newest dispatch only, and admits when there is none', () => {
    const older = dispatch({ id: 'n-0', headline: 'Crown lifts tariffs across the Spanish Main', firedAt: START - 180_000 });
    expect(buildProjector(input({ news: [older, dispatch()] })).headline?.text).toBe(dispatch().headline);
    expect(buildProjector(input({ news: [] })).headline).toBeNull();
  });
});

describe('pickMovers: what the room watches besides the leaderboard', () => {
  const quote = (ticker: string, name: string, price: number, sessionChange: number): InstrumentQuote =>
    ({
      id: ticker.toLowerCase(),
      ticker,
      name,
      description: '',
      currentPrice: price,
      startPrice: price,
      sessionOpen: price,
      sessionHigh: price,
      sessionLow: price,
      sessionVolume: 0,
      voyageHigh: price,
      voyageLow: price,
      sessionChange,
      voyageChange: 0,
      adv: 0,
      lastTick: 86,
    }) satisfies InstrumentQuote;

  const roster = [
    quote('CNBR', 'Cannonbright Foundries', 10_266, 0.0612),
    quote('LVTH', 'Leviathan Logistics', 5_703, 0.0449),
    quote('KRKN', 'Kraken Shipping Lines', 8_412, 0.0231),
    quote('ABON', 'Anne Bonny Cartography', 44_619, 0.0),
    quote('CMPS', 'Compass Rose Navigation', 11_205, -0.0066),
    quote('FDUT', 'Flying Dutchman Freight', 9_615, -0.0164),
    quote('GLGD', 'Galleon Goods Co.', 5_890, -0.0072),
  ];

  it('takes the two biggest risers and the two biggest fallers, risers first', () => {
    expect(pickMovers(roster, 'Ð').map((m) => [m.ticker, m.change, m.dir])).toEqual([
      ['CNBR', '+6.12%', 'up'],
      ['LVTH', '+4.49%', 'up'],
      ['FDUT', '−1.64%', 'down'],
      ['GLGD', '−0.72%', 'down'],
    ]);
  });

  it('carries the price and the full name, in the host currency', () => {
    const [first] = pickMovers(roster, '§');
    expect(first).toMatchObject({ ticker: 'CNBR', name: 'Cannonbright Foundries', price: '§102.66' });
  });

  it('shows nothing before anything has moved, rather than ranking a column of zeroes', () => {
    expect(pickMovers(roster.map((q) => ({ ...q, sessionChange: 0 })), 'Ð')).toEqual([]);
    expect(pickMovers([], 'Ð')).toEqual([]);
  });

  it('holds still between ticks: equal changes break on ticker, not on arrival order', () => {
    const tied = [quote('ZZZZ', 'Last', 100, 0.02), quote('AAAA', 'First', 100, 0.02)];
    expect(pickMovers(tied, 'Ð').map((m) => m.ticker)).toEqual(['AAAA', 'ZZZZ']);
  });

  it('shows only the side that moved when the whole market went one way', () => {
    const allUp = roster.filter((q) => q.sessionChange > 0);
    expect(pickMovers(allUp, 'Ð').map((m) => m.dir)).toEqual(['up', 'up']);
  });

  it('reaches the model, so the rail card is fed from the same stream as the board', () => {
    expect(buildProjector(input({ instruments: roster })).movers).toHaveLength(4);
    expect(buildProjector(input()).movers).toEqual([]);
  });

  it('leaves the rail entirely once the game ends: there is no session left to rank', () => {
    const over = buildProjector(input({ instruments: roster, game: game({ phase: 'ended' }) }));
    expect(over.movers).toBeNull();
    expect(over.winner).not.toBeNull();
  });
});

describe('buildProjector: the end of the game', () => {
  const finals: FinalEntry[] = [
    { ...entry(1, "Queen Anne's Revenue"), researchScore: 71, researchGrade: 'B' },
    { ...entry(2, 'Tortuga Capital'), researchScore: 64, researchGrade: 'C' },
  ];

  it('names the winner and reads the final standings', () => {
    const model = buildProjector(input({ game: game({ phase: 'ended', endedAt: START + 1_800_000 }), leaderboard: board(three, finals) }));
    expect(model.winner).toBe("Winner: Queen Anne's Revenue");
    expect(model.rows.map((r) => r.name)).toEqual(["Queen Anne's Revenue", 'Tortuga Capital']);
    expect(model.clock).toBe(PROJECTOR.clock.ended);
    expect(model.session).toBeNull();
    expect(model.phaseNote).toEqual(PROJECTOR.phases.ended);
  });

  it('falls back to the live standings when a final block never arrived', () => {
    const model = buildProjector(input({ game: game({ phase: 'ended' }), leaderboard: board(three) }));
    expect(model.winner).toBe("Winner: Queen Anne's Revenue");
    expect(model.rows).toHaveLength(3);
  });

  it('names no winner before the game ends', () => {
    expect(buildProjector(input()).winner).toBeNull();
  });
});

describe('buildProjector: connection state', () => {
  it('says the numbers may be out of date when the stream drops', () => {
    expect(buildProjector(input({ stale: true })).connection).toEqual(PROJECTOR.connection);
  });

  it('says nothing while the stream is open', () => {
    expect(buildProjector(input()).connection).toBeNull();
  });

  it('keeps the last numbers on screen rather than blanking the board', () => {
    const model = buildProjector(input({ stale: true }));
    expect(model.rows).toHaveLength(3);
    expect(model.composite).not.toBeNull();
  });
});
