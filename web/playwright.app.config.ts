import { defineConfig, devices } from '@playwright/test';

/**
 * Whole-game end-to-end run against an emulator stack that is ALREADY running (scripts/dev-local.sh).
 * There is deliberately no webServer: a plain `vite` would read web/.env, the real project's config.
 *
 *   APP_URL=http://localhost:5173 npx playwright test -c playwright.app.config.ts
 *
 * Projects run one after another on the same stack; each game ends with "New game (keep crews)", which
 * returns the market to the lobby for the next project. APP_SHOTS=<dir> saves screenshots of key steps.
 */
const iPhoneSE = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: './e2e/app',
  timeout: 12 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: '../node_modules/.cache/playwright-app',
  use: { baseURL: process.env.APP_URL, trace: 'off', actionTimeout: 20_000 },
  projects: [
    { name: 'webkit-iphone15', use: { ...devices['iPhone 15'] } },
    { name: 'chromium-iphone15', use: { browserName: 'chromium', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
    { name: 'webkit-iphoneSE', use: { ...devices['iPhone SE'], ...iPhoneSE } },
    { name: 'chromium-iphoneSE', use: { browserName: 'chromium', ...iPhoneSE, hasTouch: true, isMobile: true } },
  ],
});
