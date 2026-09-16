import { defineConfig } from 'vitest/config';

/**
 * Integration tests. Run with `npm run test:integration` from the repo root (or
 * `npm run test:int` here). Each file opens its OWN temp SQLite file under the
 * OS temp directory and deletes it afterwards: no emulator, no shared state, no
 * credentials, nothing to start first.
 *
 * The files share the engine + realtime singletons within a worker, so they run
 * one at a time.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
