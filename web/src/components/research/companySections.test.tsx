/**
 * Company page sections after the Apple Stocks pass (MOBILE §7.7, spec §3): Key stats is a grid
 * with the range bar under it, and the analyst view, financials preview and crew activity sit
 * behind disclosure rows instead of rendering inline.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Fundamentals } from '@deca/shared';
import { AnalystSheet, KeyStatsSection, MoreSection } from './CompanySections';
import { keyStatCells } from './researchModel';
import { DEFAULT_CURRENCY } from '../ios/signedText';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

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
  sharesOutstanding: 242_000_000,
} as unknown as Company;

const FUNDAMENTALS = { netIncome: 1.14e11, peRatio: 17.8, netMargin: 0.14, debtToEquity: 0.62, history: [] } as unknown as Fundamentals;

const cells = () => keyStatCells(KRKN, FUNDAMENTALS, () => null, 'Ð');

let appRoot: HTMLDivElement;
beforeEach(() => {
  appRoot = document.createElement('div');
  appRoot.id = 'root';
  document.body.appendChild(appRoot);
});
afterEach(() => appRoot.remove());

describe('KeyStatsSection (MOBILE §7.7 rows 4–5)', () => {
  it('is a labelled section: grid, then the session-range bar, then the helper footnote', () => {
    render(
      <MemoryRouter future={FUTURE}>
        <KeyStatsSection
          company={KRKN}
          cells={cells()}
          currency={DEFAULT_CURRENCY}
          statsPath="/markets/company/KRKN/stats"
          highlight={null}
          onOpenStat={() => {}}
        />
      </MemoryRouter>,
    );
    const section = screen.getByRole('region', { name: 'Key stats' });
    expect(within(section).getByRole('link', { name: 'See all stats' })).toHaveAttribute('href', '/markets/company/KRKN/stats');
    expect(within(section).getAllByRole('button')).toHaveLength(6);
    expect(within(section).getByRole('img', { name: /Session range: 81\.90 doubloons to 84\.60 doubloons\. Price: 84\.12 doubloons\./ })).toBeInTheDocument();
    expect(section).toHaveAccessibleDescription(/New to this\?/);
  });
});

describe('MoreSection (MOBILE §7.7 row 8)', () => {
  it('puts financials, the analyst view and this crew’s activity behind disclosure rows', async () => {
    const onAnalyst = vi.fn();
    render(
      <MemoryRouter future={FUTURE}>
        <MoreSection company={KRKN} financialsPath="/markets/company/KRKN/financials" activityCount={2} onAnalyst={onAnalyst} />
      </MemoryRouter>,
    );
    const section = screen.getByRole('region', { name: 'More' });
    expect(within(section).getByRole('link', { name: /See financials/ })).toHaveAttribute('href', '/markets/company/KRKN/financials');
    expect(within(section).getByRole('link', { name: /Your KRKN activity/ })).toHaveAttribute('href', '/portfolio/activity');
    const analyst = within(section).getByRole('button', { name: 'Analyst view' });
    expect(analyst).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(analyst);
    expect(onAnalyst).toHaveBeenCalledOnce();
    // Nothing from those three blocks renders inline any more.
    expect(screen.queryByText(/Analyst view: /)).toBeNull();
  });

  it('says so when the crew has no orders in this company', () => {
    render(
      <MemoryRouter future={FUTURE}>
        <MoreSection company={KRKN} financialsPath="/f" activityCount={0} onAnalyst={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Your KRKN activityNo KRKN orders yet/ })).toBeInTheDocument();
  });
});

describe('AnalystSheet (?sheet=help&set=company-analyst)', () => {
  it('keeps the summary, the price target and the caution, and links to the glossary', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter future={FUTURE}>
        <AnalystSheet
          company={KRKN}
          fundamentals={{ ...FUNDAMENTALS, analyst: { rating: 'Buy', priceTarget: 9600 } } as Fundamentals}
          symbol="Ð"
          open
          onClose={onClose}
        />
      </MemoryRouter>,
      { container: appRoot },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Analyst view' });
    expect(within(dialog).getByText('Analyst view: Buy. Their price target of Ð96.00 is 14.1% above the current price.')).toBeInTheDocument();
    expect(within(dialog).getByText('Ð96.00')).toBeInTheDocument();
    expect(within(dialog).getByText(/Analysts in this game are often wrong/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open in Learn' })).toHaveAttribute('href', '/learn/glossary/analystRating');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
