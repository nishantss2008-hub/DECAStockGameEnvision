/**
 * Behaviour checks for the phone chrome in the dev gallery (kit.html), at the 393×852 reference frame
 * (MOBILE §4.1). Run from web/: `npx playwright test e2e/kit.spec.ts --project=webkit`.
 *
 * - Tab bar: a tap moves aria-current and the platter (§5.1).
 * - Large title: scrolling the document collapses the bar to glass, the shared trailing capsule
 *   splits into fill circles, and scrolling back expands it (§5.2). Uses kit.html?screen=positions,
 *   which has the app's real document scroll and fixed bars.
 * - Sheet: opens at its detent, the grabber resizes it, a downward drag dismisses it and focus goes
 *   back to the trigger (§5.8, §10).
 * - SegmentedControl: arrow keys move the selection, skip the disabled segment and wrap (§5.6).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 393, height: 852 }, colorScheme: 'light', hasTouch: false, isMobile: false });

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element is not visible');
  return b;
}

/** Mouse drag in small steps so Base UI's swipe tracker sees a continuous gesture; `midway` runs before release. */
async function drag(page: Page, from: { x: number; y: number }, dy: number, midway?: () => Promise<void>, steps = 20) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x, from.y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await midway?.();
  await page.mouse.up();
}

test.describe('live screen (kit.html?screen=positions)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kit.html?screen=positions&theme=light');
    await expect(page.getByRole('heading', { level: 1, name: 'Positions' })).toBeVisible();
  });

  test('tab bar is a 62px glass capsule and a tap moves the selection and platter', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    const bar = await box(nav);
    expect(bar.height).toBe(62);
    expect(bar.x).toBe(16);
    expect(bar.width).toBe(361);
    expect(852 - (bar.y + bar.height)).toBe(8); // max(8px, safe-area-inset-bottom − 12px) with no inset
    await expect(nav).toHaveClass(/\bglass\b/);

    const portfolio = nav.getByRole('link', { name: 'Portfolio' });
    const markets = nav.getByRole('link', { name: 'Markets' });
    await expect(portfolio).toHaveAttribute('aria-current', 'page');
    const platter = nav.locator('.ios-tabbar__platter');
    const before = await box(platter);
    expect(before.height).toBe(54);

    await markets.click();
    await expect(markets).toHaveAttribute('aria-current', 'page');
    await expect(portfolio).not.toHaveAttribute('aria-current', 'page');
    // The platter slides one item (70.6px on 393) to the right.
    await expect.poll(async () => Math.round((await box(platter)).x - before.x)).toBe(71);
  });

  test('large title collapses into a glass bar when it scrolls under the bar, and expands again', async ({ page }) => {
    const navbar = page.locator('.ios-navbar');
    const bar = page.locator('.ios-navbar__bar');
    const capsule = page.locator('.ios-navbar-capsule');
    const inlineTitle = page.locator('.ios-navbar__inline');

    // Expanded: no bar background, Back is a glass circle, Sort + "?" share one 88×44 glass capsule.
    await expect(navbar).not.toHaveAttribute('data-collapsed', /.*/);
    await expect(bar).not.toHaveClass(/\bglass\b/);
    await expect(page.getByRole('button', { name: 'Back to Portfolio' })).toHaveClass(/\bglass\b/);
    await expect(capsule).toHaveClass(/\bglass\b/);
    expect(await box(capsule)).toMatchObject({ width: 88, height: 44 });
    await expect(inlineTitle).toHaveCSS('opacity', '0');
    const title = await box(page.getByRole('heading', { level: 1 }));
    expect(title).toMatchObject({ x: 16, y: 48, height: 41 }); // 44px bar row + 4, Large Title 34/41

    // Scroll the document until the title's bottom has passed under the 44px bar.
    await page.evaluate(() => window.scrollTo(0, 120));
    await expect(navbar).toHaveAttribute('data-collapsed', 'true');
    await expect(bar).toHaveClass(/\bglass\b/);
    await expect(inlineTitle).toHaveCSS('opacity', '1');
    await expect(capsule).not.toHaveClass(/\bglass\b/);
    await expect(page.getByRole('button', { name: 'Back to Portfolio' })).not.toHaveClass(/\bglass\b/);
    expect((await box(capsule)).width).toBe(96); // two 44px fill circles, 8px apart
    // The inline title never duplicates the heading for screen readers.
    await expect(page.getByRole('heading')).toHaveCount(3); // h1 + two list headers
    await expect(inlineTitle).toHaveAttribute('aria-hidden', 'true');
    // The tab bar never minimises on scroll.
    expect((await box(page.getByRole('navigation', { name: 'Main' }))).height).toBe(62);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(navbar).not.toHaveAttribute('data-collapsed', /.*/);
    await expect(capsule).toHaveClass(/\bglass\b/);
  });
});

test.describe('gallery overlays', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kit.html?theme=light&section=overlays');
  });

  test('a medium-to-large sheet opens at medium, the grabber resizes it and a downward drag dismisses it', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Crew card (medium to large)', exact: true });
    // Open from the keyboard: WebKit does not focus a <button> on mouse click, so only a focused
    // trigger can receive focus back on close.
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.ios-sheet__title')).toBeFocused();

    // Medium detent: half of the 852px viewport is showing, inset 8px with the 32px radius.
    const sheet = page.locator('.ios-sheet');
    await expect.poll(async () => Math.round(852 - (await box(sheet)).y)).toBeGreaterThanOrEqual(424);
    expect(Math.round(852 - (await box(sheet)).y)).toBeLessThanOrEqual(436);
    expect((await box(sheet)).x).toBe(8);
    await expect(sheet).toHaveCSS('border-top-left-radius', '32px');

    // Grabber: 36×5 bar in a 64×44 button that cycles medium ↔ large.
    const grabber = page.getByRole('button', { name: 'Resize sheet' });
    expect(await box(grabber)).toMatchObject({ width: 64, height: 44 });
    expect(await box(page.locator('.ios-sheet__grabber-bar'))).toMatchObject({ width: 36, height: 5 });
    await expect(grabber).toHaveAttribute('aria-expanded', 'false');
    const mediumTop = (await box(sheet)).y;
    await grabber.click();
    await expect(grabber).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await box(sheet)).y).toBeLessThan(mediumTop - 100);
    await grabber.click();
    await expect(grabber).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => Math.abs((await box(sheet)).y - mediumTop)).toBeLessThan(2);

    // Drag the header down past the dismiss threshold: the sheet follows the pointer, then closes.
    const header = await box(page.locator('.ios-sheet__header'));
    await drag(page, { x: header.x + 60, y: header.y + 40 }, 260, async () => {
      await expect(sheet).toHaveAttribute('data-swiping', /.*/);
      expect((await box(sheet)).y).toBeGreaterThan(mediumTop + 200);
    });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('sheet detents match MOBILE §5.8: large attaches under the safe area, content height stays inset', async ({ page }) => {
    await page.getByRole('button', { name: 'Trade sheet (large)', exact: true }).click();
    const sheet = page.locator('.ios-sheet');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(async () => (await box(sheet)).y).toBe(10); // safe-area-inset-top (0) + 10
    expect((await box(sheet)).x).toBe(0);
    await expect(sheet).toHaveCSS('border-top-left-radius', '24px');
    expect((await box(page.locator('.ios-sheet__header'))).height).toBe(56);
    expect(await box(page.getByRole('button', { name: 'Close' }))).toMatchObject({ x: 16, width: 44, height: 44 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // An InfoTip opens at its content height (all three blocks visible) as an inset card.
    await page.getByRole('button', { name: 'InfoTip sheet (fit)', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(async () => (await box(sheet)).x).toBe(8);
    await expect(sheet).toHaveCSS('border-top-left-radius', '32px');
    const fit = await box(sheet);
    expect(Math.round(fit.y + fit.height)).toBe(844);
    await expect(page.getByText('Usually a good sign when…', { exact: true })).toBeInViewport();
  });
});

test('segmented control moves by arrow keys, skips a disabled segment and wraps', async ({ page }) => {
  await page.goto('/kit.html?theme=light&section=controls');
  const group = page.getByRole('radiogroup', { name: 'Chart range' }).first();
  const radio = (name: string) => group.getByRole('radio', { name, exact: true });
  const track = group.locator('.ios-seg__track');
  expect((await box(track)).height).toBe(32);

  await expect(radio('All')).toBeChecked();
  await radio('All').focus();
  const thumb = group.locator('.ios-seg__thumb');
  const allX = (await box(thumb)).x;

  await page.keyboard.press('ArrowRight'); // wraps from the last segment to the first
  await expect(radio('1H')).toBeChecked();
  await expect(radio('1H')).toBeFocused();
  await expect.poll(async () => (await box(thumb)).x).toBeLessThan(allX);

  await page.keyboard.press('ArrowRight');
  await expect(radio('6H')).toBeChecked();

  await page.keyboard.press('ArrowRight'); // 24H is disabled
  await expect(radio('24H')).not.toBeChecked();
  await expect(radio('All')).toBeChecked();
  await expect(radio('All')).toBeFocused();

  await page.keyboard.press('Home');
  await expect(radio('1H')).toBeChecked();
  // Only the selected segment is a tab stop.
  await expect(radio('1H')).toHaveAttribute('tabindex', '0');
  await expect(radio('6H')).toHaveAttribute('tabindex', '-1');
});
