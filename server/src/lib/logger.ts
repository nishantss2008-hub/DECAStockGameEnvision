/**
 * Append-only audit log. Writes to the server-only `logs` collection (clients
 * cannot read it — see firestore.rules). Every meaningful action is recorded.
 */

import { db } from '../firebase';

export interface LogEntry {
  action: string;
  actor: string; // uid, teamId, 'engine', or 'admin'
  payload: Record<string, unknown>;
  timestamp: number;
}

export async function auditLog(
  action: string,
  actor: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const entry: LogEntry = { action, actor, payload, timestamp: Date.now() };
  try {
    await db.collection('logs').add(entry);
  } catch (err) {
    // Never let logging failures break gameplay; surface to stderr.
    console.error('[audit] failed to write log', action, err);
  }
}
