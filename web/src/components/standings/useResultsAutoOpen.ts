/**
 * Opens Final results by itself once per game when the phase becomes `ended` (MOBILE §7.13), and lets the
 * results page mark them seen. Mount `useResultsAutoOpen()` in any always-mounted crew screen.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useShellGame } from '../../shell/ShellData';
import { parseSheet } from '../../shell/sheetParams';
import { localStore } from '../../shell/storage';
import { resultsSeenKey, shouldAutoOpenResults } from './autoOpen';

function readSeen(key: string): boolean {
  try {
    return localStore().getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markResultsSeen(gameId: number | null | undefined): void {
  try {
    localStore().setItem(resultsSeenKey(gameId), '1');
  } catch {
    /* private mode: the results may open again, which is harmless */
  }
}

export function useResultsAutoOpen(): void {
  const { game } = useShellGame();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const phase = game?.phase ?? null;
  const gameId = game?.marketCreatedAt ?? null;
  useEffect(() => {
    if (phase !== 'ended') return;
    const seen = readSeen(resultsSeenKey(gameId));
    if (shouldAutoOpenResults({ phase, seen, pathname, sheetOpen: parseSheet(search) !== null })) {
      navigate('/standings/results?page=1');
    }
  }, [phase, gameId, pathname, search, navigate]);
}
