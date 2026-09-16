/**
 * Append-only audit log. Writes to the server-only `audit_log` table (no route
 * exposes it to a crew). Every meaningful action is recorded.
 */

import { store } from '../store';

export type { LogEntry } from '../store/types';

export async function auditLog(action: string, actor: string, payload: Record<string, unknown> = {}): Promise<void> {
  // store.audit.add already swallows and reports write failures: logging must never break gameplay.
  store.audit.add(action, actor, payload);
}
