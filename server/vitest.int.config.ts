import { defineConfig } from 'vitest/config';

/**
 * Emulator integration tests. Run from the repo root with
 * `npm run test:integration`, which starts the Firestore + Auth emulators for the
 * `demo-deca` project and sets FIRESTORE_EMULATOR_HOST / GCLOUD_PROJECT.
 *
 * The files share one emulator, so they run one at a time. The setup file refuses
 * to run without the emulator (so a test can never reach a real project).
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    setupFiles: ['test/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
