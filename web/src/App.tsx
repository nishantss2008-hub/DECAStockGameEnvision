/**
 * Application shell: top navigation, the authentication gate, and route table.
 *
 * Page components are authored by sibling agents and are imported as default
 * exports from `./pages/*`. Unauthenticated users are redirected to `/login`;
 * the `/admin` route additionally requires the `admin` role.
 */

import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from './lib/auth';
import { classNames, formatMoney } from './lib/format';
import { usePortfolio } from './hooks/usePortfolio';
import { useGame } from './hooks/useGame';
import Countdown from './components/Countdown';

import Login from './pages/Login';
import Terminal from './pages/Terminal';
import Research from './pages/Research';
import Portfolio from './pages/Portfolio';
import News from './pages/News';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';

/* --------------------------------------------------------------------------
 * Navigation (rendered only on authed pages)
 * ------------------------------------------------------------------------ */

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Terminal', icon: '🧭' },
  { to: '/research', label: 'Research', icon: '🔍' },
  { to: '/portfolio', label: 'Hold', icon: '💰' },
  { to: '/news', label: 'Dispatches', icon: '📜' },
  { to: '/leaderboard', label: 'Fleet', icon: '🏴‍☠️' },
  { to: '/admin', label: 'Helm', icon: '⚓', adminOnly: true },
];

function Nav() {
  const { role, teamId, logout } = useAuth();
  const { team } = usePortfolio();
  const { game } = useGame();
  const isAdmin = role === 'admin';
  const crewName = team?.name ?? (teamId ? `Crew · ${teamId}` : 'Crew');
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      <nav className="nav">
        <NavLink to="/" className="nav-brand" aria-label="Buccaneer Exchange home">
          <span className="nav-brand__mark" aria-hidden="true">
            🏴‍☠️
          </span>
          <span className="nav-brand__text">Buccaneer Exchange</span>
        </NavLink>

        <div className="nav-links">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => classNames('nav-link', isActive && 'is-active')}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="nav-meta">
          <Countdown endAt={game?.endAt ?? null} phase={game?.phase} className="hide-sm" />

          {/* Always-visible cash on mobile (the desktop identity block is hidden there). */}
          {!isAdmin && (
            <div className="mobile-cash">
              <span className="mobile-cash__label">Doubloons</span>
              <span className="mobile-cash__value">{team ? formatMoney(team.cashBalance) : '—'}</span>
            </div>
          )}

          <div className="nav-identity">
            <span className="nav-identity__name">{isAdmin ? 'Quartermaster' : crewName}</span>
            {isAdmin ? (
              <span className="nav-identity__role">Admin</span>
            ) : (
              <span className="nav-identity__role mono">
                {team ? formatMoney(team.cashBalance) : '—'}
              </span>
            )}
          </div>

          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void logout()}>
            <span aria-hidden="true">⚓</span>
            <span className="hide-sm">Abandon Ship</span>
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar (hidden on desktop via CSS). */}
      <nav className="tabbar" aria-label="Primary navigation">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => classNames('tabbar__link', isActive && 'is-active')}
          >
            <span className="tabbar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

/* --------------------------------------------------------------------------
 * Auth gating
 * ------------------------------------------------------------------------ */

function FullScreenLoader() {
  return (
    <div className="center-screen">
      <div className="loading-block">
        <div className="spinner" aria-hidden="true" />
        <span>Hoisting the colors…</span>
      </div>
    </div>
  );
}

/** Wraps authed pages with the nav shell; redirects out if not signed in. */
function RequireAuth({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && role !== 'admin') {
    // Signed in but not an admin — send them back to the terminal.
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">{children}</main>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Routes
 * ------------------------------------------------------------------------ */

function LoginGate() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <Terminal />
          </RequireAuth>
        }
      />
      <Route
        path="/research"
        element={
          <RequireAuth>
            <Research />
          </RequireAuth>
        }
      />
      <Route
        path="/research/:id"
        element={
          <RequireAuth>
            <Research />
          </RequireAuth>
        }
      />
      <Route
        path="/portfolio"
        element={
          <RequireAuth>
            <Portfolio />
          </RequireAuth>
        }
      />
      <Route
        path="/news"
        element={
          <RequireAuth>
            <News />
          </RequireAuth>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <RequireAuth>
            <Leaderboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth adminOnly>
            <Admin />
          </RequireAuth>
        }
      />

      {/* Unknown paths fall back to the terminal (which itself gates auth). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
