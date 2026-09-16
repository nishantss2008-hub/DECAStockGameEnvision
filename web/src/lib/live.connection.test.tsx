/**
 * The connection itself, driven by a fake fetch: seed, fold, reconnect, resume, sign-out.
 * (.tsx only so vitest gives it a DOM — visibilitychange and the offline flag need one.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLiveConnection } from './live';
import { createTestLiveStore, type LiveStore, type Snapshot } from './liveStore';
import { readSession, resetSessionCache, saveSession } from './api';

function fakeStream() {
  const queue: string[] = [];
  let ended = false;
  let wake: (() => void) | null = null;
  const body = {
    getReader: () => ({
      async read(): Promise<{ value: string | undefined; done: boolean }> {
        for (;;) {
          if (queue.length) return { value: queue.shift(), done: false };
          if (ended) return { value: undefined, done: true };
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
      releaseLock() {},
    }),
  };
  return {
    body: body as unknown as ReadableStream<Uint8Array>,
    push(text: string) {
      queue.push(text);
      wake?.();
      wake = null;
    },
    end() {
      ended = true;
      wake?.();
      wake = null;
    },
  };
}

const BOOTSTRAP: Snapshot = {
  serverTime: 1000,
  game: null,
  companies: [{ id: 'kraken', currentPrice: 500 } as Snapshot['companies'][number]],
  market: null,
  leaderboard: null,
  news: [],
  portfolio: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

function streamResponse(stream: ReturnType<typeof fakeStream>, status = 200): Response {
  return { ok: status < 400, status, body: stream.body, text: async () => '' } as unknown as Response;
}

describe('live connection', () => {
  let store: LiveStore;
  let streams: ReturnType<typeof fakeStream>[];
  let fetchMock: ReturnType<typeof vi.fn>;

  function connection(overrides: { bootstrapStatus?: number; streamStatus?: number } = {}) {
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/bootstrap')) {
        return jsonResponse(overrides.bootstrapStatus ?? 200, BOOTSTRAP);
      }
      const stream = fakeStream();
      streams.push(stream);
      return streamResponse(stream, overrides.streamStatus ?? 200);
    });
    return createLiveConnection({
      store,
      fetchImpl: fetchMock as unknown as typeof fetch,
      token: () => 'tok',
      random: () => 0.5, // no jitter: delays are exactly base · 2^n
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    store = createTestLiveStore();
    streams = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    resetSessionCache();
  });

  it('seeds the store from /api/bootstrap and sends the session token on both calls', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().ready).toBe(true);
    expect(store.getState().companies.kraken?.currentPrice).toBe(500);
    expect(store.getState().status).toBe('open');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/api/stream'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/api/bootstrap'))).toBe(true);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
    }
    live.stop();
  });

  it('folds stream events into the store', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    streams[0]!.push('retry: 500\n\n');
    streams[0]!.push('event: tick\ndata: {"tick":4,"serverTime":9,"prices":{"kraken":600}}\n\n');
    streams[0]!.push(': ping\n\nevent: ping\ndata: {"t":11}\n\n');
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().tick).toBe(4);
    expect(store.getState().prices.kraken).toBe(600);
    expect(store.getState().companies.kraken?.currentPrice).toBe(600);
    live.stop();
  });

  it('reconnects with backoff after the stream drops, honouring the retry hint', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(1);

    streams[0]!.push('retry: 500\n\n');
    await vi.advanceTimersByTimeAsync(0);
    streams[0]!.end(); // the server went away
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().status).toBe('connecting');
    expect(streams).toHaveLength(1); // nothing yet: waiting out the backoff

    await vi.advanceTimersByTimeAsync(499);
    expect(streams).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(streams).toHaveLength(2);
    expect(store.getState().status).toBe('open');
    live.stop();
  });

  it('doubles the delay while the network stays down', async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/bootstrap')) return jsonResponse(200, BOOTSTRAP);
      throw new TypeError('Failed to fetch');
    });
    const live = createLiveConnection({
      store,
      fetchImpl: fetchMock as unknown as typeof fetch,
      token: () => 'tok',
      random: () => 0.5,
    });
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().status).toBe('offline');
    expect(store.getState().online).toBe(false);
    const attempts = () => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/stream')).length;
    expect(attempts()).toBe(1);

    await vi.advanceTimersByTimeAsync(3000); // first retry: the 3s default
    expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(5999); // second retry is 6s away, not 3
    expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts()).toBe(3);
    live.stop();
  });

  it('resumes at once when the tab comes back, without waiting out the backoff', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    streams[0]!.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(2);
    expect(store.getState().status).toBe('open');
    live.stop();
  });

  it('marks the store offline when the device does, and reconnects when it returns', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('offline'));
    expect(store.getState()).toMatchObject({ online: false, status: 'offline' });

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ online: true, status: 'open' });
    expect(streams).toHaveLength(2);
    live.stop();
  });

  it('clears the session and stays down on a 401', async () => {
    saveSession({ token: 'tok', role: 'team', teamId: 'saltwind', expiresAt: Date.now() + 60_000 });
    const live = connection({ streamStatus: 401 });
    live.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(readSession()).toBeNull();
    expect(live.running()).toBe(false);
    expect(store.getState().status).toBe('idle');
    expect(streams).toHaveLength(1); // no retry loop against a revoked token
  });

  // `POST /admin/game/new` replaces the whole world (companies, prices, portfolios) and the server sends
  // no event for it, so the host has to reconnect: every fresh stream opens with its own `snapshot`.
  it('refresh() reopens the stream, and the new snapshot replaces the old world', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().companies.kraken?.currentPrice).toBe(500);

    live.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(2); // the old stream was dropped and a new one opened

    const world = { ...BOOTSTRAP, companies: [{ id: 'gull', currentPrice: 111 } as Snapshot['companies'][number]] };
    streams[1]!.push(`event: snapshot\ndata: ${JSON.stringify(world)}\n\n`);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().companies.gull?.currentPrice).toBe(111);
    expect(store.getState().companies.kraken).toBeUndefined();
    live.stop();
  });

  // The server withholds each company's `reveal` block until the game ends, then publishes only a
  // `phase` event — so the companies the client is holding are the censored ones. Reconnecting is
  // what fetches the uncensored world; without it the results reveal has nothing to show.
  it('reconnects when the phase turns to ended, so the reveal arrives', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(1);

    streams[0]!.push('event: phase\ndata: {"phase":"live"}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(1); // live is not a reveal: nothing to re-read

    streams[0]!.push('event: phase\ndata: {"phase":"ended"}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(2);

    const revealed = {
      ...BOOTSTRAP,
      game: { phase: 'ended' },
      companies: [{ id: 'kraken', currentPrice: 500, reveal: { quality: 0.8 } } as unknown as Snapshot['companies'][number]],
    } as Snapshot;
    streams[1]!.push(`event: snapshot\ndata: ${JSON.stringify(revealed)}\n\n`);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().companies.kraken?.reveal).toBeTruthy();
    live.stop();
  });

  // The server now resends the whole world when the game ends, reveal included, so the results
  // screen fills in on the stream the client already has.
  it('does not reconnect when the end arrives as a snapshot carrying the reveal', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(1);

    const revealed = {
      ...BOOTSTRAP,
      game: { phase: 'ended' },
      companies: [{ id: 'kraken', currentPrice: 500, reveal: { quality: 0.8 } } as unknown as Snapshot['companies'][number]],
    } as Snapshot;
    streams[0]!.push(`event: snapshot\ndata: ${JSON.stringify(revealed)}\n\n`);
    // The phase event follows the snapshot, as the server publishes them.
    streams[0]!.push('event: phase\ndata: {"phase":"ended"}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().companies.kraken?.reveal).toBeTruthy();
    expect(streams).toHaveLength(1);
    live.stop();
  });

  it('does not reconnect again while the game stays ended', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    streams[0]!.push('event: phase\ndata: {"phase":"ended"}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(2);
    streams[1]!.push('event: phase\ndata: {"phase":"ended"}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(streams).toHaveLength(2);
    live.stop();
  });

  it('stop() ends the stream and ignores anything still in flight', async () => {
    const live = connection();
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    live.stop();
    streams[0]!.push('event: tick\ndata: {"tick":99,"prices":{}}\n\n');
    streams[0]!.end();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(store.getState().tick).not.toBe(99);
    expect(store.getState().status).toBe('idle');
    expect(streams).toHaveLength(1);
  });

  it('does nothing without a session', () => {
    const live = createLiveConnection({ store, fetchImpl: vi.fn() as unknown as typeof fetch, token: () => null });
    live.start();
    expect(live.running()).toBe(false);
  });
});
