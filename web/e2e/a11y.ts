/**
 * Accessibility helpers for e2e/kit.spec.ts (MOBILE §4.4, §10). Each probe runs in the page and
 * returns plain strings, so a failure lists every offending element at once.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Overlays that `kit.html?open=<id>` opens on load (src/dev/kitOverlays.tsx OVERLAY_IDS). */
export const DIALOG_OVERLAYS = ['trade', 'filled', 'status', 'crew', 'account', 'welcome', 'discard', 'signout', 'endgame', 'pause'] as const;
export const MENU_OVERLAYS = ['menu-sort', 'menu-more', 'menu-row'] as const;
export const TOAST_OVERLAYS = ['toast-update', 'toast-online'] as const;

/** 200% of the 17px Body root (MOBILE §3.5): the "Larger Text 200%" row of the §9.8 test matrix. */
export const ROOT_200_PERCENT = '34px';

export async function gotoKit(page: Page, query: string): Promise<void> {
  await page.goto(`/kit.html?${query}`);
  await expect(page.locator('.kit-main')).toBeVisible();
  // Let deferred overlays (menus open on the next frame), toasts and chart widths settle.
  await page.waitForTimeout(400);
}

/** Root at `size` plus html[data-large-text], which the app shell sets at root ≥ 23px (largeText.ts). */
export async function setRootFontSize(page: Page, size: string): Promise<void> {
  await page.evaluate((px) => {
    document.documentElement.style.fontSize = px;
    document.documentElement.setAttribute('data-large-text', '');
  }, size);
  await page.waitForTimeout(400);
}

/** Every axe-core rule (WCAG 2.x A/AA, best practices); returns one line per failing node. */
export async function axeViolations(page: Page, options: { disableRules?: string[] } = {}): Promise<string[]> {
  let builder = new AxeBuilder({ page });
  if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);
  const { violations } = await builder.analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} — ${v.help}`));
}

/**
 * Interactive elements whose hit area is under 44×44 (MOBILE §4.4). The hit area is the element's
 * bounding box grown by its absolutely positioned ::before/::after (the invisible hit padding), and
 * by the hit area of the element that forwards taps to it: a label, the switch wrapper, the search
 * capsule. Disabled controls, inert content and visually hidden elements are skipped; the chart's
 * range input is covered by the whole plot.
 */
export async function smallHitAreas(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((scopeSel) => {
    type Box = { l: number; t: number; r: number; b: number };
    const selector =
      'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=switch]';
    const boxOf = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      let box: Box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      if (getComputedStyle(el).position === 'static') return box;
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === 'none' || ps.position !== 'absolute' || ps.pointerEvents === 'none' || ps.display === 'none') continue;
        const [top, right, bottom, left] = [ps.top, ps.right, ps.bottom, ps.left].map(parseFloat);
        if (![top, right, bottom, left].every(Number.isFinite)) continue;
        box = {
          l: Math.min(box.l, r.left + left!),
          t: Math.min(box.t, r.top + top!),
          r: Math.max(box.r, r.right - right!),
          b: Math.max(box.b, r.bottom - bottom!),
        };
      }
      return box;
    };
    const union = (a: Box, b: Box): Box => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(scopeSel))) {
      for (const el of Array.from(root.querySelectorAll(selector))) {
        if (el.closest('[inert], [data-base-ui-focus-guard], .ios-sr-only')) continue;
        if (el.matches(':disabled, [aria-disabled="true"]')) continue;
        if (el.matches('.chart-card__slider')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
        let box = boxOf(el);
        const proxies: Element[] = el instanceof HTMLInputElement && el.labels ? Array.from(el.labels) : [];
        for (const sel of ['.ios-toggle', '.ios-search__field']) {
          const proxy = el.parentElement?.closest(sel);
          if (proxy) proxies.push(proxy);
        }
        for (const proxy of proxies) box = union(box, boxOf(proxy));
        const w = box.r - box.l;
        const h = box.b - box.t;
        if (w < 43.5 || h < 43.5) {
          const name = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 48);
          out.push(`${w.toFixed(1)}×${h.toFixed(1)} <${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}"> "${name}"`);
        }
      }
    }
    return out;
  }, scope);
}

/**
 * Layout problems at large text: anything wider than the viewport (outside a horizontal scroller)
 * and text cut off by overflow: hidden / clip / ellipsis. Documented truncations are allowed: tab
 * labels (MOBILE §5.1, full name in aria-label) and line-clamped names (§5.14, 2 lines max).
 */
export async function reflowProblems(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scopeSel) => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${vw}`);
    const describe = (el: Element) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}"> "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    const inHorizontalScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll(scopeSel))) {
      if (el.closest('.ios-sr-only, svg, [data-base-ui-focus-guard]')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
      if ((r.right > vw + 1 || r.left < -1) && !inHorizontalScroller(el)) out.push(`off screen (${Math.round(r.left)}–${Math.round(r.right)}): ${describe(el)}`);
      const lineClamped = cs.getPropertyValue('-webkit-line-clamp') && cs.getPropertyValue('-webkit-line-clamp') !== 'none';
      if (lineClamped || el.matches('.ios-tabbar__label')) continue;
      const clips = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
      if (!clips || !(el.textContent ?? '').trim()) continue;
      const clipsY = ['hidden', 'clip'].includes(cs.overflowY);
      if (el.scrollWidth > el.clientWidth + 1 || (clipsY && el.scrollHeight > el.clientHeight + 1)) {
        out.push(`clipped (${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}): ${describe(el)}`);
      }
    }
    return out;
  }, scope);
}

/** Live regions on the page: `role@class (aria-live) in parent-class`. */
export async function liveRegions(page: Page): Promise<Array<{ role: string | null; live: string | null; where: string }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-live], [role=status], [role=alert], [role=log], [role=marquee], [role=timer], output')).map((el) => ({
      role: el.getAttribute('role'),
      live: el.getAttribute('aria-live'),
      where: [
        el.hasAttribute('data-inert-exempt') && el.parentElement === document.body ? 'announcer' : null,
        el.closest('.ios-search') ? 'search' : null,
        el.closest('.ios-keypad-amount, .ios-keypad') ? 'keypad' : null,
        el.matches('.ios-toast-viewport') ? 'toasts' : null,
      ]
        .filter(Boolean)
        .join('') || `other: <${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`,
    })),
  );
}

/** Where focus is: inside an open dialog / alert dialog, or somewhere else (with a description). */
export async function focusInDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active && active !== document.body && active.closest('[role="dialog"], [role="alertdialog"]'));
  });
}
