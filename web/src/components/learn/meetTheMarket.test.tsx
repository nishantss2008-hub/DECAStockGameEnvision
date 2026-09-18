/**
 * The "Meet the market" flow (design 2026-09-16 §6): every card in order, Back, the honest Skip,
 * and completion — which posts once, then lands on Markets. A crew that has already finished reads
 * it without writing anything, because the page reads `team.introCompletedAt` from the live store
 * rather than remembering anything of its own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as const, loading: false } }));
const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/liveState', async () => (await import('../../hooks/liveMock.testutil')).liveStateModule);
vi.mock('../../lib/auth', () => ({ useAuth: () => authState.value }));
vi.mock('../../lib/api', async (orig) => ({ ...(await orig<typeof import('../../lib/api')>()), apiPost: apiPostMock }));

import { liveMock } from '../../hooks/liveMock.testutil';
import type { LiveState } from '../../lib/liveStore';
import { ShellDataProvider } from '../../shell/ShellData';
import MeetTheMarketPage from '../../pages/learn/MeetTheMarketPage';
import WelcomeSheet from '../../sheets/WelcomeSheet';
import { MOBILE } from '../../shell/copy';
import { INTRO, INTRO_COMPANIES } from './introCopy';
import { INTRO_STEPS } from './introFlow';

const ROSTER: Array<[string, string]> = Object.entries(INTRO_COMPANIES).map(([ticker, c]) => [ticker, c.sector]);

const market = (): Partial<LiveState> => ({
  companyIds: ROSTER.map(([t]) => t.toLowerCase()),
  companies: Object.fromEntries(
    ROSTER.map(([ticker, sector], i) => [
      ticker.toLowerCase(),
      { id: ticker.toLowerCase(), ticker, name: INTRO_COMPANIES[ticker]!.name, sector, startPrice: 1_000 + i * 100, currentPrice: 1_000 },
    ]),
  ),
  fundIds: ['grand-fleet', 'shipping-lanes', 'powder-and-shot'],
  funds: {
    'grand-fleet': { kind: 'fund', id: 'grand-fleet', ticker: 'FLEET', name: 'Grand Fleet Fund', description: 'The same amount of all 15 companies.', startPrice: 10_000 },
    'shipping-lanes': { kind: 'fund', id: 'shipping-lanes', ticker: 'SHIPS', name: 'Shipping Lanes Fund', description: 'An equal slice of the three Shipping & Salvage companies.', startPrice: 10_000 },
    'powder-and-shot': { kind: 'fund', id: 'powder-and-shot', ticker: 'ARMS', name: 'Powder and Shot Fund', description: 'An equal slice of the three Naval Arms companies.', startPrice: 10_000 },
  },
}) as unknown as Partial<LiveState>;

const game = {
  phase: 'lobby',
  startingCapital: 25_000_000,
  tickIntervalMs: 30_000,
  currency: { symbol: 'Ð', name: 'Doubloons' },
};

function push(introCompletedAt: number | null) {
  act(() =>
    liveMock.push({
      ...market(),
      game: game as never,
      team: { id: 'saltwind', name: 'Saltwind Traders', introCompletedAt } as never,
    }),
  );
}

function Where() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

const wrap = (ui: ReactNode, at = '/learn/meet-the-market') =>
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ShellDataProvider>{ui}</ShellDataProvider>
      <Where />
    </MemoryRouter>,
  );

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const counter = () => screen.getByText(/^Step \d+ of \d+$/, { selector: 'p.bx-intro__counter' }).textContent;

beforeEach(() => {
  liveMock.reset();
  apiPostMock.mockReset();
  apiPostMock.mockResolvedValue({ ok: true, introCompletedAt: 123 });
  authState.value = { teamId: 'saltwind', role: 'team', loading: false };
});

describe('Meet the market — the cards', () => {
  it('walks every stage in the order design §6 fixes, with a visible step counter', async () => {
    const user = userEvent.setup();
    wrap(<MeetTheMarketPage />);
    push(null);

    const expected = [
      "What you're doing",
      'What a share is',
      'The Pirate Composite',
      'Shipping & Salvage',
      'Provisions & Spice',
      'Naval Arms',
      'Cartography & Navigation',
      'Treasure Banking',
      'What a fund is',
      "You're ready",
    ];
    expect(expected).toHaveLength(INTRO_STEPS);

    for (const [i, title] of expected.entries()) {
      expect(heading()).toBe(title);
      expect(counter()).toBe(`Step ${i + 1} of ${INTRO_STEPS}`);
      if (i < expected.length - 1) await user.click(screen.getByRole('button', { name: INTRO.next }));
    }
    // The last card finishes instead of continuing.
    expect(screen.queryByRole('button', { name: INTRO.next })).toBeNull();
    expect(screen.getByRole('button', { name: INTRO.finish })).toBeInTheDocument();
  });

  it('fills the starting cash and the tick length from the live game', async () => {
    wrap(<MeetTheMarketPage />);
    push(null);
    expect(screen.getByText(/Your crew starts with Ð250,000\.00\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: INTRO.next }));
    expect(screen.getByText('Prices here update every 30 seconds, for every company at once.')).toBeInTheDocument();
  });

  it('shows a sector card’s three companies with ticker, one-liner and opening price — and no hidden data', () => {
    wrap(<MeetTheMarketPage />, '/learn/meet-the-market?step=6');
    push(null);
    expect(heading()).toBe('Naval Arms');
    const list = screen.getByRole('region', { name: INTRO.companiesHeader });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('BBRD')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Blackbeard Incorporated', { exact: false })).toBeInTheDocument();
    expect(within(rows[0]!).getByText(INTRO_COMPANIES.BBRD!.description)).toBeInTheDocument();
    expect(within(list).getAllByText(/^Opened at Ð/)).toHaveLength(3);
    expect(list.textContent).not.toMatch(/quality|grade|fair value/i);
  });

  it('shows the three funds with the holdings line the server ships', () => {
    wrap(<MeetTheMarketPage />, '/learn/meet-the-market?step=9');
    push(null);
    expect(heading()).toBe('What a fund is');
    const list = screen.getByRole('region', { name: INTRO.fundsHeader });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    for (const ticker of ['FLEET', 'SHIPS', 'ARMS']) expect(within(list).getByText(ticker)).toBeInTheDocument();
    expect(within(list).getByText('The same amount of all 15 companies.')).toBeInTheDocument();
  });
});

describe('Meet the market — moving through it', () => {
  it('goes back a card, and Back is disabled on the first', async () => {
    const user = userEvent.setup();
    wrap(<MeetTheMarketPage />, '/learn/meet-the-market?step=3');
    push(null);
    expect(heading()).toBe('The Pirate Composite');

    await user.click(screen.getByRole('button', { name: INTRO.back }));
    expect(heading()).toBe('What a share is');
    expect(screen.getByTestId('loc').textContent).toBe('/learn/meet-the-market?step=2');

    await user.click(screen.getByRole('button', { name: INTRO.back }));
    expect(heading()).toBe("What you're doing");
    expect(screen.getByTestId('loc').textContent).toBe('/learn/meet-the-market');
    expect(screen.getByRole('button', { name: INTRO.back })).toHaveAttribute('aria-disabled', 'true');
  });

  it('is finishable with the keyboard alone, never only by swiping', async () => {
    const user = userEvent.setup();
    wrap(<MeetTheMarketPage />);
    push(null);
    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(heading()).toBe('What a share is');
  });

  it('reads an out-of-range ?step as the nearest real card', () => {
    wrap(<MeetTheMarketPage />, '/learn/meet-the-market?step=99');
    push(null);
    expect(heading()).toBe("You're ready");
    expect(counter()).toBe(`Step ${INTRO_STEPS} of ${INTRO_STEPS}`);
  });
});

describe('Meet the market — the honest Skip', () => {
  it('reads "Finish later", says what it costs, and confirms before leaving', async () => {
    const user = userEvent.setup();
    wrap(<MeetTheMarketPage />);
    push(null);
    expect(screen.getByText(INTRO.skipNote)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: INTRO.skip }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(INTRO.skipTitle)).toBeInTheDocument();
    expect(within(dialog).getByText(INTRO.skipBody)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: INTRO.skipConfirm }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/markets'));
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});

describe('Meet the market — completion', () => {
  it('posts once, then lands on Markets', async () => {
    const user = userEvent.setup();
    let release: (() => void) | null = null;
    apiPostMock.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ ok: true, introCompletedAt: 7 }))),
    );
    wrap(<MeetTheMarketPage />, `/learn/meet-the-market?step=${INTRO_STEPS}`);
    push(null);

    const finish = screen.getByRole('button', { name: INTRO.finish });
    await user.click(finish);
    // A second tap while the first is still in flight must not place a second write.
    await user.click(screen.getByRole('button', { name: new RegExp(`${INTRO.finish}|${INTRO.finishing}`) }));
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledWith('/api/intro/complete');

    await act(async () => {
      release!();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/markets'));
  });

  it('keeps the crew on the card and offers a retry when the write fails', async () => {
    const user = userEvent.setup();
    apiPostMock.mockRejectedValueOnce(new Error('offline'));
    wrap(<MeetTheMarketPage />, `/learn/meet-the-market?step=${INTRO_STEPS}`);
    push(null);

    await user.click(screen.getByRole('button', { name: INTRO.finish }));
    expect(await screen.findByRole('alert')).toHaveTextContent(INTRO.error);
    expect(screen.getByTestId('loc').textContent).toBe(`/learn/meet-the-market?step=${INTRO_STEPS}`);

    await user.click(screen.getByRole('button', { name: INTRO.retry }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/markets'));
    expect(apiPostMock).toHaveBeenCalledTimes(2);
  });

  it('a crew that has already finished replays it without writing anything', async () => {
    const user = userEvent.setup();
    wrap(<MeetTheMarketPage />, `/learn/meet-the-market?step=${INTRO_STEPS}`);
    push(1_700_000_000_000);

    // No "you must finish this" wording, and the exit is a plain Close back to Learn.
    expect(screen.getByText(INTRO.replayNote)).toBeInTheDocument();
    expect(screen.queryByText(INTRO.skipNote)).toBeNull();
    expect(screen.queryByRole('button', { name: INTRO.skip })).toBeNull();

    await user.click(screen.getByRole('button', { name: INTRO.finish }));
    expect(apiPostMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/markets'));
  });

  it('follows the server when the host marks the crew done mid-flow', () => {
    wrap(<MeetTheMarketPage />);
    push(null);
    expect(screen.getByText(INTRO.skipNote)).toBeInTheDocument();
    push(1_700_000_000_000);
    expect(screen.getByText(INTRO.replayNote)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: INTRO.close })).toBeInTheDocument();
  });
});

describe('The lobby entry point', () => {
  it('leads a new crew from the Welcome sheet straight into Meet the market', async () => {
    const user = userEvent.setup();
    wrap(<WelcomeSheet open onClose={() => {}} onClosed={() => {}} />, '/portfolio?sheet=welcome');
    push(null);
    await user.click(await screen.findByRole('button', { name: INTRO.title }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/learn/meet-the-market'));
  });

  it('offers Markets instead once the crew has finished the intro', async () => {
    wrap(<WelcomeSheet open onClose={() => {}} onClosed={() => {}} />, '/portfolio?sheet=welcome');
    push(1_700_000_000_000);
    expect(await screen.findByRole('button', { name: MOBILE.welcome.explore })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: INTRO.title })).toBeNull();
  });
});
