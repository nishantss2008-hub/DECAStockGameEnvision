/**
 * The ticket gate (design 2026-09-16 §6, requirement 3): a crew that has not finished "Meet the
 * market" is taken INTO the flow from Buy/Sell instead of filling in an order the server will
 * refuse. A crew that has finished gets the ticket as before, and an unknown crew (the stream is
 * still connecting) is never blocked — the server is the real gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as const, loading: false } }));

vi.mock('../hooks/liveState', async () => (await import('../hooks/liveMock.testutil')).liveStateModule);
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));

import { liveMock } from '../hooks/liveMock.testutil';
import { ShellDataProvider } from './ShellData';
import { useIntroGate } from './useIntroGate';

function Buy() {
  const gate = useIntroGate();
  const loc = useLocation();
  return (
    <>
      <button type="button" onClick={() => gate.openTrade({ ticker: 'KRKN', side: 'buy' })}>
        Buy
      </button>
      <output data-testid="loc">{loc.pathname + loc.search}</output>
      <output data-testid="gated">{String(gate.gated)}</output>
    </>
  );
}

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/markets/company/KRKN']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ShellDataProvider>
        <Buy />
      </ShellDataProvider>
    </MemoryRouter>,
  );

const pushTeam = (introCompletedAt: number | null) =>
  act(() => liveMock.push({ team: { id: 'saltwind', name: 'Saltwind Traders', introCompletedAt } as never }));

beforeEach(() => {
  liveMock.reset();
  authState.value = { teamId: 'saltwind', role: 'team', loading: false };
});

describe('useIntroGate', () => {
  it('sends an un-introduced crew into the flow instead of opening the ticket', async () => {
    wrap();
    pushTeam(null);
    expect(screen.getByTestId('gated').textContent).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByTestId('loc').textContent).toBe('/learn/meet-the-market');
  });

  it('opens the ticket once the crew has finished', async () => {
    wrap();
    pushTeam(1_700_000_000_000);
    expect(screen.getByTestId('gated').textContent).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByTestId('loc').textContent).toBe('/markets/company/KRKN?sheet=trade&ticker=KRKN&side=buy');
  });

  it('unlocks the moment the server says so, without a reload', async () => {
    wrap();
    pushTeam(null);
    pushTeam(1_700_000_000_000);
    await userEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByTestId('loc').textContent).toContain('sheet=trade');
  });

  it('blocks nothing while the crew document has not arrived: the server is the real gate', async () => {
    wrap();
    expect(screen.getByTestId('gated').textContent).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByTestId('loc').textContent).toContain('sheet=trade');
  });
});
