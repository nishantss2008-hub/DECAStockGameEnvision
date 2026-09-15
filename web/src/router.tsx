/**
 * Data router (MOBILE §6.5, §6.6, §9.6): /login, spec §10 redirects, the crew tab stacks under AppShell and the
 * host area under HostShell, each screen lazy-loaded. Sheets are search params rendered by SheetHost.
 */
import { useEffect, type ComponentType } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration, type RouteObject } from 'react-router-dom';
import { ToastProvider } from './components/ios/Toast';
import { AppShell } from './shell/AppShell';
import { HostShell } from './shell/HostShell';
import { LegacyRedirect, RequireArea, RouteError, UnknownRoute } from './shell/Guards';
import { CREW_SCREENS, HOST_SCREENS, LEGACY_PATHS, type CrewScreenId, type HostScreenId } from './shell/routes';
import './shell/shell.css';

type PageModule = () => Promise<{ default: ComponentType }>;

const CREW_PAGES: Record<CrewScreenId, PageModule> = {
  portfolio: () => import('./pages/portfolio/PortfolioPage'),
  positions: () => import('./pages/portfolio/PositionsPage'),
  activity: () => import('./pages/portfolio/ActivityPage'),
  orderDetail: () => import('./pages/portfolio/OrderDetailPage'),
  balances: () => import('./pages/portfolio/BalancesPage'),
  company: () => import('./pages/company/CompanyPage'),
  financials: () => import('./pages/company/FinancialsPage'),
  stats: () => import('./pages/company/AllStatsPage'),
  markets: () => import('./pages/markets/MarketsPage'),
  sector: () => import('./pages/markets/SectorPage'),
  news: () => import('./pages/news/NewsPage'),
  dispatch: () => import('./pages/news/DispatchPage'),
  standings: () => import('./pages/standings/StandingsPage'),
  results: () => import('./pages/standings/ResultsPage'),
  learn: () => import('./pages/learn/LearnPage'),
  guideChapter: () => import('./pages/learn/GuideChapterPage'),
  glossaryTerm: () => import('./pages/learn/GlossaryTermPage'),
};

const HOST_PAGES: Record<HostScreenId, PageModule> = {
  control: () => import('./pages/admin/ControlPage'),
  crews: () => import('./pages/admin/CrewsPage'),
  market: () => import('./pages/admin/MarketPage'),
  newsDesk: () => import('./pages/admin/NewsDeskPage'),
  tape: () => import('./pages/admin/TapePage'),
  audit: () => import('./pages/admin/AuditPage'),
};

const lazyPage = (load: PageModule) => async () => ({ Component: (await load()).default });

/** Push/pop direction for the view-transition CSS; the browser's own swipe-back gets no second animation (§9.6). */
function usePopstateNav() {
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const ua = (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition;
      document.documentElement.setAttribute('data-nav', ua ? 'ua' : 'pop');
    };
    window.addEventListener('popstate', onPop, { capture: true });
    return () => window.removeEventListener('popstate', onPop, { capture: true });
  }, []);
}

function RootLayout() {
  usePopstateNav();
  return (
    <ToastProvider>
      <Outlet />
      {/* Keyed by pathname: opening or closing a sheet (a search-param change) never moves the page. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
    </ToastProvider>
  );
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      // Lazy too: a signed-in crew's first view never pays for the sign-in form and its segmented control.
      { path: '/login', lazy: lazyPage(() => import('./pages/SignInPage')) },
      ...LEGACY_PATHS.map((path) => ({ path, element: <LegacyRedirect /> })),
      {
        element: (
          <RequireArea area="crew">
            <AppShell />
          </RequireArea>
        ),
        children: CREW_SCREENS.map((s) => ({ path: s.path, lazy: lazyPage(CREW_PAGES[s.id]), handle: { screen: s.id, title: s.title } })),
      },
      {
        element: (
          <RequireArea area="host">
            <HostShell />
          </RequireArea>
        ),
        children: HOST_SCREENS.map((s) => ({ path: s.path, lazy: lazyPage(HOST_PAGES[s.id]), handle: { screen: s.id, title: s.title } })),
      },
      { path: '*', element: <UnknownRoute /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes, {
    future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_skipActionErrorRevalidation: true },
  });
}
