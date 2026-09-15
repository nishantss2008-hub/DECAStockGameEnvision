/**
 * Host shell (MOBILE §6.6): its own five tabs on phone (Control, Crews, Market, News, Tape; Audit lives in
 * Control's More menu) and a sidebar with Audit at ≥744. Host pages render their own top bars.
 */
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { useHostAppearance } from './hostAppearance';
import { TabBar, type TabBarItem } from '../components/ios/TabBar';
import { HOST_TABS, hostTabIdForPath, type NavItem } from './nav';
import { HOST_TAB_ICONS } from './icons';
import { matchScreen } from './routes';
import { Sidebar } from './Sidebar';
import { useShellLayout } from './useShellLayout';
import { useDocumentTitle } from './StubPage';
import { UpdatePrompt } from './UpdatePrompt';
import { scrollToTop } from './AppShell';
import { SHELL } from './copy';

const HOST_ITEMS: TabBarItem[] = HOST_TABS.map((t) => ({ ...t, icon: HOST_TAB_ICONS[t.id] }));

export function HostShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const layout = useShellLayout();
  useHostAppearance();
  useDocumentTitle(matchScreen(location.pathname)?.title);
  const active = hostTabIdForPath(location.pathname);

  const onTab = (item: NavItem, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (location.pathname === item.to) scrollToTop();
    else navigate(item.to);
  };

  return (
    <div className="bx-shell bx-shell--host" data-layout={layout}>
      {layout === 'split' && (
        <Sidebar items={HOST_ITEMS} label={SHELL.hostNav} isActive={(item) => item.id === active && location.pathname !== '/admin/audit'} onItemClick={onTab} host />
      )}
      <main id="main" className="bx-main">
        <div className="bx-column bx-column--wide">
          <Outlet />
        </div>
      </main>
      {layout !== 'split' && <TabBar items={HOST_ITEMS} label={SHELL.hostNav} layout={layout === 'rail' ? 'rail' : 'bar'} onItemClick={(item, { event }) => onTab(item, event)} />}
      <UpdatePrompt sheetOpen={false} />
    </div>
  );
}
