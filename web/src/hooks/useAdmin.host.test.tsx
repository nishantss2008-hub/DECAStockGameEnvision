/** The host tape and per-crew holdings: host-only reads, invisible to a crew. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as 'team' | 'admin' } }));
const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock('./liveState', async () => (await import('./liveMock.testutil')).liveStateModule);
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));
vi.mock('../lib/api', () => ({ apiGet: apiGetMock }));

import { liveMock } from './liveMock.testutil';
import { useAdminHoldings, useAdminTape } from './useAdmin';

beforeEach(() => {
  liveMock.reset();
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue({});
  authState.value = { teamId: 'saltwind', role: 'team' };
});

describe('host tape and holdings hooks', () => {
  it('useAdminTape reads every crew’s fills for the host only', async () => {
    const crew = renderHook(() => useAdminTape());
    await act(async () => void (await Promise.resolve()));
    expect(crew.result.current).toMatchObject({ trades: [], loading: false });
    expect(apiGetMock).not.toHaveBeenCalled();
    crew.unmount();

    authState.value = { teamId: null, role: 'admin' };
    apiGetMock.mockResolvedValue({ trades: [{ id: 't1', teamId: 'a', side: 'buy', quantity: 5, executedAt: 2 }] });
    const host = renderHook(() => useAdminTape());
    await waitFor(() => expect(host.result.current.trades.map((t) => t.id)).toEqual(['t1']));
    expect(apiGetMock).toHaveBeenCalledWith('/admin/trades?limit=100');
  });

  it('useAdminHoldings reads one crew’s holdings and hides empty positions', async () => {
    authState.value = { teamId: null, role: 'admin' };
    const none = renderHook(() => useAdminHoldings(null));
    await act(async () => void (await Promise.resolve()));
    expect(none.result.current).toMatchObject({ holdings: [], loading: false });
    expect(apiGetMock).not.toHaveBeenCalled();
    none.unmount();

    apiGetMock.mockResolvedValue({
      holdings: [{ companyId: 'krkn', shares: 10, avgCost: 100 }, { companyId: 'salt', shares: 0, avgCost: 0 }],
    });
    const host = renderHook(() => useAdminHoldings('crew1'));
    await waitFor(() => expect(host.result.current.holdings).toEqual([{ companyId: 'krkn', shares: 10, avgCost: 100 }]));
    expect(apiGetMock).toHaveBeenCalledWith('/admin/teams/crew1/holdings');
  });
});
