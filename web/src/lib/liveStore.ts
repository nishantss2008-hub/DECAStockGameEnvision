/**
 * The live store: one typed snapshot of the game, kept in memory for this page load.
 *
 * The server owns the truth and pushes it (server/src/realtime/hub.ts). This module is the client
 * side of that contract: it holds the last `snapshot`, folds every `tick`, `news`, `portfolio` and
 * `phase` event into it, and tells subscribers something changed. Nothing here talks to the
 * network — live.ts owns the connection and calls `apply()` — so every rule below is pure and
 * testable, and a hook test can drive the whole app from `createTestLiveStore()`.
 *
 * Two things the folding does that the wire does not:
 *   - a `tick` carries only prices, so `applyPrices` re-derives the per-company session/voyage
 *     fields from them; the next snapshot corrects any drift;
 *   - live points are appended to short, capped series (`priceSeries`, `compositeSeries`,
 *     `teamSeries`) so charts keep moving between REST range reads.
 *
 * Hidden company data (`reveal`) is stripped server-side before the game ends; the client never
 * sees it, so there is nothing to hide here.
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
  Team,
  Trade,
} from '@deca/shared';

// ─── wire types (mirror server/src/realtime/{hub,snapshot}.ts and routes/api.ts) ───────────────

/** A point of `companies/{id}` price history (`GET /api/companies/:id/history`). */
export interface PricePoint {
  tick: number;
  /** Integer cents. */
  price: number;
  /** Shares traded during the interval ending at `tick`. */
  volume: number;
}

/** A point of a value series: the market composite, or a crew's total value. */
export interface ValuePoint {
  tick: number;
  value: number;
}

/** One crew's own rows. Only ever the signed-in crew's — the server takes the id from the token. */
export interface PortfolioPayload {
  team: Team | null;
  holdings: Holding[];
  trades: Trade[];
  orders: OrderRecord[];
}

/** `GET /api/bootstrap`, and the opening event of a stream. */
export interface Snapshot {
  serverTime: number;
  game: GameState | null;
  companies: Company[];
  market: MarketSummary | null;
  leaderboard: Leaderboard | null;
  news: NewsEvent[];
  portfolio: PortfolioPayload | null;
}

/** A committed tick, fanned out to every connection. */
export interface TickPayload {
  tick: number;
  serverTime: number;
  /** companyId → last price in integer cents. */
  prices: Record<string, number>;
  market: MarketSummary | null;
  leaderboard: Leaderboard | null;
  game: GameState | null;
}

export type StreamEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'tick'; data: TickPayload }
  | { type: 'news'; data: NewsEvent[] }
  | { type: 'portfolio'; data: PortfolioPayload }
  | { type: 'phase'; data: GameState }
  | { type: 'ping'; data: { t: number } };

// ─── read-endpoint response shapes (server/src/routes/api.ts) ──────────────────────────────────

export interface CompaniesResponse {
  companies: Company[];
}
export interface CompanyDetailResponse {
  company: Company;
  fundamentals?: Fundamentals;
  news: NewsEvent[];
}
export interface FundamentalsResponse {
  fundamentals: Record<string, Fundamentals>;
}
export interface CompanyHistoryResponse {
  companyId: string;
  from: number;
  to: number;
  points: PricePoint[];
}
export interface ValueHistoryResponse {
  from: number;
  to: number;
  points: ValuePoint[];
}
export interface MarketResponse {
  market: MarketSummary | null;
}
export interface NewsResponse {
  news: NewsEvent[];
}
export interface StandingsResponse {
  leaderboard: Leaderboard | null;
}
export interface TradesResponse {
  trades: Trade[];
}
export interface OrdersResponse {
  orders: OrderRecord[];
}

// ─── state ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Connection status, as the screens care about it:
 *   idle       — no session, or the stream was stopped (signed out)
 *   connecting — opening, or waiting out a backoff before retrying
 *   open       — receiving events
 *   offline    — the connection dropped or the device lost the network
 */
export type LiveStatus = 'idle' | 'connecting' | 'open' | 'offline';

/** How many live points each in-memory series keeps (a 30-minute game is at most 360 ticks). */
export const LIVE_SERIES_MAX = 400;
/** How much news the store keeps; the server opens a stream with 30. */
export const LIVE_NEWS_MAX = 100;

export interface LiveState {
  status: LiveStatus;
  /** False when the browser reports no network, or the stream is failing to reconnect. */
  online: boolean;
  /** True once a snapshot (bootstrap or stream) has been folded in: the app can paint real data. */
  ready: boolean;
  /** Last connection error, for diagnostics only — the screens show their own copy. */
  error: string | null;
  /** Server clock of the last payload, and the local `Date.now()` when it arrived. */
  serverTime: number;
  receivedAt: number;
  /** Last heartbeat (`ping`), local ms. */
  lastPingAt: number;
  tick: number;
  game: GameState | null;
  companies: Record<string, Company>;
  /** Roster order as the server sent it, so lists stay stable. */
  companyIds: string[];
  /** companyId → last price in integer cents. */
  prices: Record<string, number>;
  market: MarketSummary | null;
  leaderboard: Leaderboard | null;
  /** Newest first, matching `GET /api/news`. */
  news: NewsEvent[];
  /** The signed-in crew's own rows; null for the host, or before the first portfolio payload. */
  team: Team | null;
  holdings: Holding[];
  trades: Trade[];
  orders: OrderRecord[];
  /** Live points appended since this page load (capped); REST range reads cover the rest. */
  priceSeries: Record<string, PricePoint[]>;
  compositeSeries: ValuePoint[];
  teamSeries: ValuePoint[];
}

export const initialLiveState: LiveState = {
  status: 'idle',
  online: true,
  ready: false,
  error: null,
  serverTime: 0,
  receivedAt: 0,
  lastPingAt: 0,
  tick: 0,
  game: null,
  companies: {},
  companyIds: [],
  prices: {},
  market: null,
  leaderboard: null,
  news: [],
  team: null,
  holdings: [],
  trades: [],
  orders: [],
  priceSeries: {},
  compositeSeries: [],
  teamSeries: [],
};

// ─── pure folding helpers ──────────────────────────────────────────────────────────────────────

/**
 * Re-derives a company row from a new last price. A tick carries prices only, so the session and
 * voyage fields every screen shows would otherwise freeze between snapshots.
 */
export function applyPrice(company: Company, price: number, tick: number): Company {
  if (!Number.isFinite(price) || price === company.currentPrice) {
    return tick > company.lastTick ? { ...company, lastTick: tick } : company;
  }
  const sessionOpen = company.sessionOpen || company.startPrice;
  return {
    ...company,
    currentPrice: price,
    lastTick: Math.max(tick, company.lastTick),
    sessionHigh: Math.max(company.sessionHigh, price),
    sessionLow: company.sessionLow ? Math.min(company.sessionLow, price) : price,
    voyageHigh: Math.max(company.voyageHigh, price),
    voyageLow: company.voyageLow ? Math.min(company.voyageLow, price) : price,
    sessionChange: sessionOpen ? (price - sessionOpen) / sessionOpen : 0,
    voyageChange: company.startPrice ? (price - company.startPrice) / company.startPrice : 0,
    marketCap: price * company.sharesOutstanding,
  };
}

/** Appends a point, replacing a repeat of the same tick, and keeps the series bounded. */
export function appendPoint<T extends { tick: number }>(series: T[], point: T, max = LIVE_SERIES_MAX): T[] {
  const last = series[series.length - 1];
  if (last && last.tick === point.tick) {
    const next = series.slice(0, -1);
    next.push(point);
    return next;
  }
  const next = last && last.tick > point.tick ? [...series, point].sort((a, b) => a.tick - b.tick) : [...series, point];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Merges fired news into the list: newest first, no duplicate ids, bounded. */
export function mergeNews(current: NewsEvent[], incoming: NewsEvent[], max = LIVE_NEWS_MAX): NewsEvent[] {
  if (incoming.length === 0) return current;
  const byId = new Map<string, NewsEvent>();
  for (const n of current) byId.set(n.id, n);
  for (const n of incoming) byId.set(n.id, n);
  const merged = [...byId.values()].sort((a, b) => b.firedAt - a.firedAt || b.tick - a.tick);
  return merged.length > max ? merged.slice(0, max) : merged;
}

/** The phase every screen gates on; the lobby until the host starts a game. */
export function phaseOf(state: LiveState): Phase {
  return state.game?.phase ?? 'lobby';
}

// ─── selectors ─────────────────────────────────────────────────────────────────────────────────

export const selectGame = (s: LiveState): GameState | null => s.game;
export const selectCompanies = (s: LiveState): Company[] => s.companyIds.map((id) => s.companies[id]!).filter(Boolean);
export const selectCompany =
  (id: string) =>
  (s: LiveState): Company | null =>
    s.companies[id] ?? null;
export const selectMarket = (s: LiveState): MarketSummary | null => s.market;
export const selectLeaderboard = (s: LiveState): Leaderboard | null => s.leaderboard;
export const selectNews = (s: LiveState): NewsEvent[] => s.news;
export const selectTeam = (s: LiveState): Team | null => s.team;
export const selectHoldings = (s: LiveState): Holding[] => s.holdings;
export const selectTrades = (s: LiveState): Trade[] => s.trades;
export const selectOrders = (s: LiveState): OrderRecord[] => s.orders;
export const selectPriceSeries =
  (id: string) =>
  (s: LiveState): PricePoint[] =>
    s.priceSeries[id] ?? [];
export const selectCompositeSeries = (s: LiveState): ValuePoint[] => s.compositeSeries;
export const selectTeamSeries = (s: LiveState): ValuePoint[] => s.teamSeries;
export const selectStatus = (s: LiveState): LiveStatus => s.status;
export const selectReady = (s: LiveState): boolean => s.ready;
export const selectOnline = (s: LiveState): boolean => s.online;

// ─── the store ─────────────────────────────────────────────────────────────────────────────────

export interface LiveStore {
  /** The current state. Treat it as immutable: every change produces a new object. */
  getState(): LiveState;
  /** Subscribes to every change; returns the unsubscribe. Safe for useSyncExternalStore. */
  subscribe(listener: (state: LiveState) => void): () => void;
  /** Reads one slice now. `store.select(selectCompany('kraken'))` */
  select<T>(selector: (state: LiveState) => T): T;
  /** Folds one stream event in. Unknown event types are ignored. */
  apply(event: StreamEvent): void;
  /** Merges connection bookkeeping (status, online, error) without touching game data. */
  patch(partial: Partial<LiveState>): void;
  /** Drops every crew-specific row (sign-out on a shared device). */
  clearPortfolio(): void;
  /** Back to `initialLiveState` — sign-out, or between tests. */
  reset(): void;
}

export function createLiveStore(initial: Partial<LiveState> = {}): LiveStore {
  let state: LiveState = { ...initialLiveState, ...initial };
  const listeners = new Set<(s: LiveState) => void>();

  function set(next: LiveState): void {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener(state);
  }

  function fold(event: StreamEvent, current: LiveState): LiveState {
    switch (event.type) {
      case 'snapshot': {
        const snap = event.data;
        const companies: Record<string, Company> = {};
        const prices: Record<string, number> = {};
        const companyIds: string[] = [];
        for (const c of snap.companies ?? []) {
          companies[c.id] = c;
          prices[c.id] = c.currentPrice;
          companyIds.push(c.id);
        }
        const portfolio = snap.portfolio;
        return {
          ...current,
          ready: true,
          error: null,
          serverTime: snap.serverTime ?? current.serverTime,
          receivedAt: Date.now(),
          tick: snap.game?.currentTick ?? current.tick,
          game: snap.game ?? null,
          companies,
          companyIds,
          prices,
          market: snap.market ?? null,
          leaderboard: snap.leaderboard ?? null,
          news: mergeNews([], snap.news ?? []),
          team: portfolio ? portfolio.team : current.team,
          holdings: portfolio ? portfolio.holdings : current.holdings,
          trades: portfolio ? portfolio.trades : current.trades,
          orders: portfolio ? portfolio.orders : current.orders,
        };
      }
      case 'tick': {
        const t = event.data;
        const companies = { ...current.companies };
        const prices = { ...current.prices };
        const priceSeries = { ...current.priceSeries };
        for (const [id, price] of Object.entries(t.prices ?? {})) {
          prices[id] = price;
          const company = companies[id];
          if (company) companies[id] = applyPrice(company, price, t.tick);
          priceSeries[id] = appendPoint(priceSeries[id] ?? [], { tick: t.tick, price, volume: 0 });
        }
        const composite = t.market?.composite?.value;
        return {
          ...current,
          ready: true,
          tick: t.tick,
          serverTime: t.serverTime ?? current.serverTime,
          receivedAt: Date.now(),
          companies,
          prices,
          priceSeries,
          market: t.market ?? current.market,
          leaderboard: t.leaderboard ?? current.leaderboard,
          game: t.game ?? current.game,
          compositeSeries:
            typeof composite === 'number'
              ? appendPoint(current.compositeSeries, { tick: t.tick, value: composite })
              : current.compositeSeries,
        };
      }
      case 'news':
        return { ...current, news: mergeNews(current.news, event.data ?? []) };
      case 'portfolio': {
        const p = event.data;
        return {
          ...current,
          team: p.team,
          holdings: p.holdings ?? [],
          trades: p.trades ?? [],
          orders: p.orders ?? [],
          teamSeries: p.team
            ? appendPoint(current.teamSeries, { tick: current.tick, value: p.team.totalValue })
            : current.teamSeries,
        };
      }
      case 'phase':
        return { ...current, game: event.data, tick: event.data?.currentTick ?? current.tick };
      case 'ping':
        return { ...current, lastPingAt: Date.now(), serverTime: event.data?.t ?? current.serverTime };
      default:
        return current;
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select: (selector) => selector(state),
    apply(event) {
      if (!event || typeof event.type !== 'string') return;
      set(fold(event, state));
    },
    patch(partial) {
      set({ ...state, ...partial });
    },
    clearPortfolio() {
      set({ ...state, team: null, holdings: [], trades: [], orders: [], teamSeries: [] });
    },
    reset() {
      set({ ...initialLiveState });
    },
  };
}

/** The store the app runs on. live.ts feeds it; hooks read it. */
export const liveStore: LiveStore = createLiveStore();

/**
 * A store with no connection behind it, for tests: build one, `apply()` the events (or `patch()`
 * the fields) a screen should see, and hand it to the hooks. Identical to the real store — the
 * only difference is that nothing else is writing to it.
 */
export function createTestLiveStore(initial: Partial<LiveState> = {}): LiveStore {
  return createLiveStore(initial);
}
