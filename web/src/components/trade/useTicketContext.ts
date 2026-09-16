/**
 * Live inputs for the Trade sheet: the INSTRUMENT by ticker — a company or a fund — the crew's cash
 * and holding, and the game settings.
 *
 * Two things differ for a fund (spec 2026-09-16 §2), and both live here rather than in the sheet:
 *   - impact and the interval cap come from the basket, via `fundTicketInputs`, because a fund has
 *     no beta or share count of its own;
 *   - the position limit comes from `positionLimitFor`, the single place the broad fund's exemption
 *     is applied. "You may not put more than 25% in the entire market" is not a risk rule.
 */
import { useMemo } from 'react';
import { liveAccountValue } from '../portfolio/derive';
import type { GameState, Holding, Instrument, Team } from '@deca/shared';
import { DEFAULT_FEE_BPS, DEFAULT_MAX_POSITION_PCT, DEFAULT_TICK_INTERVAL_MS, isFund, positionLimitFor } from '@deca/shared';
import { useCompanies } from '../../hooks/useCompanies';
import { useCompany } from '../../hooks/useCompany';
import { useInstruments } from '../../hooks/useInstruments';
import { usePortfolio } from '../../hooks/usePortfolio';
import { fundTicketInputs } from './fundTicket';
import { formatTickTime } from '../../lib/format';
import { useShellGame, useShellNow } from '../../shell/ShellData';
import { DEFAULT_CURRENCY } from '../ios/signedText';
import type { TicketContext } from './ticketModel';

export interface TicketData {
  /** Whatever the ticker named. `ChooseCompanyStep` lists all of them. */
  company: Instrument | null;
  companies: Instrument[];
  holdings: Holding[];
  team: Team | null;
  game: GameState | null;
  online: boolean;
  ctx: TicketContext | null;
  loading: boolean;
  notFound: boolean;
}

export function useTicketData(ticker: string | null): TicketData {
  const { instruments, byTicker, byId: instrumentsById, loading: listLoading } = useInstruments();
  const { byId: companiesById } = useCompanies();
  const listed = ticker ? (byTicker[ticker.toUpperCase()] ?? null) : null;
  const { company: live } = useCompany(listed && !isFund(listed) ? listed.id : null);
  const company: Instrument | null = live ?? listed;
  const { game, team, online } = useShellGame();
  const { holdings, loading: portfolioLoading } = usePortfolio();
  const now = useShellNow();
  const holding = company ? holdings.find((h) => h.companyId === company.id) : undefined;

  const ctx = useMemo<TicketContext | null>(() => {
    if (!company || !team) return null;
    const step = game?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    const nextAt = game?.lastTickAt ? game.lastTickAt + step : null;
    const tickAt = game?.lastTickAt ? game.lastTickAt - Math.max(0, (game.currentTick ?? company.lastTick) - company.lastTick) * step : null;
    // A fund's impact and interval cap are its constituents', expressed as the equivalent pair.
    const impact = isFund(company) ? fundTicketInputs(company, companiesById) : { beta: company.beta, sharesOutstanding: company.sharesOutstanding };
    return {
      companyId: company.id,
      ticker: company.ticker,
      name: company.name,
      price: company.currentPrice,
      beta: impact.beta,
      sharesOutstanding: impact.sharesOutstanding,
      isFund: isFund(company),
      tick: company.lastTick,
      timeText: tickAt ? formatTickTime(tickAt) : '—',
      cash: team.cashBalance,
      owned: holding?.shares ?? 0,
      avgCost: holding?.avgCost ?? 0,
      // Same sum the server's position check uses (cash + shares at latest prices), not the per-tick mark.
      totalValue: liveAccountValue(team, holdings, instrumentsById, game?.phase),
      feeBps: game?.feeBps ?? DEFAULT_FEE_BPS,
      maxPositionPct: positionLimitFor(company, game?.maxPositionPct ?? DEFAULT_MAX_POSITION_PCT),
      currency: game?.currency ?? DEFAULT_CURRENCY,
      secondsToNextTick: nextAt ? Math.max(1, Math.ceil((nextAt - now) / 1000)) : Math.round(step / 1000),
    };
    // `now` only matters for the interval-limit seconds; rounding to 5s keeps renders calm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, team, holding?.shares, holding?.avgCost, holdings, instrumentsById, companiesById, game, Math.floor(now / 5000)]);

  return {
    company,
    companies: instruments,
    holdings,
    team,
    game,
    online,
    ctx,
    loading: listLoading || portfolioLoading,
    notFound: Boolean(ticker) && !listLoading && !listed,
  };
}
