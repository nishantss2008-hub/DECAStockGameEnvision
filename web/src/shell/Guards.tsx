/** Route guards and redirects: RequireArea (crew/host), LegacyRedirect, the full-screen loader and the route error screen. */
import type { ReactNode } from 'react';
import { Navigate, useLocation, useRouteError } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { CompassLoader } from '../components/ios/CompassRose';
import { EmptyState } from '../components/ios/EmptyState';
import { gateFor, type Area } from './gate';
import { legacyRedirect } from './routes';
import { ERRORS, LOADING } from './copy';

export function FullScreenLoader() {
  return (
    <div className="bx-fullscreen-center" role="status">
      <CompassLoader label={LOADING.generic.title} flavor={LOADING.generic.flavor} />
    </div>
  );
}

export function RequireArea({ area, children }: { area: Area; children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const gate = gateFor(area, { loading, signedIn: Boolean(user), role }, location);
  if (gate.kind === 'loading') return <FullScreenLoader />;
  if (gate.kind === 'redirect') return <Navigate to={gate.to} replace />;
  return <>{children}</>;
}

export function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={legacyRedirect(pathname, search, hash) ?? '/portfolio'} replace />;
}

/** Unknown paths go to the signed-in role's home (the gates then route crews and hosts). */
export function UnknownRoute() {
  const { role } = useAuth();
  return <Navigate to={role === 'admin' ? '/admin' : '/portfolio'} replace />;
}

export function RouteError() {
  const error = useRouteError();
  // eslint-disable-next-line no-console
  if (error) console.error(error);
  return (
    <main className="bx-fullscreen-center">
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        flavor={ERRORS.pageLoad.flavor}
        action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }}
      />
    </main>
  );
}
