/**
 * The trade ticket has to fit its window (MOBILE §7.10): on a 393×852 phone the sheet's scroll area is about
 * 569px, and the Entry step was 694px of content. Two things were spending that height for nothing — a
 * step-counter line no blueprint asks for, and a second 16px inset inside the sheet body that squeezed the
 * column to 329px and wrapped the summary box from 94 to 112px. This test holds both back.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { initialTicket } from './useTicketState';
import { estimateTicket, filledSummary, type TicketContext } from './ticketModel';
import { EntryStep, FilledStep, PreviewStep } from './TicketSteps';
import type { Trade } from '@deca/shared';

// BRIEF §7 KRKN worked example.
const KRKN: TicketContext = {
  companyId: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  price: 8412,
  beta: 1.12,
  sharesOutstanding: 242_000_000,
  tick: 1284,
  timeText: '14:02:30',
  cash: 24_834_955,
  owned: 3000,
  avgCost: 7350,
  totalValue: 108_421_955,
  feeBps: 10,
  maxPositionPct: 0.5,
  currency: { symbol: 'Ð', name: 'Doubloons' },
  secondsToNextTick: 30,
};

const state = { ...initialTicket('abcdefgh12', 'kraken'), input: '200' };
const { quantity, estimate } = estimateTicket(state, KRKN);

const css = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
/** The horizontal padding a rule declares, in px. */
function sidePadding(rules: string, selector: string): number {
  const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(rules)?.[1] ?? '';
  const shorthand = /(?:^|;)\s*padding:\s*([^;]+)/.exec(block)?.[1]?.trim().split(/\s+/) ?? [];
  const side = shorthand[1] ?? shorthand[0];
  if (!side) return 0;
  return side.includes('sheet-pad') ? 16 : Number.parseFloat(side) || 0;
}

describe('the trade ticket fits its window', () => {
  it('insets the sheet body once, so the ticket column is 361px wide and the summary box stays one line a row', () => {
    const sheetPad = sidePadding(css('../ios/Sheet.css'), '.ios-sheet__body');
    const bodyPad = sidePadding(css('./trade.css'), '.tk-body');
    expect(sheetPad).toBe(16);
    expect(bodyPad).toBe(0);
    expect(393 - 2 * (sheetPad + bodyPad)).toBe(361);
  });

  it('shows no step counter on Entry, Preview or Filled (no blueprint asks for one)', () => {
    const step = /Step \d/;
    const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

    const { unmount } = wrap(
      <EntryStep
        state={state}
        dispatch={vi.fn()}
        ctx={KRKN}
        sessionChange={0.0231}
        sector="Shipping & Salvage"
        quantity={quantity}
        estimate={estimate}
        problem={null}
        compact={false}
        onFix={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.queryByText(step)).toBeNull();
    expect(screen.getByText('Total cost')).toBeInTheDocument();
    unmount();

    const preview = wrap(<PreviewStep state={state} ctx={KRKN} quantity={quantity} estimate={estimate!} updatedTick={null} />);
    expect(screen.queryByText(step)).toBeNull();
    // The four explanation sub-lines under the preview rows stay: explaining is this app's job.
    expect(screen.getByText('0.10% charged on every trade.')).toBeInTheDocument();
    preview.unmount();

    const trade = {
      id: 't1',
      clientOrderId: 'abcdefgh12',
      companyId: 'kraken',
      side: 'buy',
      quantity: 200,
      price: 8412,
      fee: 1682,
      total: 1_684_082,
      executedAt: 0,
      tick: 1284,
    } as unknown as Trade;
    wrap(<FilledStep summary={filledSummary(trade, 8412, KRKN)} headingRef={{ current: null }} onActivity={vi.fn()} onTradeAgain={vi.fn()} />);
    expect(screen.queryByText(step)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Order filled' })).toBeInTheDocument();
  });
});
