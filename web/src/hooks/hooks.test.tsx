/**
 * The hooks over the live store and the ranged REST reads. The store is a real test store behind
 * the one seam module (liveMock), so a test pushes server state exactly as the stream would and
 * asserts what the screens get.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as 'team' | 'admin' | null } }));
const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock('./liveState', async () => (await import('./liveMock.testutil')).liveStateModule);
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));
vi.mock('../lib/api', () => ({ apiGet: apiGetMock }));

import { liveMock } from './liveMock.testutil';
import type { LiveState } from '../lib/liveStore';
import { useGame } from './useGame';
import { useCompanies } from './useCompanies';
import { useCompany } from './useCompany';
import { useHistory } from './useHistory';
import { useMarket, useCompositeHistory } from './useMarket';
import { usePortfolio } from './usePortfolio';
import { useTeamHistory } from './useTeamHistory';
import { useTrades } from './useTrades';
import { useOrders } from './useOrders';
import { useNews } from './useNews';
import { useLeaderboard } from './useLeaderboard';
import { useCountdown } from './useCountdown';
import { useDocSnapshot } from './useSnapshot';
import { useAdminPoll, useAdminTeams } from './useAdmin';
import { invalidateAllFundamentals, useAllFundamentals } from './useAllFundamentals';
import { invalidateRest } from './restCache';
import { serverClock } from '../lib/gameTime';

const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
const flush = () => act(async () => void (await Promise.resolve()));

/** A roster as the store holds it: ordered ids plus the rows. */
const roster = (...rows: Array<{ id: string; ticker: string }>): Partial<LiveState> =>
  ({ companyIds: rows.map((r) => r.id), companies: Object.fromEntries(rows.map((r) => [r.id, r])) }) as Partial<LiveState>;

beforeEach(() => {
  liveMock.reset();
  invalidateRest();
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue({});
  authState.value = { teamId: 'saltwind', role: 'team' };
});

describe('live document hooks', () => {
  it('useGame reports loading until the snapshot lands, then the game, clock and skew estimate', () => {
    serverClock.reset();
    const { result, unmount } = renderHook(() => useGame());
    expect(result.current).toMatchObject({ game: null, clock: null, loading: true, fromCache: false });

    const game = { phase: 'live', startAt: 1_000, tickMs: 5_000, gameLengthMs: 1_800_000, endAt: null, pausedAt: null };
    act(() => liveMock.push({ game: game as never, serverTime: Date.now() + 60_000 }));
    expect(result.current.game).toBe(game as never);
    expect(result.current.loading).toBe(false);
    expect(result.current.clock).not.toBeNull();
    expect(serverClock.offsetMs).toBeGreaterThan(50_000);

    unmount();
    expect(liveMock.subscribers()).toBe(0);
  });

  it('useGame ignores a heartbeat from a dropped stream and reports fromCache', () => {
    serverClock.reset();
    const { result } = renderHook(() => useGame());
    act(() => liveMock.push({ game: { phase: 'live' } as never, serverTime: Date.now() + 60_000, status: 'connecting' }));
    expect(result.current.fromCache).toBe(true);
    expect(serverClock.offsetMs).toBe(0);
  });

  it('useMarket and useLeaderboard read the pushed market and standings', () => {
    const market = renderHook(() => useMarket());
    const board = renderHook(() => useLeaderboard());
    expect(market.result.current).toMatchObject({ market: null, loading: true });
    act(() => liveMock.push({ market: { composite: 1_000 } as never, leaderboard: { rows: [{ teamId: 'a' }] } as never }));
    expect(market.result.current.market).toEqual({ composite: 1_000 });
    expect(board.result.current).toMatchObject({ leaderboard: { rows: [{ teamId: 'a' }] }, loading: false });
  });

  it('useDocSnapshot resolves only the paths the stream carries', () => {
    act(() =>
      liveMock.push({
        game: { phase: 'live' } as never,
        ...roster({ id: 'kraken', ticker: 'KRKN' }),
        news: [{ id: 'n1', firedAt: 5 }] as never,
        team: { id: 'saltwind', cash: 10 } as never,
      }),
    );
    const read = (path: string | null) => renderHook(() => useDocSnapshot<Record<string, unknown>>(path)).result.current;
    expect(read('game/state').data).toEqual({ phase: 'live' });
    expect(read('companies/kraken').data).toMatchObject({ ticker: 'KRKN' });
    expect(read('news/n1').data).toMatchObject({ firedAt: 5 });
    expect(read('teams/saltwind').data).toMatchObject({ cash: 10 });
    // Another crew's row and a server-only path are not readable, and do not hang on loading.
    expect(read('teams/other')).toMatchObject({ data: null, loading: false });
    expect(read('_engine/state')).toMatchObject({ data: null, loading: false });
    expect(read(null)).toEqual({ data: null, loading: false, fromCache: false, error: null });
  });

  it('useCompany follows the id and waits for both the company and the fundamentals read', async () => {
    apiGetMock.mockResolvedValue({ fundamentals: { kraken: { grade: 'A' }, saltworks: { grade: 'B' } } });
    act(() => liveMock.push(roster({ id: 'kraken', ticker: 'KRKN' }, { id: 'saltworks', ticker: 'SALT' })));
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useCompany(id), {
      initialProps: { id: 'kraken' } as { id: string | null },
    });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ company: { ticker: 'KRKN' }, fundamentals: { grade: 'A' } });

    rerender({ id: 'saltworks' });
    expect(result.current).toMatchObject({ company: { ticker: 'SALT' }, fundamentals: { grade: 'B' } });
    rerender({ id: null });
    expect(result.current).toEqual({ company: null, fundamentals: null, loading: false, fromCache: false, error: null });
    expect(apiGetMock).toHaveBeenCalledTimes(1); // one shared fundamentals read
  });
});

describe('ranged reads', () => {
  it('useHistory asks for nothing without a company or with an empty range', () => {
    expect(renderHook(() => useHistory(null, 0, 10)).result.current).toEqual({ points: [], loading: false });
    expect(renderHook(() => useHistory('kraken', 10, 5)).result.current).toEqual({ points: [], loading: false });
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('useHistory reads one range, shares it between instances and keeps points while the range moves', async () => {
    const points = [{ tick: 0, price: 1_000, volume: 5 }];
    apiGetMock.mockResolvedValue({ points });
    const { result, rerender } = renderHook(({ to }: { to: number }) => useHistory('kraken', null, to), { initialProps: { to: 5 } });
    await waitFor(() => expect(result.current.points).toEqual(points));
    expect(apiGetMock).toHaveBeenCalledWith('/api/companies/kraken/history?from=0&to=5');

    const second = renderHook(() => useHistory('kraken', null, 5));
    expect(second.result.current.points).toEqual(points); // cached, no second request
    expect(apiGetMock).toHaveBeenCalledTimes(1);

    const moved = [...points, { tick: 6, price: 1_100, volume: 2 }];
    apiGetMock.mockResolvedValue({ points: moved });
    rerender({ to: 6 });
    expect(result.current).toMatchObject({ points, loading: true }); // the chart does not blank
    await waitFor(() => expect(result.current.points).toEqual(moved));
    expect(apiGetMock).toHaveBeenLastCalledWith('/api/companies/kraken/history?from=0&to=6');
  });

  it('de-duplicates two charts opening the same range at once', async () => {
    apiGetMock.mockResolvedValue({ points: [{ tick: 1, price: 10, volume: 0 }] });
    renderHook(() => useHistory('kraken', 0, 9));
    renderHook(() => useHistory('kraken', 0, 9));
    await flush();
    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it('useCompositeHistory and useTeamHistory read value ranges; no crew → no request', async () => {
    apiGetMock.mockResolvedValue({ points: [{ tick: 2, value: 1_500 }] });
    const comp = renderHook(() => useCompositeHistory(null, 5));
    await waitFor(() => expect(comp.result.current.points).toEqual([{ tick: 2, value: 1_500 }]));
    expect(apiGetMock).toHaveBeenCalledWith('/api/market/history?from=0&to=5');

    expect(renderHook(() => useTeamHistory(null, 0, 5)).result.current).toEqual({ points: [], loading: false });
    const crew = renderHook(() => useTeamHistory('saltwind', 0, 5));
    await waitFor(() => expect(crew.result.current.points).toHaveLength(1));
    // The server takes the crew from the token, so the path never names a crew.
    expect(apiGetMock).toHaveBeenLastCalledWith('/api/portfolio/history?from=0&to=5');
  });
});

describe('list hooks', () => {
  it('useCompanies sorts by ticker and indexes by id and ticker', () => {
    const { result } = renderHook(() => useCompanies());
    act(() => liveMock.push(roster({ id: 'saltworks', ticker: 'SALT' }, { id: 'kraken', ticker: 'KRKN' })));
    expect(result.current.companies.map((c) => c.ticker)).toEqual(['KRKN', 'SALT']);
    expect(result.current.byId.kraken?.ticker).toBe('KRKN');
    expect(result.current.byTicker.SALT?.id).toBe('saltworks');
  });

  it('usePortfolio shows the signed-in crew only and hides empty positions', () => {
    const { result } = renderHook(() => usePortfolio());
    expect(result.current).toMatchObject({ team: null, holdings: [], loading: true });
    act(() =>
      liveMock.push({
        team: { id: 'saltwind', cash: 50_000 } as never,
        holdings: [{ companyId: 'krkn', shares: 10 }, { companyId: 'salt', shares: 0 }] as never,
      }),
    );
    expect(result.current.team).toMatchObject({ cash: 50_000 });
    expect(result.current.holdings).toEqual([{ companyId: 'krkn', shares: 10 }]);

    authState.value = { teamId: null, role: 'admin' };
    expect(renderHook(() => usePortfolio()).result.current).toMatchObject({ team: null, holdings: [], loading: false });
  });

  it('useTrades and useOrders show the crew rows newest first, cut to the limit', () => {
    act(() =>
      liveMock.push({
        team: { id: 'saltwind' } as never,
        trades: [{ id: 't1', executedAt: 1 }, { id: 't3', executedAt: 3 }, { id: 't2', executedAt: 2 }] as never,
        orders: [{ id: 'o1', createdAt: 9 }, { id: 'o2', createdAt: 11 }] as never,
      }),
    );
    expect(renderHook(() => useTrades()).result.current.trades.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
    expect(renderHook(() => useTrades(2)).result.current.trades.map((t) => t.id)).toEqual(['t3', 't2']);
    expect(renderHook(() => useOrders()).result.current.orders.map((o) => o.id)).toEqual(['o2', 'o1']);
  });

  it('useNews orders by firedAt and honours the limit', () => {
    const { result, rerender } = renderHook(({ n }: { n?: number }) => useNews(n), { initialProps: {} as { n?: number } });
    act(() => liveMock.push({ news: [{ id: 'a', firedAt: 1 }, { id: 'c', firedAt: 3 }, { id: 'b', firedAt: 2 }] as never }));
    expect(result.current.news.map((n) => n.id)).toEqual(['c', 'b', 'a']);
    rerender({ n: 1 });
    expect(result.current.news.map((n) => n.id)).toEqual(['c']);
  });

  it('keeps exactly one subscription per component under StrictMode double effects', () => {
    const { unmount } = renderHook(() => useCompanies(), { wrapper: strict });
    expect(liveMock.subscribers()).toBe(1);
    unmount();
    expect(liveMock.subscribers()).toBe(0);
  });
});

describe('useAllFundamentals', () => {
  beforeEach(() => invalidateAllFundamentals());

  it('reads every profile once, keyed by company id, and shares the load between instances', async () => {
    apiGetMock.mockResolvedValue({ fundamentals: { kraken: { grade: 'A' } } });
    const a = renderHook(() => useAllFundamentals());
    const b = renderHook(() => useAllFundamentals());
    expect(a.result.current).toMatchObject({ byId: {}, loading: true });
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.byId.kraken).toEqual({ grade: 'A' });
    expect(b.result.current.byId.kraken).toEqual({ grade: 'A' });
    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(apiGetMock).toHaveBeenCalledWith('/api/fundamentals');
  });

  it('reloads when the market changes', async () => {
    apiGetMock.mockResolvedValue({ fundamentals: {} });
    const { rerender, result } = renderHook(({ key }: { key: number }) => useAllFundamentals(key), { initialProps: { key: 1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ key: 2 });
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(2));
  });

  it('reports a failed read and retries on the next mount', async () => {
    apiGetMock.mockRejectedValueOnce(new Error('permission denied'));
    const first = renderHook(() => useAllFundamentals());
    await waitFor(() => expect(first.result.current.error).toBe('permission denied'));
    expect(first.result.current.byId).toEqual({});
    apiGetMock.mockResolvedValue({ fundamentals: { kraken: { grade: 'B' } } });
    const second = renderHook(() => useAllFundamentals());
    await waitFor(() => expect(second.result.current.byId.kraken).toEqual({ grade: 'B' }));
  });
});

describe('host hooks', () => {
  it('useAdminTeams reads /admin/teams for the host only', async () => {
    apiGetMock.mockResolvedValue({ teams: [{ id: 'b', name: 'Windward' }, { id: 'a', name: 'Anchor' }] });
    const crew = renderHook(() => useAdminTeams());
    await flush();
    expect(crew.result.current).toMatchObject({ teams: [], loading: false });
    expect(apiGetMock).not.toHaveBeenCalled();
    crew.unmount();

    authState.value = { teamId: null, role: 'admin' };
    const host = renderHook(() => useAdminTeams());
    expect(host.result.current.loading).toBe(true);
    await waitFor(() => expect(host.result.current.teams.map((t) => t.id)).toEqual(['a', 'b']));
    expect(apiGetMock).toHaveBeenCalledWith('/admin/teams');
  });
});

describe('timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    serverClock.reset(); // earlier tests fed it a 60 s heartbeat skew
  });
  afterEach(() => vi.useRealTimers());

  it('useCountdown ticks while live, freezes while paused and stops on unmount', () => {
    const live = { phase: 'live', gameLengthMs: 3_600_000, endAt: 1_000_000 + 10_500, pausedAt: null } as never;
    const { result, rerender, unmount } = renderHook(({ game }) => useCountdown(game), { initialProps: { game: live } });
    const offset = serverClock.offsetMs;
    expect(result.current.remainingMs).toBe(10_500 - offset);
    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current.label).toBe('00:00:09');
    rerender({ game: { ...(live as object), phase: 'paused', pausedAt: 1_000_000 + 4_000 } as never });
    expect(result.current).toEqual({ remainingMs: 6_500, label: '00:00:06' });
    expect(vi.getTimerCount()).toBe(0); // no ticking while the clock is stopped
    act(() => void vi.advanceTimersByTime(5_000));
    expect(result.current.remainingMs).toBe(6_500);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useAdminPoll polls, keeps the last data on error, refreshes on demand and stops on unmount', async () => {
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValueOnce({ rows: 1 }).mockRejectedValueOnce(new Error('Server down')).mockResolvedValue({ rows: 3 });
    const { result, unmount } = renderHook(() => useAdminPoll<{ rows: number }>('/admin/market', 5_000));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toEqual({ rows: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current).toMatchObject({ data: { rows: 1 }, error: 'Server down' });
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ data: { rows: 3 }, error: null });
    expect(apiGetMock).toHaveBeenCalledWith('/admin/market');
    unmount();
    const calls = apiGetMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(apiGetMock.mock.calls.length).toBe(calls);
  });
});
