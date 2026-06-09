/**
 * LeaderboardTable — the fleet standings, ranked by total value.
 *
 * Renders each crew with its rank, name, and total value (cash +
 * mark-to-market holdings). The top three get treasure medals; the signed-in
 * crew's row is highlighted. The current team id comes from useAuth, but can be
 * overridden via `highlightTeamId` for reuse (e.g. previews).
 */

import { useEffect } from 'react';
import type { LeaderboardEntry } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { classNames, formatMoney } from '../lib/format';

const STYLE_ID = 'leaderboard-table-styles';
const CSS = `
.leaderboard-empty { padding: var(--sp-6); }
.leaderboard-table__rank-col { width: 5.5rem; }
.leaderboard-table__rank {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-weight: 700;
}
.leaderboard-table__medal { font-size: 1.2em; line-height: 1; }
.leaderboard-table__name { font-family: var(--font-heading); font-weight: 600; }
.leaderboard-table__value { font-weight: 600; color: var(--gold-200); }
.leaderboard-table__you-badge { margin-left: var(--sp-2); }
.leaderboard-table__row.is-podium .leaderboard-table__value { color: var(--gold-300); }
.leaderboard-table__row.is-you {
  background: rgba(201, 161, 59, 0.16) !important;
  box-shadow: inset 3px 0 0 var(--gold-400);
}
.leaderboard-table__row.is-you td { color: var(--gold-100, var(--gold-200)); }
`;

function useInjectedStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

export interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  /** Force a highlighted team; defaults to the authenticated team. */
  highlightTeamId?: string | null;
  className?: string;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardTable({
  entries,
  highlightTeamId,
  className,
}: LeaderboardTableProps) {
  useInjectedStyles();
  const { teamId } = useAuth();
  const youId = highlightTeamId !== undefined ? highlightTeamId : teamId;

  const ranked = [...entries].sort((a, b) => a.rank - b.rank);

  if (ranked.length === 0) {
    return (
      <div className={classNames('panel leaderboard-empty', className)}>
        <p className="muted text-center">
          The standings are still being tallied. Check back once the voyage is
          underway.
        </p>
      </div>
    );
  }

  return (
    <div className={classNames('panel panel--flush', className)}>
      <div className="table-wrap">
        <table className="table leaderboard-table">
          <thead>
            <tr>
              <th className="leaderboard-table__rank-col">Rank</th>
              <th>Crew</th>
              <th className="num">Total Value</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry) => {
              const isYou = youId != null && entry.teamId === youId;
              const medal = MEDALS[entry.rank];
              return (
                <tr
                  key={entry.teamId}
                  className={classNames(
                    'leaderboard-table__row',
                    isYou && 'is-you',
                    entry.rank <= 3 && 'is-podium',
                  )}
                >
                  <td className="leaderboard-table__rank">
                    {medal ? (
                      <span className="leaderboard-table__medal" aria-hidden="true">
                        {medal}
                      </span>
                    ) : null}
                    <span className="mono">{entry.rank}</span>
                  </td>
                  <td>
                    <span className="leaderboard-table__name">{entry.name}</span>
                    {isYou && (
                      <span className="badge badge--gold leaderboard-table__you-badge">
                        You
                      </span>
                    )}
                  </td>
                  <td className="num leaderboard-table__value">
                    {formatMoney(entry.totalValue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
