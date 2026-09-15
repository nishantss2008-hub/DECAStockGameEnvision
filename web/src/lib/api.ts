/**
 * Client for the authority (write) service.
 *
 * All mutations go through these helpers, which attach a fresh Firebase ID token as a
 * Bearer credential. Reads come from Firestore directly (see hooks/). Non-2xx responses
 * throw `ApiRequestError` carrying the `{ error, message }` envelope; a request that never
 * reaches the server throws code `network` (COPY §9 ticket-errors.network).
 */

import type { ApiError } from '@deca/shared';
import { auth } from '../firebase';

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

/** Error thrown for any failed call to the authority service. */
export class ApiRequestError extends Error {
  /** HTTP status; 0 when the request never got a response. */
  readonly status: number;
  /** Machine-readable error code from the service ('insufficient_funds', 'bad_login', …). */
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

async function authHeaders(): Promise<Record<string, string>> {
  const current = auth.currentUser;
  if (!current) {
    throw new ApiRequestError(401, { error: 'unauthenticated', message: 'Not signed in.' }, 'Not signed in.');
  }
  let token: string;
  try {
    token = await current.getIdToken();
  } catch (err) {
    // An expired token refreshes over the network, so an offline phone fails here, before fetch.
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'auth/network-request-failed') {
      throw new ApiRequestError(0, { error: 'network', message: 'Network request failed' }, 'Network request failed');
    }
    throw new ApiRequestError(401, { error: 'unauthenticated', message: 'Not signed in.' }, 'Not signed in.');
  }
  return { Authorization: `Bearer ${token}` };
}

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

async function send<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  // Only declare JSON when a body is sent: the server's JSON parser rejects an empty body.
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetchOrNetworkError(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
