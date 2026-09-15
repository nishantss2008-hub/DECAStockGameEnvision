/**
 * Crew-scoped hooks while the signed-in session is still being restored: they must report
 * loading (not an empty, finished result) and attach no listeners until the crew id is known,
 * so screens show a skeleton instead of flashing "no positions" / "no activity".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  value: { teamId: null as string | null, role: null as 'team' | 'admin' | null, loading: true },
}));

vi.mock('firebase/firestore', async () => (await import('./firestoreMock.testutil')).firestoreModule);
vi.mock('../firebase', () => ({ db: { name: 'test-db' }, auth: { currentUser: null } }));
vi.mock('../lib/auth', () => ({ useAuth: () => authState.value }));

import { fsMock } from './firestoreMock.testutil';
import { usePortfolio } from './usePortfolio';
import { useTrades } from './useTrades';
import { useOrders } from './useOrders';
import { useAdminTeams } from './useAdmin';
import { clearSnapshotCache } from '../lib/snapshotCache';

beforeEach(() => {
  fsMock.reset();
  clearSnapshotCache();
  authState.value = { teamId: null, role: null, loading: true };
});

describe('crew hooks while auth is loading', () => {
  it('report loading with no listeners', () => {
    expect(renderHook(() => usePortfolio()).result.current).toMatchObject({ team: null, holdings: [], loading: true });
    expect(renderHook(() => useTrades()).result.current).toMatchObject({ trades: [], loading: true });
    expect(renderHook(() => useOrders()).result.current).toMatchObject({ orders: [], loading: true });
    expect(renderHook(() => useAdminTeams()).result.current).toMatchObject({ teams: [], loading: true });
    expect(fsMock.active()).toEqual([]);
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
