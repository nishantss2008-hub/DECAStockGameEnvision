/**
 * Portfolio stack smoke test (MOBILE §7.3–§7.5) against a running local stack with a seeded crew that owns
 * shares (scripts/dev-local.sh, then a crew + a few orders through the API).
 *
 *   APP_URL=http://localhost:5273 CREW=Saltwind CREW_PASSWORD=plunder42 npx playwright test e2e/T9-portfolio.spec.ts --project=webkit
 *
 * Skipped when APP_URL is not set. SHOTS_DIR saves the Portfolio and Positions screens.
 */
import { expect, test, type Page } from '@playwright/test';

const APP_URL = process.env.APP_URL;
const CREW = process.env.CREW ?? 'Saltwind';
const PASSWORD = process.env.CREW_PASSWORD ?? 'plunder42';
const SHOTS_DIR = process.env.SHOTS_DIR;

test.use({ viewport: { width: 393, height: 852 }, colorScheme: 'light' });
test.skip(!APP_URL, 'Set APP_URL to a running local stack');

async function signIn(page: Page) {
  // Welcome already answered with "Start the walkthrough", so Portfolio shows the walkthrough card (§7.2).
  const teamId = CREW.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ status: 'active', step: 0 })), `bx.walkthrough.${teamId}`);
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel('Crew name').fill(CREW);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/portfolio/);
  await expect(page.getByTestId('account-value')).toBeVisible();
  // First sign-in opens the Welcome sheet (MOBILE §7.2), which makes the page behind it inert.
  const skip = page.getByRole('button', { name: 'Skip for now' });
  await skip.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  if (await skip.isVisible()) {
    await skip.click();
    await expect(page).not.toHaveURL(/sheet=welcome/);
  }
}

/** Every "?" on the screen opens the InfoTip sheet for its term, and the sheet closes again. */
async function checkEveryInfoTip(page: Page) {
  const tips = page.locator('main .ios-infotip-button, .bx-page .ios-infotip-button');
  const count = await tips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const tip = tips.nth(i);
    const name = (await tip.getAttribute('aria-label')) ?? '';
    await tip.scrollIntoViewIfNeeded();
    await tip.click();
    await expect(page).toHaveURL(/sheet=term/);
    const sheet = page.locator('.ios-infotip-sheet[role="dialog"]');
    await expect(sheet).toBeVisible();
    // "What is Account value (total account value)?" → the sheet is titled with that label.
    expect(name).toMatch(/^What is /);
    await expect(sheet).toContainText(name.replace(/^What is /, '').replace(/ \(.*$|\?$/g, ''));
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/sheet=term/);
  }
}

test('Portfolio, Positions, Activity, Order detail and Balances show live data with working "?"', async ({ page }) => {
  await signIn(page);

  // Portfolio (§7.3)
  await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();
  await expect(page.getByTestId('account-value')).toContainText(/Ð[\d,]+\.\d\d/);
  await expect(page.getByText('this session', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('since the game began', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Cash available', { exact: true })).toBeVisible();
  await expect(page.locator('.pf-tile__link')).toHaveAttribute('href', '/standings');
  const seeAll = page.getByRole('link', { name: /^See all \d+$/ });
  await expect(seeAll).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await expect(page.getByText(/^Prices update every \d+ seconds · as of \d\d:\d\d:\d\d$/)).toBeVisible();
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/portfolio.png`, fullPage: true });

  // Show menu switches the metric under each value.
  await page.getByRole('button', { name: /^Show: Total gain/ }).click();
  await page.getByRole('menuitemradio', { name: '% of account' }).click();
  await expect(page.getByRole('button', { name: /^Show: % of account/ })).toBeVisible();
  await checkEveryInfoTip(page);

  // Positions (§7.4)
  await seeAll.click();
  await expect(page.getByRole('heading', { name: 'Positions', level: 1 })).toBeVisible();
  await expect(page.getByText('Where your money is').first()).toBeVisible();
  await expect(page.getByText('Swipe a row for Buy and Sell, or open the company.')).toBeVisible();
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/positions.png`, fullPage: true });
  await checkEveryInfoTip(page);
  await page.getByRole('button', { name: 'What these numbers mean' }).click();
  await expect(page.getByRole('dialog', { name: 'What these numbers mean' })).toContainText('Average price paid (average cost)');
  await page.keyboard.press('Escape');
  // Long-press menu (right-click stands in for the long press) opens the Trade sheet.
  const firstRow = page.locator('.pf-position-row').first();
  const ticker = await firstRow.getAttribute('data-ticker');
  await firstRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Buy' }).click();
  await expect(page).toHaveURL(new RegExp(`sheet=trade.*ticker=${ticker}.*side=buy|sheet=trade.*side=buy.*ticker=${ticker}`));
  await page.goBack();

  // Activity (§7.5)
  await page.goto(`${APP_URL}/portfolio/activity`);
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Session \d$/ }).first()).toBeVisible();
  const bought = page.getByRole('link', { name: /^Bought / }).first();
  await bought.click();
  await expect(page.getByRole('heading', { name: 'Order', level: 1 })).toBeVisible();
  await expect(page.getByText('Fill price')).toBeVisible();
  await expect(page.getByText(/^BX-[A-Z0-9]{6}$/)).toBeVisible();
  await checkEveryInfoTip(page);

  // Balances
  await page.goto(`${APP_URL}/portfolio/balances`);
  await expect(page.getByText('Cash available to trade (buying power)')).toBeVisible();
  await expect(page.getByText(/^Account value Ð[\d,.]+ = cash \+ invested\.$/)).toBeVisible();
  await checkEveryInfoTip(page);
});
