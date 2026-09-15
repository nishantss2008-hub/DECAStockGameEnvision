/**
 * Task 13 host smoke test against a running emulator stack (scripts/dev-local.sh). Skipped unless HOST_E2E_URL
 * points at the stack's web app, e.g. HOST_E2E_URL=http://localhost:5673 npx playwright test e2e/T13-host.spec.ts.
 * The game must be live with at least one crew and a trade (the stack is seeded through the API).
 * HOST_SHOTS=<dir> also saves the Control and Market screenshots at 393×852.
 */
import { expect, test, type Page } from '@playwright/test';

const url = process.env.HOST_E2E_URL;
const shots = process.env.HOST_SHOTS;
const password = process.env.ADMIN_PASSWORD ?? 'captain';

test.skip(!url, 'HOST_E2E_URL is not set (needs the emulator stack).');
test.use({ viewport: { width: 393, height: 852 } });

async function signInAsHost(page: Page) {
  await page.goto(`${url}/login`);
  await page.getByRole('radio', { name: 'Host' }).check({ force: true });
  await page.getByLabel('Host password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(/\/admin$/);
}

test('host control, explanations, market and tape', async ({ page }) => {
  await signInAsHost(page);

  // Control: status line, hero, heartbeat and actions.
  await expect(page.getByRole('heading', { name: 'Control', level: 1 })).toBeVisible();
  await expect(page.getByText(/^LIVE · Market open · Sails up$/)).toBeVisible();
  await expect(page.getByText(/^Tick [\d,]+ of 5,760 · [\d.]+% complete$/)).toBeVisible();
  await expect(page.getByText(/Engine (healthy|running slow|not responding)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause trading' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End game…' })).toBeVisible();

  // End game needs END typed before it enables.
  await page.getByRole('button', { name: 'End game…' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'End game' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // A "?" opens its explanation.
  await page.getByRole('button', { name: /^What is Engine health/ }).click();
  await expect(page.getByRole('dialog').getByText('Why it matters')).toBeVisible();
  await page.keyboard.press('Escape');
  if (shots) await page.screenshot({ path: `${shots}/control.png` });

  // Market: classified banner, rows and legend.
  await page.getByRole('link', { name: /Market/ }).first().click();
  await expect(page.getByText('Host only: never project this screen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^What is Fair value/ })).toBeVisible();
  await expect(page.getByText(/Quality score \d+/).first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/market.png` });

  // Tape: at least one fill.
  await page.goto(`${url}/admin/tape`);
  await expect(page.getByText(/^(Bought|Sold)$/).first()).toBeVisible();

  // Crews: a crew's detail has the trading switch and the remove action.
  await page.goto(`${url}/admin/crews`);
  await page.getByRole('button', { name: /Black Pearl Traders/ }).first().click();
  await expect(page.getByRole('switch', { name: 'Trading allowed' }).or(page.getByRole('checkbox', { name: 'Trading allowed' }))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove crew…' })).toBeVisible();

  // Fire news: picking a company shows the price preview; publish stays off until a headline is typed.
  await page.goto(`${url}/admin/news?compose=1`);
  const sheet = page.getByRole('dialog', { name: 'Fire news' });
  await expect(sheet.getByRole('button', { name: /^Publish at tick/ })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Add company' }).click();
  await sheet.locator('.bx-host-picker__item').first().click();
  await expect(sheet.getByText(/→/)).toBeVisible();
  await sheet.getByLabel('Headline').fill('A test headline');
  await expect(sheet.getByText('15/90')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Publish at tick/ })).toBeEnabled();
});
