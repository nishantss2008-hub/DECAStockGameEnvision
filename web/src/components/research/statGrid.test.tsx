/**
 * Key stats / All stats grid (MOBILE §7.7, spec §3 and §5): six scannable cells, each one a
 * button that opens the explanation the four-line row used to render inline.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fundamentals } from '@deca/shared';
import { StatGrid, StatSheet, statSheetRequest } from './StatGrid';
import { allStatsGroups, keyStatCells, type StatCell } from './researchModel';
import { peerComparisons, type MetricId } from '../../lib/compare';
import { useSheet } from '../../shell/useSheet';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const B = 100_000_000_000; // Ð1B in cents

const history = [
  { period: 'FY2022', revenue: 6.61 * B, netIncome: 0.94 * B, eps: 388 },
  { period: 'FY2023', revenue: 7.18 * B, netIncome: 1.03 * B, eps: 426 },
  { period: 'FY2024', revenue: 7.74 * B, netIncome: 1.09 * B, eps: 450 },
  { period: 'FY2025', revenue: 8.14 * B, netIncome: 1.14 * B, eps: 473 },
];

const KRKN = {
  id: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  sector: 'Shipping & Salvage',
  currentPrice: 8412,
  startPrice: 8412,
  sessionOpen: 8222,
  sessionLow: 8190,
  sessionHigh: 8460,
  sessionVolume: 184_200,
  sharesOutstanding: 242_000_000,
  beta: 1.12,
} as unknown as Company;

const FUNDAMENTALS = {
  week52Low: 5840,
  week52High: 9120,
  float: 201_300_000,
  forwardPe: 15.9,
  eps: 473,
  dividendYield: 0.019,
  payoutRatio: 0.34,
  beta: 1.12,
  sharesOutstanding: 242_000_000,
  marketCap: 20.36 * B,
  history,
  revenue: 8.14 * B,
  netIncome: 1.14 * B,
  netMargin: 0.14,
  peRatio: 17.8,
  debtToEquity: 0.62,
  equity: 6.26 * B,
  totalDebt: 3.88 * B,
  cash: 1.2 * B,
  ebitda: 2.03 * B,
} as unknown as Fundamentals;

const peer = (id: string, shares: number) =>
  ({ ...KRKN, id, ticker: id.toUpperCase(), sharesOutstanding: shares }) as unknown as Company;

/** 4 years of sales that compound at `rate`, so revenueGrowth comes out exactly at `rate`. */
const grow = (rate: number) => [0, 1, 2, 3].map((i) => ({ period: `FY${2022 + i}`, revenue: B * (1 + rate) ** i, netIncome: 0.1 * B, eps: 100 }));

/**
 * KRKN's two sector peers, each with its own numbers — a comparison a student can read something
 * into. The key stats work out to: size Ð16.82B / Ð25.24B, growth 10.0% / 2.0%, margin 10.0% / 20.0%,
 * P/E 20.0 / 24.0, debt 0.40 / 1.00, so the peer medians are Ð21.03B, 6.0%, 15.0%, 22.0 and 0.70.
 */
const PEERS: { company: Company; fundamentals: Fundamentals }[] = [
  { company: peer('peer1', 200_000_000), fundamentals: { ...FUNDAMENTALS, history: grow(0.1), netMargin: 0.1, peRatio: 20, debtToEquity: 0.4 } as Fundamentals },
  { company: peer('peer2', 300_000_000), fundamentals: { ...FUNDAMENTALS, history: grow(0.02), netMargin: 0.2, peRatio: 24, debtToEquity: 1.0 } as Fundamentals },
];

/** `averageFor` over a market of KRKN plus `n - 1` of its peers. */
function averagesOver(n: number): (id: MetricId) => ReturnType<ReturnType<typeof peerComparisons>> {
  const companies: Record<string, Company> = { kraken: KRKN };
  const funds: Record<string, Fundamentals> = { kraken: FUNDAMENTALS };
  for (const { company, fundamentals } of PEERS.slice(0, Math.max(0, n - 1))) {
    companies[company.id] = company;
    funds[company.id] = fundamentals;
  }
  const lookup = peerComparisons(funds, companies);
  return (id) => lookup(id, KRKN);
}

function Harness({ cells }: { cells: readonly StatCell[] }) {
  const { open } = useSheet();
  return (
    <>
      <StatGrid cells={cells} onOpen={(cell) => open(statSheetRequest(cell))} aria-label="Key stats" />
      <StatSheet cells={cells} />
    </>
  );
}

let appRoot: HTMLDivElement;
beforeEach(() => {
  appRoot = document.createElement('div');
  appRoot.id = 'root';
  document.body.appendChild(appRoot);
});
afterEach(() => {
  appRoot.remove();
});

function renderGrid(cells: readonly StatCell[]) {
  render(
    <MemoryRouter future={FUTURE}>
      <Harness cells={cells} />
    </MemoryRouter>,
    { container: appRoot },
  );
  return userEvent.setup();
}

const keyCells = (f: Fundamentals = FUNDAMENTALS, companies = 3) => keyStatCells(KRKN, f, averagesOver(companies), 'Ð');

describe('StatGrid (MOBILE §7.7 key stats)', () => {
  it('renders the five stats as buttons: label, value and the peer comparison as a caption, no sentence', () => {
    renderGrid(keyCells());
    const grid = screen.getByRole('list', { name: 'Key stats' });
    const cells = within(grid).getAllByRole('button');
    expect(cells).toHaveLength(5);
    // Every caption is the other two companies, so it never simply repeats the value above it.
    // No "Session range" cell since 2026-09-17: the range bar below the grid is the one that says it.
    expect(cells.map((c) => c.textContent)).toEqual([
      'Company sizeÐ20.36BRest of sector Ð21.03B',
      'Sales growth7.2%Rest of sector 6.0%',
      'Profit margin14.0%Rest of sector 15.0%',
      'Price vs. profit17.8Rest of sector 22.0',
      'Debt vs. equity0.62Rest of sector 0.70',
    ]);
    // The everyday sentence lives in the sheet now, never in the grid.
    expect(within(grid).queryByText(/You pay Ð17\.80/)).toBeNull();
    // Every cell opens a dialog and keeps the anchor Learn's "See it on a company" links to.
    for (const cell of cells) expect(cell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(document.getElementById('metric-peRatio')).not.toBeNull();
  });

  it('marks the deep-linked metric without colouring any value', () => {
    render(
      <MemoryRouter future={FUTURE}>
        <StatGrid cells={keyCells()} onOpen={() => {}} highlight="netMargin" />
      </MemoryRouter>,
    );
    expect(document.getElementById('metric-netMargin')).toHaveAttribute('data-highlighted');
    expect(document.getElementById('metric-peRatio')).not.toHaveAttribute('data-highlighted');
    expect(document.querySelector('[class*="gain"], [class*="loss"]')).toBeNull();
  });

  it('falls back to the rest of the market when the sector has fewer than 3 companies', () => {
    renderGrid(keyCells(FUNDAMENTALS, 2));
    // One other company in the whole market, and it is peer1 (P/E 20.0) — not KRKN's own 17.8.
    expect(screen.getByText('Rest of market 20.0')).toBeInTheDocument();
    expect(screen.queryByText(/Rest of sector/)).toBeNull();
  });

  it('degrades gracefully when the company has no fundamentals and no averages yet', async () => {
    // What the page renders before `useAllFundamentals` resolves: no values, no medians, no crash.
    const user = renderGrid(keyStatCells(KRKN, {} as Fundamentals, () => null, 'Ð'));
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getAllByText('Rest of market —')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /Profit margin/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Profit margin' });
    expect(within(dialog).getByText('Not available for this company.')).toBeInTheDocument();
  });
});

describe('StatSheet (?sheet=stat&id=…)', () => {
  it('opens on a tap with the sentence, the comparison line and a link to the glossary term', async () => {
    const user = renderGrid(keyCells());
    await user.click(screen.getByRole('button', { name: /Price vs\. profit/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Price vs. profit' });
    expect(within(dialog).getByText('P/E ratio')).toBeInTheDocument();
    expect(within(dialog).getByText('You pay Ð17.80 for every Ð1 of yearly profit.')).toBeInTheDocument();
    expect(within(dialog).getByText('Rest of Shipping & Salvage: 22.0')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open in Learn' })).toHaveAttribute('href', '/learn/glossary/peRatio');
  });

  it('shows the compare note when the metric has one', async () => {
    const cells = allStatsGroups(KRKN, FUNDAMENTALS, averagesOver(3), 'Ð').flatMap((g) => g.cells);
    const user = renderGrid(cells);
    await user.click(screen.getByRole('button', { name: /Profit per share/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Profit per share' });
    expect(within(dialog).getByText(/the comparison means little/)).toBeInTheDocument();
  });

  it('explains a stat with no compare template from the glossary instead', async () => {
    // All stats keeps such stats (float, past-year range, payout ratio); Key stats no longer has one.
    const cells = allStatsGroups(KRKN, FUNDAMENTALS, averagesOver(3), 'Ð').flatMap((g) => g.cells);
    const user = renderGrid(cells);
    await user.click(screen.getByRole('button', { name: /Past-year range/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Past-year range' });
    expect(within(dialog).getByRole('heading', { name: 'What it is' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Why it matters' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open in Learn' })).toHaveAttribute('href', '/learn/glossary/week52Range');
  });

  it('closes on Escape and on the Close button, and opens by keyboard too', async () => {
    const user = renderGrid(keyCells());
    await user.tab();
    expect(screen.getByRole('button', { name: /Company size/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Company size' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: /Sales growth/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Sales growth' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
