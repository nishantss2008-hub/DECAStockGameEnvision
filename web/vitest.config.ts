import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Standalone test config: vitest ignores vite.config.ts when this file exists,
// so the PWA plugin (added to vite.config.ts later) never runs during tests.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Pure logic (*.test.ts) runs in node; component tests (*.test.tsx) get a DOM.
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
