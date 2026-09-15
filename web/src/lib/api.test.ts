import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { currentUser, authMock } = vi.hoisted(() => {
  const user = { getIdToken: async () => 'token-123' };
  return { currentUser: user, authMock: { currentUser: user as typeof user | null } };
});
vi.mock('../firebase', () => ({ auth: authMock, db: {} }));

import { ApiRequestError, apiDelete, apiGet, apiPost } from './api';

function respond(status: number, body: unknown) {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    authMock.currentUser = currentUser;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs JSON with a bearer token', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { trade: { id: 't1' } }));
    await expect(apiPost('/orders', { companyId: 'kraken' })).resolves.toEqual({ trade: { id: 't1' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url).endsWith('/orders')).toBe(true);
    expect(String(url)).not.toMatch(/[^:]\/\/orders/);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"companyId":"kraken"}');
  });

  it('sends no content-type or body for an empty POST, and supports GET and DELETE', async () => {
    fetchMock.mockImplementation(async () => respond(200, { ok: true }));
    await apiPost('admin/game/start');
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/[^/]\/admin\/game\/start$/);
    expect(fetchMock.mock.calls[0]![1].headers['Content-Type']).toBeUndefined();
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
    await apiGet('/admin/market');
    expect(fetchMock.mock.calls[1]![1].method).toBe('GET');
    await apiDelete('/admin/teams/saltwind');
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ method: 'DELETE' });
  });

  it('throws ApiRequestError with the server code and message', async () => {
    fetchMock.mockResolvedValueOnce(respond(409, { error: 'insufficient_funds', message: 'Not enough cash' }));
    const err = await apiPost('/orders', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, code: 'insufficient_funds', message: 'Not enough cash' });
  });

  it('uses request_failed for a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    await expect(apiGet('/health')).rejects.toMatchObject({ status: 502, code: 'request_failed' });
  });

  it('maps a failed fetch to the network code (COPY ticket-errors.network)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiPost('/orders', {})).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('refuses without a signed-in user', async () => {
    authMock.currentUser = null;
    await expect(apiGet('/admin/market')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
