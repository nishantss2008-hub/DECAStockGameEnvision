/**
 * Firebase initialization for the web client.
 *
 * Reads config from Vite env (import.meta.env.VITE_FIREBASE_*) and exports the
 * shared `auth` and `db` (Firestore) singletons.
 *
 * Local emulators: when the dev server runs with VITE_USE_EMULATORS === '1'
 * (`npm run dev:local`), the app connects to the Auth + Firestore emulators and
 * needs no real Firebase config. It uses a `demo-` project id
 * (VITE_FIREBASE_PROJECT_ID, default `demo-deca`, matching the server) and a
 * placeholder apiKey, and it never passes the real project's apiKey, storage,
 * messaging or analytics ids (web/.env may hold them), so nothing can reach a
 * real project.
 *
 * Emulator address (set by scripts/dev-local.sh):
 *   VITE_EMULATOR_HOST             default 127.0.0.1; the computer's LAN IP with LAN=1, so phones on
 *                                  the same Wi-Fi reach the emulators
 *   VITE_FIRESTORE_EMULATOR_PORT   default 8080 (8080 + PORT_OFFSET for a parallel stack)
 *   VITE_AUTH_EMULATOR_PORT        default 9099 (9099 + PORT_OFFSET)
 */

import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env;

/** Emulator wiring is dev-only, so a production build never points at localhost. */
export const useEmulators = Boolean(env.DEV) && env.VITE_USE_EMULATORS === '1';

export const EMULATOR_PROJECT_ID = 'demo-deca';
const EMULATOR_API_KEY = 'demo-api-key';

export interface EmulatorEndpoints {
  host: string;
  firestorePort: number;
  authPort: number;
}

function portOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65_536 ? n : fallback;
}

/** Where the Auth and Firestore emulators listen. Missing or invalid values fall back to 127.0.0.1:8080 / :9099. */
export function emulatorEndpoints(vars: Record<string, unknown> = env): EmulatorEndpoints {
  const rawHost = vars.VITE_EMULATOR_HOST;
  const host = typeof rawHost === 'string' && /^[A-Za-z0-9.-]+$/.test(rawHost.trim()) ? rawHost.trim() : '127.0.0.1';
  return {
    host,
    firestorePort: portOr(vars.VITE_FIRESTORE_EMULATOR_PORT, 8080),
    authPort: portOr(vars.VITE_AUTH_EMULATOR_PORT, 9099),
  };
}

function emulatorConfig(): FirebaseOptions {
  const requested = env.VITE_FIREBASE_PROJECT_ID;
  if (requested && !requested.startsWith('demo-')) {
    // eslint-disable-next-line no-console
    console.warn(`[firebase] emulator mode needs a demo- project id; using ${EMULATOR_PROJECT_ID} instead of "${requested}".`);
  }
  const projectId = requested?.startsWith('demo-') ? requested : EMULATOR_PROJECT_ID;
  // Always the placeholder key: web/.env may hold the real project's key, and the emulators accept any value.
  return {
    apiKey: EMULATOR_API_KEY,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
  };
}

const firebaseConfig: FirebaseOptions = useEmulators
  ? emulatorConfig()
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
    };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulators) {
  try {
    const { host, firestorePort, authPort } = emulatorEndpoints();
    connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, firestorePort);
    // eslint-disable-next-line no-console
    console.info(
      `[firebase] Connected to local Auth (${host}:${authPort}) + Firestore (${host}:${firestorePort}) emulators (project ${firebaseConfig.projectId}).`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[firebase] Failed to connect to emulators:', err);
  }
}
