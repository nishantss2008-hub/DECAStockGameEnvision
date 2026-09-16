/**
 * The Welcome sheet's primary action for a crew that has not finished "Meet the market"
 * (design 2026-09-16 §6).
 *
 * REGRESSION: this used to be `onClose()` then `navigate(INTRO_PATH)`. AppShell opens the sheet by
 * PUSHING `?sheet=welcome`, so `onClose()` is `navigate(-1)`, and a real browser's `history.back()`
 * is asynchronous: the push was queued first and the pending pop then undid it, leaving a brand-new
 * crew on Portfolio with the intro never opened — and its first order refused with `intro_required`.
 * Verified against the running app on WebKit before the fix.
 *
 * The guard is the INVARIANT, not the race: jsdom's history is synchronous, so no unit test can
 * reproduce the timing that made this fail on a phone. What it pins instead is the shape of the fix
 * — an un-introduced crew's primary action never closes the sheet by popping history; it replaces
 * the sheet's own entry with the flow, which has no ordering to get wrong. (Restoring the old
 * `onClose(); navigate(INTRO_PATH)` fails the second case.) The end-to-end behaviour on a real
 * browser is covered by `e2e/app/full-game.spec.ts`, which is where the bug was found.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as const, loading: false } }));

vi.mock('../hooks/liveState', async () => (await import('../hooks/liveMock.testutil')).liveStateModule);
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));

import { liveMock } from '../hooks/liveMock.testutil';
import { ShellDataProvider } from '../shell/ShellData';
import WelcomeSheet from './WelcomeSheet';

const INTRO_PATH = '/learn/meet-the-market';

function Where() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

const pushTeam = (introCompletedAt: number | null) =>
  act(() => liveMock.push({ team: { id: 'saltwind', name: 'Saltwind Traders', introCompletedAt } as never }));

beforeEach(() => {
  liveMock.reset();
  authState.value = { teamId: 'saltwind', role: 'team', loading: false };
});

describe('WelcomeSheet primary action', () => {
  it('opens Meet the market and stays there, with the sheet gone from the URL', async () => {
    // Exactly what AppShell leaves behind: /portfolio, then a PUSHED ?sheet=welcome entry.
    window.history.replaceState(null, '', '/portfolio');
    window.history.pushState({ usr: { bxSheet: true } }, '', '/portfolio?sheet=welcome');

    const onClose = vi.fn(() => act(() => void window.history.back()));
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ShellDataProvider>
          <Where />
          <WelcomeSheet open onClose={onClose} onClosed={() => {}} />
        </ShellDataProvider>
      </BrowserRouter>,
    );
    pushTeam(null);

    await userEvent.click(await screen.findByRole('button', { name: 'Meet the market' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(INTRO_PATH));
    // Give any queued popstate a chance to undo it, the way the bug did.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('loc').textContent).toBe(INTRO_PATH);
  });

  it('does not close the sheet by popping history when the intro is unfinished', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/portfolio', '/portfolio?sheet=welcome']} initialIndex={1} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ShellDataProvider>
          <Where />
          <WelcomeSheet open onClose={onClose} onClosed={() => {}} />
        </ShellDataProvider>
      </MemoryRouter>,
    );
    pushTeam(null);

    await userEvent.click(await screen.findByRole('button', { name: 'Meet the market' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('loc').textContent).toBe(INTRO_PATH);
  });

  it('still just closes for a crew that has already finished the intro', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/portfolio?sheet=welcome']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ShellDataProvider>
          <Where />
          <WelcomeSheet open onClose={onClose} onClosed={() => {}} />
        </ShellDataProvider>
      </MemoryRouter>,
    );
    pushTeam(1_700_000_000_000);

    await userEvent.click(await screen.findByRole('button', { name: 'Start the walkthrough' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loc').textContent).toBe('/portfolio?sheet=welcome');
  });
});
