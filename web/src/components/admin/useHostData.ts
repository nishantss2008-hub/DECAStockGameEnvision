/**
 * Host screen helpers the shared hooks do not cover: the engine heartbeat from the public `/health` route, and a
 * host API call wrapper with COPY §11.1 errors. Firestore reads live in hooks/useAdmin (tape, holdings, teams).
 */
import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@deca/shared';
import { apiUrl, fetchOrNetworkError, parseApiResponse } from '../../lib/api';
import { useToast } from '../ios/Toast';
import { hostError } from './adminFormat';

export const HEALTH_POLL_MS = 5_000;

export interface HealthState {
  health: HealthResponse | null;
  /** Device time the latest answer arrived, to age `lastTickAt` between polls. */
  receivedAt: number | null;
  failed: boolean;
}

/** Polls `/health` every 5 s (plan Task 13). */
export function useHealth(intervalMs = HEALTH_POLL_MS): HealthState {
  const [state, setState] = useState<HealthState>({ health: null, receivedAt: null, failed: false });
  useEffect(() => {
    let active = true;
    const run = () =>
      fetchOrNetworkError(apiUrl('/health'), { method: 'GET' })
        .then((res) => parseApiResponse<HealthResponse>(res))
        .then(
          (health) => active && setState({ health, receivedAt: Date.now(), failed: false }),
          () => active && setState((s) => ({ ...s, failed: true })),
        );
    void run();
    const id = setInterval(run, Math.max(1_000, intervalMs));
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return state;
}

type ActionResult<T> = { ok: true; value: T } | { ok: false; title: string; message?: string };

/**
 * Runs a host API call. Failures show a toast with the COPY §11.1 title and message (unless `quiet`, for sheets
 * that show the error inline) and are returned as `{ title, message }`.
 */
export function useHostAction() {
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, call: () => Promise<T>, opts: { success?: string; quiet?: boolean } = {}): Promise<ActionResult<T>> => {
      setPending(key);
      try {
        const value = await call();
        if (opts.success) toast.show({ title: opts.success });
        return { ok: true, value };
      } catch (err) {
        const e = hostError(err);
        if (!opts.quiet) toast.show({ title: e.message ? `${e.title}. ${e.message}` : e.title });
        return { ok: false, title: e.title, message: e.message };
      } finally {
        setPending(null);
      }
    },
    [toast],
  );
  return { run, pending };
}
