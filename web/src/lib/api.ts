/**
 * Client for the server: reads, writes and the session it carries.
 *
 * The server owns everything now — SQLite, the engine, the roster and the sessions — so every call
 * goes through here with the same credential: the HS256 token `/auth/login` issued, kept in
 * `localStorage` under `bx.session` and sent as `Authorization: Bearer`.
 *
 * Non-2xx responses throw `ApiRequestError` carrying the `{ error, message }` envelope the server
 * sends; a request that never reaches the server throws code `network` (COPY §9
 * ticket-errors.network). A 401 clears the stored session and notifies `onSessionChange`, so a
 * revoked crew (password reset, removal) is signed out the moment it touches the server.
 */

import type { ApiError, Role } from '@deca/shared';

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

/** Where the session lives. One key, one JSON object, this origin only. */
export const SESSION_KEY = 'bx.session';

/** What `POST /auth/login` returns, and what we keep. */
export interface Session {
  token: string;
  role: Role;
  teamId: string | null;
  /** Epoch ms the token expires (the server signs 12-hour tokens). */
  expiresAt: number;
}

/** Error thrown for any failed call to the server. */
export class ApiRequestError extends Error {
  /** HTTP status; 0 when the request never got a response. */
  readonly status: number;
  /** Machine-readable error code from the server ('insufficient_funds', 'bad_login', …). */
  readonly code: string;

  constructor(status: number, body: Partial<ApiError> | null, fallback: string) {
    super(body?.message || body?.error || fallback);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body?.error ?? 'request_failed';
  }
}

/** Joins the configured base URL with a path, tolerating leading/trailing slashes. */
export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

// ─── the session ───────────────────────────────────────────────────────────────────────────────

const listeners = new Set<(session: Session | null) => void>();
/** `undefined` until the first read: localStorage is touched once, then cached. */
let cached: Session | null | undefined;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private mode, or storage disabled: the session simply does not survive a reload.
    return null;
  }
}

/** Accepts only a well-formed, unexpired session; anything else is treated as signed out. */
export function parseSession(raw: string | null, now: number = Date.now()): Session | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<Session>;
  if (typeof s.token !== 'string' || !s.token) return null;
  if (s.role !== 'team' && s.role !== 'admin') return null;
  if (typeof s.expiresAt !== 'number' || !Number.isFinite(s.expiresAt) || s.expiresAt <= now) return null;
  return {
    token: s.token,
    role: s.role,
    teamId: typeof s.teamId === 'string' && s.teamId ? s.teamId : null,
    expiresAt: s.expiresAt,
  };
}

function notify(session: Session | null): void {
  for (const listener of [...listeners]) listener(session);
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

function removeRaw(): void {
  try {
    storage()?.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do */
  }
}

/** The stored session, or null when there is none (or it expired). */
export function readSession(): Session | null {
  if (cached !== undefined) return cached;
  const session = parseSession(readRaw());
  cached = session;
  // An expired blob is swept as soon as it is read, so it cannot linger on a shared phone.
  if (!session) removeRaw();
  return session;
}

/** Stores a fresh session and tells every listener (the auth provider, the live stream). */
export function saveSession(session: Session): void {
  cached = session;
  const store = storage();
  if (store) {
    try {
      store.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* the session lives for this page load only */
    }
  }
  notify(session);
}

/** Forgets the session (sign-out, or a 401 from anywhere). Idempotent. */
export function clearSession(): void {
  const had = cached !== undefined ? cached !== null : Boolean(readRaw());
  cached = null;
  removeRaw();
  if (had) notify(null);
}

/** Subscribes to sign-in and sign-out; returns the unsubscribe. */
export function onSessionChange(listener: (session: Session | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The bearer token, or null when signed out. */
export function sessionToken(): string | null {
  return readSession()?.token ?? null;
}

/** Test seam: drops the in-memory copy so the next read hits storage again. */
export function resetSessionCache(): void {
  cached = undefined;
}

// ─── requests ──────────────────────────────────────────────────────────────────────────────────

/** fetch() that turns a transport failure into ApiRequestError(0, 'network'). */
export async function fetchOrNetworkError(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ApiRequestError(0, { error: 'network', message: detail || 'Network request failed' }, 'Network request failed');
  }
}

/** Parses a response, throwing ApiRequestError on non-2xx. */
export async function parseApiResponse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const envelope = body && typeof body === 'object' ? (body as Partial<ApiError>) : null;
    throw new ApiRequestError(res.status, envelope, `Request failed (${res.status})`);
  }
  return body as T;
}

/** The Authorization header for the current session, or a 401 before anything is sent. */
export function authHeaders(): Record<string, string> {
  const token = sessionToken();
  if (!token) {
    throw new ApiRequestError(401, { error: 'unauthenticated', message: 'Not signed in.' }, 'Not signed in.');
  }
  return { Authorization: `Bearer ${token}` };
}

async function send<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  // Only declare JSON when a body is sent: the server's JSON parser rejects an empty body.
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetchOrNetworkError(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // The token is gone, expired or revoked: sign out now rather than let the app keep retrying.
  if (res.status === 401) clearSession();
  return parseApiResponse<T>(res);
}

/** POST `body` as JSON to `path` and return the parsed JSON response. */
export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return send<T>('POST', path, body);
}

/** GET `path` and return the parsed JSON response. */
export function apiGet<T = unknown>(path: string): Promise<T> {
  return send<T>('GET', path);
}

/** DELETE `path` and return the parsed JSON response. */
export function apiDelete<T = unknown>(path: string): Promise<T> {
  return send<T>('DELETE', path);
}
