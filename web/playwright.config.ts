import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks for the dev component gallery (kit.html). Run from web/: `npx playwright test`.
 * The dev server serves kit.html; set KIT_PORT to reuse a server that is already running.
 * Chromium runs every check (it is the only engine that can emulate prefers-reduced-transparency);
 * WebKit at iPhone size is the closest available proxy for iOS Safari (Amendment M, Task 15).
 */
const port = Number(process.env.KIT_PORT ?? 5391);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  outputDir: '../node_modules/.cache/playwright-kit',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 393, height: 852 },
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 } },
    { name: 'webkit', use: { ...devices['iPhone 15'], hasTouch: false, isMobile: false } },
  ],
  webServer: {
    command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/kit.html`,
    reuseExistingServer: true,
    timeout: 60_000,
    // Emulator mode, whatever web/.env says: an app page loaded from this server can never reach a real project.
    env: { VITE_USE_EMULATORS: '1', VITE_FIREBASE_PROJECT_ID: 'demo-deca' },
  },
});
