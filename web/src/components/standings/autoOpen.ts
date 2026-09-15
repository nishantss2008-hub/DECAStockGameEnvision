/** Final results auto-open rule (MOBILE §7.13), kept free of standings copy so the crew shell stays small. */
import type { Phase } from '@deca/shared';

/** localStorage key remembering that this game's results were shown (one key per game). */
export function resultsSeenKey(gameId: number | null | undefined): string {
  return `bx.resultsSeen.${gameId ?? 0}`;
}

/** Open the results by themselves once, after the game ends, never over a sheet or over the results. */
export function shouldAutoOpenResults(s: { phase: Phase | null | undefined; seen: boolean; pathname: string; sheetOpen: boolean }): boolean {
  if (s.phase !== 'ended' || s.seen || s.sheetOpen) return false;
  return !s.pathname.startsWith('/standings/results') && !s.pathname.startsWith('/admin') && s.pathname !== '/login';
}
