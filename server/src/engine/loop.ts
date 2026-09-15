/**
 * GameEngine: the always-on authority that advances the market (IO layer).
 *
 * All math lives in the pure modules (model, news, flow, state, loopHelpers);
 * this class holds the in-memory market, runs ticks and persists them.
 *
 * - Fair value v, GARCH h and the news schedule are pure functions of the seed,
 *   the clock and the tick, so the engine is resume-safe: `_engine/state` is
 *   written in the same commit as prices, and when it is missing the fair value
 *   is replayed from tick 0 and the impact term recovered from persisted prices.
 * - Player flow is reserved synchronously (`reserveFlow`) before any await, so a
 *   fill always prices in every order already traded this interval; the next tick
 *   drains it into the linear transient impact term.
 * - Every state-changing operation (tick, start, pause, resume, end, settings,
 *   host news, load) runs through one async queue, so they never interleave.
 */

import {
  EDGE_SPREAD,
  HISTORY_CHUNK,
  MODEL,
  chunkOf,
  deriveClock,
  impactLambda,
  intervalShareCap,
  tickAt,
  type AdminMarketRow,
  type Company,
  type FireNewsInput,
  type GameClock,
  type GameState,
  type Grade,
  type HealthResponse,
  type HistoryChunk,
  type MarketSummary,
  type NewsEvent,
  type OrderSide,
  type QualityPillars,
  type ScheduledNewsView,
  type Sector,
  type SettingsInput,
  type Team,
  type Trade,
  type ValueChunk,
} from '@deca/shared';
import { db } from '../firebase';
import { config } from '../config';
import { auditLog } from '../lib/logger';
import { ROSTER } from '../seed/roster';
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
  advanceSnapshot,
  appendChunk,
  appendValue,
  buildReveal,
  commitWithTail,
  compositeValue,
  engineMessages,
  indexQuote,
  marketBreadth,
  mergeSettings,
  newsDocId,
  normalizeState,
  type BatchOp,
  type Snapshot,
} from './loopHelpers';

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

export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** Server-only `_schedule/{companyId}` doc written by services/market. */
interface ScheduleCompanyDoc {
  q: number;
  quality: number;
  grade: Grade;
  pillars: QualityPillars;
  idioVol: number;
  beta: number;
  sharesOutstanding: number;
  startPriceCents: number;
  ticker: string;
  name: string;
  sector: Sector;
}

/** Server-only `_schedule/_news`: the full schedule (fired host news appended) and queued host news. */
interface NewsScheduleDoc {
  events?: ScheduledEvent[];
  pending?: ScheduledEvent[];
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

function snapshotFrom(c: Partial<Company>, start: number, shares: number): Snapshot {
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

/** The per-tick company doc fields (never the static research fields). */
function snapshotFields(s: Snapshot): Record<string, number> {
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

export class GameEngine {
  /** Mirror of `game/state`. */
  state: GameState = normalizeState(undefined, Date.now());

  private seed = '';
  private clock: GameClock = deriveClock(this.state.gameLengthMs);
  private d: Derived = derive(this.clock, EDGE_SPREAD[this.state.researchEdge]);
  private cos = new Map<string, EngineCompany>();
  private ids: string[] = [];
  private sectorIds = new Map<string, string[]>();
  private starts: Record<string, number> = {};
  private shares: Record<string, number> = {};
  private snaps = new Map<string, Snapshot>();
  private es: EngineState | null = null;
  private schedule: ScheduledEvent[] = [];
  private byTick = new Map<number, ScheduledEvent[]>();
  private pendingHost: ScheduledEvent[] = [];
  private flow = new FlowBook();

  private chunks = new Map<string, HistoryChunk>();
  private compositeChunk: ValueChunk = { chunk: 0, startTick: 0, values: [INDEX_BASE] };
  private indexNow: { composite: number; sectors: Record<string, number> } = { composite: INDEX_BASE, sectors: {} };
  private indexSessionOpen: { composite: number; sectors: Record<string, number> } = { composite: INDEX_BASE, sectors: {} };

  /** Writes not yet committed (kept across a failed commit and retried next tick). */
  private outChunks = new Map<string, HistoryChunk | ValueChunk>();
  private outNews = new Map<string, NewsEvent>();
  private newsDocDirty = false;
  private finalized = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private inFlight: Promise<void> | null = null;
  /** Bumped by stop(); a tick that started before a stop never commits. */
  private generation = 0;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Loads game/state, companies, _schedule, _engine/state (or replay + recovery), current chunks, market/summary and pending flow. */
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

  /**
   * Price preview for an order of `quantity` shares, including flow already
   * traded this interval. `intervalRemaining` is the crew's remaining interval
   * cap when `teamId` is given, else the full cap. Allowed in every phase.
   */
  quote(companyId: string, side: OrderSide, quantity: number, teamId?: string): QuoteResult {
    const c = this.cos.get(companyId);
    if (!c) throw new EngineError('unknown_company', engineMessages.unknownCompany);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new EngineError('bad_quantity', engineMessages.badQuantity);
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
    const c = this.cos.get(companyId);
    const s = this.es?.companies[companyId];
    if (!c || !s) throw new EngineError('unknown_company', engineMessages.unknownCompany);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new EngineError('bad_quantity', engineMessages.badQuantity);
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

  /** Closing mark round(exp(v+m)), impact excluded. Used for final standings and the reveal. */
  closePrice(companyId: string): number {
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
      await db.doc('game/state').set(next);
      this.state = next;
      this.clock = clock;
      this.d = derive(clock, EDGE_SPREAD[next.researchEdge]);
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
      const teamsSnap = await db.collection('teams').get();
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
      this.outChunks.clear();
      this.outNews.clear();
      this.newsDocDirty = false;
      this.finalized = false;
      for (const id of this.ids) {
        const c = this.cos.get(id)!;
        this.snaps.set(id, startSnapshot(c.startPriceCents, c.sharesOutstanding));
        this.chunks.set(id, { chunk: 0, startTick: 0, prices: [c.startPriceCents], volumes: [0] });
      }
      this.compositeChunk = { chunk: 0, startTick: 0, values: [INDEX_BASE] };
      this.indexNow = this.computeIndexes();
      this.indexSessionOpen = { composite: this.indexNow.composite, sectors: { ...this.indexNow.sectors } };

      const ops: BatchOp[] = [];
      for (const id of this.ids) {
        const fields = snapshotFields(this.snaps.get(id)!);
        const chunk = this.chunks.get(id)!;
        const history: HistoryChunk = { ...chunk, prices: [...chunk.prices], volumes: [...chunk.volumes] };
        ops.push((b) => b.update(db.doc(`companies/${id}`), fields));
        ops.push((b) => b.set(db.doc(`companies/${id}/history/0`), history));
      }
      const summaryChunk: ValueChunk = { ...this.compositeChunk, values: [...this.compositeChunk.values] };
      const summary = { ...this.summary(now), lastTick: 0 };
      ops.push((b) => b.set(db.doc('market/summary/history/0'), summaryChunk));
      ops.push((b) => b.set(db.doc('market/summary'), summary));
      ops.push((b) => b.set(db.doc('_schedule/_news'), { events: schedule, pending: [] }));
      const capital = next.startingCapital;
      for (const doc of teamsSnap.docs) {
        const t = doc.data() as Partial<Team>;
        if ((Number(t.tradeCount) || 0) > 0) continue; // never overwrite a crew that has traded
        if (t.cashBalance !== capital || t.totalValue !== capital || t.sessionOpenValue !== capital) {
          ops.push((b) => b.update(doc.ref, { cashBalance: capital, totalValue: capital, sessionOpenValue: capital }));
        }
        // Value history starts at tick 0 with the starting cash (the first recompute would otherwise copy tick 1 there).
        const history: ValueChunk = { chunk: 0, startTick: 0, values: [capital] };
        ops.push((b) => b.set(doc.ref.collection('history').doc('0'), history));
      }
      const engineDoc = serializeState(es);
      await commitWithTail(db, ops, [(b) => b.set(db.doc('_engine/state'), engineDoc), (b) => b.set(db.doc('game/state'), next)]);

      resetLeaderboardCache();
      this.state = next;
    });
  }

  /** Live → paused (no-op otherwise). The clock stops; pending flow waits for the next tick. */
  pauseGame(): Promise<void> {
    return this.exclusive(async () => {
      if (this.state.phase !== 'live') return;
      const now = Date.now();
      await db.doc('game/state').update({ phase: 'paused', pausedAt: now, serverTime: now });
      this.state = { ...this.state, phase: 'paused', pausedAt: now, serverTime: now };
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
      await db.doc('game/state').update({ phase: 'live', startAt, endAt, pausedAt: null, serverTime: now });
      this.state = { ...this.state, phase: 'live', startAt, endAt, pausedAt: null, serverTime: now };
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
      await db.doc('_schedule/_news').set({ pending }, { merge: true });
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
    await recomputeLeaderboard(this, currentTick);
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
      const update: Record<string, number> = { serverTime: now };
      if (!es && target > this.state.currentTick) {
        update.currentTick = target;
        update.lastTickAt = Date.now();
      }
      if (gen !== this.generation) return;
      await db.doc('game/state').update(update);
      this.state = { ...this.state, ...update };
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
        this.newsDocDirty = true;
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
        advanceSnapshot(this.snaps.get(id)!, t, price, volume, sessionTicks);
        const chunk = appendChunk(this.chunks.get(id)!, t, price, volume);
        this.chunks.set(id, chunk);
        this.outChunks.set(`companies/${id}/history/${chunk.chunk}`, chunk);
      }
      if (first) this.flow.resetInterval(); // per-crew interval caps reset every tick

      this.indexNow = this.computeIndexes();
      if (sessionTicks > 0 && t % sessionTicks === 0) {
        this.indexSessionOpen = { composite: this.indexNow.composite, sectors: { ...this.indexNow.sectors } };
      }
      this.compositeChunk = appendValue(this.compositeChunk, t, this.indexNow.composite);
      this.outChunks.set(`market/summary/history/${this.compositeChunk.chunk}`, this.compositeChunk);

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
    await this.commitTick(now);
    if (gen !== this.generation) return;
    try {
      await recomputeLeaderboard(this, target);
    } catch (err) {
      console.error('[engine] leaderboard recompute failed', err);
    }
    if (gen === this.generation && this.shouldEnd(now)) await this.endGameLocked('engine');
  }

  /**
   * One logical commit, split at 450 ops. Everything that says where the game is NOW goes in the LAST batch
   * together: every company doc (price, session volume, lastTick), the market summary, `_engine/state` and
   * `game/state`. Earlier batches hold only writes that are harmless when they land without it (history
   * chunks, which a load truncates to the committed tick, and news docs with deterministic ids, preceded by
   * the news schedule that fires them). So a crash part-way through a long catch-up leaves Firestore at the
   * last committed tick, and the restart replays the same ticks without counting volume twice or
   * publishing host news a second time. A failed commit is retried by the next tick.
   */
  private async commitTick(now: number): Promise<void> {
    const es = this.es!;
    const ops: BatchOp[] = [];
    this.pushPendingWrites(ops);
    const tail: BatchOp[] = [];
    for (const id of this.ids) {
      const fields = snapshotFields(this.snaps.get(id)!);
      // update (not set): a market cleared mid-tick fails this batch instead of resurrecting docs
      tail.push((b) => b.update(db.doc(`companies/${id}`), fields));
    }
    const summary = this.summary(now);
    tail.push((b) => b.set(db.doc('market/summary'), summary));
    const engineDoc = serializeState(es);
    const { currentTick, serverTime, lastTickAt } = this.state;
    tail.push((b) => b.set(db.doc('_engine/state'), engineDoc));
    tail.push((b) => b.update(db.doc('game/state'), { currentTick, serverTime, lastTickAt }));
    await commitWithTail(db, ops, tail);
    this.clearPendingWrites();
  }

  /**
   * The news schedule, news and chunks not yet committed (kept across a failed commit), skipping `skip` paths.
   * The schedule comes first: once a news doc is public, the schedule that fired it (host news moved from
   * pending to its tick) is already stored, so a restart re-fires it at the same tick under the same id.
   */
  private pushPendingWrites(ops: BatchOp[], skip: ReadonlySet<string> = new Set()): void {
    if (this.newsDocDirty) {
      const doc = { events: this.schedule.map((e) => ({ ...e })), pending: this.pendingHost.map((e) => ({ ...e })) };
      ops.push((b) => b.set(db.doc('_schedule/_news'), doc));
    }
    for (const [id, news] of this.outNews) ops.push((b) => b.set(db.doc(`news/${id}`), news));
    for (const [path, chunk] of this.outChunks) {
      if (skip.has(path)) continue;
      const data = 'prices' in chunk ? { ...chunk, prices: [...chunk.prices], volumes: [...chunk.volumes] } : { ...chunk, values: [...chunk.values] };
      ops.push((b) => b.set(db.doc(path), data));
    }
  }

  private clearPendingWrites(): void {
    this.outChunks.clear();
    this.outNews.clear();
    this.newsDocDirty = false;
  }

  private async endGameLocked(actor: 'admin' | 'engine'): Promise<void> {
    if (this.state.phase === 'ended') {
      if (!this.finalized) {
        await finalizeLeaderboard(this);
        this.finalized = true;
      }
      return;
    }
    if (this.state.phase === 'lobby') throw new EngineError('not_started', engineMessages.notStarted);

    const gen = this.generation;
    const now = Date.now();
    const tick = this.state.currentTick;
    // Like a tick commit: the company docs (closing prices and the reveal), the closing history points, the
    // summary, engine state and game state (phase ended) all go in the last batch, so the reveal can never
    // be public while the game is still running, and a failed end leaves no closing mark behind.
    const tail: BatchOp[] = [];
    const closed = new Map<string, Snapshot>();
    const closedChunks = new Map<string, HistoryChunk>();
    const chunkPaths = new Set<string>();
    for (const id of this.ids) {
      const c = this.cos.get(id)!;
      const snap = { ...this.snaps.get(id)! };
      const s = this.es?.companies[id];
      const close = s ? closeMark(s) : snap.currentPrice;
      const reveal = buildReveal({
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
      });
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
      const fields = { ...snapshotFields(snap), reveal };
      tail.push((b) => b.update(db.doc(`companies/${id}`), fields));

      // The closing mark is the last point of the price chart (it replaces the last traded price at this
      // tick, as the final team values do); the volume traded in that interval stays.
      const current = this.chunks.get(id);
      if (current) {
        const at = tick - current.startTick;
        const volume = current.chunk === chunkOf(tick) ? (current.volumes[at] ?? 0) : 0;
        const chunk = appendChunk({ ...current, prices: [...current.prices], volumes: [...current.volumes] }, tick, close, volume);
        const path = `companies/${id}/history/${chunk.chunk}`;
        closedChunks.set(id, chunk);
        chunkPaths.add(path);
        const data = { ...chunk, prices: [...chunk.prices], volumes: [...chunk.volumes] };
        tail.push((b) => b.set(db.doc(path), data));
      }
    }
    const indexNow = this.computeIndexes((id) => closed.get(id)?.currentPrice ?? 0);
    const compositeChunk = appendValue({ ...this.compositeChunk, values: [...this.compositeChunk.values] }, tick, indexNow.composite);
    const compositePath = `market/summary/history/${compositeChunk.chunk}`;
    chunkPaths.add(compositePath);
    const compositeData = { ...compositeChunk, values: [...compositeChunk.values] };
    tail.push((b) => b.set(db.doc(compositePath), compositeData));
    const ops: BatchOp[] = [];
    this.pushPendingWrites(ops, chunkPaths); // anything a failed tick commit left behind (its chunks are superseded above)
    const next: GameState = { ...this.state, phase: 'ended', endedAt: now, pausedAt: null, serverTime: now };
    const summary = this.summary(now, closed, indexNow);
    tail.push((b) => b.set(db.doc('market/summary'), summary));
    if (this.es) {
      const engineDoc = serializeState(this.es);
      tail.push((b) => b.set(db.doc('_engine/state'), engineDoc));
    }
    const { lastTickAt } = this.state;
    tail.push((b) =>
      b.update(db.doc('game/state'), { phase: 'ended', endedAt: now, pausedAt: null, serverTime: now, currentTick: tick, lastTickAt }),
    );
    if (gen !== this.generation) return;
    await commitWithTail(db, ops, tail);
    this.clearPendingWrites();
    for (const [id, snap] of closed) this.snaps.set(id, snap);
    for (const [id, chunk] of closedChunks) this.chunks.set(id, chunk);
    this.compositeChunk = compositeChunk;
    this.indexNow = indexNow;
    this.state = next;

    if (gen !== this.generation) return; // a new market is being created; don't write old standings into it
    await finalizeLeaderboard(this);
    this.finalized = true;
    if (actor === 'engine') await auditLog('game.end', 'engine', { tick: next.currentTick });
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
    this.sectorIds.clear();
    this.starts = {};
    this.shares = {};
    this.snaps.clear();
    this.es = null;
    this.schedule = [];
    this.byTick = new Map();
    this.pendingHost = [];
    this.flow = new FlowBook();
    this.chunks.clear();
    this.compositeChunk = { chunk: 0, startTick: 0, values: [INDEX_BASE] };
    this.indexNow = { composite: INDEX_BASE, sectors: {} };
    this.indexSessionOpen = { composite: INDEX_BASE, sectors: {} };
    this.outChunks.clear();
    this.outNews.clear();
    this.newsDocDirty = false;
    this.finalized = false;
  }

  private async loadLocked(): Promise<void> {
    this.resetMemory();
    const now = Date.now();
    const [stateSnap, scheduleSnap, companiesSnap, engineSnap, summarySnap, leaderboardSnap] = await Promise.all([
      db.doc('game/state').get(),
      db.collection('_schedule').get(),
      db.collection('companies').get(),
      db.doc('_engine/state').get(),
      db.doc('market/summary').get(),
      db.doc('leaderboard/current').get(),
    ]);

    const state = normalizeState(stateSnap.data() as Partial<GameState> | undefined, now);
    this.clock = deriveClock(state.gameLengthMs);
    this.d = derive(this.clock, EDGE_SPREAD[state.researchEdge]);

    let newsDoc: NewsScheduleDoc = {};
    const sched = new Map<string, ScheduleCompanyDoc>();
    for (const doc of scheduleSnap.docs) {
      if (doc.id === '_meta') this.seed = String(doc.data().seed ?? '');
      else if (doc.id === '_news') newsDoc = doc.data() as NewsScheduleDoc;
      else if (!doc.id.startsWith('_')) sched.set(doc.id, doc.data() as ScheduleCompanyDoc);
    }
    if (!this.seed) {
      this.seed = config.seed;
      if (sched.size > 0) console.warn('[engine] _schedule/_meta has no seed; falling back to GAME_SEED');
    }

    const companyDocs = new Map(companiesSnap.docs.map((doc) => [doc.id, doc.data() as Partial<Company>]));
    const rosterIndex = new Map(ROSTER.map((r, i) => [r.id, i]));
    this.ids = [...sched.keys()]
      .filter((id) => companyDocs.has(id))
      .sort((a, b) => (rosterIndex.get(a) ?? 1e9) - (rosterIndex.get(b) ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0));

    for (const id of this.ids) {
      const s = sched.get(id)!;
      const doc = companyDocs.get(id)!;
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

    this.schedule = [...(newsDoc.events ?? [])].sort((a, b) => a.tick - b.tick);
    this.byTick = jumpsAtTick(this.schedule);
    this.pendingHost = newsDoc.pending ?? [];
    this.finalized = state.phase === 'ended' && leaderboardSnap.data()?.final !== undefined;

    if (state.phase === 'lobby' || this.ids.length === 0) {
      this.state = state;
      this.indexNow = this.computeIndexes();
      this.indexSessionOpen = { composite: INDEX_BASE, sectors: Object.fromEntries(Object.keys(this.indexNow.sectors).map((s) => [s, INDEX_BASE])) };
      return;
    }

    // Engine state: persisted doc, or replay fair value from tick 0 and recover impact from prices.
    const engineDoc = engineSnap.data() as EngineState | undefined;
    if (engineDoc && typeof engineDoc.lastTick === 'number' && this.ids.every((id) => validCompanyState(engineDoc.companies?.[id]))) {
      this.es = serializeState(engineDoc);
      const lastTick = Math.min(Math.max(0, this.es.lastTick), this.clock.totalTicks);
      if (lastTick !== state.currentTick) {
        console.warn(`[engine] _engine/state is at tick ${lastTick} but game/state says ${state.currentTick}; resuming from the engine state`);
        state.currentTick = lastTick;
      }
    } else {
      console.warn(`[engine] _engine/state missing or incomplete; replaying fair value to tick ${state.currentTick}`);
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

    // Current history chunks (truncated to the current tick, repaired if short).
    const tick = state.currentTick;
    const c = chunkOf(tick);
    const startTick = c * HISTORY_CHUNK;
    const keep = tick - startTick + 1;
    const [chunkSnaps, summaryChunkSnap] = await Promise.all([
      Promise.all(this.ids.map((id) => db.doc(`companies/${id}/history/${c}`).get())),
      db.doc(`market/summary/history/${c}`).get(),
    ]);
    this.ids.forEach((id, k) => {
      const data = chunkSnaps[k]!.data() as Partial<HistoryChunk> | undefined;
      let chunk: HistoryChunk = {
        chunk: c,
        startTick,
        prices: Array.isArray(data?.prices) ? data.prices.slice(0, keep) : [],
        volumes: Array.isArray(data?.volumes) ? data.volumes.slice(0, keep) : [],
      };
      if (chunk.prices.length < keep || chunk.volumes.length < keep) {
        chunk = appendChunk({ ...chunk, volumes: chunk.volumes.slice(0, chunk.prices.length) }, tick, this.getPrice(id), 0);
        this.outChunks.set(`companies/${id}/history/${c}`, chunk);
      }
      this.chunks.set(id, chunk);
    });

    this.indexNow = this.computeIndexes();
    const summaryChunk = summaryChunkSnap.data() as Partial<ValueChunk> | undefined;
    this.compositeChunk = { chunk: c, startTick, values: Array.isArray(summaryChunk?.values) ? summaryChunk.values.slice(0, keep) : [] };
    if (this.compositeChunk.values.length < keep) {
      this.compositeChunk = appendValue(this.compositeChunk, tick, this.indexNow.composite);
      this.outChunks.set(`market/summary/history/${c}`, this.compositeChunk);
    }
    const summary = summarySnap.data() as Partial<MarketSummary> | undefined;
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
      const trades = await db.collection('trades').where('tick', '>=', state.currentTick).get();
      for (const doc of trades.docs) {
        const t = doc.data() as Partial<Trade>;
        if (!t.teamId || !t.companyId || !this.cos.has(t.companyId) || !(Number(t.quantity) > 0)) continue;
        this.flow.reserve(t.teamId, t.companyId, t.side === 'sell' ? -Number(t.quantity) : Number(t.quantity));
      }
    }
  }
}

/** Process-wide singleton. */
export const engine = new GameEngine();
