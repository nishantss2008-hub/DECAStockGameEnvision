/**
 * "Choose a company" is the one sheet in the ticket with a text field (MOBILE §7.10, §9.4): without
 * `keyboardAware` the software keyboard covers the first results, which is what the blueprint says must
 * never happen. The prop is set for every step of the sheet so that picking a company does not remount
 * the drawer mid-flow.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Instrument } from '@deca/shared';

const sheetProps: Record<string, unknown>[] = [];

vi.mock('../components/ios/Sheet', () => ({
  Sheet: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    sheetProps.push(props);
    return <div role="dialog">{props.children as React.ReactNode}</div>;
  },
}));

const KRKN = {
  id: 'kraken',
  ticker: 'KRKN',
  name: 'Kraken Shipping Lines',
  sector: 'Shipping & Salvage',
  currentPrice: 8_412,
  sessionChange: 0.0231,
} as Instrument;

vi.mock('../components/trade/useTicketContext', () => ({
  useTicketData: () => ({
    ctx: null,
    company: null,
    game: { currency: { symbol: 'Ð', name: 'Doubloons' }, phase: 'live' },
    team: null,
    online: true,
    companies: [KRKN],
    holdings: [],
    notFound: false,
  }),
}));
vi.mock('../shell/useSheet', () => ({ useSheet: () => ({ replace: vi.fn(), open: vi.fn() }) }));
vi.mock('../shell/ShellData', () => ({ useShellNow: () => 1_700_000_000_000 }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('../components/ios/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

import TradeSheet from './TradeSheet';

describe('Trade sheet', () => {
  it('is keyboard-aware, so "Choose a company" keeps its results above the keyboard', () => {
    render(
      <MemoryRouter>
        <TradeSheet open onClose={vi.fn()} onClosed={vi.fn()} ticker={null} side="buy" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(sheetProps.at(-1)).toMatchObject({ keyboardAware: true, title: 'Trade' });
  });
});
