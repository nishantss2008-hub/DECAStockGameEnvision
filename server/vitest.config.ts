import { defineConfig } from 'vitest/config';

/**
 * Unit tests: pure math, the store on `:memory:`, and `fastify.inject` against it.
 * The integration suites under test/integration drive a real SQLite FILE (and a
 * listening server), so they run through `npm run test:integration`
 * (vitest.int.config.ts) instead — no emulator, no network, no credentials.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', '**/node_modules/**'],
  },
});
