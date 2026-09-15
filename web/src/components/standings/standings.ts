/** Pure logic for the Standings tab and the Final results flow (MOBILE §7.12–§7.13). */
import type { LeaderboardEntry } from '@deca/shared';
import type { PodiumEntry } from '../ios/Podium';
import { ordinal } from '../ios/ornamentGeometry';
import { formatMoney, formatPct } from '../../lib/format';
import { crewInitials } from '../../shell/device';
import { movement, movementSpoken } from './reveal';
import { STANDINGS } from './copy';

export type StandingsView = 'total' | 'session';

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** Total return keeps rank order; This session re-sorts by the session change (rank breaks ties). */
export function sortStandings<T extends LeaderboardEntry>(entries: readonly T[], view: StandingsView): T[] {
  const byRank = [...entries].sort((a, b) => a.rank - b.rank);
  if (view === 'total') return byRank;
  return byRank.sort((a, b) => b.sessionChangePct - a.sessionChangePct || a.rank - b.rank);
}

export interface PlaceSummary {
  rank: number;
  count: number;
  title: string;
  gap: string | null;
}

/** "You're 3rd of 14" and "Ð13,480.45 behind Tortuga Capital" (or the lead over 2nd place). */
export function placeSummary(entries: readonly LeaderboardEntry[], teamId: string | null, symbol: string): PlaceSummary | null {
  const ranked = sortStandings(entries, 'total');
  const i = ranked.findIndex((e) => e.teamId === teamId);
  if (i < 0) return null;
  const me = ranked[i]!;
  const title = fill(STANDINGS.place, { ordinal: ordinal(me.rank), n: ranked.length });
  let gap: string | null = null;
  if (i > 0) {
    const above = ranked[i - 1]!;
    gap = fill(STANDINGS.behind, { gap: formatMoney(above.totalValue - me.totalValue, { symbol }), crew: above.name });
  } else if (ranked.length > 1) {
    gap = fill(STANDINGS.lead, { gap: formatMoney(me.totalValue - ranked[1]!.totalValue, { symbol }) });
  }
  return { rank: me.rank, count: ranked.length, title, gap };
}

function changeSpoken(frac: number, context: string): string {
  const text = formatPct(Math.abs(frac));
  if (text === '0.00%') return `no change ${context}`;
  return `${frac > 0 ? 'up' : 'down'} ${text} ${context}`;
}

/** One accessible name for a standings row (MOBILE §10): rank, crew, You, value, change, movement. */
export function standingRowSpoken(row: LeaderboardEntry, opts: { you: boolean; view: StandingsView; symbol: string }): string {
  const change = opts.view === 'total' ? changeSpoken(row.returnPct, 'since the game began') : changeSpoken(row.sessionChangePct, 'this session');
  return [
    `Rank ${row.rank}`,
    row.name,
    ...(opts.you ? [STANDINGS.you] : []),
    formatMoney(row.totalValue, { symbol: opts.symbol }),
    change,
    movementSpoken(movement(row)),
  ].join(', ');
}

/** Top 3 by rank for the Podium (drawn 2-1-3 by the component; DOM order stays 1-2-3). */
export function podiumEntries(entries: readonly LeaderboardEntry[], symbol: string): PodiumEntry[] {
  return sortStandings(entries, 'total')
    .filter((e) => e.rank >= 1 && e.rank <= 3)
    .slice(0, 3)
    .map((e) => ({
      id: e.teamId,
      rank: e.rank as 1 | 2 | 3,
      name: e.name,
      initials: crewInitials(e.name),
      valueText: formatMoney(e.totalValue, { symbol }),
      change: e.returnPct,
    }));
}

export const RESULTS_PAGES = 5;

/** `?page=n` clamped to 1–5; anything unreadable is page 1. */
export function resultsPageFromSearch(search: string | URLSearchParams): number {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const n = Number.parseInt(params.get('page') ?? '', 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(RESULTS_PAGES, Math.max(1, n));
}

// The auto-open rule lives in its own tiny module: the always-mounted shell imports it (MOBILE §9.7).
export { resultsSeenKey, shouldAutoOpenResults } from './autoOpen';
