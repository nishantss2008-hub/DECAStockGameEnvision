import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as 'team' | 'admin' | null } }));
const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', async () => (await import('./firestoreMock.testutil')).firestoreModule);
vi.mock('../firebase', () => ({ db: { name: 'test-db' }, auth: { currentUser: null } }));
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));
vi.mock('../lib/api', () => ({ apiGet: apiGetMock }));

import { fsMock } from './firestoreMock.testutil';
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
import { useAdminPoll, useAdminTeams } from './useAdmin';
import { invalidateAllFundamentals, useAllFundamentals } from './useAllFundamentals';
import { serverClock } from '../lib/gameTime';
import { clearSnapshotCache } from '../lib/snapshotCache';

beforeEach(() => {
  fsMock.reset();
  clearSnapshotCache();
  authState.value = { teamId: 'saltwind', role: 'team' };
});

describe('document hooks', () => {
  it('useGame reads game/state, derives the clock, feeds the skew estimate and unsubscribes', async () => {
    const { result, unmount } = renderHook(() => useGame());
    expect(result.current).toMatchObject({ game: null, clock: null, loading: true });
    expect(fsMock.active()).toEqual(['game/state']);
    const serverTime = Date.now() + 60_000;
    act(() =>
      fsMock.emitDoc('game/state', {
        phase: 'live',
        gameLengthMs: 3_600_000,
        tickIntervalMs: 5000,
        totalTicks: 720,
        sessionTicks: 90,
        serverTime,
      }),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.clock).toEqual({ gameLengthMs: 3_600_000, tickIntervalMs: 5000, totalTicks: 720, sessionTicks: 90, hours: 1 });
    await waitFor(() => expect(serverClock.offsetMs).toBeGreaterThan(55_000));
    unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('useGame ignores cached heartbeats for the skew estimate and reports fromCache', () => {
    const before = serverClock.offsetMs;
    const { result } = renderHook(() => useGame());
    act(() => fsMock.emitDoc('game/state', { phase: 'live', gameLengthMs: 3_600_000, serverTime: Date.now() + 9_999_999 }, true));
    expect(result.current.fromCache).toBe(true);
    expect(serverClock.offsetMs).toBe(before);
  });

  it('useMarket and useLeaderboard read their public docs', () => {
    const market = renderHook(() => useMarket());
    const board = renderHook(() => useLeaderboard());
    expect(fsMock.active()).toEqual(['leaderboard/current', 'market/summary']);
    act(() => fsMock.emitDoc('market/summary', { lastTick: 3 }));
    act(() => fsMock.emitDoc('leaderboard/current', null));
    expect(market.result.current).toMatchObject({ market: { lastTick: 3 }, loading: false });
    expect(board.result.current).toMatchObject({ leaderboard: null, loading: false });
    market.unmount();
    board.unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('useCompany follows the id and waits for both documents', () => {
    const { result, rerender, unmount } = renderHook(({ id }: { id: string | null }) => useCompany(id), { initialProps: { id: null as string | null } });
    expect(result.current).toMatchObject({ company: null, fundamentals: null, loading: false });
    expect(fsMock.active()).toEqual([]);
    rerender({ id: 'kraken' });
    expect(fsMock.active()).toEqual(['companies/kraken', 'companies/kraken/fundamentals/data']);
    act(() => fsMock.emitDoc('companies/kraken', { id: 'kraken', ticker: 'KRKN' }));
    expect(result.current.loading).toBe(true);
    act(() => fsMock.emitDoc('companies/kraken/fundamentals/data', { revenue: 1 }));
    expect(result.current).toMatchObject({ company: { ticker: 'KRKN' }, fundamentals: { revenue: 1 }, loading: false });
    rerender({ id: 'astrolabe' });
    expect(fsMock.active()).toEqual(['companies/astrolabe', 'companies/astrolabe/fundamentals/data']);
    expect(result.current).toMatchObject({ company: null, loading: true });
    unmount();
    expect(fsMock.active()).toEqual([]);
  });
});

describe('snapshot cache', () => {
  it('a second instance renders the last snapshot at once, then follows its own listener', () => {
    const first = renderHook(() => useCompanies());
    act(() => fsMock.emitQuery('companies', [{ id: 'kraken', data: { id: 'kraken', ticker: 'KRKN', currentPrice: 8412 } }]));
    const second = renderHook(() => useCompanies());
    expect(second.result.current).toMatchObject({ loading: false, companies: [{ id: 'kraken', currentPrice: 8412 }] });
    act(() => fsMock.emitQuery('companies', [{ id: 'kraken', data: { id: 'kraken', ticker: 'KRKN', currentPrice: 8500 } }]));
    expect(second.result.current.companies[0]!.currentPrice).toBe(8500);
    first.unmount();
    second.unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('never shows a previous id while the next one loads', () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useCompany(id), { initialProps: { id: 'kraken' } });
    act(() => fsMock.emitDoc('companies/kraken', { id: 'kraken' }));
    act(() => fsMock.emitDoc('companies/kraken/fundamentals/data', { revenue: 1 }));
    rerender({ id: 'astrolabe' });
    expect(result.current).toEqual({ company: null, fundamentals: null, loading: true, fromCache: false, error: null });
  });
});

describe('chunked series hooks', () => {
  it('useHistory without a company or with an empty range has no listeners', () => {
    const none = renderHook(() => useHistory(null, 0, 50));
    expect(none.result.current).toEqual({ points: [], loading: false });
    const backwards = renderHook(() => useHistory('kraken', 90, 10));
    expect(backwards.result.current).toEqual({ points: [], loading: false });
    expect(fsMock.active()).toEqual([]);
  });


  it('useHistory subscribes only to the chunks in range and diffs when the range moves', () => {
    const { result, rerender, unmount } = renderHook(({ from, to }: { from: number | null; to: number }) => useHistory('kraken', from, to), {
      initialProps: { from: 100 as number | null, to: 130 },
    });
    expect(fsMock.active()).toEqual(['companies/kraken/history/0', 'companies/kraken/history/1']);
    const subscribed = fsMock.subscribeCount;
    act(() => fsMock.emitDoc('companies/kraken/history/0', { chunk: 0, startTick: 0, prices: Array.from({ length: 120 }, (_, i) => 1000 + i), volumes: [] }));
    expect(result.current.loading).toBe(true);
    act(() => fsMock.emitDoc('companies/kraken/history/1', { chunk: 1, startTick: 120, prices: [5000, 5001], volumes: [7, 8] }));
    expect(result.current.loading).toBe(false);
    expect(result.current.points[0]).toEqual({ tick: 100, price: 1100, volume: 0 });
    expect(result.current.points.at(-1)).toEqual({ tick: 121, price: 5001, volume: 8 });

    rerender({ from: 100, to: 131 }); // same chunks: no new listeners
    expect(fsMock.subscribeCount).toBe(subscribed);
    rerender({ from: 100, to: 245 }); // adds chunk 2 only
    expect(fsMock.subscribeCount).toBe(subscribed + 1);
    expect(fsMock.active()).toEqual(['companies/kraken/history/0', 'companies/kraken/history/1', 'companies/kraken/history/2']);
    rerender({ from: 240, to: 245 }); // drops 0 and 1
    expect(fsMock.active()).toEqual(['companies/kraken/history/2']);
    unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('keeps exactly one listener per chunk under StrictMode double effects', () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const { rerender, unmount } = renderHook(({ to }: { to: number }) => useHistory('kraken', 0, to), { wrapper, initialProps: { to: 130 } });
    expect(fsMock.active()).toEqual(['companies/kraken/history/0', 'companies/kraken/history/1']);
    rerender({ to: 10 });
    expect(fsMock.active()).toEqual(['companies/kraken/history/0']);
    unmount();
    expect(fsMock.active()).toEqual([]);
    const game = renderHook(() => useGame(), { wrapper });
    expect(fsMock.active()).toEqual(['game/state']);
    game.unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('useCompositeHistory and useTeamHistory read value chunks; no team → no listeners', () => {
    const comp = renderHook(() => useCompositeHistory(null, 5));
    expect(fsMock.active()).toEqual(['market/summary/history/0']);
    act(() => fsMock.emitDoc('market/summary/history/0', { chunk: 0, startTick: 0, values: [1000, 1001, 1002] }));
    expect(comp.result.current).toEqual({ points: [{ tick: 0, value: 1000 }, { tick: 1, value: 1001 }, { tick: 2, value: 1002 }], loading: false });
    comp.unmount();
    const none = renderHook(() => useTeamHistory(null, 0, 10));
    expect(none.result.current).toEqual({ points: [], loading: false });
    expect(fsMock.active()).toEqual([]);
    none.unmount();
    const team = renderHook(() => useTeamHistory('saltwind', 0, 10));
    expect(fsMock.active()).toEqual(['teams/saltwind/history/0']);
    team.unmount();
  });
});

describe('collection hooks', () => {
  it('useCompanies indexes by id and ticker', () => {
    const { result, unmount } = renderHook(() => useCompanies());
    expect(fsMock.active()).toEqual(['companies?order:ticker:asc']);
    act(() => fsMock.emitQuery('companies', [{ id: 'kraken', data: { id: 'kraken', ticker: 'KRKN' } }]));
    expect(result.current.byId.kraken!.ticker).toBe('KRKN');
    expect(result.current.byTicker.KRKN!.id).toBe('kraken');
    unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('usePortfolio listens to the signed-in crew only and hides empty holdings', () => {
    const { result, unmount } = renderHook(() => usePortfolio());
    expect(fsMock.active()).toEqual(['teams/saltwind', 'teams/saltwind/holdings']);
    act(() => fsMock.emitDoc('teams/saltwind', { id: 'saltwind', cashBalance: 5 }));
    act(() =>
      fsMock.emitQuery('teams/saltwind/holdings', [
        { id: 'kraken', data: { companyId: 'kraken', shares: 10, avgCost: 1 } },
        { id: 'astrolabe', data: { shares: 0, avgCost: 1 } },
      ]),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.holdings).toEqual([{ companyId: 'kraken', shares: 10, avgCost: 1 }]);
    unmount();
    expect(fsMock.active()).toEqual([]);
    authState.value = { teamId: null, role: 'admin' };
    const host = renderHook(() => usePortfolio());
    expect(host.result.current).toEqual({ team: null, holdings: [], loading: false, fromCache: false, error: null });
    expect(fsMock.active()).toEqual([]);
  });

  it('useTrades and useOrders filter to the crew, newest first, with a limit', () => {
    const trades = renderHook(() => useTrades(25));
    const orders = renderHook(() => useOrders());
    expect(fsMock.active()).toEqual([
      'orders?teamId==saltwind&order:createdAt:desc&limit:100',
      'trades?teamId==saltwind&order:executedAt:desc&limit:25',
    ]);
    act(() => fsMock.emitQuery('trades', [{ id: 't1', data: { teamId: 'saltwind', executedAt: 2 } }]));
    expect(trades.result.current).toMatchObject({ trades: [{ id: 't1', executedAt: 2 }], loading: false });
    trades.unmount();
    orders.unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('useOrders falls back to a client-sorted query when the composite index is missing', () => {
    const { result } = renderHook(() => useOrders(2));
    act(() => fsMock.emitError('orders?teamId==saltwind&order:createdAt:desc&limit:2', 'failed-precondition'));
    expect(fsMock.active()).toEqual(['orders?teamId==saltwind']);
    act(() =>
      fsMock.emitQuery('orders', [
        { id: 'a', data: { createdAt: 1 } },
        { id: 'b', data: { createdAt: 3 } },
        { id: 'c', data: { createdAt: 2 } },
      ]),
    );
    expect(result.current.orders.map((o) => o.id)).toEqual(['b', 'c']);
    expect(result.current.loading).toBe(false);
  });

  it('useNews orders by firedAt and reports listener errors', () => {
    const { result } = renderHook(() => useNews(10));
    expect(fsMock.active()).toEqual(['news?order:firedAt:desc&limit:10']);
    act(() => fsMock.emitError('news?order:firedAt:desc&limit:10', 'permission-denied'));
    expect(result.current).toMatchObject({ news: [], loading: false, error: 'permission-denied' });
  });

  it('useAdminTeams only listens for the host', () => {
    const crew = renderHook(() => useAdminTeams());
    expect(crew.result.current).toMatchObject({ teams: [], loading: false });
    expect(fsMock.active()).toEqual([]);
    crew.unmount();
    authState.value = { teamId: null, role: 'admin' };
    const host = renderHook(() => useAdminTeams());
    expect(fsMock.active()).toEqual(['teams']);
    act(() => fsMock.emitQuery('teams', [{ id: 'b', data: { name: 'Zeta' } }, { id: 'a', data: { name: 'Alpha' } }]));
    expect(host.result.current.teams.map((t) => t.name)).toEqual(['Alpha', 'Zeta']);
    host.unmount();
    expect(fsMock.active()).toEqual([]);
  });
});

describe('useAllFundamentals', () => {
  beforeEach(() => invalidateAllFundamentals());

  it('loads every company fundamentals doc once, keyed by company id', async () => {
    fsMock.setGetDocs('**/fundamentals', [
      { path: 'companies/kraken/fundamentals/data', data: { revenue: 1 } },
      { path: 'companies/astrolabe/fundamentals/data', data: { revenue: 2 } },
      { path: 'elsewhere/x/fundamentals/data', data: { revenue: 3 } },
    ]);
    const { result } = renderHook(() => useAllFundamentals());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.byId).sort()).toEqual(['astrolabe', 'kraken']);
    expect(fsMock.active()).toEqual([]);
  });

  it('shares one load between instances and reloads when the market changes', async () => {
    fsMock.setGetDocs('**/fundamentals', [{ path: 'companies/kraken/fundamentals/data', data: { revenue: 1 } }]);
    const a = renderHook(({ market }: { market: number }) => useAllFundamentals(market), { initialProps: { market: 1 } });
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useAllFundamentals(1));
    expect(b.result.current).toMatchObject({ loading: false, byId: { kraken: { revenue: 1 } } });
    fsMock.setGetDocs('**/fundamentals', [{ path: 'companies/astrolabe/fundamentals/data', data: { revenue: 2 } }]);
    a.rerender({ market: 2 });
    await waitFor(() => expect(Object.keys(a.result.current.byId)).toEqual(['astrolabe']));
  });

  it('reports a failed load and retries on the next mount', async () => {
    fsMock.setGetDocs('**/fundamentals', { code: 'permission-denied' });
    fsMock.setGetDocs('companies', { code: 'unavailable' });
    const failed = renderHook(() => useAllFundamentals());
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    expect(failed.result.current).toMatchObject({ byId: {}, error: 'unavailable' });
    failed.unmount();
    fsMock.setGetDocs('**/fundamentals', [{ path: 'companies/kraken/fundamentals/data', data: { revenue: 5 } }]);
    const retry = renderHook(() => useAllFundamentals());
    await waitFor(() => expect(retry.result.current.byId).toEqual({ kraken: { revenue: 5 } }));
  });

  it('falls back to per-company reads when collection-group reads are not allowed', async () => {
    fsMock.setGetDocs('**/fundamentals', { code: 'permission-denied' });
    fsMock.setGetDocs('companies', [{ path: 'companies/kraken', data: { id: 'kraken' } }]);
    fsMock.setGetDoc('companies/kraken/fundamentals/data', { revenue: 9 });
    const { result } = renderHook(() => useAllFundamentals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byId).toEqual({ kraken: { revenue: 9 } });
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
