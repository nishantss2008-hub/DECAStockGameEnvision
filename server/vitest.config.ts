import { defineConfig } from 'vitest/config';

/**
 * Unit tests: pure math and mocked I/O only. The emulator suites under
 * test/integration need the Firestore + Auth emulators, so they run through
 * `npm run test:integration` (vitest.int.config.ts) instead.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', '**/node_modules/**'],
  },
});
