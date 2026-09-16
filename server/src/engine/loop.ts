/**
 * GameEngine: the always-on authority that advances the market (IO layer).
 *
 * All math lives in the pure modules (model, news, flow, state, loopHelpers);
 * this class holds the in-memory market, runs ticks and persists them through the
 * `Store` (SQLite): ONE `store.tx()` per tick writes the price history rows, the
 * company snapshots, the market summary and its history point, the fired news, the
 * engine state and the game state together, so a crash can only leave the database
 * at the last committed tick.
 *
 * - Fair value v, GARCH h and the news schedule are pure functions of the seed,
 *   the clock and the tick, so the engine is resume-safe: the `engine_state` row is
 *   written in the same transaction as prices, and when it is missing the fair value
 *   is replayed from tick 0 and the impact term recovered from persisted prices.
 * - Player flow is reserved synchronously (`reserveFlow`) before any await, so a
 *   fill always prices in every order already traded this interval; the next tick
 *   drains it into the linear transient impact term.
 * - Every state-changing operation (tick, start, pause, resume, end, settings,
 *   host news, load) runs through one async queue, so they never interleave.
 * - After a committed tick the realtime hub is told what changed (`publishTick`,
 *   `publishNews`, `publishPhase`); a hub failure never fails a tick.
 */

import {
  EDGE_SPREAD,
  FUND_OPEN_PRICE,
  MODEL,
  deriveClock,
  fundConstituentShares,
  fundPrice,
  impactLambda,
  intervalShareCap,
  tickAt,
  type AdminMarketRow,
  type Company,
  type FireNewsInput,
  type Fund,
  type FundHolding,
  type FundReveal,
  type GameClock,
  type GameState,
  type Grade,
  type InstrumentQuote,
  type HealthResponse,
  type Leaderboard,
  type MarketSummary,
  type NewsEvent,
  type OrderSide,
  type QualityPillars,
  type ScheduledNewsView,
  type Sector,
  type SettingsInput,
} from '@deca/shared';
import { config } from '../config';
import {
  publishNews as hubNews,
  publishPhase as hubPhase,
  publishSnapshot as hubSnapshot,
  publishTick as hubTick,
} from '../realtime/hub';
import { ROSTER } from '../seed/roster';
import { store as processStore, type Store } from '../store';
import type { StoredScheduledEvent } from '../store/types';
import { finalizeLeaderboard, recomputeLeaderboard, resetLeaderboardCache } from '../services/leaderboard';
import { FlowBook } from './flow';
import {
  closePrice as closeMark,
  companyStep,
  derive,
  effectiveQuality,
  expectedLogReturn,
  fillPriceExact,
  initialState,
  marketStep,
  surpriseFor,
  type CompanyState,
  type Derived,
} from './model';
import { buildSchedule, hostEvent, jumpsAtTick, type ScheduledEvent } from './news';
import { recoverImpact, replayFairValue, serializeState, type EngineState } from './state';
import {
  INDEX_BASE,
  PENDING_NEWS_KEY,
  SEED_KEY,
  advanceSnapshot,
  buildReveal,
  compositeValue,
  engineMessages,
  indexQuote,
  marketBreadth,
  mergeSettings,
  newsDocId,
  normalizeState,
  type Snapshot,
} from './loopHelpers';
import type { ValuePoint } from '../store/types';

/** A `price_history` row: the point plus the company it belongs to. */
interface PriceRow {
  companyId: string;
  tick: number;
  price: number;
  volume: number;
}

export interface EngineCompany {
  id: string;
  ticker: string;
  name: string;
  sector: Sector;
  sharesOutstanding: number;
  beta: number;
  idioVol: number;
  /** Visible-fundamentals quality in (−1, 1). */
  q: number;
  /** Hidden surprise ξ ~ U[−1, 1]. */
  surprise: number;
  /** effectiveQuality(q, surprise): what the model actually tilts by. */
  qEff: number;
  /** impactLambda(beta, sharesOutstanding). */
  lambda: number;
  /** Measured quality score s. */
  quality: number;
  grade: Grade;
  pillars: QualityPillars;
  startPriceCents: number;
}

/**
 * A fund in the engine: a fixed basket and the value-weighted quality of what it holds.
 *
 * Note what is NOT here — no `idioVol`, no `lambda`, no `surprise`, no `CompanyState`. A
 * fund has no price state of its own: its quote is recomputed from its constituents every
 * time it is read, and a fund order's impact lands on the constituents.
 */
export interface EngineFund {
  id: string;
  ticker: string;
  name: string;
  style: Fund['style'];
  sector?: Sector;
  holdings: FundHolding[];
  divisor: number;
  adv: number;
  positionLimitExempt: boolean;
  /** Value-weighted mean of the constituents' visible-fundamentals q. */
  q: number;
  qEff: number;
  quality: number;
}

/** The tradeable surface of a company OR a fund: what the order path needs, whichever it is. */
export interface EngineInstrument {
  id: string;
  kind: 'company' | 'fund';
  ticker: string;
  name: string;
  /** 0 for a fund: its interval cap comes from its constituents, not from a share count. */
  sharesOutstanding: number;
  /** True only for the broad fund (see `positionLimitFor` in shared/src/funds.ts). */
  positionLimitExempt: boolean;
}

export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** What a committed tick fans out to every connected client (realtime/hub.ts `publishTick`). */
export interface TickPayload {
  tick: number;
  serverTime: number;
  prices: Record<string, number>;
  market: MarketSummary;
  leaderboard: Leaderboard;
  game: GameState;
}

/** The slice of `realtime/hub.ts` the engine uses; swappable so a test can observe the fan-out. */
export interface RealtimeHub {
  publishTick(payload: TickPayload): void;
  publishNews(events: NewsEvent[]): void;
  publishPhase(game: GameState): void;
  /** Optional on a test double: the whole-world resend (end of game). */
  publishSnapshot?(): void;
}

const liveHub: RealtimeHub = {
  publishTick: hubTick,
  publishNews: hubNews,
  publishPhase: hubPhase,
  publishSnapshot: hubSnapshot,
};
let hub: RealtimeHub = liveHub;

/** Replaces the realtime hub (tests). Pass null to restore the live SSE hub. */
export function setRealtimeHub(next: RealtimeHub | null): void {
  hub = next ?? liveHub;
}

export interface QuoteResult {
  lastPrice: number;
  /** Unrounded cents, pending flow included. */
  fillPrice: number;
  impactBps: number;
  intervalRemaining: number;
}

export interface FlowReservation {
  lastPrice: number;
  /** Unrounded cents, pending flow included. */
  fillPrice: number;
  impactBps: number;
  /**
   * The tick the order was priced at (`state.currentTick` at reservation). Its flow is drained by the next
   * tick, so after a restart at committed tick T every trade with `tick >= T` is still pending. Store it on the trade.
   */
  tick: number;
  /**
   * Undoes the reservation (idempotent). Before a tick drains it, the pending flow is removed; after, the
   * order's decayed impact is taken back out of the price state so a failed trade never moves the price
   * (the volume already recorded for that tick stays).
   */
  release(): void;
}

const NO_FLOW = { net: 0, volume: 0 } as const;
/** The timer fires at most this often so catch-up stays prompt at any tick interval. */
const MAX_TIMER_MS = 5_000;

function finiteOr(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

function validCompanyState(s: Partial<CompanyState> | undefined): s is CompanyState {
  return !!s && [s.v, s.m, s.f, s.h].every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** A stored row of ANY instrument (a `companies` or a `funds` row) as a tick snapshot. */
function snapshotFrom(c: Partial<InstrumentQuote> & { marketCap?: number }, start: number, shares: number): Snapshot {
  const price = finiteOr(c.currentPrice, start);
  return {
    currentPrice: price,
    startPrice: finiteOr(c.startPrice, start),
    sessionOpen: finiteOr(c.sessionOpen, price),
    sessionHigh: finiteOr(c.sessionHigh, price),
    sessionLow: finiteOr(c.sessionLow, price),
    sessionVolume: finiteOr(c.sessionVolume, 0),
    voyageHigh: finiteOr(c.voyageHigh, price),
    voyageLow: finiteOr(c.voyageLow, price),
    sessionChange: finiteOr(c.sessionChange, 0),
    voyageChange: finiteOr(c.voyageChange, 0),
    marketCap: finiteOr(c.marketCap, price * shares),
    sharesOutstanding: shares,
    lastTick: finiteOr(c.lastTick, 0),
  };
}

function startSnapshot(start: number, shares: number): Snapshot {
  return snapshotFrom({}, start, shares);
}

/** The per-tick company fields (never the static research fields). */
function snapshotFields(s: Snapshot): Partial<Company> {
  return {
    currentPrice: s.currentPrice,
    sessionOpen: s.sessionOpen,
    sessionHigh: s.sessionHigh,
    sessionLow: s.sessionLow,
    sessionVolume: s.sessionVolume,
    voyageHigh: s.voyageHigh,
    voyageLow: s.voyageLow,
    sessionChange: s.sessionChange,
    voyageChange: s.voyageChange,
    marketCap: s.marketCap,
    lastTick: s.lastTick,
  };
}

/**
 * The per-tick fields of a `funds` row. A fund's snapshot carries no share count and no
 * market cap — it is a basket, not a company — so those two are simply left out.
 */
function fundSnapshotFields(s: Snapshot): Partial<Fund> {
  return {
    currentPrice: s.currentPrice,
    sessionOpen: s.sessionOpen,
    sessionHigh: s.sessionHigh,
    sessionLow: s.sessionLow,
    sessionVolume: s.sessionVolume,
    voyageHigh: s.voyageHigh,
    voyageLow: s.voyageLow,
    sessionChange: s.sessionChange,
    voyageChange: s.voyageChange,
    lastTick: s.lastTick,
  };
}

/** Drops the storage columns so the in-memory schedule stays a plain `ScheduledEvent`. */
function toEvent(row: StoredScheduledEvent): ScheduledEvent {
  const { rowId: _rowId, fired: _fired, ...event } = row;
  return event;
}

function parsePending(raw: string | null): ScheduledEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduledEvent[]) : [];
  } catch {
    console.warn('[engine] meta.news_pending is not valid JSON; dropping it');
    return [];
  }
}

export class GameEngine {
  /** Mirror of the `game_state` row. */
  state: GameState = normalizeState(undefined, Date.now());

  private readonly injected: Store;
  private seed = '';
  private clock: GameClock = deriveClock(this.state.gameLengthMs);
  private d: Derived = derive(this.clock, EDGE_SPREAD[this.state.researchEdge]);
  private cos = new Map<string, EngineCompany>();
  private ids: string[] = [];
  private fnds = new Map<string, EngineFund>();
  private fundIds: string[] = [];
  private sectorIds = new Map<string, string[]>();
  private starts: Record<string, number> = {};
  private shares: Record<string, number> = {};
  private snaps = new Map<string, Snapshot>();
  private es: EngineState | null = null;
  private schedule: ScheduledEvent[] = [];
  private byTick = new Map<number, ScheduledEvent[]>();
  private pendingHost: ScheduledEvent[] = [];
  private flow = new FlowBook();

  private indexNow: { composite: number; sectors: Record<string, number> } = { composite: INDEX_BASE, sectors: {} };
  private indexSessionOpen: { composite: number; sectors: Record<string, number> } = { composite: INDEX_BASE, sectors: {} };
  /** The last price row written per company, so the closing mark can keep that tick's volume. */
  private lastRow = new Map<string, PriceRow>();

  /** Writes not yet committed (kept across a failed commit and retried next tick). */
  private outHistory: PriceRow[] = [];
  private outMarketHistory: ValuePoint[] = [];
  private outNews = new Map<string, NewsEvent>();
  private scheduleDirty = false;
  private finalized = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private inFlight: Promise<void> | null = null;
  /** Bumped by stop(); a tick that started before a stop never commits. */
  private generation = 0;

  /** `store` is the lazily-opened process store; tests pass an in-memory one. */
  constructor(store: Store = processStore) {
    this.injected = store;
  }

  /** The store this engine writes through. */
  private get store(): Store {
    return this.injected;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Loads the game state, companies, secrets, schedule, engine state (or replay + recovery), market summary and pending flow. */
  load(): Promise<void> {
    return this.exclusive(() => this.loadLocked());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.autoTick(), Math.min(this.clock.tickIntervalMs, MAX_TIMER_MS));
    this.timer.unref?.();
  }

  /**
   * Stops the timer; a tick already running skips its remaining writes. The returned
   * promise resolves once queued engine work has settled (await it before clearing data).
   */
  stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generation++;
    return this.queue;
  }

  /** stop → clear memory → load → start. Waits for an in-flight tick to finish first. */
  async reload(): Promise<void> {
    this.stop();
    await this.exclusive(() => this.loadLocked());
    this.start();
  }

  // ─── Read API ───────────────────────────────────────────────────────────────

  getPrice(companyId: string): number {
    return this.snaps.get(companyId)?.currentPrice ?? 0;
  }

  getCompany(companyId: string): EngineCompany | undefined {
    return this.cos.get(companyId);
  }

  companies(): EngineCompany[] {
    return this.ids.map((id) => this.cos.get(id)!);
  }

  getFund(fundId: string): EngineFund | undefined {
    return this.fnds.get(fundId);
  }

  funds(): EngineFund[] {
    return this.fundIds.map((id) => this.fnds.get(id)!);
  }

  /** The company or the fund behind an id, as the order path sees it. */
  getInstrument(id: string): EngineInstrument | undefined {
    const c = this.cos.get(id);
    if (c) {
      return { id, kind: 'company', ticker: c.ticker, name: c.name, sharesOutstanding: c.sharesOutstanding, positionLimitExempt: false };
    }
    const f = this.fnds.get(id);
    if (f) return { id, kind: 'fund', ticker: f.ticker, name: f.name, sharesOutstanding: 0, positionLimitExempt: f.positionLimitExempt };
    return undefined;
  }

  /**
   * The hidden quality behind an instrument, for the end-of-game research score: a company's
   * visible-fundamentals `q`, or a fund's value-weighted average of its constituents'. Buying
   * the broad fund therefore scores as the market average — "did not pick" — by construction.
   */
  qualityOf(id: string): number {
    return this.cos.get(id)?.q ?? this.fnds.get(id)?.q ?? 0;
  }

  /** Current price of every company and every fund, for the tick fan-out. */
  prices(): Record<string, number> {
    return Object.fromEntries([...this.ids, ...this.fundIds].map((id) => [id, this.getPrice(id)]));
  }

  /** A fund's quote, always recomputed from live constituent prices (never a stored value). */
  private fundQuoteNow(f: EngineFund, priceOf: (id: string) => number = (id) => this.getPrice(id)): number {
    return fundPrice(f, priceOf);
  }

  /**
   * Price preview for an order of `quantity` shares, including flow already
   * traded this interval. `intervalRemaining` is the crew's remaining interval
   * cap when `teamId` is given, else the full cap. Allowed in every phase.
   */
  quote(companyId: string, side: OrderSide, quantity: number, teamId?: string): QuoteResult {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new EngineError('bad_quantity', engineMessages.badQuantity);
    const fund = this.fnds.get(companyId);
    if (fund) return this.quoteFund(fund, side, quantity, teamId);
    const c = this.cos.get(companyId);
    if (!c) throw new EngineError('unknown_company', engineMessages.unknownCompany);
    const lastPrice = this.getPrice(companyId);
    const s = this.es?.companies[companyId] ?? initialState(lastPrice);
    const signed = side === 'buy' ? quantity : -quantity;
    const cap = intervalShareCap(c.sharesOutstanding);
    const used = teamId ? this.flow.teamGross(teamId, companyId) : 0;
    return {
      lastPrice,
      fillPrice: fillPriceExact(s, c.lambda, this.flow.pendingNet(companyId), signed),
      impactBps: Math.round(((c.lambda * quantity) / 2) * 10_000),
      intervalRemaining: Math.max(0, cap - used),
    };
  }

  /**
   * SYNCHRONOUS: prices the order against the current state plus pending flow and
   * adds its signed quantity to pending flow before returning. Call `release()` if
   * the trade does not commit.
   */
  reserveFlow(teamId: string, companyId: string, side: OrderSide, quantity: number): FlowReservation {
    if (this.state.phase !== 'live') throw new EngineError('market_closed', engineMessages.marketClosed(this.state.phase));
    if (!Number.isInteger(quantity) || quantity <= 0) throw new EngineError('bad_quantity', engineMessages.badQuantity);
    const fund = this.fnds.get(companyId);
    if (fund) return this.reserveFundFlow(teamId, fund, side, quantity);
    const c = this.cos.get(companyId);
    const s = this.es?.companies[companyId];
    if (!c || !s) throw new EngineError('unknown_company', engineMessages.unknownCompany);
    const cap = intervalShareCap(c.sharesOutstanding);
    const used = this.flow.teamGross(teamId, companyId);
    if (used + quantity > cap) {
      throw new EngineError(
        'interval_limit',
        engineMessages.intervalLimit({ cap, used, ticker: c.ticker, seconds: this.secondsToNextTick(Date.now()) }),
      );
    }
    const signed = side === 'buy' ? quantity : -quantity;
    const fillPrice = fillPriceExact(s, c.lambda, this.flow.pendingNet(companyId), signed);
    const releaseFlow = this.flow.reserve(teamId, companyId, signed);
    const es = this.es;
    const tickAtReserve = this.state.currentTick;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      releaseFlow(); // undoes pending flow and the interval counter when no tick has drained them yet
      // A tick already drained this flow into the impact term (the trade failed after the drain): impact is
      // linear, so take this order's decayed contribution λ·σ·decay^k back out; otherwise a failed order moves the price.
      const ticks = this.state.currentTick - tickAtReserve;
      if (ticks > 0 && this.es === es && es) {
        const state = es.companies[companyId];
        if (state) state.f -= c.lambda * signed * Math.pow(this.d.decay, ticks);
      }
    };
    return {
      lastPrice: this.getPrice(companyId),
      fillPrice,
      impactBps: Math.round(((c.lambda * quantity) / 2) * 10_000),
      tick: tickAtReserve,
      release,
    };
  }

  /**
   * One constituent leg of a fund order: the company, its state, and the FRACTIONAL share
   * count this order creates demand for (`quantity · wᵢ / divisor`).
   */
  private fundLegs(f: EngineFund, quantity: number): { c: EngineCompany; s: CompanyState; shares: number; weight: number }[] {
    const weights = new Map(f.holdings.map((h) => [h.companyId, h.weight]));
    return fundConstituentShares(f, quantity).map((part) => {
      const c = this.cos.get(part.companyId);
      if (!c) throw new EngineError('unknown_company', engineMessages.unknownCompany);
      // Before the game starts there is no price state yet; a preview prices off the start price,
      // exactly as the company path does.
      const s = this.es?.companies[part.companyId] ?? initialState(this.getPrice(part.companyId));
      return { c, s, shares: part.shares, weight: weights.get(part.companyId)! };
    });
  }

  /**
   * Prices a fund order from its constituents: the crew pays Σ wᵢ·fillᵢ / divisor, where each
   * fillᵢ is the same path-exact impacted price it would pay buying that company directly. That
   * is what makes the fund and its components cost the same, in either direction.
   */
  private priceFundLegs(legs: ReturnType<GameEngine['fundLegs']>, f: EngineFund, sign: number): { fillPrice: number; impactBps: number } {
    let basket = 0;
    let value = 0;
    let impact = 0;
    for (const leg of legs) {
      const fill = fillPriceExact(leg.s, leg.c.lambda, this.flow.pendingNet(leg.c.id), sign * leg.shares);
      basket += leg.weight * fill;
      const legValue = leg.weight * this.getPrice(leg.c.id);
      value += legValue;
      impact += legValue * ((leg.c.lambda * leg.shares) / 2);
    }
    return {
      fillPrice: f.divisor > 0 ? basket / f.divisor : 0,
      impactBps: value > 0 ? Math.round((impact / value) * 10_000) : 0,
    };
  }

  /**
   * The crew's remaining interval headroom in FUND shares: the tightest constituent's
   * remaining 1-ADV cap, converted through that constituent's basket weight. A crew that has
   * already used its KRKN cap directly has no headroom left in a fund that holds KRKN.
   */
  private fundIntervalRemaining(f: EngineFund, teamId?: string): number {
    let remaining = Infinity;
    for (const leg of this.fundLegs(f, 1)) {
      const cap = intervalShareCap(leg.c.sharesOutstanding);
      const used = teamId ? this.flow.teamGross(teamId, leg.c.id) : 0;
      remaining = Math.min(remaining, leg.shares > 0 ? Math.max(0, cap - used) / leg.shares : Infinity);
    }
    return Number.isFinite(remaining) ? Math.floor(remaining) : 0;
  }

  private quoteFund(f: EngineFund, side: OrderSide, quantity: number, teamId?: string): QuoteResult {
    const legs = this.fundLegs(f, quantity);
    const { fillPrice, impactBps } = this.priceFundLegs(legs, f, side === 'buy' ? 1 : -1);
    return {
      lastPrice: this.fundQuoteNow(f),
      fillPrice,
      impactBps,
      intervalRemaining: this.fundIntervalRemaining(f, teamId),
    };
  }

  /**
   * Reserves a fund order as demand on its CONSTITUENTS.
   *
   * Buying Ð10,000 of a fund is demand for Ð10,000 of the underlying, so the existing linear
   * transient impact applies to each constituent pro-rata by `wᵢ × notional`; the fund's own
   * quote is then simply the basket recomputed from the moved constituent prices. There is no
   * separate impact term on the fund, and no way to route around a per-company interval cap:
   * the cap is checked on each constituent, against the shares the crew has already traded in
   * that company this interval, however it traded them.
   */
  private reserveFundFlow(teamId: string, f: EngineFund, side: OrderSide, quantity: number): FlowReservation {
    const sign = side === 'buy' ? 1 : -1;
    const legs = this.fundLegs(f, quantity);
    for (const leg of legs) {
      const cap = intervalShareCap(leg.c.sharesOutstanding);
      const used = this.flow.teamGross(teamId, leg.c.id);
      if (used + leg.shares > cap) {
        throw new EngineError(
          'interval_limit',
          engineMessages.intervalLimit({ cap, used, ticker: leg.c.ticker, seconds: this.secondsToNextTick(Date.now()) }),
        );
      }
    }

    const { fillPrice, impactBps } = this.priceFundLegs(legs, f, sign);
    const lastPrice = this.fundQuoteNow(f);
    const releases = legs.map((leg) => this.flow.reserve(teamId, leg.c.id, sign * leg.shares));
    // The fund's own row records the fund shares traded, so its chart shows crew activity in it.
    // Its `net` is never priced: a fund has no impact term of its own.
    releases.push(this.flow.reserve(teamId, f.id, sign * quantity));

    const es = this.es;
    const tickAtReserve = this.state.currentTick;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      for (const undo of releases) undo();
      const ticks = this.state.currentTick - tickAtReserve;
      if (ticks > 0 && this.es === es && es) {
        for (const leg of legs) {
          const state = es.companies[leg.c.id];
          if (state) state.f -= leg.c.lambda * sign * leg.shares * Math.pow(this.d.decay, ticks);
        }
      }
    };
    return { lastPrice, fillPrice, impactBps, tick: tickAtReserve, release };
  }

  /** Closing mark round(exp(v+m)), impact excluded. Used for final standings and the reveal. */
  closePrice(companyId: string): number {
    const f = this.fnds.get(companyId);
    if (f) return this.fundQuoteNow(f, (id) => this.closePrice(id));
    const s = this.es?.companies[companyId];
    return s ? closeMark(s) : this.getPrice(companyId);
  }

  adminMarket(): AdminMarketRow[] {
    return this.ids.map((id) => {
      const c = this.cos.get(id)!;
      const snap = this.snaps.get(id)!;
      const s = this.es?.companies[id];
      const fairValue = s ? Math.max(1, Math.round(Math.exp(s.v))) : c.startPriceCents;
      return {
        companyId: id,
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        price: snap.currentPrice,
        sessionChange: snap.sessionChange,
        sessionVolume: snap.sessionVolume,
        netFlow: this.flow.pendingNet(id),
        quality: c.quality,
        q: c.q,
        grade: c.grade,
        fairValue,
        deviation: fairValue > 0 ? snap.currentPrice / fairValue - 1 : 0,
      };
    });
  }

  scheduledNews(): ScheduledNewsView[] {
    const started = this.state.phase !== 'lobby';
    const view = (e: ScheduledEvent, fired: boolean): ScheduledNewsView => ({
      tick: e.tick,
      companyIds: [...e.companyIds],
      type: e.type,
      sentiment: e.sentiment,
      headline: e.headline,
      fired,
      source: e.source,
    });
    return [
      ...this.schedule.map((e) => view(e, started && e.tick <= this.state.currentTick)),
      ...this.pendingHost.map((e) => view(e, false)),
    ].sort((a, b) => a.tick - b.tick);
  }

  health(now: number = Date.now()): HealthResponse {
    const { phase, startAt, currentTick, totalTicks, lastTickAt } = this.state;
    const ticksBehind = phase === 'live' ? Math.max(0, tickAt(now, startAt, this.clock) - currentTick) : 0;
    return { ok: true, phase, tick: currentTick, totalTicks, serverTime: now, lastTickAt, ticksBehind };
  }

  // ─── Host controls ──────────────────────────────────────────────────────────

  applySettings(input: SettingsInput): Promise<GameState> {
    return this.exclusive(async () => {
      if (this.state.phase !== 'lobby') throw new EngineError('not_lobby', engineMessages.notLobby);
      const now = Date.now();
      const settings = mergeSettings(this.state, input);
      const clock = deriveClock(settings.gameLengthMs);
      const next: GameState = {
        ...this.state,
        ...settings,
        tickIntervalMs: clock.tickIntervalMs,
        totalTicks: clock.totalTicks,
        sessionTicks: clock.sessionTicks,
        serverTime: now,
      };
      this.store.tx(() => this.store.game.set(next));
      this.state = next;
      this.clock = clock;
      this.d = derive(clock, EDGE_SPREAD[next.researchEdge]);
      this.publishPhase(next);
      return { ...next, currency: { ...next.currency } };
    });
  }

  /** Lobby only: derives the clock, builds the hidden schedule and engine state, and opens trading. */
  startGame(): Promise<void> {
    return this.exclusive(async () => {
      if (this.state.phase !== 'lobby') throw new EngineError('not_lobby', engineMessages.alreadyStarted);
      if (this.ids.length === 0) throw new EngineError('no_market', engineMessages.noMarket);
      // Every crew starts with the lobby's Starting cash (COPY §11: "The cash each crew gets at the start"),
      // including crews created before the host changed it; otherwise returnPct is measured from the wrong base.
      const crews = this.store.crews.all();
      const now = Date.now();
      const clock = deriveClock(this.state.gameLengthMs);
      const d = derive(clock, EDGE_SPREAD[this.state.researchEdge]);
      const schedule = buildSchedule(this.seed, clock, this.companies(), d);
      const es: EngineState = {
        lastTick: 0,
        hM: 1,
        companies: Object.fromEntries(this.ids.map((id) => [id, initialState(this.cos.get(id)!.startPriceCents)])),
      };
      const next: GameState = {
        ...this.state,
        phase: 'live',
        startAt: now,
        endAt: now + clock.totalTicks * clock.tickIntervalMs,
        pausedAt: null,
        endedAt: null,
        currentTick: 0,
        tickIntervalMs: clock.tickIntervalMs,
        totalTicks: clock.totalTicks,
        sessionTicks: clock.sessionTicks,
        serverTime: now,
        lastTickAt: now,
      };

      // Memory is reset before the commit; while phase stays 'lobby' nothing reads it, and a retry rebuilds it.
      this.clock = clock;
      this.d = d;
      this.schedule = schedule;
      this.byTick = jumpsAtTick(schedule);
      this.pendingHost = [];
      this.es = es;
      this.flow = new FlowBook();
      this.clearPendingWrites();
      this.lastRow.clear();
      this.finalized = false;
      for (const id of this.ids) {
        const c = this.cos.get(id)!;
        this.snaps.set(id, startSnapshot(c.startPriceCents, c.sharesOutstanding));
        this.lastRow.set(id, { companyId: id, tick: 0, price: c.startPriceCents, volume: 0 });
      }
      // A fund opens at its divisor's promise: Σ wᵢ·pᵢ(0)/divisor = FUND_OPEN_PRICE exactly.
      for (const id of this.fundIds) {
        const f = this.fnds.get(id)!;
        this.snaps.set(id, startSnapshot(this.fundQuoteNow(f, (cid) => this.cos.get(cid)!.startPriceCents) || FUND_OPEN_PRICE, 0));
        this.lastRow.set(id, { companyId: id, tick: 0, price: this.getPrice(id), volume: 0 });
      }
      this.indexNow = this.computeIndexes();
      this.indexSessionOpen = { composite: this.indexNow.composite, sectors: { ...this.indexNow.sectors } };

      const capital = next.startingCapital;
      const summary = { ...this.summary(now), lastTick: 0 };
      this.store.tx(() => {
        this.store.history.append([...this.lastRow.values()]);
        for (const id of this.ids) this.store.companies.update(id, snapshotFields(this.snaps.get(id)!));
        for (const id of this.fundIds) this.store.funds.update(id, fundSnapshotFields(this.snaps.get(id)!));
        this.store.market.appendHistory(0, this.indexNow.composite);
        this.store.market.set(summary);
        this.store.newsSchedule.set(schedule);
        this.store.meta.set(PENDING_NEWS_KEY, '[]');
        for (const crew of crews) {
          if (crew.tradeCount > 0) continue; // never overwrite a crew that has traded
          if (crew.cashBalance !== capital || crew.totalValue !== capital || crew.sessionOpenValue !== capital) {
            this.store.crews.update(crew.id, { cashBalance: capital, totalValue: capital, sessionOpenValue: capital });
          }
          // Value history starts at tick 0 with the starting cash (the first recompute would otherwise copy tick 1 there).
          this.store.crewHistory.append([{ crewId: crew.id, tick: 0, value: capital }]);
        }
        this.store.engine.set(serializeState(es));
        this.store.game.set(next);
      });

      resetLeaderboardCache();
      this.state = next;
      this.publishPhase(next);
    });
  }

  /** Live → paused (no-op otherwise). The clock stops; pending flow waits for the next tick. */
  pauseGame(): Promise<void> {
    return this.exclusive(async () => {
      if (this.state.phase !== 'live') return;
      const now = Date.now();
      const next: GameState = { ...this.state, phase: 'paused', pausedAt: now, serverTime: now };
      this.store.tx(() => this.store.game.set(next));
      this.state = next;
      this.publishPhase(next);
    });
  }

  /** Paused → live (no-op otherwise), shifting startAt/endAt by the pause length. */
  resumeGame(): Promise<void> {
    return this.exclusive(async () => {
      if (this.state.phase !== 'paused') return;
      const now = Date.now();
      const delta = Math.max(0, now - (this.state.pausedAt ?? now));
      const startAt = this.state.startAt === null ? null : this.state.startAt + delta;
      const endAt = this.state.endAt === null ? null : this.state.endAt + delta;
      const next: GameState = { ...this.state, phase: 'live', startAt, endAt, pausedAt: null, serverTime: now };
      this.store.tx(() => this.store.game.set(next));
      this.state = next;
      this.publishPhase(next);
    });
  }

  /** Ends the game: closing marks, reveal per company, final leaderboard. No-op once ended (retries a failed finalize). */
  endGame(): Promise<void> {
    return this.exclusive(() => this.endGameLocked('admin'));
  }

  /** Live/paused only. The event fires (and is persisted in the schedule) at the next tick. */
  queueHostNews(input: FireNewsInput): Promise<void> {
    return this.exclusive(async () => {
      const { phase } = this.state;
      if (phase !== 'live' && phase !== 'paused') throw new EngineError('not_live', engineMessages.notRunning);
      const ev = hostEvent(this.state.currentTick + 1, this.companies(), {
        companyIds: input.companyIds,
        type: input.type,
        magnitude: input.magnitude,
        headline: input.headline,
        body: input.body ?? '',
      });
      if (ev.companyIds.length === 0) throw new EngineError('unknown_company', engineMessages.noNewsCompanies);
      const pending = [...this.pendingHost, ev];
      this.store.tx(() => this.store.meta.set(PENDING_NEWS_KEY, JSON.stringify(pending)));
      this.pendingHost = pending;
    });
  }

  /**
   * Recomputes the standings once, in the engine queue (never alongside a tick), for the current tick.
   * Live or paused games only: the lobby has no standings yet, and an ended game's final standings are
   * pruned by the crew service.
   */
  refreshStandings(): Promise<void> {
    return this.exclusive(() => this.refreshStandingsLocked());
  }

  /**
   * Removes a crew in the engine queue, so no tick, standings recompute or final standings runs alongside the
   * removal: one that had already read the crew would write its value history, research stats and standings
   * row back after they were deleted (and a re-created crew with that name would inherit them). A new game
   * waits for it too (`stop()` settles the queue). Afterwards the in-memory standings are dropped and, in a
   * live or paused game, recomputed once so the remaining ranks renumber at once.
   *
   * The removal's own error is thrown. A failed refresh never fails the removal: it goes to `onRefreshError`,
   * and the next tick recomputes the standings anyway.
   */
  runCrewRemoval(
    remove: () => Promise<void>,
    onRefreshError: (err: unknown) => void = (err) => console.error('[engine] standings refresh after a crew removal failed', err),
  ): Promise<void> {
    return this.exclusive(async () => {
      try {
        await remove();
      } finally {
        resetLeaderboardCache(); // even after a partial removal: never keep the removed crew's series in memory
      }
      try {
        await this.refreshStandingsLocked();
      } catch (err) {
        onRefreshError(err);
      }
    });
  }

  private async refreshStandingsLocked(): Promise<void> {
    const { phase, currentTick } = this.state;
    if ((phase !== 'live' && phase !== 'paused') || this.ids.length === 0) return;
    recomputeLeaderboard(this.store, this, currentTick);
  }

  // ─── Tick ───────────────────────────────────────────────────────────────────

  /** Advances to the tick for `now` and persists it. Exported for integration tests; waits for any running operation. */
  async tickOnce(now: number = Date.now()): Promise<void> {
    const run = this.exclusive(() => this.tickLocked(now));
    this.inFlight = run;
    try {
      await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private async autoTick(): Promise<void> {
    if (this.inFlight) return;
    try {
      await this.tickOnce();
    } catch (err) {
      console.error('[engine] tick failed', err);
    }
  }

  private shouldEnd(now: number): boolean {
    const { currentTick, totalTicks, endAt } = this.state;
    return currentTick >= totalTicks || (endAt !== null && now >= endAt);
  }

  private async tickLocked(now: number): Promise<void> {
    if (this.state.phase === 'ended' && !this.finalized) {
      await this.endGameLocked('engine'); // retries a final leaderboard that failed to write
      return;
    }
    if (this.state.phase !== 'live' || this.state.startAt === null) return;
    const gen = this.generation;
    const target = tickAt(now, this.state.startAt, this.clock);
    const es = this.es;

    if (!es || target <= this.state.currentTick) {
      // Heartbeat only (or a market with no companies, which just follows the clock).
      const next: GameState = { ...this.state, serverTime: now };
      if (!es && target > this.state.currentTick) {
        next.currentTick = target;
        next.lastTickAt = Date.now();
      }
      if (gen !== this.generation) return;
      this.store.tx(() => this.store.game.set(next));
      this.state = next;
      if (gen === this.generation && this.shouldEnd(now)) await this.endGameLocked('engine');
      return;
    }

    const prevTick = this.state.currentTick;
    const { sessionTicks, tickIntervalMs, startAt } = this.state;
    const d = this.d;
    const mk = { hM: es.hM };
    // Flow is drained synchronously below; trades that reserve after this instant belong to the next tick.
    const drainedAt = Date.now();

    for (let t = prevTick + 1; t <= target; t++) {
      const first = t === prevTick + 1;
      const rM = marketStep(this.seed, t, mk, d);

      let events = this.byTick.get(t) ?? [];
      if (t === target && this.pendingHost.length > 0) {
        const host = this.pendingHost.splice(0).map((e) => ({ ...e, tick: t }));
        events = [...events, ...host];
        this.byTick.set(t, events);
        this.schedule = [...this.schedule, ...host].sort((a, b) => a.tick - b.tick); // stable: host news after scheduled news at t
        this.scheduleDirty = true;
      }

      // priceAtFire = price at the end of tick t−1, before this tick's news jump.
      const priceBefore: Record<string, number> = {};
      for (const e of events) for (const id of e.companyIds) priceBefore[id] = this.getPrice(id);

      for (const id of this.ids) {
        const c = this.cos.get(id)!;
        const { net, volume } = first ? this.flow.drain(id) : NO_FLOW;
        let jump = 0;
        for (const e of events) jump += e.jumps[id] ?? 0;
        const price = companyStep(this.seed, t, c, es.companies[id]!, rM, jump, net, d);
        // Fund orders create FRACTIONAL constituent demand; the shares shown are whole.
        const shares = Math.round(volume);
        advanceSnapshot(this.snaps.get(id)!, t, price, shares, sessionTicks);
        const row: PriceRow = { companyId: id, tick: t, price, volume: shares };
        this.outHistory.push(row);
        this.lastRow.set(id, row);
      }
      // Funds are priced AFTER the companies and only from them: no step, no state, no news.
      for (const id of this.fundIds) {
        const f = this.fnds.get(id)!;
        const { volume } = first ? this.flow.drain(id) : NO_FLOW;
        const price = this.fundQuoteNow(f);
        const shares = Math.round(volume);
        advanceSnapshot(this.snaps.get(id)!, t, price, shares, sessionTicks);
        const row: PriceRow = { companyId: id, tick: t, price, volume: shares };
        this.outHistory.push(row);
        this.lastRow.set(id, row);
      }
      if (first) this.flow.resetInterval(); // per-crew interval caps reset every tick

      this.indexNow = this.computeIndexes();
      if (sessionTicks > 0 && t % sessionTicks === 0) {
        this.indexSessionOpen = { composite: this.indexNow.composite, sectors: { ...this.indexNow.sectors } };
      }
      this.outMarketHistory.push({ tick: t, value: this.indexNow.composite });

      events.forEach((e, seq) => {
        const id = newsDocId(e.source, t, e.companyIds[0], seq);
        this.outNews.set(id, {
          id,
          headline: e.headline,
          body: e.body,
          companyIds: [...e.companyIds],
          type: e.type,
          sentiment: e.sentiment,
          source: e.source,
          tick: t,
          firedAt: (startAt ?? now) + t * tickIntervalMs,
          priceAtFire: Object.fromEntries(e.companyIds.map((cid) => [cid, priceBefore[cid] ?? 0])),
        });
      });
    }

    es.hM = mk.hM;
    es.lastTick = target;
    this.state = { ...this.state, currentTick: target, lastTickAt: drainedAt, serverTime: now };

    if (gen !== this.generation) return;
    const fired = this.commitTick(now);
    if (gen !== this.generation) return;
    let leaderboard: Leaderboard | null = null;
    try {
      leaderboard = recomputeLeaderboard(this.store, this, target);
    } catch (err) {
      console.error('[engine] leaderboard recompute failed', err);
    }
    this.publishNews(fired);
    this.publishTick(leaderboard);
    if (gen === this.generation && this.shouldEnd(now)) await this.endGameLocked('engine');
  }

  /**
   * ONE transaction: the price rows, the company snapshots, the market summary and its history point,
   * the news schedule and the news it fires, the engine state and the game state all commit together or
   * not at all. Anything a failed commit left pending is retried by the next tick (rows are keyed by
   * (company, tick) and news ids are deterministic, so a retry overwrites rather than duplicates).
   * Returns the news that became public in this commit.
   */
  private commitTick(now: number): NewsEvent[] {
    const es = this.es!;
    const history = this.outHistory;
    const marketHistory = this.outMarketHistory;
    const news = [...this.outNews.values()];
    const scheduleDirty = this.scheduleDirty;
    const schedule = this.schedule;
    const pending = this.pendingHost;
    const summary = this.summary(now);
    const state = this.state;
    const store = this.store;
    store.tx(() => {
      if (scheduleDirty) {
        // The schedule that fires a host event is stored before the news it publishes.
        store.newsSchedule.set(schedule);
        store.meta.set(PENDING_NEWS_KEY, JSON.stringify(pending));
      }
      if (history.length > 0) store.history.append(history);
      for (const { tick, value } of marketHistory) store.market.appendHistory(tick, value);
      for (const id of this.ids) store.companies.update(id, snapshotFields(this.snaps.get(id)!));
      for (const id of this.fundIds) store.funds.update(id, fundSnapshotFields(this.snaps.get(id)!));
      store.market.set(summary);
      if (news.length > 0) store.news.insert(news);
      store.engine.set(serializeState(es));
      store.game.set(state);
    });
    this.clearPendingWrites();
    return news;
  }

  private clearPendingWrites(): void {
    this.outHistory = [];
    this.outMarketHistory = [];
    this.outNews = new Map();
    this.scheduleDirty = false;
  }

  private async endGameLocked(actor: 'admin' | 'engine'): Promise<void> {
    if (this.state.phase === 'ended') {
      if (!this.finalized) {
        finalizeLeaderboard(this.store, this);
        this.finalized = true;
      }
      return;
    }
    if (this.state.phase === 'lobby') throw new EngineError('not_started', engineMessages.notStarted);

    const gen = this.generation;
    const now = Date.now();
    const tick = this.state.currentTick;
    // Like a tick commit, in one transaction: the company snapshots (closing prices and the reveal), the
    // closing price rows, the summary, engine state and game state (phase ended). The reveal can never be
    // public while the game is still running, and a failed end leaves no closing mark behind.
    const closed = new Map<string, Snapshot>();
    const reveals = new Map<string, ReturnType<typeof buildReveal>>();
    const closingRows: PriceRow[] = [];
    for (const id of this.ids) {
      const c = this.cos.get(id)!;
      const snap = { ...this.snaps.get(id)! };
      const s = this.es?.companies[id];
      const close = s ? closeMark(s) : snap.currentPrice;
      reveals.set(
        id,
        buildReveal({
          quality: c.quality,
          q: c.q,
          qEff: c.qEff,
          surprise: c.surprise,
          grade: c.grade,
          pillars: c.pillars,
          v: s ? s.v : Math.log(c.startPriceCents),
          closePrice: close,
          startPrice: c.startPriceCents,
          // spread·qEff + beta·mktDrift: the hidden surprise is inside expected, so luck is news, market and chance (COPY.md §10)
          expectedReturn: expectedLogReturn(c, this.d),
        }),
      );
      // The closing mark replaces the last traded price, so final marks can't be pumped in the last interval.
      snap.currentPrice = close;
      snap.sessionHigh = Math.max(snap.sessionHigh, close);
      snap.sessionLow = Math.min(snap.sessionLow, close);
      snap.voyageHigh = Math.max(snap.voyageHigh, close);
      snap.voyageLow = Math.min(snap.voyageLow, close);
      snap.sessionChange = snap.sessionOpen > 0 ? close / snap.sessionOpen - 1 : 0;
      snap.voyageChange = snap.startPrice > 0 ? close / snap.startPrice - 1 : 0;
      snap.marketCap = close * snap.sharesOutstanding;
      closed.set(id, snap);

      // The closing mark is the last point of the price chart (it replaces the last traded price at this
      // tick, as the final team values do); the volume traded in that interval stays.
      const last = this.lastRow.get(id);
      closingRows.push({ companyId: id, tick, price: close, volume: last?.tick === tick ? last.volume : 0 });
    }
    // A fund closes on the CLOSING MARKS of what it holds, so a last-interval push on a
    // constituent cannot pump a fund's final mark either. Its reveal is the value-weighted
    // quality of its holdings — it has no hidden state of its own to reveal.
    const fundReveals = new Map<string, FundReveal>();
    for (const id of this.fundIds) {
      const f = this.fnds.get(id)!;
      const snap = { ...this.snaps.get(id)! };
      const close = this.fundQuoteNow(f, (cid) => closed.get(cid)?.currentPrice ?? this.getPrice(cid));
      fundReveals.set(id, { quality: f.quality, q: f.q, qEff: f.qEff });
      snap.currentPrice = close;
      snap.sessionHigh = Math.max(snap.sessionHigh, close);
      snap.sessionLow = Math.min(snap.sessionLow, close);
      snap.voyageHigh = Math.max(snap.voyageHigh, close);
      snap.voyageLow = Math.min(snap.voyageLow, close);
      snap.sessionChange = snap.sessionOpen > 0 ? close / snap.sessionOpen - 1 : 0;
      snap.voyageChange = snap.startPrice > 0 ? close / snap.startPrice - 1 : 0;
      closed.set(id, snap);
      const last = this.lastRow.get(id);
      closingRows.push({ companyId: id, tick, price: close, volume: last?.tick === tick ? last.volume : 0 });
    }

    const indexNow = this.computeIndexes((id) => closed.get(id)?.currentPrice ?? 0);
    const next: GameState = { ...this.state, phase: 'ended', endedAt: now, pausedAt: null, serverTime: now };
    const summary = this.summary(now, closed, indexNow);
    const history = [...this.outHistory.filter((r) => r.tick !== tick), ...closingRows];
    const marketHistory = [...this.outMarketHistory.filter((r) => r.tick !== tick), { tick, value: indexNow.composite }];
    const news = [...this.outNews.values()];
    const scheduleDirty = this.scheduleDirty;
    const schedule = this.schedule;
    const pending = this.pendingHost;
    const store = this.store;
    const es = this.es;
    if (gen !== this.generation) return;
    store.tx(() => {
      if (scheduleDirty) {
        store.newsSchedule.set(schedule);
        store.meta.set(PENDING_NEWS_KEY, JSON.stringify(pending));
      }
      store.history.append(history);
      for (const { tick: t, value } of marketHistory) store.market.appendHistory(t, value);
      for (const id of this.ids) store.companies.update(id, { ...snapshotFields(closed.get(id)!), reveal: reveals.get(id) });
      for (const id of this.fundIds) store.funds.update(id, { ...fundSnapshotFields(closed.get(id)!), reveal: fundReveals.get(id) });
      store.market.set(summary);
      if (news.length > 0) store.news.insert(news);
      if (es) store.engine.set(serializeState(es));
      store.game.set(next);
      if (actor === 'engine') store.audit.add('game.end', 'engine', { tick });
    });
    this.clearPendingWrites();
    for (const [id, snap] of closed) this.snaps.set(id, snap);
    for (const row of closingRows) this.lastRow.set(row.companyId, row);
    this.indexNow = indexNow;
    this.state = next;

    if (gen !== this.generation) return; // a new market is being created; don't write old standings into it
    finalizeLeaderboard(store, this);
    this.finalized = true;
    this.publishNews(news);
    // The reveal only becomes public at this instant, so every connection is handed a fresh snapshot
    // BEFORE the phase event: the results screen fills in without anyone reconnecting for it.
    this.publishSnapshot();
    this.publishPhase(next);
  }

  // ─── Realtime fan-out ───────────────────────────────────────────────────────

  private publishTick(leaderboard: Leaderboard | null): void {
    if (!leaderboard) return;
    try {
      hub.publishTick({
        tick: this.state.currentTick,
        serverTime: this.state.serverTime,
        prices: this.prices(),
        market: this.summary(this.state.serverTime),
        leaderboard,
        game: { ...this.state, currency: { ...this.state.currency } },
      });
    } catch (err) {
      console.error('[engine] publishTick failed', err);
    }
  }

  private publishNews(events: NewsEvent[]): void {
    if (events.length === 0) return;
    try {
      hub.publishNews(events);
    } catch (err) {
      console.error('[engine] publishNews failed', err);
    }
  }

  /** Whole-world resend. A hub that does not implement it (a test double) is simply skipped. */
  private publishSnapshot(): void {
    try {
      hub.publishSnapshot?.();
    } catch (err) {
      console.error('[engine] publishSnapshot failed', err);
    }
  }

  private publishPhase(game: GameState): void {
    try {
      hub.publishPhase({ ...game, currency: { ...game.currency } });
    } catch (err) {
      console.error('[engine] publishPhase failed', err);
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private secondsToNextTick(now: number): number {
    const { startAt, tickIntervalMs } = this.state;
    if (startAt === null) return Math.ceil(tickIntervalMs / 1000);
    const intoInterval = (((now - startAt) % tickIntervalMs) + tickIntervalMs) % tickIntervalMs;
    return Math.max(1, Math.ceil((tickIntervalMs - intoInterval) / 1000));
  }

  private computeIndexes(priceOf: (id: string) => number = (id) => this.getPrice(id)): { composite: number; sectors: Record<string, number> } {
    const prices: Record<string, number> = {};
    for (const id of this.ids) prices[id] = priceOf(id);
    const sectors: Record<string, number> = {};
    for (const [sector, ids] of this.sectorIds) sectors[sector] = compositeValue(prices, this.starts, this.shares, ids);
    return { composite: compositeValue(prices, this.starts, this.shares, this.ids), sectors };
  }

  private summary(now: number, snaps: Map<string, Snapshot> = this.snaps, indexNow = this.indexNow): MarketSummary {
    return {
      lastTick: this.state.currentTick,
      updatedAt: now,
      composite: indexQuote(indexNow.composite, this.indexSessionOpen.composite),
      sectors: Object.fromEntries(
        Object.entries(indexNow.sectors).map(([s, v]) => [s, indexQuote(v, this.indexSessionOpen.sectors[s] ?? INDEX_BASE)]),
      ),
      breadth: marketBreadth(this.ids.map((id) => snaps.get(id)!)),
    };
  }

  private resetMemory(): void {
    this.state = normalizeState(undefined, Date.now());
    this.seed = '';
    this.clock = deriveClock(this.state.gameLengthMs);
    this.d = derive(this.clock, EDGE_SPREAD[this.state.researchEdge]);
    this.cos.clear();
    this.ids = [];
    this.fnds.clear();
    this.fundIds = [];
    this.sectorIds.clear();
    this.starts = {};
    this.shares = {};
    this.snaps.clear();
    this.es = null;
    this.schedule = [];
    this.byTick = new Map();
    this.pendingHost = [];
    this.flow = new FlowBook();
    this.lastRow.clear();
    this.indexNow = { composite: INDEX_BASE, sectors: {} };
    this.indexSessionOpen = { composite: INDEX_BASE, sectors: {} };
    this.clearPendingWrites();
    this.finalized = false;
  }

  private async loadLocked(): Promise<void> {
    this.resetMemory();
    const store = this.store;
    const now = Date.now();

    const state = normalizeState(store.game.get() ?? undefined, now);
    this.clock = deriveClock(state.gameLengthMs);
    this.d = derive(this.clock, EDGE_SPREAD[state.researchEdge]);

    this.seed = store.meta.get(SEED_KEY) ?? '';
    const secrets = store.secrets.all();
    const companyRows = new Map(store.companies.all().map((c) => [c.id, c]));
    if (!this.seed) {
      this.seed = config.seed;
      if (Object.keys(secrets).length > 0) console.warn('[engine] meta has no seed; falling back to GAME_SEED');
    }

    const rosterIndex = new Map(ROSTER.map((r, i) => [r.id, i]));
    this.ids = Object.keys(secrets)
      .filter((id) => companyRows.has(id))
      .sort((a, b) => (rosterIndex.get(a) ?? 1e9) - (rosterIndex.get(b) ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0));

    for (const id of this.ids) {
      const s = secrets[id]!;
      const doc = companyRows.get(id)!;
      const sharesOutstanding = finiteOr(s.sharesOutstanding, finiteOr(doc.sharesOutstanding, 0));
      const beta = finiteOr(s.beta, finiteOr(doc.beta, 1));
      const startPriceCents = finiteOr(s.startPriceCents, finiteOr(doc.startPrice, 1));
      const surprise = surpriseFor(this.seed, id);
      const c: EngineCompany = {
        id,
        ticker: s.ticker ?? doc.ticker ?? id.toUpperCase(),
        name: s.name ?? doc.name ?? id,
        sector: (s.sector ?? doc.sector) as Sector,
        sharesOutstanding,
        beta,
        idioVol: finiteOr(s.idioVol, MODEL.idioVolBase),
        q: finiteOr(s.q, 0),
        surprise,
        qEff: effectiveQuality(finiteOr(s.q, 0), surprise),
        lambda: impactLambda(beta, sharesOutstanding),
        quality: finiteOr(s.quality, 0),
        grade: s.grade,
        pillars: s.pillars,
        startPriceCents,
      };
      this.cos.set(id, c);
      this.snaps.set(id, snapshotFrom(doc, startPriceCents, sharesOutstanding));
      this.starts[id] = startPriceCents;
      this.shares[id] = sharesOutstanding;
      const list = this.sectorIds.get(c.sector) ?? [];
      list.push(id);
      this.sectorIds.set(c.sector, list);
    }

    // Funds: the public basket plus the server-only weighted quality. A fund whose holdings
    // are not all present in this market is skipped rather than priced from a partial basket.
    const fundSecrets = store.fundSecrets.all();
    for (const row of store.funds.all()) {
      if (row.holdings.length === 0 || !row.holdings.every((h) => this.cos.has(h.companyId))) {
        console.warn(`[engine] fund ${row.id} holds a company this market does not have; skipping it`);
        continue;
      }
      const secret = fundSecrets[row.id];
      this.fnds.set(row.id, {
        id: row.id,
        ticker: row.ticker,
        name: row.name,
        style: row.style,
        ...(row.sector ? { sector: row.sector } : {}),
        holdings: row.holdings.map((h) => ({ ...h })),
        divisor: finiteOr(row.divisor, 0),
        adv: finiteOr(row.adv, 0),
        positionLimitExempt: row.positionLimitExempt === true,
        q: finiteOr(secret?.q, 0),
        qEff: finiteOr(secret?.qEff, 0),
        quality: finiteOr(secret?.quality, 0),
      });
      this.fundIds.push(row.id);
      this.snaps.set(row.id, snapshotFrom(row, finiteOr(row.startPrice, FUND_OPEN_PRICE), 0));
    }

    this.schedule = store.newsSchedule.all().map(toEvent).sort((a, b) => a.tick - b.tick);
    this.byTick = jumpsAtTick(this.schedule);
    // A lobby has no queued host news by definition; never let a stale row resurrect one into a new market.
    this.pendingHost = state.phase === 'lobby' ? [] : parsePending(store.meta.get(PENDING_NEWS_KEY));
    this.finalized = state.phase === 'ended' && store.leaderboard.get()?.final !== undefined;

    if (state.phase === 'lobby' || this.ids.length === 0) {
      this.state = state;
      this.indexNow = this.computeIndexes();
      this.indexSessionOpen = { composite: INDEX_BASE, sectors: Object.fromEntries(Object.keys(this.indexNow.sectors).map((s) => [s, INDEX_BASE])) };
      return;
    }

    // Engine state: persisted row, or replay fair value from tick 0 and recover impact from prices.
    const engineRow = store.engine.get();
    if (engineRow && typeof engineRow.lastTick === 'number' && this.ids.every((id) => validCompanyState(engineRow.companies?.[id]))) {
      this.es = serializeState(engineRow);
      const lastTick = Math.min(Math.max(0, this.es.lastTick), this.clock.totalTicks);
      if (lastTick !== state.currentTick) {
        console.warn(`[engine] engine_state is at tick ${lastTick} but game_state says ${state.currentTick}; resuming from the engine state`);
        state.currentTick = lastTick;
      }
    } else {
      console.warn(`[engine] engine_state missing or incomplete; replaying fair value to tick ${state.currentTick}`);
      const replay = replayFairValue(
        this.seed,
        this.clock,
        EDGE_SPREAD[state.researchEdge],
        this.companies(),
        this.starts,
        this.schedule,
        state.currentTick,
      );
      const prices = Object.fromEntries(this.ids.map((id) => [id, this.getPrice(id)]));
      this.es = recoverImpact(replay, prices);
      this.es.lastTick = state.currentTick;
    }
    this.state = state;

    // The price row at the current tick: its volume belongs to the closing mark, and a missing row (a market
    // created before the first tick, or history cleared under a running game) is repaired on the next commit.
    const tick = state.currentTick;
    // Funds keep price rows like companies do, so the same repair covers both.
    for (const id of [...this.ids, ...this.fundIds]) {
      const [row] = store.history.range(id, tick, tick);
      if (row) this.lastRow.set(id, { companyId: id, ...row });
      else this.outHistory.push({ companyId: id, tick, price: this.getPrice(id), volume: 0 });
    }

    this.indexNow = this.computeIndexes();
    if (store.market.historyRange(tick, tick).length === 0) this.outMarketHistory.push({ tick, value: this.indexNow.composite });
    const summary = store.market.get();
    const fallbackOpen = (value: number) => (tick < state.sessionTicks ? INDEX_BASE : value);
    this.indexSessionOpen = {
      composite: finiteOr(summary?.composite?.sessionOpen, fallbackOpen(this.indexNow.composite)),
      sectors: Object.fromEntries(
        Object.entries(this.indexNow.sectors).map(([s, v]) => [s, finiteOr(summary?.sectors?.[s]?.sessionOpen, fallbackOpen(v))]),
      ),
    };

    // Pending flow: a trade priced at tick k is drained by tick k + 1, so with tick T committed every trade
    // priced at tick T or later has not reached the impact term yet. Ticks, not timestamps: a trade priced in
    // the same millisecond as a drain is still on the right side of it.
    if (state.phase === 'live' || state.phase === 'paused') {
      for (const t of store.trades.sinceTick(state.currentTick)) {
        if (!t.teamId || !t.companyId || !(Number(t.quantity) > 0)) continue;
        const signed = t.side === 'sell' ? -Number(t.quantity) : Number(t.quantity);
        const fund = this.fnds.get(t.companyId);
        if (fund) {
          // A fund trade's pending flow lives on its CONSTITUENTS, which is where the impact lands.
          for (const part of fundConstituentShares(fund, signed)) this.flow.reserve(t.teamId, part.companyId, part.shares);
          this.flow.reserve(t.teamId, t.companyId, signed); // the fund's own volume row
        } else if (this.cos.has(t.companyId)) {
          this.flow.reserve(t.teamId, t.companyId, signed);
        }
      }
    }
  }
}

/** Process-wide singleton (its store is bound by the entry point through `setEngineStore`). */
export const engine = new GameEngine();
