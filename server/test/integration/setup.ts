/**
 * Runs before every integration test file (before its imports load firebase.ts).
 *
 * Integration tests only ever talk to the local emulators for a `demo-` project.
 * Without FIRESTORE_EMULATOR_HOST the Admin SDK would fall back to a real
 * project and credentials, so the run stops here instead.
 */

const EMULATOR_PROJECT_ID = 'demo-deca';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'Integration tests need the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set). ' +
      'Run `npm run test:integration` from the repo root.',
  );
}

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST.replace(/:\d+$/, '');
if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(emulatorHost)) {
  throw new Error(`Integration tests only use a local Firestore emulator (FIRESTORE_EMULATOR_HOST is "${process.env.FIRESTORE_EMULATOR_HOST}").`);
}

process.env.GCLOUD_PROJECT ||= EMULATOR_PROJECT_ID;
if (!process.env.GCLOUD_PROJECT.startsWith('demo-')) {
  throw new Error(
    `Integration tests only run against a demo- emulator project (got "${process.env.GCLOUD_PROJECT}"). ` +
      'Run `npm run test:integration` from the repo root.',
  );
}

// Never let a credential reach the Admin SDK or Google auth libraries in a test run.
delete process.env.FIREBASE_SERVICE_ACCOUNT;
delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
