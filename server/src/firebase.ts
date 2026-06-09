/**
 * Firebase Admin SDK initialization. The authority service uses the Admin SDK,
 * which BYPASSES Firestore Security Rules — it is the only trusted writer of
 * "real" data (prices, balances, trades, news).
 *
 * Credentials resolve in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT  — service-account JSON (single line) [production]
 *   2. FIRESTORE_EMULATOR_HOST   — local emulator (no credentials needed)
 *   3. applicationDefault()      — GCP environment default creds
 */

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'decastockenvision';

/**
 * Resolve service-account JSON from (in order): the FIREBASE_SERVICE_ACCOUNT env
 * var (inline JSON — production), the FIREBASE_SERVICE_ACCOUNT_FILE path, or a
 * local `service-account.json` dropped into the server workspace (easiest for
 * local runs). Returns undefined if none found.
 */
function resolveServiceAccount(): string | undefined {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return process.env.FIREBASE_SERVICE_ACCOUNT;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (file && existsSync(file)) return readFileSync(file, 'utf8');
  if (existsSync('service-account.json')) return readFileSync('service-account.json', 'utf8');
  return undefined;
}

if (getApps().length === 0) {
  const serviceAccount = resolveServiceAccount();
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)), projectId: PROJECT_ID });
  } else if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // Emulator: no real credentials required.
    initializeApp({ projectId: PROJECT_ID });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}

export const db = getFirestore();
export const adminAuth = getAuth();
