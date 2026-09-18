/**
 * News paging (MOBILE §7.11): ten dispatches on screen, the rest behind "See older dispatches".
 * A crew must still be able to read back to the first dispatch of the game, so nothing is dropped —
 * it is only folded away, ten at a time.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, NewsEvent } from '@deca/shared';
import { NEWS_PAGE_SIZE } from '../../hooks/crewFeed';

const KRKN = {
  id: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  sector: 'Shipping & Salvage',
  currentPrice: 8_412,
  startPrice: 8_000,
  sessionChange: 0.0231,
  sessionOpen: 8_222,
} as Company;

const NEWS: NewsEvent[] = Array.from({ length: 43 }, (_, i) => ({
  id: `n${i}`,
  headline: `Dispatch number ${i}`,
  body: 'b',
  companyIds: ['kraken'],
  type: 'earnings',
  sentiment: 'bullish',
  source: 'scheduled',
  tick: 100 - i,
  firedAt: 1_700_000_000_000 - i * 60_000,
  priceAtFire: { kraken: 8_000 },
})) as NewsEvent[];

vi.mock('../../hooks/useNews', () => ({ useNews: () => ({ news: NEWS, loading: false, error: null }) }));
vi.mock('../../hooks/useCompanies', () => ({ useCompanies: () => ({ byId: { kraken: KRKN }, companies: [KRKN], loading: false }) }));
vi.mock('../../hooks/useMarket', () => ({ useMarket: () => ({ market: null }), useCompositeHistory: () => ({ points: [], loading: false }) }));
vi.mock('../../hooks/usePortfolio', () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock('../../lib/watchlist', () => ({ useWatchlist: () => ({ symbols: [] }) }));
vi.mock('../../shell/ShellNavBar', () => ({ ShellNavBar: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('../../shell/ShellData', () => ({ useShellGame: () => ({ team: null, game: null }) }));

import NewsPage from './NewsPage';

const headlines = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('News (MOBILE §7.11)', () => {
  it('shows ten dispatches, then reveals the older ones ten at a time, back to the start of the game', async () => {
    render(
      <MemoryRouter>
        <NewsPage />
      </MemoryRouter>,
    );
    expect(NEWS_PAGE_SIZE).toBe(10);
    expect(headlines()).toHaveLength(10);
    expect(headlines()[0]).toBe('Dispatch number 0');

    const older = screen.getByRole('button', { name: /See older/ });
    await userEvent.click(older);
    expect(headlines()).toHaveLength(20);

    // Every remaining dispatch stays reachable: keep tapping and the oldest one arrives.
    for (let i = 0; i < 3; i += 1) await userEvent.click(screen.getByRole('button', { name: /See older/ }));
    expect(headlines()).toHaveLength(NEWS.length);
    expect(headlines().at(-1)).toBe('Dispatch number 42');
    expect(screen.queryByRole('button', { name: /See older/ })).toBeNull();
    // The control that replaces it takes focus, so keyboard and screen-reader users are not dropped to the top.
    expect(screen.getByText(/every dispatch/i)).toHaveFocus();
  });

  it('counts what is on screen against the whole feed', async () => {
    render(
      <MemoryRouter>
        <NewsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Showing 10 of 43')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /See older/ }));
    expect(screen.getByText('Showing 20 of 43')).toBeInTheDocument();
  });
});
