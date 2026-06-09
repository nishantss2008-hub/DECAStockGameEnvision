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

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'decastockenvision';

if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
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
