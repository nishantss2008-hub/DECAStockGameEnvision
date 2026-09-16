/**
 * Crew-scoped hooks while the signed-in session is still being restored: they must report
 * loading (not an empty, finished result) and send no request until the crew is known, so screens
 * show a skeleton instead of flashing "no positions" / "no activity".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  value: { teamId: null as string | null, role: null as 'team' | 'admin' | null, loading: true },
}));
const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock('./liveState', async () => (await import('./liveMock.testutil')).liveStateModule);
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));
vi.mock('../lib/api', () => ({ apiGet: apiGetMock }));

import { liveMock } from './liveMock.testutil';
import { usePortfolio } from './usePortfolio';
import { useTrades } from './useTrades';
import { useOrders } from './useOrders';
import { useAdminTeams } from './useAdmin';

beforeEach(() => {
  liveMock.reset();
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue({});
  authState.value = { teamId: null, role: null, loading: true };
});

describe('crew hooks while auth is loading', () => {
  it('report loading and send no request', () => {
    expect(renderHook(() => usePortfolio()).result.current).toMatchObject({ team: null, holdings: [], loading: true });
    expect(renderHook(() => useTrades()).result.current).toMatchObject({ trades: [], loading: true });
    expect(renderHook(() => useOrders()).result.current).toMatchObject({ orders: [], loading: true });
    expect(renderHook(() => useAdminTeams()).result.current).toMatchObject({ teams: [], loading: true });
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('settle to an empty, non-loading result for an account without a crew once auth is known', () => {
    authState.value = { teamId: null, role: 'admin', loading: false };
    expect(renderHook(() => usePortfolio()).result.current).toMatchObject({ loading: false });
    expect(renderHook(() => useTrades()).result.current).toMatchObject({ loading: false });
    expect(renderHook(() => useOrders()).result.current).toMatchObject({ loading: false });
    authState.value = { teamId: 'saltwind', role: 'team', loading: false };
    expect(renderHook(() => useAdminTeams()).result.current).toMatchObject({ teams: [], loading: false });
  });
});
