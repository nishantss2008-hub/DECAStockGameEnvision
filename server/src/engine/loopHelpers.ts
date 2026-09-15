/**
 * Pure helpers for the engine loop, market service and leaderboard (no I/O).
 *
 * Everything here is deterministic and unit-tested in `test/loopHelpers.test.ts`.
 * The Firestore types are imported as types only, so this module never
 * initializes Firebase.
 */

import {
  CURRENCY,
  DEFAULT_FEE_BPS,
  DEFAULT_GAME_LENGTH_MS,
  DEFAULT_MAX_POSITION_PCT,
  DEFAULT_STARTING_CAPITAL,
  GAME_LENGTH_OPTIONS_MS,
  HISTORY_CHUNK,
  POSITION_LIMIT_OPTIONS,
  RESEARCH_EDGES,
  chunkOf,
  deriveClock,
  type CompanyReveal,
  type GameSettings,
  type GameState,
  type Grade,
  type HistoryChunk,
  type IndexQuote,
  type LeaderboardEntry,
  type MarketBreadth,
  type Phase,
  type QualityPillars,
  type ResearchEdge,
  type RevealLabel,
  type SettingsInput,
  type ValueChunk,
} from '@deca/shared';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';

/** Composite and sector indexes start every game at this value. */
export const INDEX_BASE = 1000;
/** Firestore allows 500 writes per batch; stay well below it. */
export const BATCH_LIMIT = 450;
/** Points in a leaderboard sparkline. */
export const SPARK_POINTS = 40;

// ─── Indexes and sparks ──────────────────────────────────────────────────────

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Cap-weighted index: 1000·Σ(price·shares)/Σ(start·shares) over `ids`, 2-dp.
 * Ids missing from any map are skipped; with no weight at all it is 1000.
 */
export function compositeValue(
  prices: Record<string, number>,
  starts: Record<string, number>,
  shares: Record<string, number>,
  ids: string[],
): number {
  let num = 0;
  let den = 0;
  for (const id of ids) {
    const p = prices[id];
    const s = starts[id];
    const n = shares[id];
    if (p === undefined || s === undefined || n === undefined) continue;
    num += p * n;
    den += s * n;
  }
  return den > 0 ? round2((INDEX_BASE * num) / den) : INDEX_BASE;
}

/** `points` evenly spaced samples of `series`, always including the first and last. */
export function sampleSpark(series: number[], points: number = SPARK_POINTS): number[] {
  const n = series.length;
  if (n <= points) return series.slice();
  if (points < 2) return [series[n - 1]!];
  const out: number[] = [];
  for (let i = 0; i < points; i++) out.push(series[Math.round((i * (n - 1)) / (points - 1))]!);
  return out;
}

/** Index quote vs the game open (1000) and the session open. Changes are signed fractions. */
export function indexQuote(value: number, sessionOpen: number): IndexQuote {
  return {
    value,
    open: INDEX_BASE,
    sessionOpen,
    change: value / INDEX_BASE - 1,
    sessionChange: sessionOpen > 0 ? value / sessionOpen - 1 : 0,
  };
}

// ─── Reveal and research grade ───────────────────────────────────────────────

/** Reveal label from the signs of q (health) and luck; 0 counts as the non-negative side. */
export function revealLabel(q: number, luck: number): RevealLabel {
  if (q >= 0) return luck >= 0 ? 'compounder' : 'unlucky_gem';
  return luck >= 0 ? 'lucky_turnaround' : 'decliner';
}

/** Research grade from a value-weighted average q: ≥0.6 A, ≥0.2 B, ≥−0.2 C, ≥−0.6 D, else F. */
export function researchGrade(score: number): Grade {
  if (score >= 0.6) return 'A';
  if (score >= 0.2) return 'B';
  if (score >= -0.2) return 'C';
  if (score >= -0.6) return 'D';
  return 'F';
}

export interface RevealInput {
  quality: number;
  q: number;
  qEff: number;
  surprise: number;
  grade: Grade;
  pillars: QualityPillars;
  /** ln(fair value in cents) at the end of the game. */
  v: number;
  /** Closing mark in cents (impact excluded). */
  closePrice: number;
  startPrice: number;
  /** Whole-game expected log return, surprise included (spread·qEff + beta·mktDrift). */
  expectedReturn: number;
}

export function buildReveal(i: RevealInput): CompanyReveal {
  const actualReturn = i.startPrice > 0 && i.closePrice > 0 ? Math.log(i.closePrice / i.startPrice) : 0;
  const luck = actualReturn - i.expectedReturn;
  return {
    quality: i.quality,
    q: i.q,
    qEff: i.qEff,
    surprise: i.surprise,
    grade: i.grade,
    pillars: { ...i.pillars },
    fairValue: Math.max(1, Math.round(Math.exp(i.v))),
    expectedReturn: i.expectedReturn,
    actualReturn,
    luck,
    label: revealLabel(i.q, luck),
  };
}

// ─── Company snapshots and breadth ───────────────────────────────────────────

/** The mutable, per-tick part of a `companies/{id}` doc. */
export interface Snapshot {
  currentPrice: number;
  startPrice: number;
  sessionOpen: number;
  sessionHigh: number;
  sessionLow: number;
  sessionVolume: number;
  voyageHigh: number;
  voyageLow: number;
  sessionChange: number;
  voyageChange: number;
  marketCap: number;
  sharesOutstanding: number;
  lastTick: number;
}

/**
 * Applies tick `t`'s price and crew volume. The volume traded during the
 * interval that ends at t belongs to the session it was traded in, so it is
 * added before a session boundary resets the session fields.
 */
export function advanceSnapshot(s: Snapshot, t: number, price: number, volume: number, sessionTicks: number): void {
  s.currentPrice = price;
  s.sessionVolume += volume;
  if (sessionTicks > 0 && t % sessionTicks === 0) {
    s.sessionOpen = price;
    s.sessionHigh = price;
    s.sessionLow = price;
    s.sessionVolume = 0;
  } else {
    s.sessionHigh = Math.max(s.sessionHigh, price);
    s.sessionLow = Math.min(s.sessionLow, price);
  }
  s.voyageHigh = Math.max(s.voyageHigh, price);
  s.voyageLow = Math.min(s.voyageLow, price);
  s.sessionChange = s.sessionOpen > 0 ? price / s.sessionOpen - 1 : 0;
  s.voyageChange = s.startPrice > 0 ? price / s.startPrice - 1 : 0;
  s.marketCap = price * s.sharesOutstanding;
  s.lastTick = t;
}

/**
 * Advancers/decliners by session change sign. A voyage high (low) counts when
 * the current price sits at the game high above the start (low below it).
 */
export function marketBreadth(snaps: Snapshot[]): MarketBreadth {
  const b: MarketBreadth = {
    advancers: 0,
    decliners: 0,
    unchanged: 0,
    voyageHighs: 0,
    voyageLows: 0,
    sessionVolume: 0,
    advancingVolume: 0,
    decliningVolume: 0,
  };
  for (const s of snaps) {
    b.sessionVolume += s.sessionVolume;
    if (s.sessionChange > 0) {
      b.advancers++;
      b.advancingVolume += s.sessionVolume;
    } else if (s.sessionChange < 0) {
      b.decliners++;
      b.decliningVolume += s.sessionVolume;
    } else {
      b.unchanged++;
    }
    if (s.currentPrice >= s.voyageHigh && s.voyageHigh > s.startPrice) b.voyageHighs++;
    if (s.currentPrice <= s.voyageLow && s.voyageLow < s.startPrice) b.voyageLows++;
  }
  return b;
}

// ─── History chunks ──────────────────────────────────────────────────────────

/**
 * Writes tick t into its chunk: returns a fresh chunk when t is past this one,
 * forward-fills any skipped ticks and truncates anything recorded after t.
 */
export function appendChunk(chunk: HistoryChunk, t: number, price: number, volume: number): HistoryChunk {
  const c = chunkOf(t);
  const out = chunk.chunk === c ? chunk : { chunk: c, startTick: c * HISTORY_CHUNK, prices: [], volumes: [] };
  const i = t - out.startTick;
  if (out.prices.length > i) out.prices.length = i;
  if (out.volumes.length > i) out.volumes.length = i;
  while (out.prices.length < i) out.prices.push(out.prices[out.prices.length - 1] ?? price);
  while (out.volumes.length < i) out.volumes.push(0);
  out.prices.push(price);
  out.volumes.push(volume);
  return out;
}

/** Same as appendChunk for a value series chunk (composite index, team value). */
export function appendValue(chunk: ValueChunk, t: number, value: number): ValueChunk {
  const c = chunkOf(t);
  const out = chunk.chunk === c ? chunk : { chunk: c, startTick: c * HISTORY_CHUNK, values: [] };
  const i = t - out.startTick;
  if (out.values.length > i) out.values.length = i;
  while (out.values.length < i) out.values.push(out.values[out.values.length - 1] ?? value);
  out.values.push(value);
  return out;
}

/** True when a session starts in (prevTick, tick]; with no previous tick, when tick opens a session. */
export function crossedSession(prevTick: number | undefined, tick: number, sessionTicks: number): boolean {
  if (sessionTicks <= 0) return false;
  if (prevTick === undefined) return tick % sessionTicks === 0;
  return Math.floor(tick / sessionTicks) > Math.floor(prevTick / sessionTicks);
}

/** `news/{source}-{tick}-{firstCompanyId}-{seq}`; deterministic so a retried commit overwrites itself. */
export function newsDocId(source: string, tick: number, firstId: string | undefined, seq: number): string {
  return `${source}-${tick}-${firstId ?? 'market'}-${seq}`;
}

// ─── Team value series ───────────────────────────────────────────────────────

/** values[i] is the team's total value at tick start + i. */
export interface TeamSeries {
  start: number;
  values: number[];
}

/**
 * Records `value` at `tick`. A new series starts at the tick's chunk start
 * (earlier slots take the first value); skipped ticks forward-fill; anything
 * after `tick` is dropped. Mutates and returns the series.
 */
export function putSeriesValue(series: TeamSeries | undefined, tick: number, value: number): TeamSeries {
  const s = series ?? { start: chunkOf(tick) * HISTORY_CHUNK, values: [] };
  if (tick < s.start) {
    const lead = new Array<number>(s.start - tick).fill(value);
    s.values = [...lead, ...s.values];
    s.start = tick;
  }
  const i = tick - s.start;
  if (s.values.length > i) s.values.length = i;
  while (s.values.length < i) s.values.push(s.values[s.values.length - 1] ?? value);
  s.values.push(value);
  return s;
}

/** Chunk docs covering ticks fromTick..toTick of the series (copies). */
export function seriesChunks(series: TeamSeries, fromTick: number, toTick: number): ValueChunk[] {
  const out: ValueChunk[] = [];
  const end = series.start + series.values.length - 1;
  const from = Math.max(fromTick, series.start);
  const to = Math.min(toTick, end);
  if (to < from) return out;
  for (let c = chunkOf(from); c <= chunkOf(to); c++) {
    const startTick = c * HISTORY_CHUNK;
    const a = Math.max(0, startTick - series.start);
    const b = Math.min(series.values.length, startTick + HISTORY_CHUNK - series.start);
    if (b <= a) continue;
    // Slots before the series start (first chunk only) take the first value so indexes stay aligned.
    const lead = Math.max(0, series.start - startTick);
    const values = [...new Array<number>(lead).fill(series.values[0]!), ...series.values.slice(a, b)];
    out.push({ chunk: c, startTick, values });
  }
  return out;
}

/** Rebuilds a series from stored chunks (any order); gaps between chunks forward-fill. */
export function seriesFromChunks(chunks: ValueChunk[]): TeamSeries | undefined {
  const sorted = chunks.filter((c) => c.values.length > 0).sort((a, b) => a.startTick - b.startTick);
  let s: TeamSeries | undefined;
  for (const c of sorted) {
    c.values.forEach((v, i) => {
      s = putSeriesValue(s ?? { start: c.startTick, values: [] }, c.startTick + i, v);
    });
  }
  return s;
}

// ─── Standings ───────────────────────────────────────────────────────────────

export interface StandingRow {
  teamId: string;
  name: string;
  totalValue: number;
  cash: number;
  holdingsCount: number;
  sessionOpenValue: number;
  /** Total value per tick (for the spark). */
  series: number[];
}

/**
 * Leaderboard entries ranked by total value (ties by name, then id). Percent
 * fields are signed fractions like `Company.sessionChange`. A crew with no
 * previous rank keeps its current rank as prevRank.
 */
export function rankEntries(
  rows: StandingRow[],
  prevRanks: Record<string, number>,
  startingCapital: number,
): LeaderboardEntry[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.totalValue - a.totalValue ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0),
  );
  return sorted.map((r, i) => {
    const rank = i + 1;
    return {
      teamId: r.teamId,
      name: r.name,
      totalValue: r.totalValue,
      rank,
      prevRank: prevRanks[r.teamId] ?? rank,
      returnPct: startingCapital > 0 ? r.totalValue / startingCapital - 1 : 0,
      sessionChangePct: r.sessionOpenValue > 0 ? r.totalValue / r.sessionOpenValue - 1 : 0,
      cashPct: r.totalValue > 0 ? r.cash / r.totalValue : 0,
      holdings: r.holdingsCount,
      spark: r.series.length > 0 ? sampleSpark(r.series) : [r.totalValue],
    };
  });
}

// ─── Settings and game state ─────────────────────────────────────────────────

function isEdge(x: unknown): x is ResearchEdge {
  return typeof x === 'string' && (RESEARCH_EDGES as readonly string[]).includes(x);
}

function intOr(x: unknown, fallback: number, min: number): number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min ? x : fallback;
}

/** Settings with every missing or invalid field set to its default. */
export function normalizeSettings(raw: Partial<GameSettings> | undefined): GameSettings {
  const r = raw ?? {};
  const cur = r.currency;
  return {
    gameLengthMs:
      typeof r.gameLengthMs === 'number' && GAME_LENGTH_OPTIONS_MS.includes(r.gameLengthMs) ? r.gameLengthMs : DEFAULT_GAME_LENGTH_MS,
    startingCapital: intOr(r.startingCapital, DEFAULT_STARTING_CAPITAL, 1),
    feeBps: intOr(r.feeBps, DEFAULT_FEE_BPS, 0),
    researchEdge: isEdge(r.researchEdge) ? r.researchEdge : 'normal',
    maxPositionPct:
      typeof r.maxPositionPct === 'number' && (POSITION_LIMIT_OPTIONS as readonly number[]).includes(r.maxPositionPct)
        ? r.maxPositionPct
        : DEFAULT_MAX_POSITION_PCT,
    currency: {
      name: typeof cur?.name === 'string' && cur.name ? cur.name : CURRENCY.name,
      symbol: typeof cur?.symbol === 'string' && cur.symbol ? cur.symbol : CURRENCY.symbol,
    },
  };
}

/** Applies a validated settings input on top of the current settings (returns a new object). */
export function mergeSettings(current: GameSettings, input: SettingsInput): GameSettings {
  return normalizeSettings({
    gameLengthMs: input.gameLengthMs ?? current.gameLengthMs,
    startingCapital: input.startingCapital ?? current.startingCapital,
    feeBps: input.feeBps ?? current.feeBps,
    researchEdge: input.researchEdge ?? current.researchEdge,
    maxPositionPct: input.maxPositionPct ?? current.maxPositionPct,
    currency: {
      name: input.currencyName ?? current.currency.name,
      symbol: input.currencySymbol ?? current.currency.symbol,
    },
  });
}

/** Only the settings fields of a state (Firestore docs must not carry extra keys by accident). */
export function settingsOf(s: GameSettings): GameSettings {
  return normalizeSettings(s);
}

/** A fresh lobby state for a market created at `now`. */
export function lobbyState(settings: GameSettings, now: number): GameState {
  const clock = deriveClock(settings.gameLengthMs);
  return {
    ...settingsOf(settings),
    phase: 'lobby',
    startAt: null,
    endAt: null,
    pausedAt: null,
    endedAt: null,
    currentTick: 0,
    tickIntervalMs: clock.tickIntervalMs,
    totalTicks: clock.totalTicks,
    sessionTicks: clock.sessionTicks,
    serverTime: now,
    lastTickAt: null,
    marketCreatedAt: now,
  };
}

const PHASES: readonly Phase[] = ['lobby', 'live', 'paused', 'ended'];

function numOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/**
 * A complete GameState from a possibly partial (or v1) `game/state` doc. The
 * clock fields are always rederived from the game length.
 */
export function normalizeState(raw: Partial<GameState> | undefined, now: number): GameState {
  const r = raw ?? {};
  const base = lobbyState(normalizeSettings(r), now);
  return {
    ...base,
    phase: PHASES.includes(r.phase as Phase) ? (r.phase as Phase) : 'lobby',
    startAt: numOrNull(r.startAt),
    endAt: numOrNull(r.endAt),
    pausedAt: numOrNull(r.pausedAt),
    endedAt: numOrNull(r.endedAt),
    currentTick: intOr(r.currentTick, 0, 0),
    serverTime: numOrNull(r.serverTime) ?? now,
    lastTickAt: numOrNull(r.lastTickAt),
    marketCreatedAt: numOrNull(r.marketCreatedAt) ?? 0,
  };
}

// ─── Firestore batching ──────────────────────────────────────────────────────

export type BatchOp = (batch: WriteBatch) => void;

/** Applies `ops` in order, committing every `limit` ops. Returns the number of commits. */
export async function commitInBatches(db: Pick<Firestore, 'batch'>, ops: BatchOp[], limit: number = BATCH_LIMIT): Promise<number> {
  let commits = 0;
  for (let i = 0; i < ops.length; i += limit) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + limit)) op(batch);
    await batch.commit();
    commits++;
  }
  return commits;
}

// ─── User-facing engine messages (docs/design/COPY.md wording) ────────────────

function fmtInt(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

export const engineMessages = {
  /** COPY §9 ticket-errors: market_closed (lobby), paused, market_closed_ended. */
  marketClosed(phase: Phase): string {
    if (phase === 'paused') return 'The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.';
    if (phase === 'ended') return "The game has ended, so trading is closed. See how every crew finished and what drove each company's price.";
    return 'Trading opens when the host starts the game. You can research companies and preview orders now.';
  },
  /** COPY §9 ticket-errors: unknown_company. */
  unknownCompany: "We couldn't find a company with that symbol. Pick one from the search list, like KRKN.",
  /** COPY §9 ticket-errors: bad_quantity. */
  badQuantity: 'Enter a whole number of shares that is 1 or more, like 10 or 250.',
  /** COPY §9 ticket-errors: interval_limit (message / messageAfterTrades). */
  intervalLimit(i: { cap: number; used: number; ticker: string; seconds: number }): string {
    if (i.used > 0) {
      return `You already traded ${fmtInt(i.used)} shares of ${i.ticker} in this price update. You can trade ${fmtInt(i.cap - i.used)} more now, or the rest after the next update.`;
    }
    return `You can trade up to ${fmtInt(i.cap)} shares of ${i.ticker} per price update. Lower the shares, or place the rest after the next update in about ${fmtInt(i.seconds)} seconds.`;
  },
  /** COPY §11 host-settings: lockedNote. */
  notLobby: 'Locked while the game is running. You can change settings only in the lobby.',
  alreadyStarted: 'The game has already started. Start a new game to return to the lobby.',
  noMarket: 'There is no market yet. Start a new game to create one.',
  notStarted: "The game hasn't started yet, so there is nothing to end.",
  notRunning: 'News can be sent only while the game is running or paused.',
  noNewsCompanies: "We couldn't find any of those companies. Pick at least one from the list.",
} as const;
