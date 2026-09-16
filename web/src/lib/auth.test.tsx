/**
 * The token lifecycle the whole app hangs off: sign in, persist, restore on reload, sign out, and
 * the forced sign-out a revoked crew gets from any 401.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const live = vi.hoisted(() => ({ startLive: vi.fn(), stopLive: vi.fn() }));
vi.mock('./live', () => live);

import { AuthProvider, useAuth } from './auth';
import { ApiRequestError, SESSION_KEY, apiGet, clearSession, readSession, resetSessionCache, saveSession } from './api';
import { readSnapshot, writeSnapshot } from './snapshotCache';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const LOGIN_OK = { token: 'jwt-1', role: 'team', teamId: 'saltwind-traders', expiresAt: Date.now() + 3_600_000 };

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AuthProvider', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    resetSessionCache();
    live.startLive.mockClear();
    live.stopLive.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it('posts /auth/login, stores the token under bx.session and opens the stream', async () => {
    fetchMock.mockResolvedValue(respond(200, LOGIN_OK));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.login('Saltwind Traders', 'pw'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/login$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Saltwind Traders', password: 'pw' });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({ token: 'jwt-1', role: 'team' });
    expect(live.startLive).toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current).toMatchObject({ role: 'team', teamId: 'saltwind-traders', loading: false }),
    );
    expect(result.current.user).toMatchObject({ uid: 'saltwind-traders', role: 'team' });
  });

  it('signs the host in under the admin name, with no teamId', async () => {
    fetchMock.mockResolvedValue(respond(200, { token: 'jwt-admin', role: 'admin', expiresAt: Date.now() + 3_600_000 }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.loginAdmin('captain'));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: 'admin', password: 'captain' });
    await waitFor(() => expect(result.current).toMatchObject({ role: 'admin', teamId: null }));
    expect(result.current.user).toMatchObject({ uid: 'admin' });
  });

  it('restores a stored session on reload and reconnects', async () => {
    saveSession({ token: 'jwt-1', role: 'team', teamId: 'saltwind', expiresAt: Date.now() + 60_000 });
    resetSessionCache();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ role: 'team', teamId: 'saltwind' });
    expect(live.startLive).toHaveBeenCalled();
  });

  it('starts signed out when the stored session has expired', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'old', role: 'team', teamId: 'x', expiresAt: Date.now() - 1 }));
    resetSessionCache();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(live.startLive).not.toHaveBeenCalled();
  });

  it('logout clears the token, closes the stream and forgets cached crew data', async () => {
    fetchMock.mockResolvedValue(respond(200, LOGIN_OK));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.login('Saltwind Traders', 'pw'));
    writeSnapshot('teams/saltwind', { data: { cashBalance: 1 }, fromCache: false });

    await act(() => result.current.logout());
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(live.stopLive).toHaveBeenCalled();
    expect(readSnapshot('teams/saltwind')).toBeUndefined();
    await waitFor(() => expect(result.current).toMatchObject({ user: null, role: null, teamId: null, loading: false }));
  });

  it('a 401 from anywhere signs the app out', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, LOGIN_OK));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.login('Saltwind Traders', 'pw'));
    await waitFor(() => expect(result.current.role).toBe('team'));

    fetchMock.mockResolvedValueOnce(respond(401, { error: 'unauthenticated', message: 'Sign in again.' }));
    await act(async () => {
      await apiGet('/api/portfolio').catch(() => undefined);
    });
    expect(readSession()).toBeNull();
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(live.stopLive).toHaveBeenCalled();
  });

  it('forgets one crews cached data when another signs in on the same phone', async () => {
    fetchMock.mockResolvedValue(respond(200, LOGIN_OK));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.login('Saltwind Traders', 'pw'));
    writeSnapshot('teams/saltwind-traders', { data: { cashBalance: 1 }, fromCache: false });

    fetchMock.mockResolvedValue(respond(200, { ...LOGIN_OK, token: 'jwt-2', teamId: 'reef-runners' }));
    await act(() => result.current.login('Reef Runners', 'pw'));
    expect(readSnapshot('teams/saltwind-traders')).toBeUndefined();
    await waitFor(() => expect(result.current.teamId).toBe('reef-runners'));
  });

  it('throws ApiRequestError codes the sign-in screen can map to COPY, and stores nothing', async () => {
    fetchMock.mockResolvedValue(respond(401, { error: 'bad_login', message: 'Wrong crew name or password' }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    const err = await result.current.login('x', 'y').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 401, code: 'bad_login' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(live.startLive).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(result.current.login('x', 'y')).rejects.toMatchObject({ code: 'network' });
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
