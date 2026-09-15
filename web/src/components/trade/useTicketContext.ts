/** Live inputs for the Trade sheet: the company by ticker, the crew's cash and holding, and the game settings. */
import { useMemo } from 'react';
import { liveAccountValue } from '../portfolio/derive';
import type { Company, GameState, Holding, Team } from '@deca/shared';
import { DEFAULT_FEE_BPS, DEFAULT_MAX_POSITION_PCT } from '@deca/shared';
import { useCompanies } from '../../hooks/useCompanies';
import { useCompany } from '../../hooks/useCompany';
import { usePortfolio } from '../../hooks/usePortfolio';
import { formatTickTime } from '../../lib/format';
import { useShellGame, useShellNow } from '../../shell/ShellData';
import { DEFAULT_CURRENCY } from '../ios/signedText';
import type { TicketContext } from './ticketModel';

export interface TicketData {
  company: Company | null;
  companies: Company[];
  holdings: Holding[];
  team: Team | null;
  game: GameState | null;
  online: boolean;
  ctx: TicketContext | null;
  loading: boolean;
  notFound: boolean;
}

export function useTicketData(ticker: string | null): TicketData {
  const { companies, byTicker, byId, loading: listLoading } = useCompanies();
  const listed = ticker ? (byTicker[ticker.toUpperCase()] ?? null) : null;
  const { company: live } = useCompany(listed?.id ?? null);
  const company = live ?? listed;
  const { game, team, online } = useShellGame();
  const { holdings, loading: portfolioLoading } = usePortfolio();
  const now = useShellNow();
  const holding = company ? holdings.find((h) => h.companyId === company.id) : undefined;

  const ctx = useMemo<TicketContext | null>(() => {
    if (!company || !team) return null;
    const step = game?.tickIntervalMs ?? 30_000;
    const nextAt = game?.lastTickAt ? game.lastTickAt + step : null;
    const tickAt = game?.lastTickAt ? game.lastTickAt - Math.max(0, (game.currentTick ?? company.lastTick) - company.lastTick) * step : null;
    return {
      companyId: company.id,
      ticker: company.ticker,
      name: company.name,
      price: company.currentPrice,
      beta: company.beta,
      sharesOutstanding: company.sharesOutstanding,
      tick: company.lastTick,
      timeText: tickAt ? formatTickTime(tickAt) : '—',
      cash: team.cashBalance,
      owned: holding?.shares ?? 0,
      avgCost: holding?.avgCost ?? 0,
      // Same sum the server's position check uses (cash + shares at latest prices), not the per-tick mark.
      totalValue: liveAccountValue(team, holdings, byId, game?.phase),
      feeBps: game?.feeBps ?? DEFAULT_FEE_BPS,
      maxPositionPct: game?.maxPositionPct ?? DEFAULT_MAX_POSITION_PCT,
      currency: game?.currency ?? DEFAULT_CURRENCY,
      secondsToNextTick: nextAt ? Math.max(1, Math.ceil((nextAt - now) / 1000)) : Math.round(step / 1000),
    };
    // `now` only matters for the interval-limit seconds; rounding to 5s keeps renders calm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, team, holding?.shares, holding?.avgCost, holdings, byId, game, Math.floor(now / 5000)]);

  return {
    company,
    companies,
    holdings,
    team,
    game,
    online,
    ctx,
    loading: listLoading || portfolioLoading,
    notFound: Boolean(ticker) && !listLoading && !listed,
  };
}
