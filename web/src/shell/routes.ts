/**
 * Route table (MOBILE §6.5, §6.6) as data: every screen's path pattern and default document title, plus the
 * redirects from the spec §10 routes. router.tsx turns this into the data router; the tests read it directly.
 */
import { matchRoutes } from 'react-router-dom';

export type CrewScreenId =
  | 'portfolio'
  | 'positions'
  | 'activity'
  | 'orderDetail'
  | 'balances'
  | 'company'
  | 'financials'
  | 'stats'
  | 'markets'
  | 'compare'
  | 'news'
  | 'dispatch'
  | 'standings'
  | 'results'
  | 'learn'
  | 'meetTheMarket'
  | 'guideChapter'
  | 'glossaryTerm';

export type HostScreenId = 'control' | 'crews' | 'market' | 'newsDesk' | 'tape' | 'audit' | 'projector';
export type ScreenId = CrewScreenId | HostScreenId;

export interface ScreenRoute<Id extends ScreenId = ScreenId> {
  id: Id;
  path: string;
  /** Default `<title>` prefix (MOBILE §10: every screen has a unique title); pages may refine it. */
  title: string;
}

/** Stacks that push the shared Company page (§6.5: tab ∈ portfolio, markets, news, learn). */
export const COMPANY_STACKS = ['portfolio', 'markets', 'news', 'learn'] as const;

const companyRoutes: ScreenRoute<CrewScreenId>[] = COMPANY_STACKS.flatMap((tab) => [
  { id: 'company' as const, path: `/${tab}/company/:ticker`, title: 'Company' },
  { id: 'financials' as const, path: `/${tab}/company/:ticker/financials`, title: 'Financials' },
  { id: 'stats' as const, path: `/${tab}/company/:ticker/stats`, title: 'All stats' },
]);

export const CREW_SCREENS: readonly ScreenRoute<CrewScreenId>[] = [
  { id: 'portfolio', path: '/portfolio', title: 'Portfolio' },
  { id: 'positions', path: '/portfolio/positions', title: 'Positions' },
  { id: 'activity', path: '/portfolio/activity', title: 'Activity' },
  { id: 'orderDetail', path: '/portfolio/activity/:orderId', title: 'Order detail' },
  { id: 'balances', path: '/portfolio/balances', title: 'Balances' },
  { id: 'markets', path: '/markets', title: 'Markets' },
  { id: 'compare', path: '/markets/compare', title: 'Compare companies' },
  { id: 'news', path: '/news', title: 'News' },
  { id: 'dispatch', path: '/news/:newsId', title: 'Dispatch' },
  { id: 'standings', path: '/standings', title: 'Standings' },
  { id: 'results', path: '/standings/results', title: 'Final results' },
  { id: 'learn', path: '/learn', title: 'Learn' },
  { id: 'meetTheMarket', path: '/learn/meet-the-market', title: 'Meet the market' },
  { id: 'guideChapter', path: '/learn/guide', title: 'How the game works' },
  { id: 'guideChapter', path: '/learn/five-questions', title: '5 questions' },
  { id: 'guideChapter', path: '/learn/basics', title: 'Trading basics' },
  { id: 'glossaryTerm', path: '/learn/glossary/:termId', title: 'Glossary' },
  ...companyRoutes,
];

export const HOST_SCREENS: readonly ScreenRoute<HostScreenId>[] = [
  { id: 'control', path: '/admin', title: 'Control' },
  { id: 'crews', path: '/admin/crews', title: 'Crews' },
  { id: 'market', path: '/admin/market', title: 'Market' },
  { id: 'newsDesk', path: '/admin/news', title: 'News desk' },
  { id: 'tape', path: '/admin/tape', title: 'Tape' },
  { id: 'audit', path: '/admin/audit', title: 'Audit' },
];

/**
 * Host screens rendered OUTSIDE HostShell's chrome (MOBILE §7.19): no tab bar, no nav bar, nothing
 * tappable. The projector is the room's screen, not the host's, and one fat-fingered tab during a
 * round would put the standings somewhere else. Kept out of HOST_SCREENS so it can never
 * accidentally grow chrome; still a `/admin/*` path, so `gate.ts` keeps crews out of it.
 */
export const HOST_FULLSCREEN_SCREENS: readonly ScreenRoute<HostScreenId>[] = [{ id: 'projector', path: '/admin/projector', title: 'Projector' }];

const ALL = [...CREW_SCREENS, ...HOST_SCREENS, ...HOST_FULLSCREEN_SCREENS];
const MATCHABLE = ALL.map((s) => ({ path: s.path, screen: s }));

export function matchScreen(pathname: string): ScreenRoute | null {
  const hit = matchRoutes(MATCHABLE, pathname);
  return hit?.[hit.length - 1]?.route.screen ?? null;
}

/**
 * Crew screens that fill the phone with the shell's chrome hidden (`html[data-intro]`, intro.css):
 * today only the required-once "Meet the market" flow (design 2026-09-16 §6). They still live in a
 * tab's path space — the flow is replayable from Learn — but a step inside a flow is not a place in
 * that tab's stack, so tab memory neither stores nor restores one (nav.ts). Without that, pressing
 * Learn after the flow drops the crew straight back into the intro it has already finished, with no
 * tab bar to leave by.
 */
export const CHROMELESS_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['meetTheMarket']);

/** True when the shell renders `pathname` without its tab bar / sidebar. */
export function isChromeless(pathname: string): boolean {
  const screen = matchScreen(pathname);
  return screen ? CHROMELESS_SCREENS.has(screen.id) : false;
}

/**
 * Patterns router.tsx mounts <LegacyRedirect/> on.
 *
 * `/markets/sector/:sectorId` is here rather than in CREW_SCREENS since 2026-09-17: the sector
 * screen is gone (its index percentage is on the Markets group heading, and the three companies it
 * listed are under that heading), but a bookmark, a shared link or a stale service-worker page can
 * still ask for it, and landing on Portfolio would be a lie about where those companies went.
 */
export const LEGACY_PATHS = [
  '/',
  '/positions',
  '/activity',
  '/trade',
  '/trade/:ticker',
  '/research',
  '/research/:ticker',
  '/results',
  '/leaderboard',
  '/markets/sector/:sectorId',
] as const;

const TRADE_SECTIONS = new Set(['analysts', 'dispatches', 'crew']);

/** New location for an old spec §10 path, or null when the path is not a legacy route. */
export function legacyRedirect(pathname: string, search: string, hash = ''): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const keep = `${search}${hash}`;
  const segs = path.split('/').filter(Boolean);
  const company = (t: string) => `/markets/company/${encodeURIComponent(t)}`;
  switch (segs[0]) {
    case undefined:
      return `/portfolio${keep}`;
    case 'positions':
      return segs.length === 1 ? `/portfolio/positions${keep}` : null;
    case 'activity':
      return segs.length === 1 ? `/portfolio/activity${keep}` : null;
    case 'results':
      return segs.length === 1 ? `/standings/results${keep}` : null;
    case 'leaderboard':
      return segs.length === 1 ? `/standings${keep}` : null;
    case 'markets':
      // The retired sector screen: the group it named is on Markets, under its own heading.
      return segs[1] === 'sector' && segs.length === 3 ? '/markets#companies' : null;
    case 'research':
      if (segs.length === 1) return '/markets?view=basics#companies';
      return segs.length === 2 ? `${company(segs[1]!)}/financials` : null;
    case 'trade': {
      if (segs.length === 1) return '/portfolio?sheet=trade';
      if (segs.length !== 2) return null;
      const ticker = segs[1]!;
      const tab = new URLSearchParams(search).get('tab');
      if (tab === 'financials') return `${company(ticker)}/financials`;
      if (tab && TRADE_SECTIONS.has(tab)) return `${company(ticker)}#${tab}`;
      if (tab === 'snapshot') return company(ticker);
      return `${company(ticker)}?sheet=trade&side=buy`;
    }
    default:
      return null;
  }
}
