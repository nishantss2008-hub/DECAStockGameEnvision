/**
 * Host screens with no chrome (MOBILE §7.19). HostShell's tab bar, sidebar and update prompt are
 * for the host's phone; the projector is for a wall, where every control is something a passing
 * elbow can press. This wrapper keeps the two things a chrome-less screen still needs — the host's
 * dark appearance and a document title — and nothing else.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { useHostAppearance } from './hostAppearance';
import { matchScreen } from './routes';
import { useDocumentTitle } from './StubPage';

export function HostFullScreen() {
  const location = useLocation();
  useHostAppearance();
  useDocumentTitle(matchScreen(location.pathname)?.title);
  return <Outlet />;
}
