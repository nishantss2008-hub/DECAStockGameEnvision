import { describe, expect, it } from 'vitest';
import { CREW_SCREENS, HOST_SCREENS, legacyRedirect, matchScreen } from './routes';

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
  ])('%s%s → %s', (pathname, search, expected) => {
    expect(legacyRedirect(pathname, search)).toBe(expected);
  });

  it('leaves current routes alone', () => {
    for (const p of ['/portfolio', '/news', '/markets/company/KRKN', '/login', '/admin', '/nowhere']) {
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
    ['/markets/sector/shipping', 'sector'],
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
  ])('%s → %s', (pathname, id) => {
    expect(matchScreen(pathname)?.id).toBe(id);
  });

  it('has no Company page in the Standings stack and no unknown screens', () => {
    expect(matchScreen('/standings/company/KRKN')).toBeNull();
    expect(matchScreen('/learn/sector/x')).toBeNull();
  });

  it('every screen has a title and a unique path', () => {
    const all = [...CREW_SCREENS, ...HOST_SCREENS];
    expect(new Set(all.map((s) => s.path)).size).toBe(all.length);
    for (const s of all) expect(s.title.length).toBeGreaterThan(0);
  });
});
