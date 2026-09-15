import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const authState = vi.hoisted(() => ({ value: { teamId: 'saltwind' as string | null, role: 'team' as 'team' | 'admin' } }));

vi.mock('firebase/firestore', async () => (await import('./firestoreMock.testutil')).firestoreModule);
vi.mock('../firebase', () => ({ db: { name: 'test-db' }, auth: { currentUser: null } }));
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));

import { fsMock } from './firestoreMock.testutil';
import { useAdminHoldings, useAdminTape } from './useAdmin';
import { clearSnapshotCache } from '../lib/snapshotCache';

beforeEach(() => {
  fsMock.reset();
  clearSnapshotCache();
  authState.value = { teamId: 'saltwind', role: 'team' };
});

describe('host tape and holdings hooks', () => {
  it('useAdminTape listens to every trade only for the host', () => {
    const crew = renderHook(() => useAdminTape());
    expect(crew.result.current).toMatchObject({ trades: [], loading: false });
    expect(fsMock.active()).toEqual([]);
    crew.unmount();
    authState.value = { teamId: null, role: 'admin' };
    const host = renderHook(() => useAdminTape());
    expect(fsMock.active()).toEqual(['trades?order:executedAt:desc&limit:100']);
    act(() => fsMock.emitQuery('trades', [{ id: 't1', data: { teamId: 'a', side: 'buy', quantity: 5, executedAt: 2 } }]));
    expect(host.result.current.trades.map((t) => t.id)).toEqual(['t1']);
    host.unmount();
    expect(fsMock.active()).toEqual([]);
  });

  it('useAdminHoldings reads one crew’s holdings and hides empty positions', () => {
    authState.value = { teamId: null, role: 'admin' };
    const none = renderHook(() => useAdminHoldings(null));
    expect(fsMock.active()).toEqual([]);
    none.unmount();
    const host = renderHook(() => useAdminHoldings('crew1'));
    expect(fsMock.active()).toEqual(['teams/crew1/holdings']);
    act(() =>
      fsMock.emitQuery('teams/crew1/holdings', [
        { id: 'krkn', data: { shares: 10, avgCost: 100 } },
        { id: 'salt', data: { companyId: 'salt', shares: 0, avgCost: 0 } },
      ]),
    );
    expect(host.result.current.holdings).toEqual([{ companyId: 'krkn', shares: 10, avgCost: 100 }]);
    host.unmount();
  });
});
