import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fundamentals, NewsEvent } from '@deca/shared';
import { DispatchCard } from './DispatchCard';
import { CompanyMetricsRow } from './CompaniesSection';

vi.mock('../../hooks/useMarket', () => ({ useCompositeHistory: () => ({ points: [], loading: false }) }));

const CNBR = { id: 'cannonbright', ticker: 'CNBR', name: 'Cannonbright Foundries', sector: 'Naval Arms', currentPrice: 10_266, startPrice: 10_266, sessionChange: 0.0612, sessionOpen: 9_674 } as Company;
const EVENT = {
  id: 'n1',
  headline: 'Cannonbright Foundries posts blowout quarterly doubloons',
  body: 'b',
  companyIds: ['cannonbright'],
  type: 'earnings',
  sentiment: 'bullish',
  source: 'scheduled',
  tick: 10,
  firedAt: new Date(2026, 8, 14, 14, 1).getTime(),
  priceAtFire: { cannonbright: 9_674 },
} as NewsEvent;

describe('DispatchCard (MOBILE §7.11)', () => {
  it('links the headline to the dispatch and the chip to the company, never to Trade', async () => {
    const onSinceHelp = vi.fn();
    render(
      <MemoryRouter>
        <DispatchCard event={EVENT} byId={{ cannonbright: CNBR }} owned compositeNow={null} onSinceHelp={onSinceHelp} />
      </MemoryRouter>,
    );
    const card = screen.getByRole('article', { name: EVENT.headline });
    expect(within(card).getByRole('link', { name: EVENT.headline })).toHaveAttribute('href', '/news/n1');
    expect(within(card).getByRole('link', { name: 'CNBR, Cannonbright Foundries, up 6.12 percent since the news' })).toHaveAttribute('href', '/news/company/CNBR');
    expect(within(card).getByText('What this means')).toBeInTheDocument();
    expect(within(card).getByText(/Earnings beat forecasts/)).toBeInTheDocument();
    expect(within(card).getByText('Good news')).toBeInTheDocument();
    expect(within(card).getByText('You own this')).toBeInTheDocument();
    expect(within(card).queryByText(/Trade|Buy/)).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: /What is Since the news/ }));
    expect(onSinceHelp).toHaveBeenCalledOnce();
  });
});

describe('CompanyMetricsRow (MOBILE §7.6)', () => {
  it('is one link that speaks every cell with its column name', () => {
    const f = { netIncome: 1, peRatio: 17.8, netMargin: 0.14, debtToEquity: 0.62, history: [] } as unknown as Fundamentals;
    render(
      <MemoryRouter>
        <ul>
          <CompanyMetricsRow company={{ ...CNBR, sharesOutstanding: 1 } as Company} view="basics" fundamentals={f} />
        </ul>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/markets/company/CNBR');
    expect(link.getAttribute('aria-label')).toContain('Price vs. profit 17.8');
    expect(link.getAttribute('aria-label')).toContain('up 6.12 percent this session');
    expect(link.getAttribute('aria-label')).toContain('Sales growth not available');
  });
});
