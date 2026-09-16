/**
 * The Markets list after the Apple Stocks pass (spec 2026-09-16 §4, MOBILE §7.6): two sections —
 * Funds first, then Companies grouped by sector — one row per instrument, and no metric table.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fund } from '@deca/shared';
import { FundsSection, SectorGroupsSection } from './InstrumentSections';
import { sectorGroups } from './marketsView';

// The sparkline reads price history over the network; the list itself is what is under test.
vi.mock('../../hooks/useHistory', () => ({ useHistory: () => ({ points: [], loading: false }) }));

const co = (id: string, ticker: string, name: string, sector: Company['sector'], marketCap: number): Company =>
  ({
    id,
    ticker,
    name,
    sector,
    marketCap,
    currentPrice: 8_412,
    sessionOpen: 8_222,
    sessionChange: 0.0231,
    startPrice: 8_412,
    voyageChange: 0.01,
  }) as Company;

const COMPANIES = [
  co('kraken', 'KRKN', 'Kraken Shipping Lines', 'Shipping & Salvage', 900),
  co('flying-dutchman', 'FDUT', 'Flying Dutchman Salvage', 'Shipping & Salvage', 800),
  co('leviathan', 'LVTH', 'Leviathan Logistics', 'Shipping & Salvage', 700),
  co('blackbeard', 'BBRD', 'Blackbeard Armaments', 'Naval Arms', 600),
  co('mary-read', 'MRED', 'Mary Read Munitions', 'Naval Arms', 500),
  co('cannonbright', 'CNBR', 'Cannonbright Foundries', 'Naval Arms', 400),
];

const fund = (id: string, ticker: string, name: string, extra: Partial<Fund> = {}): Fund =>
  ({
    kind: 'fund',
    id,
    ticker,
    name,
    description: '',
    style: 'broad',
    holdings: [],
    divisor: 1,
    positionLimitExempt: false,
    currentPrice: 10_000,
    sessionOpen: 9_900,
    sessionChange: 0.0101,
    startPrice: 10_000,
    voyageChange: 0,
    ...extra,
  }) as Fund;

const FUNDS = [
  fund('grand-fleet', 'FLEET', 'Grand Fleet Fund', { positionLimitExempt: true }),
  fund('shipping-lanes', 'SHIPS', 'Shipping Lanes Fund', { style: 'sector', sector: 'Shipping & Salvage' }),
  fund('powder-and-shot', 'ARMS', 'Powder and Shot Fund', { style: 'sector', sector: 'Naval Arms' }),
];

function renderList() {
  return render(
    <MemoryRouter>
      <FundsSection funds={FUNDS} sessionStartTick={0} currentTick={10} />
      <SectorGroupsSection groups={sectorGroups(COMPANIES, 'size')} sessionStartTick={0} currentTick={10} />
    </MemoryRouter>,
  );
}

describe('Markets list (spec §4)', () => {
  it('renders Funds first and Companies second, in that document order', () => {
    renderList();
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings[0]).toBe('Funds');
    expect(headings.indexOf('Funds')).toBeLessThan(headings.indexOf('Companies'));
  });

  it('lists all three funds as rows, each linking to its own detail screen', () => {
    renderList();
    const funds = screen.getByRole('region', { name: 'Funds' });
    const links = within(funds).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/markets/company/FLEET');
    expect(links[1]).toHaveAttribute('href', '/markets/company/SHIPS');
    expect(links[2]).toHaveAttribute('href', '/markets/company/ARMS');
  });

  it('speaks a fund row as a fund, with its price and session change — and no fundamentals', () => {
    renderList();
    const row = screen.getByRole('link', { name: /Grand Fleet Fund/ });
    expect(row.getAttribute('aria-label')).toBe('Grand Fleet Fund, FLEET, Fund, 100.00 doubloons, up 1.01 percent this session');
    // Nothing a fund does not have: no P/E, no margin, no analyst rating, no grade.
    expect(row.textContent).not.toMatch(/P\/E|margin|Buy|Hold|grade/i);
  });

  it('groups the companies into sectors of three, each group under its own header', () => {
    renderList();
    const shipping = screen.getByRole('region', { name: 'Shipping & Salvage' });
    // Three company rows plus the group header's link to the sector screen.
    expect(within(shipping).getAllByRole('link')).toHaveLength(4);
    expect(within(shipping).getByRole('link', { name: 'See Shipping & Salvage' })).toHaveAttribute('href', '/markets/sector/shipping-salvage');
    expect(within(shipping).getByRole('link', { name: /Kraken Shipping Lines/ })).toBeInTheDocument();
    expect(within(shipping).getByRole('link', { name: /Flying Dutchman Salvage/ })).toBeInTheDocument();
    expect(within(shipping).getByRole('link', { name: /Leviathan Logistics/ })).toBeInTheDocument();

    const arms = screen.getByRole('region', { name: 'Naval Arms' });
    expect(within(arms).getAllByRole('link')).toHaveLength(4); // 3 companies + the "See Naval Arms" link
    expect(within(arms).queryByRole('link', { name: /Kraken/ })).toBeNull();
  });

  it('offers Compare from the Companies header instead of a metric control on this screen', () => {
    renderList();
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/markets/compare');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('Basics')).toBeNull();
    expect(screen.queryByText('Analysts')).toBeNull();
  });

  it('draws nothing when the server has sent no funds yet', () => {
    const { container } = render(
      <MemoryRouter>
        <FundsSection funds={[]} sessionStartTick={0} currentTick={1} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
