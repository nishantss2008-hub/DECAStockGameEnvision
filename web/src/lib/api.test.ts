import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiRequestError,
  SESSION_KEY,
  apiDelete,
  apiGet,
  apiPost,
  clearSession,
  onSessionChange,
  parseSession,
  readSession,
  resetSessionCache,
  saveSession,
  sessionToken,
  type Session,
} from './api';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

const session = (over: Partial<Session> = {}): Session => ({
  token: 'token-123',
  role: 'team',
  teamId: 'saltwind',
  expiresAt: Date.now() + 60_000,
  ...over,
});

function respond(status: number, body: unknown) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('session storage', () => {
  let store: Storage;
  beforeEach(() => {
    store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    resetSessionCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips through localStorage under bx.session', () => {
    saveSession(session());
    expect(JSON.parse(store.getItem(SESSION_KEY)!)).toMatchObject({ token: 'token-123', role: 'team', teamId: 'saltwind' });
    resetSessionCache();
    expect(readSession()).toMatchObject({ token: 'token-123', role: 'team', teamId: 'saltwind' });
    expect(sessionToken()).toBe('token-123');
  });

  it('clears the key and reports signed out', () => {
    saveSession(session());
    clearSession();
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(readSession()).toBeNull();
    expect(sessionToken()).toBeNull();
  });

  it('refuses a malformed, roleless or expired blob and sweeps it', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('not json')).toBeNull();
    expect(parseSession('{"token":"t","role":"pirate","expiresAt":9e15}')).toBeNull();
    expect(parseSession('{"role":"team","expiresAt":9e15}')).toBeNull();
    expect(parseSession(JSON.stringify(session({ expiresAt: Date.now() - 1 })))).toBeNull();
    // An expired session on a shared phone is removed the first time it is read.
    store.setItem(SESSION_KEY, JSON.stringify(session({ expiresAt: Date.now() - 1 })));
    resetSessionCache();
    expect(readSession()).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
  });

  it('treats the host session (no teamId) as signed in', () => {
    saveSession(session({ role: 'admin', teamId: null }));
    resetSessionCache();
    expect(readSession()).toMatchObject({ role: 'admin', teamId: null });
  });

  it('notifies listeners on sign-in and sign-out, once each', () => {
    const seen: (Session | null)[] = [];
    const off = onSessionChange((s) => seen.push(s));
    saveSession(session());
    clearSession();
    clearSession(); // already signed out: no second notification
    off();
    saveSession(session());
    expect(seen.map((s) => s?.role ?? null)).toEqual(['team', null]);
  });

  it('survives storage being unavailable (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    resetSessionCache();
    expect(() => saveSession(session())).not.toThrow();
    expect(sessionToken()).toBe('token-123'); // this page load only
  });
});

describe('api', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetSessionCache();
    saveSession(session());
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs JSON with the session token', async () => {
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
    // Base-agnostic: VITE_API_BASE is empty in production (the server serves the app from its own
    // origin) and may be an absolute URL in local development. Either way, joining it to a path that
    // carries no leading slash must not produce a double slash.
    const startUrl = String(fetchMock.mock.calls[0]![0]);
    expect(startUrl.endsWith('/admin/game/start')).toBe(true);
    expect(startUrl).not.toMatch(/[^:]\/\/admin\/game\/start/);
    expect(fetchMock.mock.calls[0]![1].headers['Content-Type']).toBeUndefined();
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
    await apiGet('/api/market');
    expect(fetchMock.mock.calls[1]![1].method).toBe('GET');
    await apiDelete('/api/admin/teams/saltwind');
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ method: 'DELETE' });
  });

  it('types the read endpoints', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { news: [{ id: 'n1' }] }));
    const body = await apiGet<{ news: { id: string }[] }>('/api/news?limit=5');
    expect(body.news[0]!.id).toBe('n1');
  });

  it('throws ApiRequestError with the server code and message', async () => {
    fetchMock.mockResolvedValueOnce(respond(409, { error: 'price_moved', message: 'The price moved' }));
    const err = await apiPost('/orders', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, code: 'price_moved', message: 'The price moved' });
  });

  it('uses request_failed for a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    await expect(apiGet('/health')).rejects.toMatchObject({ status: 502, code: 'request_failed' });
  });

  it('maps a failed fetch to the network code (COPY ticket-errors.network)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiPost('/orders', {})).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('clears the session on a 401 so a revoked crew is signed out', async () => {
    const seen: (Session | null)[] = [];
    const off = onSessionChange((s) => seen.push(s));
    fetchMock.mockResolvedValueOnce(respond(401, { error: 'unauthenticated', message: 'Sign in again.' }));
    await expect(apiGet('/api/portfolio')).rejects.toMatchObject({ status: 401 });
    off();
    expect(readSession()).toBeNull();
    expect(seen).toEqual([null]);
  });

  it('refuses without a session, before anything is sent', async () => {
    clearSession();
    await expect(apiGet('/api/market')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
