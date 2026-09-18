/**
 * Portfolio tab root after the 2026-09-17 density pass (MOBILE §7.3).
 *
 * What this pins: no walkthrough card and no three-row "Recent activity" block, Activity still one
 * obvious tap away, and the chart's summary sentence spoken but not printed — section 2 prints the
 * same figure 16px above it, and the sentence is still the plot slider's description.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GameClock, GameState } from '@deca/shared';
import * as sections from './PortfolioSections';
import { AccountChart, AccountSummary, ActivityLink, TopPositions } from './PortfolioSections';
import type { AccountTotals, PositionRow } from './derive';
import { DEFAULT_CURRENCY } from '../ios/signedText';

const history = vi.hoisted(() => ({ points: [] as { tick: number; value: number }[] }));

vi.mock('../../hooks/useTeamHistory', () => ({ useTeamHistory: () => ({ points: history.points, loading: false, error: null }) }));
vi.mock('../../hooks/useMarket', () => ({
  useMarket: () => ({ market: null, loading: false, error: null }),
  useCompositeHistory: () => ({ points: [], loading: false, error: null }),
}));

const START = 25_000_000;
const GAME = { phase: 'live', currentTick: 4, sessionTicks: 720, tickIntervalMs: 5_000, lastTickAt: 1_700_000_000_000 } as unknown as GameState;
const CLOCK = { totalTicks: 720, sessionTicks: 720 } as unknown as GameClock;

const TOTALS = {
  invested: 21_460_300,
  cashPct: 0.208,
  sessionGain: 191_980,
  sessionValueChange: 191_980,
  sessionPct: 0.0071,
  totalGain: 2_104_955,
  totalPct: 0.0842,
  startingCapital: START,
  unrealized: 1_860_120,
} as AccountTotals;

const ROW = {
  companyId: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  sector: 'Shipping & Salvage',
  isFund: false,
  shares: 750,
  avgCost: 7_349,
  last: 8_412,
  sessionChangePerShare: 190,
  sessionGain: 142_500,
  sessionPct: 0.0231,
  totalGain: 796_500,
  totalPct: 0.1445,
  value: 6_309_000,
  pctOfAccount: 0.233,
  costBasis: 5_511_750,
} as PositionRow;

function renderChart() {
  history.points = [0, 1, 2, 3, 4].map((tick) => ({ tick, value: START + tick * 526_239 }));
  return render(
    <MemoryRouter>
      <AccountChart
        teamId="saltwind"
        game={GAME}
        clock={CLOCK}
        totalValue={27_104_955}
        startingCapital={START}
        compositeOpen={null}
        currency={DEFAULT_CURRENCY}
      />
    </MemoryRouter>,
  );
}

describe('Portfolio sections (MOBILE §7.3)', () => {
  it('no longer exports a Recent activity block', () => {
    expect(Object.keys(sections)).not.toContain('RecentActivity');
  });

  it('keeps Activity one obvious, labelled tap from Portfolio', () => {
    render(
      <MemoryRouter>
        <ActivityLink />
      </MemoryRouter>,
    );
    const section = screen.getByRole('region', { name: 'Activity' });
    const link = within(section).getByRole('link', { name: /Activity/ });
    expect(link).toHaveAttribute('href', '/portfolio/activity');
    expect(within(section).getByText('Every order you have placed, with its price and fee')).toBeInTheDocument();
    // One row, not three of the list it opens.
    expect(within(section).getAllByRole('link')).toHaveLength(1);
  });

  it('speaks the chart summary without printing it under the same figure', () => {
    const { container } = renderChart();
    expect(container.querySelector('.chart-card__summary')).toBeNull();
    const slider = screen.getByRole('slider', { name: /Account value/ });
    expect(slider).toHaveAccessibleDescription(/since the game began/);
  });

  it('still prints "since the game began" once, in the summary above the chart', () => {
    render(
      <MemoryRouter>
        <AccountSummary totalValue={27_104_955} totals={TOTALS} compositeChange={null} currency={DEFAULT_CURRENCY} />
      </MemoryRouter>,
    );
    const summary = screen.getByRole('region', { name: 'Account summary' });
    const printed = within(summary).getAllByText(/since the game began/).filter((el) => !el.closest('.ios-sr-only'));
    expect(printed).toHaveLength(1);
  });

  it('shows the positions the crew holds with a See all link, above Activity', () => {
    render(
      <MemoryRouter>
        <TopPositions rows={[ROW]} currency={DEFAULT_CURRENCY} onOpenMarkets={() => {}} />
        <ActivityLink />
      </MemoryRouter>,
    );
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings[0]).toBe('Positions');
    expect(screen.getByRole('link', { name: 'See all 1' })).toHaveAttribute('href', '/portfolio/positions');
    expect(screen.queryByText('Recent activity')).toBeNull();
  });
});
