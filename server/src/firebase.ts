/**
 * Firebase Admin SDK initialization. The authority service uses the Admin SDK,
 * which BYPASSES Firestore Security Rules — it is the only trusted writer of
 * "real" data (prices, balances, trades, news).
 *
 * EMULATOR GUARD: when FIRESTORE_EMULATOR_HOST or FIREBASE_AUTH_EMULATOR_HOST is
 * set, the app is initialized with a project id ONLY. No service account is read
 * (not the env var, not the file, not `service-account.json`), and the other
 * emulator variable is filled in too, so neither Firestore nor Auth can reach
 * the real project from a local run or a test. The default emulator project id
 * is `demo-deca` (a `demo-` project never touches real resources).
 *
 * Outside emulator mode, credentials resolve in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT       — service-account JSON (single line) [production]
 *   2. FIREBASE_SERVICE_ACCOUNT_FILE  — path to a service-account JSON file
 *   3. ./service-account.json         — local file in the server workspace
 *   4. applicationDefault()           — GCP environment default creds
 */

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/** Ports from firebase.json `emulators`. */
const DEFAULT_FIRESTORE_EMULATOR = '127.0.0.1:8080';
const DEFAULT_AUTH_EMULATOR = '127.0.0.1:9099';
export const EMULATOR_PROJECT_ID = 'demo-deca';

export const emulatorMode = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

/**
 * Resolve service-account JSON from (in order): the FIREBASE_SERVICE_ACCOUNT env
 * var (inline JSON — production), the FIREBASE_SERVICE_ACCOUNT_FILE path, or a
 * local `service-account.json` dropped into the server workspace (easiest for
 * local runs). Returns undefined if none found. Never called in emulator mode.
 */
function resolveServiceAccount(): string | undefined {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return process.env.FIREBASE_SERVICE_ACCOUNT;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (file && existsSync(file)) return readFileSync(file, 'utf8');
  if (existsSync('service-account.json')) return readFileSync('service-account.json', 'utf8');
  return undefined;
}

if (getApps().length === 0) {
  if (emulatorMode) {
    // Both services go to the emulator, or a half-configured run could reach the real Auth project.
    process.env.FIRESTORE_EMULATOR_HOST ||= DEFAULT_FIRESTORE_EMULATOR;
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= DEFAULT_AUTH_EMULATOR;
    const projectId = process.env.GCLOUD_PROJECT || EMULATOR_PROJECT_ID;
    if (!projectId.startsWith('demo-')) {
      console.warn(`[firebase] emulator project "${projectId}" is not a demo- project; expected ${EMULATOR_PROJECT_ID}`);
    }
    initializeApp({ projectId });
    console.info('[firebase] emulator mode — service account ignored');
  } else {
    const projectId = process.env.GCLOUD_PROJECT || 'decastockenvision'; // an empty GCLOUD_PROJECT= line must not yield ''
    const serviceAccount = resolveServiceAccount();
    if (serviceAccount) {
      initializeApp({ credential: cert(JSON.parse(serviceAccount)), projectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
}

export const db = getFirestore();
export const adminAuth = getAuth();
