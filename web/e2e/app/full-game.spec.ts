/**
 * One whole game on phones (final web gate): host setup → crew intro, research and first trade → news →
 * pause/resume → end and the reveal → new game with the crews kept. Needs the authority server running with the built
 * web app (DB_FILE=… WEB_DIR=../web/dist PORT=… ADMIN_PASSWORD=… npx tsx src/index.ts) and its game in the lobby;
 * run with playwright.app.config.ts (no webServer, see there). Crew names are unique per run.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { axeViolations } from '../a11y';

const PASSWORD = process.env.ADMIN_PASSWORD ?? 'captain';
const SHOTS = process.env.APP_SHOTS;
const CREW_PASSWORD = 'plunder42';

test.skip(!process.env.APP_URL, 'Set APP_URL to a running authority server (server/: npx tsx src/index.ts).');

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
}

async function hostPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, baseURL: process.env.APP_URL });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('radio', { name: 'Host' }).check({ force: true });
  await page.getByLabel('Host password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(/\/admin$/);
  return page;
}

async function editSetting(host: Page, label: string, option: string) {
  await host.getByRole('button', { name: new RegExp(`^Edit settings: ${label}`) }).click();
  const sheet = host.getByRole('dialog', { name: label });
  const radio = sheet.getByRole('radio', { name: option, exact: true });
  await expect(sheet.getByRole('heading', { name: label })).toBeVisible();
  await host.waitForTimeout(700); // the sheet slides in; Playwright sees the radio outside the viewport until then
  await radio.check();
  await expect(radio).toBeChecked();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(host.getByRole('button', { name: new RegExp(`^Edit settings: ${label}, ${option.replace('%', '%')}`) })).toBeVisible();
}

async function confirmAlert(host: Page, button: string, word?: string) {
  const alert = host.getByRole('alertdialog');
  await expect(alert).toBeVisible();
  if (word) await alert.getByRole('textbox').fill(word);
  await alert.getByRole('button', { name: button, exact: true }).click();
  await expect(alert).toBeHidden();
}

async function newGameKeepCrews(host: Page) {
  await host.getByRole('button', { name: 'More options' }).click();
  await host.getByRole('menuitem', { name: 'New game…' }).click();
  const newGame = host.getByRole('dialog', { name: 'Start a new game' });
  await expect(newGame.getByRole('switch', { name: 'Keep crews and passwords' }).or(newGame.getByRole('checkbox', { name: 'Keep crews and passwords' }))).toBeChecked();
  await host.waitForTimeout(700);
  await newGame.getByRole('button', { name: 'Start new game' }).click();
  await confirmAlert(host, 'Start new game', 'NEW GAME');
  await expect(host.getByRole('button', { name: 'Start game', exact: true })).toBeVisible({ timeout: 90_000 });
}

/** A previous run may have stopped mid-game: end it and start a new one so this run begins in the lobby. */
async function ensureLobby(host: Page) {
  const start = host.getByRole('button', { name: 'Start game', exact: true });
  const end = host.getByRole('button', { name: 'End game…' });
  const again = host.getByRole('button', { name: 'New game…' });
  await expect(start.or(end).or(again).first()).toBeVisible();
  if (await start.isVisible()) return;
  if (await end.isVisible()) {
    await end.click();
    await confirmAlert(host, 'End game', 'END');
  }
  await newGameKeepCrews(host);
}

/**
 * Moves the host between console screens by tapping the host tab bar — which is how a host moves
 * between them in the app. (`page.goto('/admin/…')` also works now that the host API lives under
 * `/api/admin/*` and the server answers HTML navigations to `/admin/*` with the app shell; the tab
 * bar is kept here because tapping is what the gate is meant to exercise.)
 */
async function hostTab(host: Page, name: string) {
  await host.getByRole('navigation', { name: 'Host' }).getByRole('link', { name, exact: true }).click();
  await expect(host.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function crewSignIn(page: Page, crew: string) {
  await page.goto('/login');
  await page.getByLabel('Crew name').fill(crew);
  await page.getByLabel('Password', { exact: true }).fill(CREW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/portfolio/);
}

/**
 * "Meet the market" start to finish (design 2026-09-16 §6). Required once per crew before its first
 * order, so every crew that trades in this file goes through it — the same ten cards a student sees.
 */
async function completeIntro(page: Page) {
  await expect(page).toHaveURL(/\/learn\/meet-the-market/);
  // The visible counter, not the sr-only live region that announces the same words.
  const counter = page.locator('#bx-intro-step');
  const total = Number((await counter.textContent())?.match(/of (\d+)/)?.[1] ?? 0);
  expect(total).toBe(10); // 3 cards + 5 sectors + funds + done
  for (let step = 1; step < total; step++) {
    await expect(counter).toHaveText(`Step ${step} of ${total}`);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(counter).toHaveText(`Step ${total} of ${total}`);
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  await page.waitForURL(/\/markets/);
}

async function tab(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
}

/** Axe on the current screen in light and dark; returns the violations tagged with the screen and scheme. */
async function axeBoth(page: Page, screen: string): Promise<string[]> {
  const out: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForTimeout(300);
    const found = (await axeViolations(page)).map((v) => `${screen}/${colorScheme}: ${v}`);
    if (found.length) console.log(found.join('\n'));
    out.push(...found);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  return out;
}

test('a whole game on a phone', async ({ page, browser }) => {
  const project = test.info().project.name;
  const runAxe = project === 'chromium-iphone15';
  const stamp = `${project.replace(/[^a-z0-9]/gi, '').slice(0, 10)}${Date.now().toString(36).slice(-4)}`;
  const crews = [`Saltwind ${stamp}`, `Gull ${stamp}`, `Reef ${stamp}`];
  const a11y: string[] = [];

  // ── Host: settings, three crews, start ────────────────────────────────────
  const host = await hostPage(browser);
  await ensureLobby(host);
  await editSetting(host, 'Game length', '10 minutes');
  await editSetting(host, 'Position limit', '50%');
  await hostTab(host, 'Crews');
  for (const name of crews) {
    await host.getByRole('button', { name: 'Add crew' }).first().click();
    const sheet = host.getByRole('dialog', { name: 'Add crew' });
    await host.waitForTimeout(700);
    await sheet.getByLabel('Crew name').fill(name);
    await sheet.getByLabel('Password', { exact: true }).fill(CREW_PASSWORD);
    await sheet.getByRole('button', { name: 'Add crew' }).click();
    await expect(host.getByText(`${name} added.`).first()).toBeVisible();
    await expect(sheet).toBeHidden();
  }
  await hostTab(host, 'Control');
  await host.getByRole('button', { name: 'Start game', exact: true }).click();
  await confirmAlert(host, 'Start game');
  await expect(host.getByRole('button', { name: 'Pause trading' })).toBeVisible();
  await shot(host, '01-host-live');
  if (runAxe) a11y.push(...(await axeBoth(host, 'host-control')));
  if (runAxe) {
    await page.goto('/login');
    a11y.push(...(await axeBoth(page, 'sign-in')));
  }

  // ── Crew: sign in, Meet the market, Markets, KRKN, "?" on P/E ─────────────
  await crewSignIn(page, crews[0]!);
  const welcome = page.getByRole('dialog', { name: new RegExp(`Welcome aboard, ${crews[0]}`) });
  await expect(welcome).toBeVisible();
  const startingValue = (await page.getByTestId('account-value').textContent())?.trim();
  // A crew that has not finished the intro is sent into it from Welcome (design §6).
  await welcome.getByRole('button', { name: 'Meet the market', exact: true }).click();
  if (runAxe) a11y.push(...(await axeBoth(page, 'meet-the-market')));
  await completeIntro(page);
  // Portfolio opens on the account value: the 3-step walkthrough card above it was deleted on 2026-09-17
  // (MOBILE §7.2), and its state and COPY §5 words on 2026-09-18, because "Meet the market", just
  // finished, teaches the same three things. The title is asserted absent so a revival is loud.
  await tab(page, 'Portfolio');
  await expect(page.getByText('Your first trade in 3 steps')).toHaveCount(0);
  await expect(page.getByTestId('account-value')).toBeVisible();
  await shot(page, '02-portfolio');
  await tab(page, 'Markets');
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible();
  // Funds first, then the five sector groups (spec §4).
  await expect(page.getByRole('heading', { name: 'Funds', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Grand Fleet Fund, FLEET/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible();
  if (runAxe) a11y.push(...(await axeBoth(page, 'markets')));
  await page.getByRole('searchbox').first().fill('kra');
  await page.getByRole('link', { name: /Kraken Shipping Lines, KRKN/ }).first().click();
  await expect(page).toHaveURL(/\/markets\/company\/KRKN/);
  // Key stats is now a two-column grid of cells (spec §3): the number and its sector comparison are
  // on the cell, and the plain-English sentence is one tap away in the stat sheet.
  await expect(page.getByRole('heading', { name: 'Key stats' })).toBeVisible();
  const peCell = page.getByRole('button', { name: /^Price vs\. profit/ }).first();
  await expect(peCell).toContainText('Rest of sector');
  await peCell.scrollIntoViewIfNeeded();
  await peCell.tap();
  const tip = page.getByRole('dialog', { name: 'Price vs. profit' });
  await expect(tip).toBeVisible();
  await expect(tip.getByRole('link', { name: /Learn/ }).first()).toBeVisible();
  await shot(page, '03-pe-tip');
  await tip.getByRole('button', { name: 'Close' }).click();
  await expect(tip).toBeHidden();
  await expect(page).not.toHaveURL(/sheet=stat/);
  if (runAxe) a11y.push(...(await axeBoth(page, 'company')));

  // ── Trade: Buy 10 via Preview → Place → Filled ───────────────────────────
  await page.getByRole('button', { name: 'Buy KRKN' }).first().click();
  const ticket = page.locator('.ios-sheet[role="dialog"]:not([data-closed])');
  await expect(ticket.getByRole('radiogroup', { name: 'Action' })).toBeVisible();
  if (runAxe) {
    await page.waitForTimeout(500);
    a11y.push(...(await axeBoth(page, 'trade-sheet')));
  }
  for (const d of '10') await ticket.getByRole('button', { name: d, exact: true }).click();
  await ticket.getByRole('button', { name: 'Preview order' }).click();
  await expect(ticket.getByText(/^Buy 10 shares of KRKN \(/)).toBeVisible();
  await ticket.getByRole('button', { name: 'Place order' }).click();
  await expect(ticket.getByRole('heading', { name: 'Order filled', exact: true })).toBeVisible();
  await shot(page, '04-filled');
  await ticket.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).not.toHaveURL(/sheet=trade/);

  await tab(page, 'Portfolio');
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByRole('link', { name: /KRKN/ }).first()).toBeVisible();
  if (runAxe) a11y.push(...(await axeBoth(page, 'portfolio')));
  await page.goto('/portfolio/activity');
  await expect(page.getByText(/Bought 10 KRKN/).first()).toBeVisible();
  if (runAxe) {
    a11y.push(...(await axeBoth(page, 'activity')));
    await tab(page, 'Standings');
    await expect(page.getByRole('heading', { level: 1, name: 'Standings' })).toBeVisible();
    a11y.push(...(await axeBoth(page, 'standings')));
    await tab(page, 'Learn');
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    a11y.push(...(await axeBoth(page, 'learn')));
  }

  // ── News: host fires, crew reads "What this means" ────────────────────────
  const headline = `Kraken wins a navy contract ${stamp}`.slice(0, 90);
  await hostTab(host, 'News');
  await host.getByRole('button', { name: 'Fire news…' }).first().click();
  const compose = host.getByRole('dialog', { name: 'Fire news' });
  await compose.getByRole('button', { name: 'Add company' }).click();
  await compose.locator('.bx-host-picker__item', { hasText: 'KRKN' }).first().click();
  await compose.getByLabel('Headline').fill(headline);
  await compose.getByRole('button', { name: /^Publish at tick/ }).click();
  await expect(compose).toBeHidden();
  await tab(page, 'News');
  const card = page.getByRole('article').filter({ hasText: headline });
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card.getByText('What this means')).toBeVisible();
  await shot(page, '05-news');
  if (runAxe) a11y.push(...(await axeBoth(page, 'news')));

  // ── Pause: banner, trade blocked, resume ──────────────────────────────────
  await hostTab(host, 'Control');
  await host.getByRole('button', { name: 'Pause trading' }).click();
  await confirmAlert(host, 'Pause');
  await tab(page, 'Markets');
  await expect(page.getByText('Trading paused').first()).toBeVisible();
  await page.goto('/markets/company/KRKN');
  await page.getByRole('button', { name: 'Buy KRKN' }).first().click();
  const paused = page.locator('.ios-sheet[role="dialog"]:not([data-closed])');
  await expect(paused.getByText('Trading paused').first()).toBeVisible();
  await paused.getByRole('button', { name: '1', exact: true }).click();
  // Paused: preview still works (to learn the cost), placing does not.
  await paused.getByRole('button', { name: 'Preview order' }).click();
  await expect(paused.getByText(/^Buy 1 share of KRKN \(/)).toBeVisible();
  await expect(paused.getByRole('button', { name: 'Place order' })).toBeDisabled();
  await shot(page, '06-paused');
  await paused.getByRole('button', { name: 'Back', exact: true }).click();
  await paused.getByRole('button', { name: 'Close' }).first().click();
  const discard = page.getByRole('button', { name: 'Discard order' });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await host.getByRole('button', { name: 'Resume trading' }).click();
  await confirmAlert(host, 'Resume');
  await expect(host.getByRole('button', { name: 'Pause trading' })).toBeVisible();
  await expect(page.getByText('Trading paused')).toHaveCount(0, { timeout: 30_000 });

  // ── End: typed END, the crew's results open by themselves ─────────────────
  await tab(page, 'Portfolio');
  await host.getByRole('button', { name: 'End game…' }).click();
  await confirmAlert(host, 'End game', 'END');
  await expect(page).toHaveURL(/\/standings\/results/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Voyage complete' })).toBeVisible();
  await shot(page, '07-results');
  if (runAxe) a11y.push(...(await axeBoth(page, 'results')));

  // ── New game, keep crews: the crew is back in the lobby with fresh cash ───
  await newGameKeepCrews(host);

  await page.goto('/portfolio');
  if (/\/login/.test(page.url())) await crewSignIn(page, crews[0]!);
  await expect(page.getByText(/In the lobby/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('account-value')).toHaveText(startingValue ?? /./, { timeout: 60_000 });
  await expect(page.getByRole('link', { name: /KRKN/ })).toHaveCount(0);
  await shot(page, '08-lobby-again');
  if (runAxe) a11y.push(...(await axeBoth(page, 'portfolio-lobby')));

  await host.context().close();
  if (runAxe) {
    console.log(`AXE ${a11y.length} violation node(s)\n${a11y.join('\n')}`);
    expect.soft(a11y).toEqual([]);
  }
});
