/**
 * Domain types: the single source of truth for data shapes shared by the
 * authority service and the web client. Money fields are integer cents of the
 * themed currency unless the field name says otherwise.
 */

import type { Grade, NewsType, ResearchEdge, RevealLabel, Sector } from './constants.js';
import type { QualityPillars } from './quality.js';

export type Phase = 'lobby' | 'live' | 'paused' | 'ended';
export type OrderSide = 'buy' | 'sell';
export type Role = 'team' | 'admin';

/** Host-configurable settings (editable in the lobby). */
export interface GameSettings {
  gameLengthMs: number;
  startingCapital: number; // integer cents
  feeBps: number;
  researchEdge: ResearchEdge;
  /** Max share of total account value one company may hold after a buy (1 = no limit). */
  maxPositionPct: number;
  currency: { name: string; symbol: string };
}

/** Public document at `game/state`. */
export interface GameState extends GameSettings {
  phase: Phase;
  startAt: number | null; // epoch ms when the game went live
  endAt: number | null; // epoch ms when the game ends
  pausedAt: number | null; // epoch ms the game was paused
  endedAt: number | null; // epoch ms the game actually ended
  currentTick: number;
  tickIntervalMs: number;
  totalTicks: number;
  sessionTicks: number;
  serverTime: number; // engine heartbeat, epoch ms
  lastTickAt: number | null;
  marketCreatedAt: number;
}

/** End-of-game reveal written onto `companies/{id}.reveal`. */
export interface CompanyReveal {
  quality: number; // s
  q: number;
  qEff: number; // surpriseWeight·q + (1 − surpriseWeight)·surprise
  surprise: number; // ξ ~ U[−1,1], hidden until the reveal
  grade: Grade;
  pillars: QualityPillars;
  fairValue: number; // integer cents, exp(v)
  expectedReturn: number; // log return, QS·qEff + beta·mktDrift
  actualReturn: number; // log return, ln(end/start)
  luck: number; // actual − expected
  label: RevealLabel;
}

/** Public document at `companies/{id}`. */
export interface Company {
  id: string;
  name: string;
  ticker: string;
  sector: Sector;
  description: string;
  currentPrice: number; // integer cents
  startPrice: number;
  sessionOpen: number;
  sessionHigh: number;
  sessionLow: number;
  sessionVolume: number; // shares
  voyageHigh: number;
  voyageLow: number;
  sessionChange: number; // signed fraction vs sessionOpen
  voyageChange: number; // signed fraction vs startPrice
  sharesOutstanding: number;
  marketCap: number; // integer cents
  beta: number;
  adv: number; // shares
  lastTick: number;
  reveal?: CompanyReveal;
}

export interface ManagementMember {
  name: string;
  role: string;
  bio: string;
  tenureYears: number;
}

export interface IndustryAnalysis {
  sector: Sector;
  tam: number; // total addressable market, integer cents
  growthRate: number; // signed fraction, annualized
  competitivePosition: string;
  notes: string;
}

export interface FinancialPeriod {
  period: string; // e.g. "FY2025"
  revenue: number;
  netIncome: number;
  eps: number; // cents per share
}

/** Public document at `companies/{id}/fundamentals/data`. */
export interface Fundamentals {
  // valuation & size
  marketCap: number;
  sharesOutstanding: number;
  float: number;
  week52High: number;
  week52Low: number;
  peRatio: number;
  forwardPe: number;
  psRatio: number;
  pbRatio: number;
  evToEbitda: number;
  dividendYield: number; // fraction
  payoutRatio: number; // fraction
  // income statement (most recent period)
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number; // cents per share
  ebitda: number;
  grossMargin: number; // fraction
  operatingMargin: number; // fraction
  netMargin: number; // fraction
  // balance sheet
  cash: number;
  totalAssets: number;
  totalDebt: number;
  totalLiabilities: number;
  equity: number;
  currentRatio: number;
  debtToEquity: number;
  // cash flow & returns
  operatingCashFlow: number;
  capex: number;
  freeCashFlow: number;
  roe: number; // fraction
  roa: number; // fraction
  // qualitative research
  businessOverview: string;
  management: ManagementMember[];
  industry: IndustryAnalysis;
  marketingStrategy: string;
  riskFactors: string[];
  recentDevelopments: string[];
  analyst: { rating: string; priceTarget: number }; // priceTarget integer cents
  history: FinancialPeriod[];
  // risk
  beta: number;
}

/** `companies/{id}/history/{chunk}`: HISTORY_CHUNK ticks of prices and volumes. */
export interface HistoryChunk {
  chunk: number;
  startTick: number;
  prices: number[]; // integer cents
  volumes: number[]; // shares
}

/** Value series chunk (market composite, team total value). */
export interface ValueChunk {
  chunk: number;
  startTick: number;
  values: number[];
}

export interface IndexQuote {
  value: number;
  open: number;
  sessionOpen: number;
  change: number; // signed fraction vs open
  sessionChange: number; // signed fraction vs sessionOpen
}

export interface MarketBreadth {
  advancers: number;
  decliners: number;
  unchanged: number;
  voyageHighs: number;
  voyageLows: number;
  sessionVolume: number;
  advancingVolume: number;
  decliningVolume: number;
}

/** Public document at `market/summary`. */
export interface MarketSummary {
  lastTick: number;
  updatedAt: number;
  composite: IndexQuote;
  sectors: Record<string, IndexQuote>;
  breadth: MarketBreadth;
}

/** Document at `teams/{id}` (readable by the team and admin). */
export interface Team {
  id: string;
  name: string;
  cashBalance: number; // integer cents
  totalValue: number; // cash + mark-to-market holdings
  rank: number;
  realizedPnl: number;
  feesPaid: number;
  tradeCount: number;
  tradingDisabled: boolean;
  sessionOpenValue: number;
  holdingsCount: number;
  createdAt: number;
  /**
   * Rank at the start of the current session, stored when a session opens (or at the crew's first
   * standings). Leaderboard `prevRank` is this value, so movement arrows show change since the session
   * began. 0 or absent: not set yet.
   */
  sessionStartRank?: number;
}

/** Document at `teams/{id}/holdings/{companyId}`. */
export interface Holding {
  companyId: string;
  shares: number;
  avgCost: number; // integer cents per share
}

/** Request body for POST /orders. */
export interface OrderRequest {
  companyId: string;
  side: OrderSide;
  quantity: number;
  clientOrderId: string;
  quotedPrice?: number; // integer cents the client saw
}

/** Document at `trades/{id}` (server-written). */
export interface Trade {
  id: string;
  teamId: string;
  companyId: string;
  side: OrderSide;
  quantity: number;
  price: number; // fill price, integer cents
  lastPrice: number; // last price at fill time
  impactBps: number;
  fee: number; // integer cents
  realizedPnl: number;
  executedAt: number; // epoch ms
  tick: number;
  cashAfter: number;
  sharesAfter: number;
  clientOrderId: string;
}

export type OrderStatus = 'filled' | 'rejected';

/** Document at `orders/{teamId}_{clientOrderId}`. */
export interface OrderRecord {
  id: string;
  teamId: string;
  clientOrderId: string;
  companyId: string;
  side: OrderSide;
  quantity: number;
  status: OrderStatus;
  code?: string;
  reason?: string;
  tradeId?: string;
  createdAt: number;
  tick: number;
}

/** Public document at `news/{id}` (only after the event fires; never carries magnitude). */
export interface NewsEvent {
  id: string;
  headline: string;
  body: string;
  companyIds: string[];
  type: NewsType;
  sentiment: 'bullish' | 'bearish';
  source: 'scheduled' | 'macro' | 'host';
  tick: number;
  firedAt: number;
  priceAtFire: Record<string, number>;
}

/** Entry within `leaderboard/current`. */
export interface LeaderboardEntry {
  teamId: string;
  name: string;
  totalValue: number;
  rank: number;
  /** Rank at the start of the current session (`Team.sessionStartRank`); movement = prevRank − rank. */
  prevRank: number;
  returnPct: number;
  sessionChangePct: number;
  cashPct: number;
  holdings: number;
  spark: number[];
}

export interface FinalEntry extends LeaderboardEntry {
  researchScore: number;
  researchGrade: Grade;
  /**
   * The invested value behind the research grade: holdings value in cents summed over every price update
   * it was held for. A crew that bought only after the last update is graded on its closing holdings,
   * counted as one update. Written by every final standings from this version on (absent on older ones).
   */
  researchWeight?: number;
  /**
   * True when the crew held shares at any price update or at the close. False means it has no research
   * grade: show COPY §10 `researchGrade.noHoldings` instead of the grade.
   */
  heldAnyShares?: boolean;
}

/** Public document at `leaderboard/current`. */
export interface Leaderboard {
  updatedAt: number;
  tick: number;
  entries: LeaderboardEntry[];
  final?: { endedAt: number; entries: FinalEntry[] };
}

/** Standard JSON error envelope returned by the authority service. */
export interface ApiError {
  error: string;
  message: string;
}

/** Success envelope for POST /orders. */
export interface OrderResult {
  trade: Trade;
}

/** Row of GET /admin/market. */
export interface AdminMarketRow {
  companyId: string;
  ticker: string;
  name: string;
  sector: Sector;
  price: number;
  sessionChange: number;
  sessionVolume: number;
  netFlow: number;
  quality: number;
  q: number;
  grade: Grade;
  fairValue: number;
  deviation: number;
}

/** Row of GET /admin/news/scheduled. */
export interface ScheduledNewsView {
  tick: number;
  companyIds: string[];
  type: NewsType;
  sentiment: 'bullish' | 'bearish';
  headline: string;
  fired: boolean;
  source: 'scheduled' | 'macro' | 'host';
}

/** GET /health. */
export interface HealthResponse {
  ok: true;
  phase: Phase;
  tick: number;
  totalTicks: number;
  serverTime: number;
  lastTickAt: number | null;
  ticksBehind: number;
}
