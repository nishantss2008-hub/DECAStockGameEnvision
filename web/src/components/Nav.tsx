/**
 * Nav — the top navigation bar shown on every authenticated page.
 *
 * Links: Terminal, Research, Portfolio, News, Leaderboard, and Admin (admins
 * only). Shows the current crew identity (team name) with live cash balance, a
 * Countdown to the end of the voyage, and a logout action.
 *
 * Reads auth + role from useAuth, the team doc (cash) from usePortfolio, and
 * the game phase/endAt from useGame. Purely presentational beyond those hooks.
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { usePortfolio } from '../hooks/usePortfolio';
import { useGame } from '../hooks/useGame';
import { classNames, formatMoney } from '../lib/format';
import Countdown from './Countdown';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Terminal', icon: '🧭', end: true },
  { to: '/research', label: 'Research', icon: '🔍' },
  { to: '/portfolio', label: 'Hold', icon: '💰' },
  { to: '/news', label: 'Dispatches', icon: '📜' },
  { to: '/leaderboard', label: 'Fleet', icon: '🏴‍☠️' },
  { to: '/admin', label: 'Helm', icon: '⚓', adminOnly: true },
];

export default function Nav() {
  const { role, teamId, logout } = useAuth();
  const { team } = usePortfolio();
  const { game } = useGame();

  const isAdmin = role === 'admin';
  const crewName = team?.name ?? (teamId ? `Crew · ${teamId}` : 'Crew');

  return (
    <nav className="nav">
      <NavLink to="/" className="nav-brand" aria-label="Buccaneer Exchange home">
        <span className="nav-brand__mark" aria-hidden="true">
          🏴‍☠️
        </span>
        <span className="nav-brand__text">Buccaneer Exchange</span>
      </NavLink>

      <div className="nav-links">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => classNames('nav-link', isActive && 'is-active')}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="nav-meta">
        <Countdown
          endAt={game?.endAt ?? null}
          phase={game?.phase}
          className="hide-sm"
        />

        <div className="nav-identity">
          <span className="nav-identity__name">
            {isAdmin ? 'Quartermaster' : crewName}
          </span>
          {isAdmin ? (
            <span className="nav-identity__role">Admin</span>
          ) : (
            <span className="nav-identity__role mono">
              {team ? formatMoney(team.cashBalance) : '—'}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void logout()}
        >
          Abandon Ship
        </button>
      </div>
    </nav>
  );
}
