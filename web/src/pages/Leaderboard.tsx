/**
 * Leaderboard — the fleet standings.
 *
 * Renders the LeaderboardTable (which highlights the signed-in crew on its
 * own) from useLeaderboard. Above it, a small summary of the leader, the fleet
 * size, and the crew's own rank for quick orientation.
 */

import { useMemo } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useAuth } from '../lib/auth';
import LeaderboardTable from '../components/LeaderboardTable';
import { formatMoney } from '../lib/format';

function formatUpdated(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Leaderboard() {
  const { leaderboard, loading } = useLeaderboard();
  const { teamId } = useAuth();

  const entries = leaderboard?.entries ?? [];
  const leader = useMemo(
    () => entries.find((e) => e.rank === 1) ?? null,
    [entries],
  );
  const you = useMemo(
    () => (teamId ? entries.find((e) => e.teamId === teamId) ?? null : null),
    [entries, teamId],
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Standings</p>
          <h1>The Fleet</h1>
        </div>
        {leaderboard?.updatedAt ? (
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Tallied at {formatUpdated(leaderboard.updatedAt)}
          </span>
        ) : null}
      </header>

      {loading && entries.length === 0 ? (
        <div className="loading-block" style={{ minHeight: '40vh' }}>
          <div className="spinner" aria-hidden="true" />
          <span>Tallying the chests…</span>
        </div>
      ) : (
        <>
          {entries.length > 0 && (
            <div
              className="grid grid-3"
              style={{ marginBottom: 'var(--sp-6)', gap: 'var(--sp-4)' }}
            >
              <div className="panel stat">
                <span className="stat-label">Flagship (1st)</span>
                <span className="stat-value" style={{ fontSize: 'var(--fs-md)' }}>
                  {leader ? `🥇 ${leader.name}` : '—'}
                </span>
                {leader && (
                  <span className="muted mono" style={{ fontSize: 'var(--fs-sm)' }}>
                    {formatMoney(leader.totalValue)}
                  </span>
                )}
              </div>
              <div className="panel stat">
                <span className="stat-label">Ships in the Fleet</span>
                <span className="stat-value">{entries.length}</span>
              </div>
              <div className="panel stat">
                <span className="stat-label">Your Crew</span>
                <span className="stat-value" style={{ fontSize: 'var(--fs-md)' }}>
                  {you ? `Rank #${you.rank}` : '—'}
                </span>
                {you && (
                  <span className="muted mono" style={{ fontSize: 'var(--fs-sm)' }}>
                    {formatMoney(you.totalValue)}
                  </span>
                )}
              </div>
            </div>
          )}

          <LeaderboardTable entries={entries} />
        </>
      )}
    </div>
  );
}
