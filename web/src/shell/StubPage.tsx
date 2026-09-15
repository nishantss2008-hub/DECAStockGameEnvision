/**
 * Placeholder screen used by the page stubs until their builders replace them: the right top bar for the
 * screen (tab root or pushed) and an EmptyState. Also exports useStackBack and useDocumentTitle for real pages.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LargeTitleNavBar } from '../components/ios/LargeTitleNavBar';
import { EmptyState } from '../components/ios/EmptyState';
import { CREW_TABS, HOST_TABS, hostTabIdForPath, isTabRoot, tabIdForPath } from './nav';
import { ShellNavBar } from './ShellNavBar';
import { SHELL } from './copy';

const APP_NAME = 'Buccaneer Exchange';

/** Sets `<title>` to "{screen} · Buccaneer Exchange" (MOBILE §10: every screen has a unique title). */
export function useDocumentTitle(screen: string | null | undefined): void {
  useEffect(() => {
    document.title = screen ? `${screen} · ${APP_NAME}` : APP_NAME;
  }, [screen]);
}

/**
 * Back for a pushed screen: history back when the app pushed this entry, else the stack's parent path
 * (a deep link has no history inside the app). Label = the owning tab's name.
 */
export function useStackBack(parent?: string): { label: string; onBack: () => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const tabId = tabIdForPath(location.pathname);
  const tab = CREW_TABS.find((t) => t.id === tabId) ?? HOST_TABS.find((t) => t.id === hostTabIdForPath(location.pathname)) ?? CREW_TABS[0]!;
  return {
    label: tab.label,
    onBack: () => {
      if (location.key !== 'default' && window.history.length > 1) navigate(-1);
      else navigate(parent ?? tab.to, { replace: true });
    },
  };
}

export function StubPage({ title }: { title: string }) {
  const { pathname } = useLocation();
  const root = isTabRoot(pathname);
  const back = useStackBack();
  const host = pathname === '/admin' || pathname.startsWith('/admin/');
  const hostRoot = host && HOST_TABS.some((t) => t.to === pathname.replace(/\/+$/, ''));
  return (
    <>
      {root ? <ShellNavBar title={title} /> : <LargeTitleNavBar title={title} back={hostRoot ? undefined : back} />}
      <div className="bx-page">
        <EmptyState title={SHELL.comingSoon} />
      </div>
    </>
  );
}
