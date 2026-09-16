/**
 * The surface spec 2026-09-16 added or rebuilt, driven the way a student and a host drive it, against
 * the real REST + SSE stack (see playwright.app.config.ts for how to start it).
 *
 *   1. "Meet the market" gates a crew's first order; finishing it unlocks the ticket, and the host's
 *      Crews screen unlocks a crew that never ran the flow.
 *   2. Funds are tradeable: buy FLEET from the ticket and the demand lands on the 15 constituents.
 *      The fund screen shows what it holds and none of a company's research sections.
 *   3. Markets is Funds then five sector groups; the metric table lives on /markets/compare.
 *   4. Every one of those screens renders at 320px (the narrowest width MOBILE §9.8 supports) and at
 *      the project's own width, in light and dark: no sideways scroll, nothing laid out past the
 *      edge, and no axe-core violation (which covers contrast).
 *   5. Two crews and a host are live on one instance at once, all three streaming, none rate limited.
 *
 * The game is left running; `full-game.spec.ts` is the project that returns the market to the lobby.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { axeViolations, reflowProblems } from '../a11y';

const PASSWORD = process.env.ADMIN_PASSWORD ?? 'captain';
const CREW_PASSWORD = 'plunder42';
/** WCAG 1.4.10 reflow, and the narrowest width the MOBILE §9.8 matrix lists. */
const NARROW = 320;
/**
 * axe-core runs on the Chromium projects only — the same engine split `full-game.spec.ts` uses.
 * Reflow, which is the engine-dependent half, runs everywhere; axe's findings are not engine
 * dependent, and WebKit is where axe is slow enough on a live, ticking page to blow the 12-minute
 * file timeout — 24 analyses of a DOM that changes every five seconds.
 */
const runAxe = () => test.info().project.name.startsWith('chromium');

test.skip(!process.env.APP_URL, 'Set APP_URL to a running authority server (server/: npx tsx src/index.ts).');

const stamp = () => `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;

/** Host actions go through the API where the screen is not what is under test. */
async function hostApi(request: APIRequestContext) {
  const res = await request.post('/auth/login', { data: { name: 'admin', password: PASSWORD } });
  expect(res.status(), 'host login').toBe(200);
  const headers = { Authorization: `Bearer ${(await res.json()).token as string}` };
  const phase = async () => (await (await request.get('/health')).json()).phase as string;
  return {
    headers,
    phase,
    async addCrew(name: string): Promise<string> {
      const r = await request.post('/api/admin/teams', { headers, data: { name, password: CREW_PASSWORD } });
      expect(r.status(), `add crew ${name}`).toBe(200);
      return (await r.json()).team.id as string;
    },
    async prices(): Promise<Record<string, number>> {
      const r = await request.get('/api/companies', { headers });
      const body = await r.json();
      return Object.fromEntries((body.companies ?? []).map((c: { ticker: string; currentPrice: number }) => [c.ticker, c.currentPrice]));
    },
    /** A game must be running for an order to fill; a previous project may have left any phase. */
    async ensureLive() {
      if ((await phase()) === 'ended') {
        expect((await request.post('/api/admin/game/new', { headers, data: { keepCrews: true } })).status()).toBe(200);
      }
      if ((await phase()) === 'lobby') {
        expect((await request.post('/api/admin/game/start', { headers })).status()).toBe(200);
      }
      if ((await phase()) === 'paused') {
        expect((await request.post('/api/admin/game/resume', { headers })).status()).toBe(200);
      }
      expect(await phase()).toBe('live');
    },
  };
}

async function signIn(page: Page, crew: string) {
  await page.goto('/login');
  await page.getByLabel('Crew name').fill(crew);
  await page.getByLabel('Password', { exact: true }).fill(CREW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/portfolio/);
}

async function hostSignIn(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, baseURL: process.env.APP_URL });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByRole('radio', { name: 'Host' }).check({ force: true });
  await page.getByLabel('Host password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(/\/admin$/);
  return page;
}

/**
 * The Welcome sheet opens by itself on the first Portfolio view, a frame or two after sign-in — so
 * this waits for it rather than sampling once, or it reopens over a later assertion.
 */
async function dismissWelcome(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip for now' });
  await skip.waitFor({ state: 'visible', timeout: 20_000 });
  await skip.click();
  await expect(skip).toBeHidden();
}

/** Ten cards, Next through each, finish on Markets. */
async function runIntro(page: Page) {
  await expect(page).toHaveURL(/\/learn\/meet-the-market/);
  const counter = page.locator('#bx-intro-step');
  const total = Number((await counter.textContent())?.match(/of (\d+)/)?.[1] ?? 0);
  expect(total, 'three cards, five sectors, funds, done').toBe(10);
  for (let step = 1; step < total; step++) {
    await expect(counter).toHaveText(`Step ${step} of ${total}`);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  await page.waitForURL(/\/markets/);
}

/**
 * Renders the current screen at both widths in both schemes and returns what is wrong with it.
 *
 * `hard` is the part that fails the run: an axe-core violation (contrast included), a page that
 * scrolls sideways, or an element laid out past the viewport edge. Both layout bugs this file was
 * written for showed up there — Markets' sector groups widened the page to 404px at every width,
 * and the company screen's news lines were laid out to 842px and hard-cut by the card's clip.
 *
 * `soft` is everything `reflowProblems` calls "clipped": a single line ending in an ellipsis is a
 * deliberate iOS list-row truncation, not a fault, so those are reported and not asserted on.
 */
async function auditScreen(page: Page, screen: string): Promise<{ hard: string[]; soft: string[] }> {
  const hard: string[] = [];
  const soft: string[] = [];
  const original = page.viewportSize() ?? { width: 375, height: 667 };
  for (const width of [NARROW, original.width]) {
    await page.setViewportSize({ width, height: original.height });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForTimeout(350);
      const where = `${screen} @${width}px ${colorScheme}`;
      for (const p of await reflowProblems(page, 'body *')) {
        (p.startsWith('clipped') ? soft : hard).push(`${where}: ${p}`);
      }
      if (runAxe()) hard.push(...(await axeViolations(page)).map((v) => `${where}: ${v}`));
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(original);
  return { hard, soft };
}

test('the intro gate, funds and the rebuilt screens on a small phone', async ({ page, browser, request }) => {
  const api = await hostApi(request);
  const id = stamp();
  const [learner, overridden] = [`Learn ${id}`, `Over ${id}`];
  await api.addCrew(learner);
  await api.addCrew(overridden);
  await api.ensureLive();
  const hard: string[] = [];
  const truncations: string[] = [];
  const audit = async (p: Page, name: string) => {
    const r = await auditScreen(p, name);
    hard.push(...r.hard);
    truncations.push(...r.soft);
  };

  // ── 1. The gate ────────────────────────────────────────────────────────────
  await signIn(page, learner);
  await expect(page.getByRole('dialog', { name: new RegExp(`Welcome aboard, ${learner}`) })).toBeVisible();
  await page.getByRole('button', { name: 'Meet the market', exact: true }).click();
  await expect(page, 'Welcome opens the flow it names').toHaveURL(/\/learn\/meet-the-market/);
  await audit(page, 'meet-the-market step 1');

  // Browsing is never locked: leave the flow and look around, the way a student would.
  await page.goto('/markets/company/KRKN');
  await expect(page.getByRole('heading', { name: 'Key stats' })).toBeVisible();
  await page.getByRole('button', { name: /^Buy KRKN/ }).first().click();
  await expect(page, 'Buy sends an un-introduced crew into the intro').toHaveURL(/\/learn\/meet-the-market/);

  await runIntro(page);
  await page.goto('/markets/company/KRKN');
  await page.getByRole('button', { name: /^Buy KRKN/ }).first().click();
  const krknTicket = page.locator('.ios-sheet[role="dialog"]:not([data-closed])');
  await expect(krknTicket.getByText('Step 1 · enter your order'), 'the ticket opens once the flow is done').toBeVisible();
  await krknTicket.getByRole('button', { name: 'Close' }).first().click();
  const discard = page.getByRole('button', { name: 'Discard order' });
  if (await discard.isVisible().catch(() => false)) await discard.click();

  // ── 2. The host override, from the Crews screen ────────────────────────────
  const hostPage = await hostSignIn(browser);
  await hostPage.goto(`/admin/crews`);
  await hostPage.getByRole('link', { name: new RegExp(overridden) }).or(hostPage.getByRole('button', { name: new RegExp(overridden) })).first().click();
  await expect(hostPage.getByRole('heading', { level: 1, name: overridden })).toBeVisible();
  await expect(hostPage.getByText('Not finished')).toBeVisible();
  await hostPage.getByRole('button', { name: 'Mark Meet the market finished' }).click();
  await expect(hostPage.getByText(`${overridden}: Meet the market marked finished.`)).toBeVisible();
  await expect(hostPage.getByText('Finished').first()).toBeVisible();

  const second = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL: process.env.APP_URL });
  const other = await second.newPage();
  await signIn(other, overridden);
  await dismissWelcome(other);
  // The override reached this crew's phone: Buy opens the ticket, with no flow of its own.
  await other.goto('/markets/company/FLEET');
  await other.getByRole('button', { name: /^Buy FLEET/ }).first().click();
  const ticket = other.locator('.ios-sheet[role="dialog"]:not([data-closed])');
  await expect(ticket.getByText('Step 1 · enter your order'), 'the host override unlocks trading').toBeVisible();

  // ── 3. Funds as a student uses them ────────────────────────────────────────
  const before = await api.prices();
  for (const d of '250') await ticket.getByRole('button', { name: d, exact: true }).click();
  await ticket.getByRole('button', { name: 'Preview order' }).click();
  await expect(ticket.getByText(/^Buy 250 shares of FLEET \(/)).toBeVisible();
  await ticket.getByRole('button', { name: 'Place order' }).click();
  await expect(ticket.getByRole('heading', { name: 'Order filled', exact: true })).toBeVisible();
  await ticket.getByRole('button', { name: 'Done', exact: true }).click();
  await other.goto('/portfolio/positions');
  await expect(other.getByRole('link', { name: /Grand Fleet Fund|FLEET/ }).first(), 'the fund is a position like any other').toBeVisible();
  await expect(other.getByText('250 shares · paid')).toBeVisible();
  // The demand landed on the constituents — that is what makes a fund a basket (spec §2).
  await expect
    .poll(async () => {
      const now = await api.prices();
      return Object.keys(now).filter((t) => now[t] !== before[t]).length;
    }, { timeout: 90_000, message: 'constituent prices move after a fund trade' })
    .toBeGreaterThanOrEqual(10);

  await other.goto('/markets/company/FLEET');
  await expect(other.getByRole('heading', { name: 'What this fund holds' })).toBeVisible();
  await expect(other.getByRole('link', { name: /share of the fund/ })).toHaveCount(15);
  // A fund has no fundamentals, no analyst view and no financials (spec §3).
  for (const gone of ['Key stats', 'See all stats', 'Analyst view', 'See financials', 'Read this company in 5 questions']) {
    const anywhere = other
      .getByRole('heading', { name: gone })
      .or(other.getByRole('button', { name: new RegExp(`^${gone}`) }))
      .or(other.getByRole('link', { name: new RegExp(`^${gone}`) }));
    await expect(anywhere, `a fund screen has no "${gone}"`).toHaveCount(0);
  }
  await audit(other, 'fund FLEET');

  // ── 4. Markets, Compare, a company, Learn ──────────────────────────────────
  await other.goto('/markets');
  await expect(other.getByRole('heading', { name: 'Funds', exact: true })).toBeVisible();
  await expect(other.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible();
  await expect(other.locator('.bx-sector-groups .ios-list'), 'five sector groups').toHaveCount(5);
  await audit(other, 'markets');

  await other.getByRole('link', { name: 'Compare' }).first().click();
  await expect(other).toHaveURL(/\/markets\/compare/);
  await expect(other.getByRole('heading', { level: 1, name: 'Compare companies' })).toBeVisible();
  await audit(other, 'markets/compare');

  await other.goto('/markets/company/KRKN');
  await expect(other.getByRole('heading', { name: 'Key stats' })).toBeVisible();
  await audit(other, 'company KRKN');

  await other.goto('/learn');
  await expect(other.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
  await audit(other, 'learn');

  // ── 5. Two crews and a host at once ────────────────────────────────────────
  const limited: string[] = [];
  for (const [who, p] of [['crew 1', page], ['crew 2', other], ['host', hostPage]] as const) {
    p.on('response', (r) => {
      if (r.status() === 429) limited.push(`${who} rate limited: ${r.url()}`);
    });
  }
  await page.goto('/markets');
  await other.goto('/standings');
  await hostPage.goto('/admin/market');
  await expect
    .poll(async () => (await (await request.get('/health')).json()).connections, { timeout: 60_000, message: 'three live streams on one instance' })
    .toBeGreaterThanOrEqual(3);
  const textOf = (p: Page) => p.evaluate(() => document.body.innerText);
  const first = await Promise.all([textOf(page), textOf(other), textOf(hostPage)]);
  await page.waitForTimeout(15_000);
  const later = await Promise.all([textOf(page), textOf(other), textOf(hostPage)]);
  for (const [i, who] of ['crew 1', 'crew 2', 'host'].entries()) {
    expect(later[i], `${who} kept updating from its stream`).not.toBe(first[i]);
  }
  expect(limited, 'no 429 with two crews and a host on one instance').toEqual([]);

  await hostPage.context().close();
  await second.close();

  if (truncations.length) console.log(`${truncations.length} documented single-line truncation(s)\n${truncations.join('\n')}`);
  if (hard.length) console.log(`LAYOUT/A11Y ${hard.length} failure(s)\n${hard.join('\n')}`);
  expect(hard, 'no sideways scroll, nothing off screen, no axe violation').toEqual([]);
});
