/**
 * The shape the hooks read, and the pure projection from the live store's state onto it.
 *
 * Kept apart from liveState.ts (which opens the stream) so it stays pure and testable, and so
 * every hook selects from one already-derived object instead of re-deriving the roster, the
 * staleness flag and the crew's rows on each render.
 */

import type { Company, Fund, GameState, Holding, Leaderboard, MarketSummary, NewsEvent, OrderRecord, Team, Trade } from '@deca/shared';
import type { LiveState } from '../lib/liveStore';

/** The signed-in crew's own rows, as the server's `portfolio` event carries them. */
export interface LivePortfolio {
  team: Team | null;
  holdings: Holding[];
  trades: Trade[];
  orders: OrderRecord[];
}

/** Everything the stream keeps live, as the hooks read it. */
export interface LiveSnapshot {
  /** True once a snapshot (bootstrap or stream) has been folded in. */
  ready: boolean;
  /** The stream is down or the device is offline: what is shown may be behind the server. */
  stale: boolean;
  /** Last connection error, else null. */
  error: string | null;
  /** Server clock of the newest payload (ms). */
  serverTime: number;
  game: GameState | null;
  /** The roster in the order the server sent it. */
  companies: Company[];
  /** The tradeable baskets, in the order the server sent them (broad fund first). */
  funds: Fund[];
  market: MarketSummary | null;
  leaderboard: Leaderboard | null;
  news: NewsEvent[];
  portfolio: LivePortfolio;
}

const NO_COMPANIES: Company[] = [];
const NO_FUNDS: Fund[] = [];
const NO_NEWS: NewsEvent[] = [];
const NO_HOLDINGS: Holding[] = [];
const NO_TRADES: Trade[] = [];
const NO_ORDERS: OrderRecord[] = [];

const NO_PORTFOLIO: LivePortfolio = { team: null, holdings: NO_HOLDINGS, trades: NO_TRADES, orders: NO_ORDERS };

export const EMPTY_LIVE: LiveSnapshot = {
  ready: false,
  stale: false,
  error: null,
  serverTime: 0,
  game: null,
  companies: NO_COMPANIES,
  funds: NO_FUNDS,
  market: null,
  leaderboard: null,
  news: NO_NEWS,
  portfolio: NO_PORTFOLIO,
};

/**
 * Stale means "what you are looking at may be behind the server": the device is offline, or the
 * stream is not open although the app has already painted real data ("Reconnecting…", §7.16).
 */
export function isStale(state: Pick<LiveState, 'online' | 'ready' | 'status'>): boolean {
  return !state.online || (state.ready && state.status !== 'open');
}

/** Live store state → the snapshot the hooks read. */
export function normalizeLive(state: LiveState | null | undefined): LiveSnapshot {
  if (!state) return EMPTY_LIVE;
  const ids = Array.isArray(state.companyIds) ? state.companyIds : [];
  const companies = ids.map((id) => state.companies?.[id]).filter((c): c is Company => Boolean(c));
  const fundIds = Array.isArray(state.fundIds) ? state.fundIds : [];
  const funds = fundIds.map((id) => state.funds?.[id]).filter((f): f is Fund => Boolean(f));
  return {
    ready: Boolean(state.ready),
    stale: isStale(state),
    error: state.error ?? null,
    serverTime: typeof state.serverTime === 'number' ? state.serverTime : 0,
    game: state.game ?? null,
    companies: companies.length ? companies : NO_COMPANIES,
    funds: funds.length ? funds : NO_FUNDS,
    market: state.market ?? null,
    leaderboard: state.leaderboard ?? null,
    news: state.news ?? NO_NEWS,
    portfolio: {
      team: state.team ?? null,
      holdings: state.holdings ?? NO_HOLDINGS,
      trades: state.trades ?? NO_TRADES,
      orders: state.orders ?? NO_ORDERS,
    },
  };
}
