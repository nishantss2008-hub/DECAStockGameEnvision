/**
 * The projector screen (MOBILE §7.19): the host's scoreboard for the wall.
 *
 * The things a runbook promises and a room depends on: a signed-in host can open it, a crew cannot,
 * the standings read in rank order, a field too big for one screen says how much it left off, the
 * end of the game names a winner, and a dropped stream admits it instead of showing frozen numbers
 * that still look live. Nothing on it can be pressed.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import type { Company, FinalEntry, GameState, Leaderboard, LeaderboardEntry, MarketSummary, NewsEvent } from '@deca/shared';

const authState = vi.hoisted(() => ({ value: { user: { uid: 'host' } as unknown, role: 'admin' as 'admin' | 'team' | null, loading: false, teamId: null as string | null } }));

vi.mock('../../hooks/liveState', async () => (await import('../../hooks/liveMock.testutil')).liveStateModule);
vi.mock('../../lib/auth', () => ({ useAuth: () => authState.value }));

import { liveMock } from '../../hooks/liveMock.testutil';
import { PROJECTOR as WORDS } from '../../components/projector/projectorCopy';
import { HostFullScreen } from '../../shell/HostFullScreen';
import { RequireArea } from '../../shell/Guards';
import ProjectorPage from './ProjectorPage';

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

const dispatch: NewsEvent = {
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
};

const THREE = [entry(2, 'Tortuga Capital'), entry(1, "Queen Anne's Revenue"), entry(3, 'Saltwind Traders')];

const company = (ticker: string, name: string, price: number, sessionChange: number): Company => ({
  id: ticker.toLowerCase(),
  ticker,
  name,
  description: '',
  sector: 'Shipping & Salvage',
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
  sharesOutstanding: 1,
  marketCap: price,
  beta: 1,
});

const ROSTER = [
  company('CNBR', 'Cannonbright Foundries', 10_266, 0.0612),
  company('LVTH', 'Leviathan Logistics', 5_703, 0.0449),
  company('KRKN', 'Kraken Shipping Lines', 8_412, 0.0231),
  company('CMPS', 'Compass Rose Navigation', 11_205, -0.0066),
  company('FDUT', 'Flying Dutchman Freight', 9_615, -0.0164),
];

/** The real guard and the real chrome-less wrapper; the redirect targets are stubs. */
const wrap = (at = '/admin/projector') =>
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          element={
            <RequireArea area="host">
              <HostFullScreen />
            </RequireArea>
          }
        >
          <Route path="/admin/projector" element={<ProjectorPage />} />
        </Route>
        <Route path="/portfolio" element={<p>Crew home</p>} />
        <Route path="/login" element={<p>Sign in</p>} />
      </Routes>
    </MemoryRouter>,
  );

const live = (over: Parameters<typeof liveMock.push>[0] = {}) => liveMock.push({ game: game(), leaderboard: board(THREE), market, news: [dispatch], ...over });

beforeEach(() => {
  liveMock.reset();
  authState.value = { user: { uid: 'host' }, role: 'admin', loading: false, teamId: null };
});

describe('who can open the projector', () => {
  it('opens for a signed-in host', () => {
    live();
    wrap();
    expect(screen.getByRole('heading', { name: WORDS.title })).toBeInTheDocument();
    expect(screen.getByText("Queen Anne's Revenue")).toBeInTheDocument();
  });

  it('is refused to a crew, which is sent back to its own tabs', () => {
    authState.value = { user: { uid: 'crew' }, role: 'team', loading: false, teamId: 'crew-1' };
    live();
    wrap();
    expect(screen.getByText('Crew home')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: WORDS.title })).not.toBeInTheDocument();
  });

  it('is refused to a signed-out browser: the wall never becomes a second way in', () => {
    authState.value = { user: null, role: null, loading: false, teamId: null };
    live();
    wrap();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('has nothing to press: no buttons, no links, no nav', () => {
    live();
    wrap();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('what the room reads', () => {
  it('ranks the crews in rank order, with value and total return', () => {
    live();
    wrap();
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Queen Anne's Revenue"),
      expect.stringContaining('Tortuga Capital'),
      expect.stringContaining('Saltwind Traders'),
    ]);
    expect(rows[0]!.textContent).toContain('Ð275,000.00');
    expect(rows[0]!.textContent).toContain('+10.00%');
  });

  it('carries the composite, the clock, the session and the newest dispatch', () => {
    live();
    wrap();
    expect(screen.getByText(WORDS.composite.label)).toBeInTheDocument();
    expect(screen.getByText('1,048.62')).toBeInTheDocument();
    expect(screen.getByText('+0.84% this session')).toBeInTheDocument();
    expect(screen.getByText(/left$/)).toBeInTheDocument();
    expect(screen.getByText('Session 2 of 8')).toBeInTheDocument();
    expect(screen.getByText(dispatch.headline)).toBeInTheDocument();
  });

  it('names the two biggest risers and the two biggest fallers', () => {
    live({ companyIds: ROSTER.map((c) => c.id), companies: Object.fromEntries(ROSTER.map((c) => [c.id, c])) });
    wrap();
    expect(screen.getByText(WORDS.movers.label)).toBeInTheDocument();
    const card = screen.getByText(WORDS.movers.label).closest('section')!;
    expect(within(card).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      expect.stringContaining('CNBR'),
      expect.stringContaining('LVTH'),
      expect.stringContaining('FDUT'),
      expect.stringContaining('CMPS'),
    ]);
    expect(within(card).getByText('Ð102.66')).toBeInTheDocument();
    expect(within(card).getByText('+6.12%')).toBeInTheDocument();
  });

  it('says nothing has moved before the first tick, rather than ranking zeroes', () => {
    const flat = ROSTER.map((c) => ({ ...c, sessionChange: 0 }));
    live({ companyIds: flat.map((c) => c.id), companies: Object.fromEntries(flat.map((c) => [c.id, c])) });
    wrap();
    expect(screen.getByText(WORDS.movers.empty)).toBeInTheDocument();
  });

  it('says the phase large whenever the game is not simply running', () => {
    live({ game: game({ phase: 'paused', pausedAt: START + 60_000 }) });
    wrap();
    expect(screen.getByText(WORDS.phases.paused.title)).toBeInTheDocument();
    expect(screen.getByText(WORDS.phases.paused.body)).toBeInTheDocument();
    expect(screen.getByText(WORDS.clock.paused)).toBeInTheDocument();
  });

  it('says nothing about the phase while the game runs', () => {
    live();
    wrap();
    expect(screen.queryByText(WORDS.phases.paused.title)).not.toBeInTheDocument();
    expect(screen.queryByText(WORDS.phases.lobby.title)).not.toBeInTheDocument();
  });
});

describe('more crews than fit', () => {
  it('shows the top N and says how many are off the board', () => {
    const many = Array.from({ length: 24 }, (_, i) => entry(i + 1, `Crew ${i + 1}`));
    live({ leaderboard: board(many) });
    wrap();
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeLessThan(24);
    expect(rows[0]!.textContent).toContain('Crew 1');
    expect(screen.getByText(`Showing the top ${rows.length} of 24 crews`)).toBeInTheDocument();
  });

  it('says nothing when every crew is on the board', () => {
    live();
    wrap();
    expect(screen.queryByText(/Showing the top/)).not.toBeInTheDocument();
  });

  it('squeezes a 14-crew class onto the wall whole, rather than cutting the last two', () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => entry(i + 1, `Crew ${i + 1}`));
    live({ leaderboard: board(fourteen) });
    wrap();
    expect(screen.getAllByRole('listitem')).toHaveLength(14);
    expect(screen.getByText('Crew 14')).toBeInTheDocument();
    expect(screen.queryByText(/Showing the top/)).not.toBeInTheDocument();
  });
});

describe('the end of the game', () => {
  const finals: FinalEntry[] = [
    { ...entry(1, "Queen Anne's Revenue"), researchScore: 71, researchGrade: 'B' },
    { ...entry(2, 'Tortuga Capital'), researchScore: 64, researchGrade: 'C' },
  ];

  it('names the winner and shows the final standings', () => {
    live({ game: game({ phase: 'ended', endedAt: START + 1_800_000 }), leaderboard: board(THREE, finals) });
    wrap();
    expect(screen.getByText("Winner: Queen Anne's Revenue")).toBeInTheDocument();
    expect(screen.getByText(WORDS.phases.ended.title)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      expect.stringContaining("Queen Anne's Revenue"),
      expect.stringContaining('Tortuga Capital'),
    ]);
  });

  it('drops the movers card: the rail belongs to the winner, and the session is over', () => {
    live({
      game: game({ phase: 'ended' }),
      leaderboard: board(THREE, finals),
      companyIds: ROSTER.map((c) => c.id),
      companies: Object.fromEntries(ROSTER.map((c) => [c.id, c])),
    });
    wrap();
    expect(screen.queryByText(WORDS.movers.label)).not.toBeInTheDocument();
    expect(screen.queryByText(WORDS.movers.empty)).not.toBeInTheDocument();
  });

  it('keeps the hidden company data hidden even at the end', () => {
    live({ game: game({ phase: 'ended' }), leaderboard: board(THREE, finals) });
    wrap();
    expect(screen.queryByText(/health score|fair value|grade/i)).not.toBeInTheDocument();
  });
});

describe('a dropped connection', () => {
  it('says the numbers may be out of date rather than showing them as live', () => {
    live();
    liveMock.patch({ status: 'offline', online: false });
    wrap();
    expect(screen.getByText(WORDS.connection.title)).toBeInTheDocument();
    expect(screen.getByText(WORDS.connection.body)).toBeInTheDocument();
    // The last standings stay up — a blank wall helps nobody — they just stop claiming to be live.
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('says nothing while the stream is open', () => {
    live();
    wrap();
    expect(screen.queryByText(WORDS.connection.title)).not.toBeInTheDocument();
  });

  it('waits plainly before any market exists', () => {
    liveMock.patch({ status: 'connecting', online: true });
    wrap();
    expect(screen.getByText(WORDS.waiting.title)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
