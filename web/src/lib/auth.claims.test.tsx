/**
 * Claims when the forced token refresh fails (offline reload, flaky school Wi-Fi): the crew keeps
 * the role and teamId from its cached ID token instead of becoming a signed-in user with no crew.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const m = vi.hoisted(() => ({ listener: null as null | ((u: unknown) => void) }));

vi.mock('../firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    m.listener = cb;
    return () => {};
  },
  signInWithCustomToken: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

import { AuthProvider, useAuth } from './auth';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider claims fallback', () => {
  beforeEach(() => {
    m.listener = null;
  });

  it('uses the cached token claims when the forced refresh fails', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const getIdTokenResult = vi.fn(async (force?: boolean) => {
      if (force) throw Object.assign(new Error('offline'), { code: 'auth/network-request-failed' });
      return { claims: { role: 'team', teamId: 'saltwind' } };
    });
    await act(async () => m.listener!({ uid: 'saltwind', getIdTokenResult }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ role: 'team', teamId: 'saltwind' });
    expect(getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it('is signed in without a role only when no claims can be read at all', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const getIdTokenResult = vi.fn(async () => {
      throw new Error('offline');
    });
    await act(async () => m.listener!({ uid: 'x', getIdTokenResult }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ role: null, teamId: null });
  });
});
