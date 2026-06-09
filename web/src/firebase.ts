/**
 * Firebase initialization for the web client.
 *
 * Reads config from Vite env (import.meta.env.VITE_FIREBASE_*) and exports the
 * shared `auth` and `db` (Firestore) singletons. When running the dev server
 * with VITE_USE_EMULATORS === '1', it wires up the Auth + Firestore emulators.
 */

import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Optional local emulator wiring — guarded so production builds never touch it.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === '1') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    // eslint-disable-next-line no-console
    console.info('[firebase] Connected to local Auth + Firestore emulators.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[firebase] Failed to connect to emulators:', err);
  }
}
