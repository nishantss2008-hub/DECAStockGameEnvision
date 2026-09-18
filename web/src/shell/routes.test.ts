import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREW_SCREENS, HOST_FULLSCREEN_SCREENS, HOST_SCREENS, isChromeless, legacyRedirect, matchScreen } from './routes';

describe('legacy redirects (MOBILE §6.5, spec §10 routes)', () => {
  it.each([
    ['/', '', '/portfolio'],
    ['/positions', '', '/portfolio/positions'],
    ['/activity', '?filter=sells', '/portfolio/activity?filter=sells'],
    ['/trade', '', '/portfolio?sheet=trade'],
    ['/trade/KRKN', '', '/markets/company/KRKN?sheet=trade&side=buy'],
    ['/trade/KRKN', '?tab=financials', '/markets/company/KRKN/financials'],
    ['/trade/KRKN', '?tab=analysts', '/markets/company/KRKN#analysts'],
    ['/trade/KRKN', '?tab=dispatches', '/markets/company/KRKN#dispatches'],
    ['/trade/KRKN', '?tab=crew', '/markets/company/KRKN#crew'],
    ['/trade/KRKN', '?tab=snapshot', '/markets/company/KRKN'],
    ['/research', '', '/markets?view=basics#companies'],
    ['/research/KRKN', '', '/markets/company/KRKN/financials'],
    ['/results', '', '/standings/results'],
    ['/leaderboard', '', '/standings'],
    // The retired sector screen (2026-09-17): its group is on Markets, under its own heading.
    ['/markets/sector/shipping-salvage', '', '/markets#companies'],
    ['/markets/sector/naval-arms', '?sort=price', '/markets#companies'],
  ])('%s%s → %s', (pathname, search, expected) => {
    expect(legacyRedirect(pathname, search)).toBe(expected);
  });

  it('leaves current routes alone', () => {
    for (const p of ['/portfolio', '/news', '/markets', '/markets/compare', '/markets/company/KRKN', '/login', '/admin', '/nowhere']) {
      expect(legacyRedirect(p, '')).toBeNull();
    }
  });
});

describe('route table', () => {
  it.each([
    ['/portfolio', 'portfolio'],
    ['/portfolio/positions', 'positions'],
    ['/portfolio/activity', 'activity'],
    ['/portfolio/activity/BX-7Q2F9K', 'orderDetail'],
    ['/portfolio/balances', 'balances'],
    ['/portfolio/company/KRKN', 'company'],
    ['/markets', 'markets'],
    ['/markets/compare', 'compare'],
    ['/markets/company/KRKN', 'company'],
    ['/markets/company/KRKN/financials', 'financials'],
    ['/news/company/KRKN/stats', 'stats'],
    ['/learn/company/KRKN/financials', 'financials'],
    ['/portfolio/company/KRKN/stats', 'stats'],
    ['/news', 'news'],
    ['/news/n-123', 'dispatch'],
    ['/news/company/KRKN', 'company'],
    ['/standings', 'standings'],
    ['/standings/results', 'results'],
    ['/learn', 'learn'],
    ['/learn/guide', 'guideChapter'],
    ['/learn/five-questions', 'guideChapter'],
    ['/learn/basics', 'guideChapter'],
    ['/learn/glossary/peRatio', 'glossaryTerm'],
    ['/learn/company/KRKN', 'company'],
    ['/admin', 'control'],
    ['/admin/crews', 'crews'],
    ['/admin/market', 'market'],
    ['/admin/news', 'newsDesk'],
    ['/admin/tape', 'tape'],
    ['/admin/audit', 'audit'],
    ['/admin/projector', 'projector'],
  ])('%s → %s', (pathname, id) => {
    expect(matchScreen(pathname)?.id).toBe(id);
  });

  /**
   * The crew shell hides its tab bar with `html[data-intro]` (intro.css), and only the "Meet the
   * market" flow sets it. `isChromeless` is that same list for nav.ts, which must never remember a
   * chrome-less screen as a tab's stack — read the CSS and the page so a second full-screen flow
   * cannot quietly appear without joining the set.
   */
  it('knows every crew screen the shell renders without its tab bar (design §6)', () => {
    expect(isChromeless('/learn/meet-the-market')).toBe(true);
    for (const p of ['/learn', '/learn/guide', '/learn/glossary/peRatio', '/portfolio', '/markets', '/standings/results']) {
      expect(isChromeless(p), p).toBe(false);
    }
    const pages = fileURLToPath(new URL('../pages', import.meta.url));
    const read = (p: string) => readFileSync(p, 'utf8');
    expect(read(fileURLToPath(new URL('../components/learn/intro.css', import.meta.url)))).toContain('html[data-intro] .ios-tabbar');
    const setters = readdirSync(pages, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => read(join(pages, f)).includes("setAttribute('data-intro'"));
    expect(setters, 'a new full-screen flow must join CHROMELESS_SCREENS').toEqual(['learn/MeetTheMarketPage.tsx']);
  });

  it('keeps the projector out of the host tab stack: it renders without chrome (§7.19)', () => {
    expect(HOST_SCREENS.map((s) => s.id)).not.toContain('projector');
    expect(HOST_FULLSCREEN_SCREENS.map((s) => s.path)).toEqual(['/admin/projector']);
  });

  // router.tsx cannot be imported in a test: HostShell's UpdatePrompt pulls in the PWA plugin's
  // virtual module, which vitest does not build. The wiring is one branch, so read it instead.
  it('mounts the chrome-less host screens behind the host gate and outside HostShell', () => {
    const src = readFileSync(fileURLToPath(new URL('../router.tsx', import.meta.url)), 'utf8');
    const branch = src.slice(src.indexOf('HOST_SCREENS.map'), src.indexOf('HOST_FULLSCREEN_SCREENS.map'));
    expect(branch).toContain('area="host"');
    expect(branch).toContain('<HostFullScreen />');
    expect(branch).not.toContain('<HostShell />');
  });

  it('has no Company page in the Standings stack and no unknown screens', () => {
    expect(matchScreen('/standings/company/KRKN')).toBeNull();
    expect(matchScreen('/learn/sector/x')).toBeNull();
  });

  it('every screen has a title and a unique path', () => {
    const all = [...CREW_SCREENS, ...HOST_SCREENS, ...HOST_FULLSCREEN_SCREENS];
    expect(new Set(all.map((s) => s.path)).size).toBe(all.length);
    for (const s of all) expect(s.title.length).toBeGreaterThan(0);
  });
});
