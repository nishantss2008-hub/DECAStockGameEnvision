/**
 * Client for the authority (write) service.
 *
 * All mutations go through these helpers, which attach a fresh Firebase ID
 * token as a Bearer credential. Reads come from Firestore directly elsewhere.
 * Non-2xx responses are thrown as `ApiRequestError` carrying the parsed
 * `{ error, message }` envelope when available.
 */

import type { ApiError } from '@deca/shared';
import { auth } from '../firebase';

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

/** Error thrown for any non-2xx response from the authority service. */
export class ApiRequestError extends Error {
  readonly status: number;
  /** Machine-readable error code from the service, when present. */
  readonly code: string;

  constructor(status: number, body: Partial<ApiError> | null, fallback: string) {
    super(body?.message || body?.error || fallback);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body?.error ?? 'request_failed';
  }
}

/** Build the Authorization header from the current user's ID token. */
async function authHeaders(): Promise<Record<string, string>> {
  const current = auth.currentUser;
  if (!current) {
    throw new ApiRequestError(401, { error: 'unauthenticated', message: 'Not signed in.' }, 'Not signed in.');
  }
  const token = await current.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/** Join the configured base URL with a path, tolerating leading/trailing slashes. */
function url(path: string): string {
  const base = API_BASE.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Parse a response, throwing ApiRequestError on non-2xx. */
async function handle<T>(res: Response): Promise<T> {
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
    throw new ApiRequestError(
      res.status,
      (body as Partial<ApiError> | null) ?? null,
      `Request failed (${res.status})`,
    );
  }
  return body as T;
}

/** POST `body` as JSON to `path` and return the parsed JSON response. */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  // Only declare a JSON content-type when we actually send a body — otherwise the
  // server's JSON parser rejects the empty body (e.g. game start/pause/resume/end).
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url(path), {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(res);
}

/** GET `path` and return the parsed JSON response. */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(url(path), { method: 'GET', headers });
  return handle<T>(res);
}
