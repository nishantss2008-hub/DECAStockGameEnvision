/**
 * The live connection: one SSE stream per signed-in session, feeding the live store.
 *
 * `EventSource` cannot send an `Authorization` header, so this is `fetch` + `ReadableStream` with
 * its own SSE parser. That also buys the three things a phone in a school gym needs:
 *   - auto-reconnect with exponential backoff and jitter, honouring the server's `retry:` hint;
 *   - an immediate resume when the tab comes back (`visibilitychange`) or the network returns,
 *     instead of waiting out a backoff the device slept through;
 *   - an `online` flag the screens can show, rather than a silently stale price.
 *
 * The store is seeded from `GET /api/bootstrap` so the app paints as soon as the token is known;
 * the stream then opens with its own `snapshot` and takes over. Every payload is already filtered
 * server-side (realtime/snapshot.ts) — hidden company data never reaches the client before the
 * game ends, and a crew only ever receives its own portfolio.
 */

import { ApiRequestError, apiUrl, clearSession, parseApiResponse, sessionToken } from './api';
import { liveStore, type LiveStore, type Snapshot, type StreamEvent } from './liveStore';

export { createTestLiveStore } from './liveStore';

/** Server default (`realtime/hub.ts` RETRY_MS); a `retry:` field overrides it. */
export const DEFAULT_RETRY_MS = 3_000;
/** Backoff ceiling: a phone that has been asleep for an hour still retries every half minute. */
export const MAX_BACKOFF_MS = 30_000;
/** How much of the delay is randomised, so 200 phones do not reconnect in lockstep. */
export const BACKOFF_JITTER = 0.25;

export const STREAM_PATH = '/api/stream';
export const BOOTSTRAP_PATH = '/api/bootstrap';

// ─── SSE parsing (pure) ────────────────────────────────────────────────────────────────────────

export interface SseMessage {
  /** The `event:` field, 'message' when the frame has none, or 'retry' for a reconnect hint. */
  event: string;
  /** `data:` lines joined with newlines; empty on a retry hint. */
  data: string;
  id?: string;
  /** New reconnect delay in ms. Takes effect immediately, so it arrives on its own message. */
  retry?: number;
}

export interface SseParser {
  /** Feeds a decoded chunk. Chunks may split anywhere — mid-line, mid-frame, mid-UTF8-sequence. */
  push(chunk: string): void;
  /** Drops anything half-parsed (a new connection starts clean). */
  reset(): void;
}

/**
 * The SSE wire format, to spec: lines end with LF, CR or CRLF; a blank line dispatches the frame;
 * a line starting with ':' is a comment (the heartbeat proxies need) and is ignored; `field: value`
 * loses exactly one space after the colon; a field with no colon has an empty value; repeated
 * `data:` lines are joined with newlines. A frame with no data is not dispatched, so the server's
 * opening `retry:` (which arrives alone) is delivered as its own message the moment it is read.
 */
export function createSseParser(onMessage: (message: SseMessage) => void): SseParser {
  let buffer = '';
  let dataLines: string[] = [];
  let eventName = '';
  let lastId: string | undefined;

  function dispatch(): void {
    if (dataLines.length === 0) {
      eventName = '';
      return;
    }
    const message: SseMessage = { event: eventName || 'message', data: dataLines.join('\n') };
    if (lastId !== undefined) message.id = lastId;
    dataLines = [];
    eventName = '';
    onMessage(message);
  }

  function handleLine(line: string): void {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment / heartbeat
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        eventName = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        // A NUL in the id is ignored per spec; anything else becomes the last event id.
        if (!value.includes('\0')) lastId = value;
        break;
      case 'retry': {
        const ms = Number(value);
        if (Number.isInteger(ms) && ms >= 0) onMessage({ event: 'retry', data: '', retry: ms });
        break;
      }
      default:
        break; // unknown fields are ignored
    }
  }

  return {
    push(chunk) {
      buffer += chunk;
      // Normalise line endings, then keep the trailing fragment for the next chunk.
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
    },
    reset() {
      buffer = '';
      dataLines = [];
      eventName = '';
    },
  };
}

// ─── backoff (pure) ────────────────────────────────────────────────────────────────────────────

export interface BackoffOptions {
  /** First delay; doubles from there. Defaults to the server's `retry:` hint. */
  base?: number;
  max?: number;
  /** Fraction of the delay that is randomised (0 = deterministic). */
  jitter?: number;
  random?: () => number;
}

/**
 * Delay before retry number `attempt` (0 = the first retry after a drop): base · 2^attempt, capped,
 * then spread by ±jitter. Never negative, always an integer.
 */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.base ?? DEFAULT_RETRY_MS;
  const max = options.max ?? MAX_BACKOFF_MS;
  const jitter = options.jitter ?? BACKOFF_JITTER;
  const random = options.random ?? Math.random;
  const safeAttempt = Math.max(0, Math.floor(attempt));
  // 2^30 is already far past the cap; clamping the exponent keeps the maths finite.
  const raw = base * 2 ** Math.min(safeAttempt, 30);
  const capped = Math.min(raw, max);
  if (jitter <= 0) return Math.round(capped);
  // random() ∈ [0,1) → spread ∈ [-jitter, +jitter)
  const spread = (random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(capped * (1 + spread)));
}

// ─── the connection ────────────────────────────────────────────────────────────────────────────

export interface LiveConnectionOptions {
  store?: LiveStore;
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  random?: () => number;
  /** Bearer token source; defaults to the stored session. */
  token?: () => string | null;
}

export interface LiveConnection {
  /** Opens the stream (and seeds the store) if a session exists. Idempotent. */
  start(): void;
  /** Closes the stream, cancels any pending retry and drops the listeners. Idempotent. */
  stop(): void;
  /** Reconnects now, cancelling any backoff: the tab woke, or the network came back. */
  refresh(): void;
  running(): boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createLiveConnection(options: LiveConnectionOptions = {}): LiveConnection {
  const store = options.store ?? liveStore;
  const getToken = options.token ?? sessionToken;
  const random = options.random ?? Math.random;
  const doFetch: typeof fetch = (input, init) =>
    (options.fetchImpl ?? globalThis.fetch.bind(globalThis))(input, init);

  let running = false;
  let attempt = 0;
  let retryHint = DEFAULT_RETRY_MS;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on every (re)connect so a slow, superseded read cannot write to the store. */
  let generation = 0;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function abort(): void {
    controller?.abort();
    controller = null;
  }

  /** The token is gone, expired or revoked: sign out and stay down until the next login. */
  function onUnauthorized(): void {
    clearSession();
    stop();
    store.patch({ status: 'idle', error: 'unauthenticated' });
  }

  function handleMessage(message: SseMessage, gen: number): void {
    if (gen !== generation) return;
    if (typeof message.retry === 'number') retryHint = message.retry;
    if (!message.data) return;
    let data: unknown;
    try {
      data = JSON.parse(message.data);
    } catch {
      return; // a truncated or malformed frame is dropped, not fatal
    }
    const wasEnded = store.getState().game?.phase === 'ended';
    store.apply({ type: message.event, data } as StreamEvent);
    // The server censors each company (and the leaderboard's final table) until the game ends, and
    // announces the end with a bare `phase` event — so what the client is holding is still the
    // censored world. Reopening the stream is what fetches the revealed one for the results screen.
    if (!wasEnded && store.getState().game?.phase === 'ended') refresh();
  }

  async function readStream(body: ReadableStream<Uint8Array>, gen: number): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser((m) => handleMessage(m, gen));
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value === undefined) continue;
        // Test doubles hand back strings; the browser hands back bytes.
        parser.push(typeof value === 'string' ? value : decoder.decode(value, { stream: true }));
        if (gen !== generation) break;
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }
  }

  /** Paints the app before the stream's own snapshot lands. Failures are not fatal. */
  async function seed(gen: number, token: string): Promise<void> {
    try {
      const res = await doFetch(apiUrl(BOOTSTRAP_PATH), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const snapshot = await parseApiResponse<Snapshot>(res);
      // The stream's snapshot is never older, so it wins if it already arrived.
      if (gen === generation && running && !store.getState().ready) {
        store.apply({ type: 'snapshot', data: snapshot });
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onUnauthorized();
    }
  }

  /** 'offline' outranks 'connecting': a phone with no network stays offline while it retries. */
  function markConnecting(): void {
    if (store.getState().status !== 'offline') store.patch({ status: 'connecting' });
  }

  function scheduleReconnect(): void {
    if (!running || timer !== null) return;
    const delay = backoffDelay(attempt, { base: retryHint, random });
    attempt += 1;
    markConnecting();
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    if (!running) return;
    const token = getToken();
    if (!token) {
      store.patch({ status: 'idle', online: true });
      return;
    }
    const gen = ++generation;
    clearTimer();
    abort();
    controller = new AbortController();
    markConnecting();
    try {
      const res = await doFetch(apiUrl(STREAM_PATH), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (gen !== generation || !running) return;
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        return;
      }
      if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);
      // A live connection is the only proof the network works; reset the backoff here.
      attempt = 0;
      store.patch({ status: 'open', online: true, error: null });
      await readStream(res.body, gen);
      if (gen !== generation || !running) return;
      // The server ended the stream (restart, deploy): reconnect like any other drop.
      store.patch({ status: 'connecting', error: null });
    } catch (err) {
      if (gen !== generation || !running) return;
      if (controller?.signal.aborted) return;
      store.patch({ status: 'offline', online: false, error: errorMessage(err) });
    }
    if (gen === generation && running) scheduleReconnect();
  }

  function onVisibility(): void {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    // The tab slept through its backoff; come back at once instead of waiting it out.
    if (store.getState().status !== 'open') refresh();
  }

  function onOnline(): void {
    store.patch({ online: true });
    refresh();
  }

  function onOffline(): void {
    store.patch({ online: false, status: 'offline' });
  }

  function addListeners(): void {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      window.addEventListener('pageshow', onVisibility);
    }
  }

  function removeListeners(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pageshow', onVisibility);
    }
  }

  function start(): void {
    if (running) return;
    const token = getToken();
    if (!token) return;
    running = true;
    attempt = 0;
    retryHint = DEFAULT_RETRY_MS;
    addListeners();
    const gen = generation + 1;
    void connect();
    void seed(gen, token);
  }

  function stop(): void {
    if (!running && timer === null && controller === null) return;
    running = false;
    generation += 1;
    clearTimer();
    abort();
    removeListeners();
    store.patch({ status: 'idle' });
  }

  function refresh(): void {
    if (!running) {
      start();
      return;
    }
    clearTimer();
    attempt = 0;
    void connect();
  }

  return { start, stop, refresh, running: () => running };
}

// ─── the app's single connection ───────────────────────────────────────────────────────────────

let connection: LiveConnection | null = null;

/** The connection the app runs on, created on first use. */
export function liveConnection(): LiveConnection {
  if (!connection) connection = createLiveConnection();
  return connection;
}

/** Opens the stream for the signed-in session (no-op without one). */
export function startLive(): void {
  liveConnection().start();
}

/** Closes the stream and forgets the crew's rows (sign-out). */
export function stopLive(): void {
  liveConnection().stop();
  liveStore.clearPortfolio();
}

/**
 * Reopens the stream so the store is rebuilt from the server's snapshot.
 *
 * For `POST /admin/game/new`: it replaces every company, price, holding and news item, and the
 * server publishes no event for it, so the host that fired it would otherwise keep painting the
 * game it just ended. Every fresh stream opens with a `snapshot`, so reconnecting is the resync.
 */
export function resyncLive(): void {
  liveConnection().refresh();
}

/** The store the app reads. Hook tests swap this with `createTestLiveStore()`. */
export function getLiveStore(): LiveStore {
  return liveStore;
}
