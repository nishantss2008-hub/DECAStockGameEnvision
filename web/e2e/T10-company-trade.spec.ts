/**
 * Company + Trade smoke test (MOBILE §7.7, §7.8, §7.10) against a running local stack with a live game and a
 * seeded crew that owns KRKN (scripts/dev-local.sh, then a crew + a few orders through the API).
 *
 *   APP_URL=http://localhost:5373 CREW=Saltwind CREW_PASSWORD=plunder42 npx playwright test e2e/T10-company-trade.spec.ts --project=webkit
 *
 * Skipped when APP_URL is not set. SHOTS_DIR saves the Company page and the Trade sheet.
 */
import { expect, test, type Page } from '@playwright/test';

const APP_URL = process.env.APP_URL;
const CREW = process.env.CREW ?? 'Saltwind';
const PASSWORD = process.env.CREW_PASSWORD ?? 'plunder42';
const TICKER = process.env.TICKER ?? 'KRKN';
const SHOTS_DIR = process.env.SHOTS_DIR;

test.use({ viewport: { width: 393, height: 852 }, colorScheme: 'light' });
test.skip(!APP_URL, 'Set APP_URL to a running local stack');

async function signIn(page: Page) {
  const teamId = CREW.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // The Welcome sheet, already answered (`bx.walkthrough.*` and its statuses went on 2026-09-18).
  await page.addInitScript((key) => localStorage.setItem(key, '1'), `bx.welcome.${teamId}`);
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel('Crew name').fill(CREW);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/portfolio/);
  const skip = page.getByRole('button', { name: /^(Skip for now|Done)$/ });
  await skip.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  if (await skip.isVisible()) await skip.click();
}

/** Every "?" on the page opens the InfoTip sheet for its term, and the sheet closes again. */
async function checkEveryInfoTip(page: Page, scope = '.bx-page') {
  const tips = page.locator(`${scope} .ios-infotip-button`);
  const count = await tips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const tip = tips.nth(i);
    await tip.scrollIntoViewIfNeeded();
    await tip.click();
    await expect(page).toHaveURL(/sheet=term/);
    await expect(page.locator('.ios-infotip-sheet[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/sheet=term/);
  }
  return count;
}

async function typeOnKeypad(page: Page, digits: string) {
  const sheet = page.getByRole('dialog');
  for (const d of digits) await sheet.getByRole('button', { name: d, exact: true }).click();
}

test('Company page, Financials, All stats and the Trade sheet flow', async ({ page }) => {
  await signIn(page);

  // Company page: header, chart, position, key stats with sector averages, and a "?" on every metric.
  await page.goto(`${APP_URL}/markets/company/${TICKER}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('slider', { name: new RegExp(`${TICKER} price`) })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your position' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Key stats' })).toBeVisible();
  await expect(page.getByText(/^(Sector|Market) average: /).first()).toBeVisible();
  await expect(page.getByText(/^Analyst view: |^No analyst view/)).toBeVisible();
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/company.png` });
  expect(await checkEveryInfoTip(page)).toBeGreaterThanOrEqual(12);

  // All stats and Financials.
  await page.getByRole('link', { name: 'See all stats' }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole('heading', { level: 1, name: 'All stats' })).toBeVisible();
  expect(await checkEveryInfoTip(page)).toBe(9);
  await page.goto(`${APP_URL}/markets/company/${TICKER}/financials`);
  await expect(page.getByRole('heading', { level: 1, name: 'Financials' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Is it making money?' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Income statement, scrolls sideways' })).toBeVisible();
  await checkEveryInfoTip(page);
  await page.getByRole('region', { name: 'Income statement, scrolls sideways' }).getByRole('button').first().click();
  await expect(page).toHaveURL(/sheet=term/);
  await page.keyboard.press('Escape');

  // Trade sheet: Entry → Preview → Placing → Filled.
  await page.goto(`${APP_URL}/markets/company/${TICKER}`);
  await page.getByRole('button', { name: `Buy ${TICKER}` }).click();
  await expect(page).toHaveURL(/sheet=trade/);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('radiogroup', { name: 'Action' })).toBeVisible();
  const preview = page.getByRole('button', { name: 'Preview order' });
  await expect(preview).toBeDisabled();
  await typeOnKeypad(page, '10');
  await expect(sheet.getByText(/^≈ .* with fee$/)).toBeVisible();
  await expect(sheet.getByText(new RegExp(`^This order would make ${TICKER} .*% of your account\\.$`))).toBeVisible();
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/trade-entry.png` });
  await preview.click();
  await expect(sheet.getByText('Step 2 · review before placing')).toBeVisible();
  await expect(sheet.getByText(new RegExp(`^Buy 10 shares of ${TICKER} \\(`))).toBeVisible();
  await expect(sheet.getByText('Buys right away at about the current price.')).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(sheet.getByRole('heading', { name: 'Order filled', exact: true })).toBeVisible();
  await expect(sheet.getByText('Fair winds.')).toBeVisible();
  await expect(page.getByText(new RegExp(`^Order filled: Bought 10 ${TICKER} at `)).first()).toBeVisible();

  // Trade again as a sell that is too big: inline problem with a fix.
  await page.getByRole('button', { name: 'Trade again' }).click();
  await sheet.getByRole('radio', { name: 'Sell' }).check({ force: true });
  await expect(sheet.getByRole('radio', { name: 'Sell' })).toBeChecked();
  await typeOnKeypad(page, '50000');
  await expect(sheet.getByText('Not enough shares')).toBeVisible();
  await expect(preview).toBeDisabled();
  await sheet.getByRole('button', { name: /^Sell all / }).click();
  await expect(sheet.getByText('Not enough shares')).toBeHidden();
  await expect(preview).toBeEnabled();

  // Discard: closing a typed order asks first.
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByText('Discard this order?')).toBeVisible();
  await page.getByRole('button', { name: 'Discard order' }).click();
  await expect(page).not.toHaveURL(/sheet=trade/);
});
