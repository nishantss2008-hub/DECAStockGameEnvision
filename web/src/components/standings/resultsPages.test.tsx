/**
 * Final results pages 3 and 4 (MOBILE §7.13). COPY §10 `intro` explains what the reveal is; it was printed
 * word for word on both pages, 118px of it, and page 4 follows page 3.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { REVEAL } from './copy';
import { LuckPage, RevealPage } from './ResultsSections';
import type { RevealRow } from './reveal';

const ROWS: RevealRow[] = [
  {
    companyId: 'kraken',
    ticker: 'KRKN',
    name: 'Kraken Shipping Lines',
    sector: 'Shipping & Salvage',
    quality: 84,
    grade: 'A',
    expected: 0.152,
    actual: 0.196,
    luck: 0.044,
    label: 'compounder',
    drivers: 'Strong profit · steady growth',
    pillars: { prof: 1, grow: 1, safe: -1, val: 1 },
  } as RevealRow,
];

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('the reveal intro is printed once', () => {
  it('page 3 (Market reveal) carries it', () => {
    wrap(<RevealPage rows={ROWS} sort="quality" onSort={vi.fn()} onHelp={vi.fn()} onRow={vi.fn()} headingId="h3" />);
    expect(screen.getByText(REVEAL.intro)).toBeInTheDocument();
  });

  it('page 4 (Luck vs. research) does not repeat it', () => {
    wrap(<LuckPage rows={ROWS} heldIds={new Set(['kraken'])} onViewList={vi.fn()} headingId="h4" />);
    expect(screen.queryByText(REVEAL.intro)).toBeNull();
    // Everything page 4 is for is still there.
    expect(screen.getByText(REVEAL.scatter.title)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /companies/ })).toBeInTheDocument();
  });
});
