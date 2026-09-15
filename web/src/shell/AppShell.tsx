/**
 * Crew shell (MOBILE §6, §4.5): tab stacks under one layout route. Phone: floating TabBar; short landscape: the
 * TabBar's rail; ≥744×501: Sidebar split view. Hosts the URL sheets, tab memory, first sign-in Welcome sheet,
 * "Sails up", update prompt, Back online toast and the one-time Add to Home Screen tip.
 */
import { useEffect, useRef, type MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Smartphone, Wifi } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/ios/TabBar';
import { useToast } from '../components/ios/Toast';
import { useAuth } from '../lib/auth';
import { CREW_TABS, recallTabPath, rememberTabPath, tabIdForPath, tabPressTarget, type NavItem, type TabId } from './nav';
import { TAB_ICONS } from './icons';
import { matchScreen } from './routes';
import { withSheet } from './sheetParams';
import { SHEET_STATE_KEY, useSheet } from './useSheet';
import { ShellDataProvider, useShellGame } from './ShellData';
import { WalkthroughProvider, useWalkthrough } from './useWalkthrough';
import { SheetHost } from './SheetHost';
import { SailsUp } from './SailsUp';
import { UpdatePrompt } from './UpdatePrompt';
import { Sidebar } from './Sidebar';
import { useShellLayout } from './useShellLayout';
import { useDocumentTitle } from './StubPage';
import { homeScreenPlatform } from './device';
import { isStandalone, localStore, sessionStore } from './storage';
import { MOBILE, SHELL } from './copy';
import { useResultsAutoOpen } from '../components/standings/useResultsAutoOpen';

const TAB_ITEMS: TabBarItem[] = CREW_TABS.map((t) => ({ ...t, icon: TAB_ICONS[t.id] }));
const HOME_TIP_KEY = 'bx.homeScreenTip';

export function scrollToTop() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

/** Tab press behaviour shared by the tab bar and the sidebar (MOBILE §5.1). */
export function useTabPress() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (item: NavItem, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
    event.preventDefault();
    const remembered = recallTabPath(sessionStore(), item.id as TabId);
    const target = tabPressTarget({ tab: item, pathname, remembered });
    if (target.kind === 'scrollTop') scrollToTop();
    else navigate(target.to);
  };
}

function CrewFrame() {
  const location = useLocation();
  const navigate = useNavigate();
  const layout = useShellLayout();
  const { sheet, open } = useSheet();
  const { team, online } = useShellGame();
  const walkthrough = useWalkthrough();
  const toast = useToast();
  const onTab = useTabPress();
  // Final results open by themselves once per game when the host ends it (MOBILE §7.13), from any tab.
  useResultsAutoOpen();

  useEffect(() => {
    rememberTabPath(sessionStore(), location);
  }, [location]);

  useDocumentTitle(matchScreen(location.pathname)?.title);

  // First sign-in: the Welcome sheet over Portfolio (MOBILE §7.2), once.
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current || !walkthrough.welcomePending || !team || sheet || location.pathname !== '/portfolio') return;
    welcomed.current = true;
    navigate({ pathname: '/portfolio', search: withSheet(location.search, { kind: 'welcome' }) }, { state: { [SHEET_STATE_KEY]: true } });
  }, [walkthrough.welcomePending, team, sheet, location.pathname, location.search, navigate]);

  // "Back online" (a polite announcement comes with the toast).
  const wasOnline = useRef(online);
  useEffect(() => {
    if (!wasOnline.current && online) toast.show({ title: MOBILE.toasts.backOnline, icon: Wifi });
    wasOnline.current = online;
  }, [online, toast]);

  // One-time Add to Home Screen tip in a browser tab, after the first sign-in (MOBILE §7.1).
  useEffect(() => {
    if (!team || sheet || walkthrough.welcomePending || isStandalone()) return;
    const store = localStore();
    if (store.getItem(HOME_TIP_KEY)) return;
    store.setItem(HOME_TIP_KEY, '1');
    const platform = homeScreenPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    const tip = platform === 'ios' ? MOBILE.homeScreen.tipIos : platform === 'android' ? MOBILE.homeScreen.tipAndroid : MOBILE.homeScreen.tipChromebook;
    toast.show({ title: tip, icon: Smartphone });
  }, [team, sheet, walkthrough.welcomePending, toast]);

  const activeTab = tabIdForPath(location.pathname);

  return (
    <div className="bx-shell" data-layout={layout}>
      {layout === 'split' && (
        <Sidebar
          items={TAB_ITEMS}
          label={SHELL.mainNav}
          isActive={(item) => item.id === activeTab}
          onItemClick={onTab}
          onTrade={() => open({ kind: 'trade', ticker: null, side: 'buy' })}
          crew={team ? { name: team.name, onOpen: () => open({ kind: 'account' }) } : null}
        />
      )}
      <main id="main" className="bx-main">
        <div className="bx-column">
          <Outlet />
        </div>
      </main>
      {layout !== 'split' && (
        <TabBar items={TAB_ITEMS} label={SHELL.mainNav} layout={layout === 'rail' ? 'rail' : 'bar'} onItemClick={(item, { event }) => onTab(item, event)} />
      )}
      <SheetHost />
      <SailsUp />
      <UpdatePrompt sheetOpen={Boolean(sheet)} />
    </div>
  );
}

export function AppShell() {
  const { teamId } = useAuth();
  return (
    <ShellDataProvider>
      <WalkthroughProvider key={teamId ?? 'none'} teamId={teamId}>
        <CrewFrame />
      </WalkthroughProvider>
    </ShellDataProvider>
  );
}
