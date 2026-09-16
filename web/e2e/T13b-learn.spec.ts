/**
 * Task 13b smoke test: Learn root, glossary search, glossary term page, guide chapters and their "?" explanations.
 * Runs against a running dev:local stack with a crew (never the real Firebase project):
 *   APP_URL=http://localhost:5773 CREW_NAME="Sea Wolves" CREW_PASSWORD=plunder123 npx playwright test e2e/T13b-learn.spec.ts --project=webkit
 * (web port 5173 + PORT_OFFSET; the crew must exist and the game must be live.)
 * Skipped when APP_URL is unset. SHOT_DIR=… also saves the Learn root and the dark glossary term screenshots.
 */
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './a11y';

const APP_URL = process.env.APP_URL ?? '';
const CREW = process.env.CREW_NAME ?? 'Sea Wolves';
const PASSWORD = process.env.CREW_PASSWORD ?? 'plunder123';
const SHOT_DIR = process.env.SHOT_DIR;

test.skip(!APP_URL, 'needs a running dev:local stack (set APP_URL)');

async function signIn(page: Page) {
  await page.goto(`${APP_URL}/login?next=%2Flearn`);
  await page.getByLabel('Crew name').fill(CREW);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function expectSheetFor(page: Page, label: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: label })).toBeVisible();
  await expect(dialog.getByText('What it is')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open in Learn' })).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
}

test('Learn tab: chapters, glossary search, term page and every "?"', async ({ page }) => {
  await signIn(page);

  await page.goto(`${APP_URL}/learn`);
  await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search 73 terms' });
  await expect(search).toBeVisible();
  for (const name of ['How to play', 'How the game works', 'Read a company in 5 questions', 'Trading basics']) {
    await expect(page.getByRole('main').getByText(name, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole('heading', { level: 2, name: 'Glossary' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Account, / })).toBeVisible();
  await expect(page.getByText(/ left · Session \d of 8$/).first()).toBeVisible();
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/learn-root.png` });
  expect(await axeViolations(page)).toEqual([]);

  await search.fill('pe ratio');
  await expect(page.getByRole('link', { name: /Price vs\. profit/ }).first()).toHaveAttribute('href', '/learn/glossary/peRatio');
  await search.fill('zzzz');
  await expect(page.getByRole('heading', { name: 'No terms match “zzzz”' })).toBeVisible();
  await search.fill('');

  // Glossary term (dark), "See it on a company" and the InfoTip sheet for its metric.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${APP_URL}/learn/glossary/peRatio`);
  await expect(page.getByRole('heading', { level: 1, name: 'Price vs. profit' })).toBeVisible();
  await expect(page.getByText('P/E ratio', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'See it on a company' })).toBeVisible();
  await expect(page.getByText(/^Rest of .+: |^Rest of the market: /)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Open [A-Z]+, / })).toHaveAttribute('href', /\/learn\/company\/[A-Z]+\?highlight=peRatio$/);
  await expect(page.getByRole('heading', { name: 'Related terms' })).toBeVisible();
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/glossary-term-dark.png` });
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'What is Price vs. profit (P/E ratio)?' }).click();
  await expectSheetFor(page, 'Price vs. profit');
  await page.emulateMedia({ colorScheme: 'light' });

  // Five questions: every "look at" metric chip opens its explanation.
  await page.goto(`${APP_URL}/learn/five-questions`);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(5);
  const chips = page.getByRole('main').getByRole('button', { name: /^What is / });
  const chipCount = await chips.count();
  expect(chipCount).toBe(20);
  await chips.first().click();
  await expectSheetFor(page, 'Profit');

  // Trading basics and the guide: each topic has a working "?".
  for (const [path, count] of [['/learn/basics', 6], ['/learn/guide', 8]] as const) {
    await page.goto(`${APP_URL}${path}`);
    const qs = page.getByRole('main').getByRole('button', { name: /^What is / });
    await expect(qs).toHaveCount(count);
    for (let i = 0; i < count; i += 1) {
      await qs.nth(i).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('dialog')).toBeHidden();
    }
  }
});
