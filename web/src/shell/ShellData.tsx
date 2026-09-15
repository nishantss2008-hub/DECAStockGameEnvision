/**
 * Shared shell data: the game document, the crew's team document and connectivity (GameContext), plus a
 * once-a-second server clock while the market is live (ClockContext), so the status line re-renders alone.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameClock, GameState, Team } from '@deca/shared';
import { useGame } from '../hooks/useGame';
import { usePortfolio } from '../hooks/usePortfolio';
import { serverNow } from '../lib/gameTime';

export interface ShellGame {
  game: GameState | null;
  clock: GameClock | null;
  gameLoading: boolean;
  fromCache: boolean;
  team: Team | null;
  teamLoading: boolean;
  online: boolean;
}

const GameContext = createContext<ShellGame | null>(null);
const ClockContext = createContext<number>(0);

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function ShellDataProvider({ children }: { children: ReactNode }) {
  const { game, clock, loading: gameLoading, fromCache } = useGame();
  const { team, loading: teamLoading } = usePortfolio();
  const online = useOnline();
  const [now, setNow] = useState(() => serverNow());
  const ticking = game?.phase === 'live';

  useEffect(() => {
    setNow(serverNow());
    if (!ticking) return undefined;
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, [ticking, game?.lastTickAt]);

  const value = useMemo<ShellGame>(
    () => ({ game, clock, gameLoading, fromCache, team, teamLoading, online }),
    [game, clock, gameLoading, fromCache, team, teamLoading, online],
  );
  return (
    <GameContext.Provider value={value}>
      <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
    </GameContext.Provider>
  );
}

const EMPTY: ShellGame = { game: null, clock: null, gameLoading: true, fromCache: false, team: null, teamLoading: true, online: true };

export function useShellGame(): ShellGame {
  return useContext(GameContext) ?? EMPTY;
}

/** Server time, refreshed every second while live. */
export function useShellNow(): number {
  return useContext(ClockContext) || serverNow();
}
