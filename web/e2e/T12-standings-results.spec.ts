/**
 * Smoke test for Standings, the Crew sheet and Final results (MOBILE §7.12–§7.13) against a running emulator
 * stack (scripts/dev-local.sh) with a seeded crew. Skipped unless E2E_APP_URL is set, e.g.
 *   E2E_APP_URL=http://localhost:5573 E2E_CREW="Saltwind Traders" E2E_PASSWORD=saltwind1 \
 *     npx playwright test e2e/T12-standings-results.spec.ts --project=webkit
 * Results pages are checked when the game has ended; otherwise the "not open yet" state is checked.
 */
import { expect, test, type Page } from '@playwright/test';

const APP = process.env.E2E_APP_URL;
const CREW = process.env.E2E_CREW ?? 'Saltwind Traders';
const PASSWORD = process.env.E2E_PASSWORD ?? 'saltwind1';

test.skip(!APP, 'Set E2E_APP_URL to a running dev-local stack.');
test.use({ viewport: { width: 393, height: 852 } });

async function signIn(page: Page) {
  await page.goto(`${APP}/login`);
  await page.getByLabel('Crew name').fill(CREW);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/portfolio/);
}

/** Every visible "?" on the screen opens an explanation sheet with real text. */
async function expectTipsWork(page: Page, url: string) {
  const tips = page.locator('button[aria-label^="What is"]:visible, button[aria-label="What these numbers mean"]:visible');
  await page.goto(url);
  await expect(tips.first()).toBeVisible();
  const count = await tips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    if (i > 0) await page.goto(url);
    await tips.nth(i).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    expect((await dialog.innerText()).length).toBeGreaterThan(40);
  }
}

test('standings: your place, both views, crew sheet and explanations', async ({ page }) => {
  await signIn(page);
  // Visiting the results first marks them seen, so Standings does not auto-open them after the game ends.
  await page.goto(`${APP}/standings/results?page=1`);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.goto(`${APP}/standings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Standings' })).toBeVisible();
  await expect(page.getByText(/^You're \d+(st|nd|rd|th) of \d+$/)).toBeVisible();
  await expect(page.getByText(/crews · Ranked by account value\./)).toBeVisible();

  const rows = page.locator('.bx-standing');
  await expect(rows.first()).toHaveAttribute('aria-label', /^Rank 1, .+ since the game began, (no change|(up|down) \d+ places?)$/);
  await page.locator('input.ios-seg__input[value=session]').check({ force: true });
  await expect(rows.first()).toHaveAttribute('aria-label', /this session/);

  await rows.first().click();
  const sheet = page.getByRole('dialog').first();
  await expect(sheet).toContainText(/Rank 1 of \d+/);
  await expect(sheet).toContainText('Account value');
  const inline = sheet.locator('button[aria-label^="What is"]');
  await expect(inline).toHaveCount(5);
  await inline.first().click();
  await expect(inline.first()).toHaveAttribute('aria-expanded', 'true');

  await expectTipsWork(page, `${APP}/standings`);
});

test('final results: five pages with paging, or the not-open state', async ({ page }) => {
  await signIn(page);
  await page.goto(`${APP}/standings/results?page=1`);
  const notOpen = page.getByRole('heading', { name: "The market reveal isn't open yet" });
  const voyage = page.getByRole('heading', { level: 1, name: 'Voyage complete' });
  await expect(notOpen.or(voyage)).toBeVisible();
  if (await notOpen.isVisible()) return;

  await expect(page.locator('.ios-tabbar')).toBeHidden();
  const titles = ['Voyage complete', 'Your crew', 'What was behind the prices', 'Luck vs. research', 'Final standings'];
  for (let n = 1; n <= 5; n++) {
    await expect(page.getByRole('heading', { level: 1, name: titles[n - 1] })).toBeVisible();
    await expect(page.getByText(`Page ${n} of 5`)).toBeAttached();
    if (n < 5) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/page=4/);
  await page.getByRole('button', { name: 'View as list' }).click();
  await expect(page).toHaveURL(/page=3&sort=luck/);
  await expectTipsWork(page, `${APP}/standings/results?page=2`);
  await expectTipsWork(page, `${APP}/standings/results?page=3`);

  await page.goto(`${APP}/standings/results?page=5`);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/standings$/);
});
