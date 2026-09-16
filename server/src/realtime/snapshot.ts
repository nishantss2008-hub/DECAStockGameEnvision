/**
 * Server-side filtering and the opening payload of a stream.
 *
 * ONE rule governs every read the server answers: hidden data (`q`, `qEff`, `surprise`, `quality`,
 * `grade`, `pillars`, `fairValue`, the seed, the news schedule) never leaves the process before
 * `phase === 'ended'`. Company rows carry all of that inside `reveal`, which the engine writes at
 * the end, so `publicCompany` drops `reveal` until the game has ended. The secrets table, the
 * engine state and the schedule are never read by any crew-facing path at all.
 *
 * The second rule: a crew sees only its own crew, holdings, trades and orders. Every helper here
 * takes the crew id from the verified token, never from the request.
 */

import type {
  Company,
  Fundamentals,
  GameState,
  Holding,
  Leaderboard,
  MarketSummary,
  NewsEvent,
  OrderRecord,
  Phase,
  Role,
  Team,
  Trade,
} from '@deca/shared';
import { store } from '../store';

/** How much history a fresh stream opens with. */
export const SNAPSHOT_NEWS = 30;
export const SNAPSHOT_TRADES = 50;
export const SNAPSHOT_ORDERS = 50;

export interface StreamContext {
  role: Role;
  teamId?: string;
}

export interface PortfolioPayload {
  team: Team | null;
  holdings: Holding[];
  trades: Trade[];
  orders: OrderRecord[];
}

export interface Snapshot {
  serverTime: number;
  game: GameState | null;
  companies: Company[];
  market: MarketSummary | null;
  leaderboard: Leaderboard | null;
  news: NewsEvent[];
  portfolio: PortfolioPayload | null;
}

/** The stored phase, defaulting to the lobby when there is no game row yet. */
export function currentPhase(game: GameState | null = store.game.get()): Phase {
  return game?.phase ?? 'lobby';
}

/** A company as a crew may see it: the reveal block only after the game has ended. */
export function publicCompany(company: Company, phase: Phase): Company {
  if (phase === 'ended' || !company.reveal) return company;
  const { reveal: _reveal, ...rest } = company;
  return rest as Company;
}

export function publicCompanies(phase: Phase): Company[] {
  return store.companies.all().map((c) => publicCompany(c, phase));
}

/** Fundamentals are public: the generator keeps every hidden input out of them. */
export function publicFundamentals(): Record<string, Fundamentals> {
  return store.fundamentals.all();
}

/** One crew's own rows. Returns nulls for a crew that no longer exists. */
export function portfolioFor(
  teamId: string,
  limits: { trades?: number; orders?: number } = {},
): PortfolioPayload {
  const team = store.crews.get(teamId);
  if (!team) return { team: null, holdings: [], trades: [], orders: [] };
  return {
    team,
    holdings: store.holdings.forCrew(teamId),
    trades: store.trades.forCrew(teamId, limits.trades ?? SNAPSHOT_TRADES),
    orders: store.orders.forCrew(teamId, limits.orders ?? SNAPSHOT_ORDERS),
  };
}

/**
 * Everything a client needs to paint the app once: the game, the (filtered) companies, the market,
 * the standings, recent news and — for a crew — its own portfolio. `/api/bootstrap` answers with
 * exactly this, and a new stream opens with it, so both paths share one filter.
 */
export function buildSnapshot(ctx: StreamContext): Snapshot {
  const game = store.game.get();
  const phase = currentPhase(game);
  return {
    serverTime: Date.now(),
    game,
    companies: publicCompanies(phase),
    market: store.market.get(),
    leaderboard: store.leaderboard.get(),
    news: store.news.recent(SNAPSHOT_NEWS),
    portfolio: ctx.teamId ? portfolioFor(ctx.teamId) : null,
  };
}
