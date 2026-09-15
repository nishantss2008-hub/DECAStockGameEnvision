import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const m = vi.hoisted(() => ({
  listener: null as null | ((u: unknown) => void),
  unsubscribe: vi.fn(),
  signInWithCustomToken: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

vi.mock('../firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    m.listener = cb;
    return m.unsubscribe;
  },
  signInWithCustomToken: m.signInWithCustomToken,
  signOut: m.signOut,
}));

import { AuthProvider, useAuth } from './auth';
import { ApiRequestError } from './api';
import { readSnapshot, writeSnapshot } from './snapshotCache';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    m.listener = null;
    m.unsubscribe.mockReset();
    m.signInWithCustomToken.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads role and teamId from the token claims and unsubscribes on unmount', async () => {
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    const user = { getIdTokenResult: vi.fn(async () => ({ claims: { role: 'team', teamId: 'saltwind-traders' } })) };
    await act(async () => m.listener!(user));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ user, role: 'team', teamId: 'saltwind-traders' });
    await act(async () => m.listener!(null));
    expect(result.current).toMatchObject({ user: null, role: null, teamId: null, loading: false });
    unmount();
    expect(m.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('forgets cached crew data when the account signs out or changes', async () => {
    renderHook(() => useAuth(), { wrapper });
    const crew = (uid: string) => ({ uid, getIdTokenResult: vi.fn(async () => ({ claims: { role: 'team', teamId: uid } })) });
    await act(async () => m.listener!(crew('a')));
    writeSnapshot('teams/a', { data: { cashBalance: 1 }, fromCache: false });
    await act(async () => m.listener!(crew('a'))); // token refresh for the same account keeps it
    expect(readSnapshot('teams/a')).toBeDefined();
    await act(async () => m.listener!(null));
    expect(readSnapshot('teams/a')).toBeUndefined();
    await act(async () => m.listener!(crew('b')));
    writeSnapshot('teams/b', { data: { cashBalance: 2 }, fromCache: false });
    await act(async () => m.listener!(crew('c'))); // switched accounts without a sign-out event
    expect(readSnapshot('teams/b')).toBeUndefined();
  });

  it('exchanges a crew name and password for a custom token', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ token: 'custom' }), { status: 200 }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.login('Saltwind Traders', 'pw'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/login$/);
    expect(JSON.parse(init.body)).toEqual({ name: 'Saltwind Traders', password: 'pw' });
    expect(m.signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), 'custom');
    await act(() => result.current.loginAdmin('captain'));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ name: 'admin', password: 'captain' });
  });

  it('throws ApiRequestError codes the sign-in screen can map to COPY', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'bad_login', message: 'Wrong crew name or password' }), { status: 401 }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    const err = await result.current.login('x', 'y').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 401, code: 'bad_login' });
    expect(m.signInWithCustomToken).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(result.current.login('x', 'y')).rejects.toMatchObject({ code: 'network' });
  });

  it('logout signs out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.logout());
    expect(m.signOut).toHaveBeenCalled();
  });

  it('useAuth outside the provider throws a clear error', () => {
    const Probe = () => {
      useAuth();
      return null;
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
    spy.mockRestore();
  });
});
