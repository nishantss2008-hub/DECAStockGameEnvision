/**
 * Crew sheet and Market status sheet (MOBILE §7.12, §7.9).
 *
 * The Crew sheet had no visible Close: its header was hidden, so the only ways out were a swipe, the scrim
 * and Esc. The status sheet printed "Session 2 of 8" twice inside a medium sheet that was already 325px of
 * content in a 324px window. The Account sheet's first row armed the Portfolio walkthrough card, which no
 * longer renders, and dropped the crew on Portfolio with nothing to read.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { GameState, Leaderboard } from '@deca/shared';

const HOUR = 3_600_000;
const NOW = new Date(2026, 8, 14, 14, 2, 40).getTime();

const GAME = {
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
  lastTickAt: NOW - 10_000,
  marketCreatedAt: 0,
} as GameState;

const LEADERBOARD = {
  entries: Array.from({ length: 14 }, (_, i) => ({
    teamId: `crew-${i + 1}`,
    name: i === 1 ? 'Tortuga Capital' : `Crew ${i + 1}`,
    rank: i + 1,
    totalValue: 27_442_500,
    returnPct: 0.0977,
    sessionChangePct: 0.014,
    cashPct: 0.314,
    holdings: 6,
    spark: [100, 102, 101, 104],
  })),
} as unknown as Leaderboard;

vi.mock('../hooks/useLeaderboard', () => ({ useLeaderboard: () => ({ leaderboard: LEADERBOARD, loading: false }) }));
vi.mock('../shell/ShellData', () => ({
  useShellGame: () => ({ game: GAME, team: { id: 'crew-2', name: 'Tortuga Capital', rank: 2, totalValue: 27_442_500 }, online: true }),
  useShellNow: () => NOW,
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ logout: vi.fn(), teamId: 'crew-2' }) }));

import AccountSheet from './AccountSheet';
import CrewSheet from './CrewSheet';
import StatusSheet from './StatusSheet';
import { INTRO } from '../components/learn/introCopy';
import { INTRO_PATH } from '../components/learn/introFlow';

function Where() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname}</output>;
}

const show = (ui: React.ReactNode) => (
  render(
    <MemoryRouter initialEntries={['/portfolio?sheet=account']}>
      {ui}
      <Where />
    </MemoryRouter>,
  )
);

describe('Crew sheet (MOBILE §7.12)', () => {
  it('names the crew in its own header and closes by the Close button', async () => {
    const onClose = vi.fn();
    show(<CrewSheet open onClose={onClose} onClosed={vi.fn()} crewId="crew-2" />);
    const dialog = await screen.findByRole('dialog', { name: 'Tortuga Capital' });
    expect(within(dialog).getByText('Rank 2 of 14').textContent).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('still closes with Escape', async () => {
    const onClose = vi.fn();
    show(<CrewSheet open onClose={onClose} onClosed={vi.fn()} crewId="crew-2" />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('Market status sheet (MOBILE §7.9)', () => {
  it('prints the session once, and still explains it in place', async () => {
    show(<StatusSheet open onClose={vi.fn()} onClosed={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/Session 2 of 8/)).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: /What is Price update/ })).toBeInTheDocument();

    const tip = within(dialog).getByRole('button', { name: /What is Game session/ });
    expect(tip).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(tip);
    expect(tip).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(tip.getAttribute('aria-controls')!)!;
    expect(within(panel).getByText(/One of 8 equal parts of the game/)).toBeInTheDocument();
  });
});

describe('Account sheet (MOBILE §7.15)', () => {
  it('opens "Meet the market" instead of arming the walkthrough card Portfolio no longer renders', async () => {
    show(<AccountSheet open onClose={vi.fn()} onClosed={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('How to play')).toBeNull();
    const row = within(dialog).getByRole('button', { name: new RegExp(INTRO.learnRow) });
    expect(within(row).getByText(INTRO.learnSubtitle)).toBeInTheDocument();
    await userEvent.click(row);
    expect(screen.getByTestId('loc').textContent).toBe(INTRO_PATH);
  });
});
