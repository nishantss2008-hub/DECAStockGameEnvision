/**
 * Game-wide constants and tunable defaults.
 *
 * Money is represented as INTEGER CENTS of the themed currency to avoid
 * floating-point drift. 1,000,000 Ð is stored as 100_000_000.
 */

export const CURRENCY = { name: 'Doubloons', symbol: 'Ð' } as const;

/** Starting capital per team, in integer cents of Ð (= 1,000,000 Ð). */
export const STARTING_CAPITAL = 1_000_000_00;

/** Engine tick cadence. */
export const TICK_INTERVAL_MS = 30_000;

/** Total game length. */
export const GAME_LENGTH_MS = 48 * 60 * 60 * 1000;

/** Number of price ticks across the whole game (~5760). */
export const TOTAL_TICKS = Math.floor(GAME_LENGTH_MS / TICK_INTERVAL_MS);

/** Trading fee charged on each fill, in basis points (10 bps = 0.10%). */
export const ORDER_FEE_BPS = 10;

/** Pirate-themed market sectors. */
export const SECTORS = [
  'Shipping & Salvage',
  'Rum & Provisions',
  'Naval Arms',
  'Cartography & Navigation',
  'Treasure Banking',
  'Cursed Relics',
  'Tortuga Hospitality',
  'Parrot & Livestock',
  'Maps & Instruments',
  'Letters of Marque (Insurance)',
] as const;
export type Sector = (typeof SECTORS)[number];

/** Hidden company "fate" archetypes that drive intrinsic value over time. */
export const ARCHETYPES = [
  'compounder',
  'turnaround',
  'steady',
  'value_trap',
  'decliner',
] as const;
export type ArchetypeName = (typeof ARCHETYPES)[number];

/**
 * Price-engine parameters. Starting values; calibrated by the research
 * synthesis + the simulation harness (Task 7.1). All are fractions of price
 * unless noted.
 */
export const ENGINE_PARAMS = {
  /** Mean-reversion speed of realized price toward hidden intrinsic value. */
  kappa: 0.03,
  /** Base per-tick volatility (fraction of price), scaled per-company. */
  sigmaBase: 0.004,
  /** Price impact per unit of net order flow (see orderflow normalization). */
  lambda: 0.00002,
  /** Fraction of temporary order-flow impact retained each subsequent tick. */
  impactDecay: 0.7,
  /** Hard clamp on the absolute fractional price move in a single tick. */
  maxTickMove: 0.08,
} as const;

/** News impact categories. */
export const NEWS_IMPACTS = [
  'merger',
  'scandal',
  'storm',
  'discovery',
  'regulatory',
  'earnings',
  'management',
  'macro',
] as const;
export type NewsImpact = (typeof NEWS_IMPACTS)[number];

/** Email domain used to map a team name to a Firebase Auth credential. */
export const TEAM_EMAIL_DOMAIN = 'deca-pirates.game';
