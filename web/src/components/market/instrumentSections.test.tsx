/**
 * The Markets list after the Apple Stocks pass (spec 2026-09-16 §4, MOBILE §7.6): two sections —
 * Funds first, then Companies grouped by sector — one row per instrument, and no metric table.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fund, Instrument, MarketSummary } from '@deca/shared';
import { WatchlistSection } from './MarketSections';
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

/** The two sector indices the group headings print, as `market/summary` sends them. */
const MARKET = {
  sectors: {
    'Shipping & Salvage': { value: 1, open: 1, sessionOpen: 1, change: 0.04, sessionChange: 0.0231 },
    'Naval Arms': { value: 1, open: 1, sessionOpen: 1, change: -0.02, sessionChange: -0.0158 },
  },
} as unknown as MarketSummary;

/** The header row of one sector group: heading plus the sector's session change beside it. */
function groupHeader(sector: string): HTMLElement {
  const region = screen.getByRole('region', { name: sector });
  return within(region).getByRole('heading', { name: sector }).closest('.ios-list__header') as HTMLElement;
}

function renderList() {
  return render(
    <MemoryRouter>
      <FundsSection funds={FUNDS} sessionStartTick={0} currentTick={10} />
      <SectorGroupsSection groups={sectorGroups(COMPANIES, 'size', MARKET)} sessionStartTick={0} currentTick={10} />
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
    // Three company rows and nothing else: the sector screen the header used to link to is gone.
    expect(within(shipping).getAllByRole('link')).toHaveLength(3);
    expect(within(shipping).queryByRole('link', { name: /^See / })).toBeNull();
    expect(within(shipping).getByRole('link', { name: /Kraken Shipping Lines/ })).toBeInTheDocument();
    expect(within(shipping).getByRole('link', { name: /Flying Dutchman Salvage/ })).toBeInTheDocument();
    expect(within(shipping).getByRole('link', { name: /Leviathan Logistics/ })).toBeInTheDocument();

    const arms = screen.getByRole('region', { name: 'Naval Arms' });
    expect(within(arms).getAllByRole('link')).toHaveLength(3);
    expect(within(arms).queryByRole('link', { name: /Kraken/ })).toBeNull();
  });

  it('prints each sector percentage on its group heading, seen and spoken (2026-09-17)', () => {
    renderList();
    const shipping = groupHeader('Shipping & Salvage');
    expect(within(shipping).getByText('+2.31%')).toBeInTheDocument();
    expect(within(shipping).getByText('up 2.31 percent')).toBeInTheDocument();
    expect(within(shipping).getByText('this session')).toBeInTheDocument();
    const arms = groupHeader('Naval Arms');
    expect(within(arms).getByText('−1.58%')).toBeInTheDocument();
    expect(within(arms).getByText('down 1.58 percent')).toBeInTheDocument();
    // The heading still names the sector alone, so the region keeps its name.
    expect(within(shipping).getByRole('heading', { name: 'Shipping & Salvage' })).toBeInTheDocument();
  });

  it('falls back to the members own change when the summary carries no sectors yet', () => {
    render(
      <MemoryRouter>
        <SectorGroupsSection groups={sectorGroups(COMPANIES, 'size', { sectors: {} } as unknown as MarketSummary)} sessionStartTick={0} currentTick={1} />
      </MemoryRouter>,
    );
    expect(within(groupHeader('Shipping & Salvage')).getByText('+2.31%')).toBeInTheDocument();
  });

  it('shows no fundamentals helper: this list has no fundamentals on it', () => {
    renderList();
    expect(screen.queryByText(/New to this\?/)).toBeNull();
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

describe('Watchlist (MOBILE §7.6 row 7)', () => {
  it('draws nothing at all until the crew has starred something', () => {
    const { container } = render(
      <MemoryRouter>
        <WatchlistSection instruments={[]} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists starred instruments, funds and companies alike, once there are any', () => {
    const watched: Instrument[] = [FUNDS[1]!, COMPANIES[0]!];
    render(
      <MemoryRouter>
        <WatchlistSection instruments={watched} />
      </MemoryRouter>,
    );
    const list = screen.getByRole('region', { name: 'Watchlist' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(within(list).getByRole('link', { name: /Shipping Lanes Fund, SHIPS, Fund/ })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /Kraken Shipping Lines/ })).toBeInTheDocument();
  });
});
