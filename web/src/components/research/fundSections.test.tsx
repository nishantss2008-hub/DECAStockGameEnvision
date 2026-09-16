/**
 * A fund's detail screen (spec 2026-09-16 §3): "What this fund holds" replaces Key stats, and the
 * company-only sections are ABSENT rather than rendered empty.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fund } from '@deca/shared';
import { FundAboutSection, FundHoldingsSection } from './FundSections';
import { fundHoldingRows } from '../market/marketsView';
import { DEFAULT_CURRENCY } from '../ios/signedText';

const co = (id: string, ticker: string, name: string, sector: Company['sector'], price: number, change: number): Company =>
  ({ id, ticker, name, sector, currentPrice: price, sessionChange: change, sessionOpen: price, startPrice: price }) as Company;

const BY_ID: Record<string, Company> = {
  kraken: co('kraken', 'KRKN', 'Kraken Shipping Lines', 'Shipping & Salvage', 8_412, 0.0231),
  'flying-dutchman': co('flying-dutchman', 'FDUT', 'Flying Dutchman Salvage', 'Shipping & Salvage', 4_206, -0.0154),
  leviathan: co('leviathan', 'LVTH', 'Leviathan Logistics', 'Shipping & Salvage', 4_206, 0.0448),
};

const SHIPS = {
  kind: 'fund',
  id: 'shipping-lanes',
  ticker: 'SHIPS',
  name: 'Shipping Lanes Fund',
  description: 'An equal slice of the three Shipping & Salvage companies.',
  style: 'sector',
  sector: 'Shipping & Salvage',
  holdings: [
    { companyId: 'kraken', ticker: 'KRKN', weight: 1 / 3 },
    { companyId: 'flying-dutchman', ticker: 'FDUT', weight: 1 / 3 },
    { companyId: 'leviathan', ticker: 'LVTH', weight: 1 / 3 },
  ],
  divisor: 1,
  positionLimitExempt: false,
  currentPrice: 10_000,
  sessionOpen: 9_900,
  sessionLow: 9_850,
  sessionHigh: 10_120,
  sessionChange: 0.0101,
  startPrice: 10_000,
  voyageChange: 0,
} as unknown as Fund;

function renderFund() {
  const rows = fundHoldingRows(SHIPS, BY_ID);
  return render(
    <MemoryRouter>
      <FundHoldingsSection fund={SHIPS} rows={rows} currency={DEFAULT_CURRENCY} />
      <FundAboutSection fund={SHIPS} openPrice={10_000} />
    </MemoryRouter>,
  );
}

describe('fund detail (spec §3)', () => {
  it('shows "What this fund holds" with every constituent, its weight and its session change', () => {
    renderFund();
    const holds = screen.getByRole('region', { name: 'What this fund holds' });
    const rows = within(holds).getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '/markets/company/KRKN',
      '/markets/company/FDUT',
      '/markets/company/LVTH',
    ]);
    // KRKN is twice the price of the other two at equal basket weights: 50% / 25% / 25%.
    expect(within(holds).getByText('50.0%')).toBeInTheDocument();
    expect(within(holds).getAllByText('25.0%')).toHaveLength(2);
    expect(rows[0]!.getAttribute('aria-label')).toBe('Kraken Shipping Lines, KRKN, 50.0% share of the fund, up 2.31 percent this session');
    expect(rows[1]!.getAttribute('aria-label')).toContain('down 1.54 percent this session');
  });

  it('says in plain words that the price is those companies added together', () => {
    renderFund();
    expect(screen.getByText("Its price is the prices it holds, added together, so one company's news moves it less.")).toBeInTheDocument();
    expect(screen.getByText(/A fund has no news of its own/)).toBeInTheDocument();
    expect(screen.getByText(/The weights were set when the game began/)).toBeInTheDocument();
  });

  it('has no Key stats, no fundamentals, no analyst view and no financials', () => {
    renderFund();
    for (const absent of ['Key stats', 'See all stats', 'Analyst view', 'See financials', 'Price vs. profit', 'Profit margin', 'Sales growth']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /Price vs\. profit/ })).toBeNull();
  });

  it('shows nothing about hidden quality or grades', () => {
    const { container } = renderFund();
    expect(container.textContent).not.toMatch(/quality|grade|\bq\b|hidden|research score/i);
  });

  it('keeps the session range bar, which is a quote fact rather than a fundamental', () => {
    renderFund();
    expect(screen.getByRole('img', { name: /^Session range: / })).toBeInTheDocument();
  });

  it('describes the fund and names its opening price in About', () => {
    renderFund();
    expect(screen.getByText('An equal slice of the three Shipping & Salvage companies.')).toBeInTheDocument();
    expect(screen.getByText('Every fund opened at Ð100.00 a share.')).toBeInTheDocument();
  });

  it('explains itself rather than showing an empty list when the companies have not loaded', () => {
    render(
      <MemoryRouter>
        <FundHoldingsSection fund={SHIPS} rows={[]} currency={DEFAULT_CURRENCY} />
      </MemoryRouter>,
    );
    expect(screen.getByText("We could not load this fund's holdings. Try again in a moment.")).toBeInTheDocument();
  });
});
