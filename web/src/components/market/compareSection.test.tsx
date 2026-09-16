/**
 * Compare (spec 2026-09-16 §4): the five-way metric table that moved off the Markets list keeps
 * every metric set and every column it had. This is the regression guard for that promise.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fundamentals } from '@deca/shared';
import { CompaniesSection } from './CompaniesSection';
import { MARKETS_VIEWS, VIEW_COLUMNS, type MarketsQuery, type MarketsView } from './marketsView';

vi.mock('../../hooks/useHistory', () => ({ useHistory: () => ({ points: [], loading: false }) }));

const KRKN = {
  id: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  sector: 'Shipping & Salvage',
  currentPrice: 8_412,
  sessionOpen: 8_222,
  sessionChange: 0.0231,
  marketCap: 2_036_000_000_000,
  sharesOutstanding: 242_000_000,
} as Company;

const F = {
  marketCap: 2_036_000_000_000,
  netIncome: 1.14e11,
  revenue: 8.14e11,
  netMargin: 0.14,
  peRatio: 17.8,
  forwardPe: 15.9,
  psRatio: 2.5,
  pbRatio: 1.8,
  dividendYield: 0.019,
  debtToEquity: 0.62,
  currentRatio: 1.4,
  cash: 1.5e11,
  totalDebt: 3e11,
  freeCashFlow: 9e10,
  analyst: { rating: 'Buy', priceTarget: 9_600 },
  history: [],
} as unknown as Fundamentals;

function renderCompare(view: MarketsView) {
  const query: MarketsQuery = { view, sort: 'size', sector: null };
  return render(
    <MemoryRouter>
      <CompaniesSection
        companies={[KRKN]}
        fundamentals={{ kraken: F }}
        query={query}
        onQuery={() => {}}
        sessionStartTick={0}
        currentTick={10}
      />
    </MemoryRouter>,
  );
}

describe('Compare screen (spec §4)', () => {
  it('still offers all five metric sets', () => {
    renderCompare('basics');
    for (const label of ['Basics', 'Price', 'Value', 'Health', 'Analysts']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('renders every column of every metric set — nothing was dropped in the move', () => {
    for (const view of MARKETS_VIEWS) {
      const { unmount } = renderCompare(view);
      for (const column of VIEW_COLUMNS[view]) {
        expect(screen.getAllByText(column.label).length, `${view}/${column.id}`).toBeGreaterThan(0);
      }
      unmount();
    }
  });

  it('speaks each cell with its column name on the company row', () => {
    renderCompare('basics');
    const row = screen.getByRole('link', { name: /Kraken Shipping Lines/ });
    expect(row.getAttribute('aria-label')).toContain('Price vs. profit 17.8');
    expect(row.getAttribute('aria-label')).toContain('Debt vs. equity 0.62');
    expect(row).toHaveAttribute('href', '/markets/company/KRKN');
  });

  it('keeps the "What these columns mean" entry point for the current set', () => {
    renderCompare('value');
    expect(screen.getByRole('button', { name: 'What these columns mean' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('lists companies only: a fund has no fundamentals to put in these columns', () => {
    renderCompare('basics');
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText('FLEET')).toBeNull();
  });
});
