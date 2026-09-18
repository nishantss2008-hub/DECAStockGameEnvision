/**
 * Smoke test for Markets and News (MOBILE §7.6, §7.11) against a running emulator stack with a seeded crew.
 * Needs: `scripts/dev-local.sh` running (PORT_OFFSET=n), a crew seeded through the API, and a Playwright config with
 * NO webServer whose baseURL is the stack's web app (e.g. http://localhost:5173+n). Do not rely on the default
 * config's webServer: it starts a plain `vite` that reads web/.env (the real project) instead of the emulators.
 * Env: T11_CREW, T11_PASSWORD (skipped without them), T11_SHOTS (folder for screenshots).
 */
import { expect, test, type Page } from '@playwright/test';

const CREW = process.env.T11_CREW;
const PASSWORD = process.env.T11_PASSWORD;
const SHOTS = process.env.T11_SHOTS;

test.skip(!CREW || !PASSWORD, 'needs a seeded emulator stack (T11_CREW, T11_PASSWORD)');
test.use({ viewport: { width: 393, height: 852 }, colorScheme: 'light' });

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Crew name').fill(CREW!);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/portfolio/);
}

/** Segments are visually hidden radios inside labels; tap the label like a finger would. */
async function pickSegment(page: Page, group: string, label: string) {
  const radiogroup = page.getByRole('radiogroup', { name: group });
  await radiogroup.locator('label', { hasText: label }).click();
  await expect(radiogroup.getByRole('radio', { name: label, exact: true })).toBeChecked();
}

async function closeDialog(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('Markets: composite, funds, sector groups with their percentages, Compare and search', async ({ page }) => {
  await signIn(page);
  await page.goto('/markets');
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pirate Composite' })).toBeVisible();
  await expect(page.getByText(/\d+ rising · \d+ falling · \d+ unchanged/)).toBeVisible();
  // 2026-09-17: no chip row, no "Biggest moves" and no empty watchlist between the index and the list.
  await expect(page.getByRole('heading', { name: 'Industry groups' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Biggest moves this session' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Watchlist' })).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/markets.png` });

  await page.getByRole('button', { name: 'What is Market tracker (market index)?' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Market tracker' })).toBeVisible();
  await closeDialog(page);

  // Funds first, then one group per sector, each heading carrying that sector's session change.
  await expect(page.getByRole('region', { name: 'Funds' }).getByRole('link')).toHaveCount(3);
  const shipping = page.getByRole('region', { name: 'Shipping & Salvage' });
  await expect(shipping.getByRole('link')).toHaveCount(3);
  await expect(shipping.locator('.bx-group-change')).toContainText(/%$/);
  // The first row a crew can buy is on the first screen, not a screen and a half down.
  const firstFund = page.getByRole('region', { name: 'Funds' }).getByRole('link').first();
  expect((await firstFund.boundingBox())!.y).toBeLessThan(852);

  // The metric table is its own screen now (§7.6b), reached from the Companies header.
  await page.locator('#companies').getByRole('link', { name: 'Compare' }).click();
  await expect(page).toHaveURL(/\/markets\/compare/);
  const companies = page.locator('#companies');
  await expect(companies.getByRole('link', { name: /KRKN.*Company size/ })).toBeVisible();
  await pickSegment(page, 'Compare view', 'Health');
  await expect(page).toHaveURL(/view=health/);
  await expect(companies.getByText('Bill coverage')).toBeVisible();
  await companies.getByRole('button', { name: 'What these columns mean' }).click();
  const help = page.getByRole('dialog', { name: 'What these columns mean' });
  await expect(help.getByRole('heading', { name: 'Short-term bill coverage (current ratio)' })).toBeVisible();
  await closeDialog(page);

  await page.goto('/markets');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('searchbox').first().fill('kra');
  await expect(page.getByRole('link', { name: /Kraken Shipping Lines, KRKN/ })).toBeVisible();
  await page.getByRole('link', { name: /Kraken Shipping Lines, KRKN/ }).click();
  await expect(page).toHaveURL(/\/markets\/company\/KRKN/);
});

test('News: filters, dispatch cards, detail links to the company and never to Trade', async ({ page }) => {
  await signIn(page);
  await page.goto('/news');
  await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible();
  await expect(page.getByText('Dispatches from the Spanish Main')).toBeVisible();
  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first().getByText('What this means')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/news.png` });

  await pickSegment(page, 'Show news for', 'My holdings');
  await expect(page).toHaveURL(/filter=holdings/);
  await expect(cards.first()).toBeVisible();

  const card = cards.filter({ hasText: 'Kraken Shipping Lines posts blowout' }).first();
  await card.getByRole('button', { name: 'What is Since the news (change since the news)?' }).click();
  await expect(page.getByRole('dialog', { name: 'Since the news' })).toContainText('How much the price has moved since this news came out.');
  await closeDialog(page);

  await card.getByRole('link', { name: 'Kraken Shipping Lines posts blowout quarterly doubloons' }).click();
  await expect(page).toHaveURL(/\/news\/[^/]+$/);
  await expect(page.getByRole('link', { name: 'View KRKN' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /Buy|Trade/ })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: /Buy|Trade/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'View KRKN' }).click();
  await expect(page).toHaveURL(/\/news\/company\/KRKN/);
});
