import { defineConfig, devices } from '@playwright/test';

/**
 * Whole-game end-to-end run against an authority server that is ALREADY running and serving web/dist.
 * There is deliberately no webServer: the app under test must be the built bundle the server hosts,
 * so the run exercises the real REST + SSE stack rather than a dev server.
 *
 *   (server/) DB_FILE=./data/e2e.db WEB_DIR=../web/dist PORT=8081 ADMIN_PASSWORD=… npx tsx src/index.ts
 *   (web/)    APP_URL=http://localhost:8081 npx playwright test -c playwright.app.config.ts
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
  // Service workers are blocked: installing one precaches ~138 files, which on its own pushes a single
  // host+crew run past the server's 240-requests-per-minute-per-IP limit and answers route chunks with 429.
  // The PWA/offline behaviour has its own coverage; this run is about the REST + SSE stack.
  use: { baseURL: process.env.APP_URL, trace: 'off', actionTimeout: 20_000, serviceWorkers: 'block' },
  projects: [
    { name: 'webkit-iphone15', use: { ...devices['iPhone 15'] } },
    { name: 'chromium-iphone15', use: { browserName: 'chromium', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
    { name: 'webkit-iphoneSE', use: { ...devices['iPhone SE'], ...iPhoneSE } },
    { name: 'chromium-iphoneSE', use: { browserName: 'chromium', ...iPhoneSE, hasTouch: true, isMobile: true } },
  ],
});
