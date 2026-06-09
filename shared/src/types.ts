/**
 * Domain types — the single source of truth for data shapes shared by the
 * authority service and the web client. Money fields are integer cents of the
 * themed currency unless the field name says otherwise.
 */

import type { ArchetypeName, NewsImpact, Sector } from './constants.js';

export type Phase = 'lobby' | 'live' | 'paused' | 'ended';
export type OrderSide = 'buy' | 'sell';
export type Role = 'team' | 'admin';
export type Archetype = ArchetypeName;

/** Public document at `game/state`. */
export interface GameState {
  phase: Phase;
  startAt: number | null; // epoch ms when game went live
  endAt: number | null; // epoch ms when game ends
  currentTick: number;
  tickIntervalMs: number;
  serverTime: number; // engine heartbeat, epoch ms
  currency: { name: string; symbol: string };
  startingCapital: number; // integer cents
}

/** Public document at `companies/{id}`. */
export interface Company {
  id: string; // slug, e.g. "blackbeard"
  name: string; // "Blackbeard Incorporated"
  ticker: string; // "BBRD"
  sector: Sector;
  emoji: string;
  description: string;
  currentPrice: number; // integer cents
  prevClose: number; // integer cents (reference price ~24h ago)
  dayChange: number; // signed fraction, e.g. 0.0123 = +1.23%
  sharesOutstanding: number;
  marketCap: number; // integer cents = currentPrice * sharesOutstanding
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
}

/** A single recorded price tick at `companies/{id}/priceHistory/{tick}`. */
export interface PricePoint {
  tick: number;
  timestamp: number; // epoch ms
  price: number; // integer cents
  volume: number; // shares traded into this tick
}

/** Public document at `teams/{id}` (private fields readable only by the team/admin). */
export interface Team {
  id: string;
  name: string;
  cashBalance: number; // integer cents
  totalValue: number; // cash + mark-to-market holdings
  rank: number;
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
}

/** Document at `trades/{id}` (server-written). */
export interface Trade {
  id: string;
  teamId: string;
  companyId: string;
  side: OrderSide;
  quantity: number;
  price: number; // fill price, integer cents
  fee: number; // integer cents
  executedAt: number; // epoch ms
  cashAfter: number; // team cash after the fill
  sharesAfter: number; // team shares of this company after the fill
}

/** Public document at `news/{id}` (only after the event fires). */
export interface NewsEvent {
  id: string;
  headline: string;
  body: string;
  companyIds: string[];
  impact: NewsImpact;
  magnitude: number; // signed fractional price jump applied
  firedAt: number; // epoch ms
}

/** Entry within `leaderboard/current`. */
export interface LeaderboardEntry {
  teamId: string;
  name: string;
  totalValue: number;
  rank: number;
}

/** Public document at `leaderboard/current`. */
export interface Leaderboard {
  updatedAt: number;
  entries: LeaderboardEntry[];
}

/** Custom claims attached to a Firebase Auth user. */
export interface AuthClaims {
  role: Role;
  teamId?: string;
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
