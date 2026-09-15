/**
 * The ID token refresh is part of every call: when it fails, callers still get an
 * ApiRequestError they can map to COPY (a phone that went offline mid-game → ticket-errors.network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMock = vi.hoisted(() => ({ currentUser: null as null | { getIdToken: () => Promise<string> } }));
vi.mock('../firebase', () => ({ auth: authMock, db: {} }));

import { ApiRequestError, apiPost } from './api';

describe('api token refresh failures', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('maps an offline token refresh to the network code and sends nothing', async () => {
    authMock.currentUser = {
      getIdToken: async () => {
        throw Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), { code: 'auth/network-request-failed' });
      },
    };
    const err = await apiPost('/orders', { companyId: 'kraken' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 0, code: 'network' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps any other token failure to unauthenticated', async () => {
    authMock.currentUser = {
      getIdToken: async () => {
        throw Object.assign(new Error('Firebase: Error (auth/user-token-expired).'), { code: 'auth/user-token-expired' });
      },
    };
    const err = await apiPost('/orders', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 401, code: 'unauthenticated' });
  });
});
