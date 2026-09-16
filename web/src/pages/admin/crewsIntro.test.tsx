/**
 * Host Crews and the "Meet the market" gate (design 2026-09-16 §6, requirement 5): which crews have
 * finished, and one action — with an Undo — to mark a crew finished or send it back through. A
 * student whose phone died must not be locked out of a competition, and a mis-tap must cost one tap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authState = vi.hoisted(() => ({ value: { teamId: null as string | null, role: 'admin' as const, loading: false } }));
const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/liveState', async () => (await import('../../hooks/liveMock.testutil')).liveStateModule);
vi.mock('../../lib/auth', () => ({ useAuth: () => authState.value }));
vi.mock('../../lib/api', async (orig) => ({
  ...(await orig<typeof import('../../lib/api')>()),
  apiGet: apiGetMock,
  apiPost: apiPostMock,
  apiDelete: vi.fn(),
}));

import { liveMock } from '../../hooks/liveMock.testutil';
import { ToastProvider } from '../../components/ios/Toast';
import { INTRO_HOST } from '../../components/learn/introCopy';
import CrewsPage from './CrewsPage';

const crew = (id: string, name: string, introCompletedAt: number | null) => ({
  id,
  name,
  cashBalance: 25_000_000,
  totalValue: 25_000_000,
  rank: 1,
  tradeCount: 0,
  tradingDisabled: false,
  introCompletedAt,
});

let teams = [crew('saltwind', 'Saltwind Traders', null), crew('tortuga', 'Tortuga Capital', 1_700_000_000_000)];

const wrap = (at = '/admin/crews') =>
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <CrewsPage />
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  liveMock.reset();
  teams = [crew('saltwind', 'Saltwind Traders', null), crew('tortuga', 'Tortuga Capital', 1_700_000_000_000)];
  apiGetMock.mockReset();
  apiGetMock.mockImplementation((path: string) => (path.includes('holdings') ? Promise.resolve({ holdings: [] }) : Promise.resolve({ teams })));
  apiPostMock.mockReset();
  apiPostMock.mockResolvedValue({ ok: true, introCompletedAt: 1 });
  authState.value = { teamId: null, role: 'admin', loading: false };
});

describe('Host Crews shows who has finished Meet the market', () => {
  it('tags the crews that still have to finish it', async () => {
    wrap();
    const pending = await screen.findByText(INTRO_HOST.pendingTag);
    const row = pending.closest('li')!;
    expect(within(row).getByText('Saltwind Traders')).toBeInTheDocument();
    // The crew that has finished carries no tag.
    expect(screen.getAllByText(INTRO_HOST.pendingTag)).toHaveLength(1);
  });

  it('reports each crew’s state on its detail screen', async () => {
    wrap('/admin/crews?crew=tortuga');
    await screen.findByRole('heading', { name: 'Tortuga Capital' });
    expect(screen.getByText(INTRO_HOST.done)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: INTRO_HOST.sendAgain })).toBeInTheDocument();
    expect(screen.getByText(INTRO_HOST.note)).toBeInTheDocument();
  });
});

describe('The host action on one crew', () => {
  it('marks a crew finished and offers an Undo that puts it back', async () => {
    const user = userEvent.setup();
    wrap('/admin/crews?crew=saltwind');
    await screen.findByRole('heading', { name: 'Saltwind Traders' });
    expect(screen.getByText(INTRO_HOST.pending)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: INTRO_HOST.markDone }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/admin/teams/saltwind/intro', { completed: true }));
    expect(await screen.findByText('Saltwind Traders: Meet the market marked finished.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: INTRO_HOST.undo }));
    await waitFor(() => expect(apiPostMock).toHaveBeenLastCalledWith('/api/admin/teams/saltwind/intro', { completed: false }));
    expect(apiPostMock).toHaveBeenCalledTimes(2);
  });

  it('sends a finished crew back through it, and reads the new state from the server', async () => {
    const user = userEvent.setup();
    apiPostMock.mockImplementation((_path: string, body: { completed: boolean }) => {
      teams = teams.map((t) => (t.id === 'tortuga' ? { ...t, introCompletedAt: body.completed ? 1 : null } : t));
      return Promise.resolve({ ok: true, introCompletedAt: body.completed ? 1 : null });
    });
    wrap('/admin/crews?crew=tortuga');
    await screen.findByRole('heading', { name: 'Tortuga Capital' });

    await user.click(screen.getByRole('button', { name: INTRO_HOST.sendAgain }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/admin/teams/tortuga/intro', { completed: false }));
    // The row is re-read, so the screen follows the server rather than a local guess.
    expect(await screen.findByText(INTRO_HOST.pending)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: INTRO_HOST.markDone })).toBeInTheDocument();
  });

  it('is an action with an undo, not a switch', async () => {
    wrap('/admin/crews?crew=saltwind');
    await screen.findByRole('heading', { name: 'Saltwind Traders' });
    const switches = screen.getAllByRole('switch').map((s) => s.textContent ?? '');
    expect(switches.some((t) => t.includes('Meet the market'))).toBe(false);
  });
});
