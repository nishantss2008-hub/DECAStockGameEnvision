/**
 * Live data shared by the Portfolio stack: the crew's team and holdings, every INSTRUMENT (companies
 * and funds — a crew can hold either), the game document, derived position rows and account totals
 * (derive.ts), and the orders + fills joined for Activity.
 */
import { useMemo } from 'react';
import { DEFAULT_STARTING_CAPITAL } from '@deca/shared';
import { useInstruments } from '../../hooks/useInstruments';
import { useOrders } from '../../hooks/useOrders';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useTrades } from '../../hooks/useTrades';
import { useShellGame } from '../../shell/ShellData';
import { DEFAULT_CURRENCY } from '../ios/signedText';
import { buildActivity } from './activity';
import { accountTotals, buildPositions, liveAccountValue } from './derive';

export function usePortfolioView() {
  const { team: stored, holdings, loading: teamLoading, error: teamError } = usePortfolio();
  const { byId, loading: companiesLoading, error: companiesError } = useInstruments();
  const { game, clock } = useShellGame();
  const startingCapital = game?.startingCapital ?? DEFAULT_STARTING_CAPITAL;
  // Live valuation: a fill or a price change shows at once, not at the next leaderboard mark.
  const phase = game?.phase ?? null;
  const team = useMemo(
    () => (stored ? { ...stored, totalValue: liveAccountValue(stored, holdings, byId, phase) } : null),
    [stored, holdings, byId, phase],
  );
  const rows = useMemo(() => buildPositions(holdings, byId, team?.totalValue ?? 0), [holdings, byId, team?.totalValue]);
  const totals = useMemo(() => (team ? accountTotals(team, rows, startingCapital) : null), [team, rows, startingCapital]);
  return {
    team,
    rows,
    totals,
    byId,
    game,
    clock,
    startingCapital,
    currency: game?.currency ?? DEFAULT_CURRENCY,
    loading: (teamLoading && !team) || (companiesLoading && holdings.length > 0 && Object.keys(byId).length === 0),
    error: team ? null : (teamError ?? companiesError ?? null),
  };
}

export function useActivityItems() {
  const { orders, loading: ordersLoading, error: ordersError } = useOrders();
  const { trades, loading: tradesLoading, error: tradesError } = useTrades();
  const { byId } = useInstruments();
  const { game } = useShellGame();
  const sessionTicks = game?.sessionTicks ?? 1;
  const items = useMemo(() => buildActivity(orders, trades, byId, sessionTicks), [orders, trades, byId, sessionTicks]);
  return {
    items,
    loading: (ordersLoading || tradesLoading) && items.length === 0,
    error: items.length ? null : (ordersError ?? tradesError ?? null),
  };
}
