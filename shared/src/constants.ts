/**
 * Game-wide constants and tunable defaults.
 *
 * Money is represented as INTEGER CENTS of the themed currency to avoid
 * floating-point drift. 1,000,000 Ð is stored as 100_000_000.
 */

export const CURRENCY = { name: 'Doubloons', symbol: 'Ð' } as const;

/** Default starting capital per team, in integer cents of Ð (= 1,000,000 Ð). */
export const DEFAULT_STARTING_CAPITAL = 100_000_000;

/** Default trading fee charged on each fill, in basis points (10 bps = 0.10%). */
export const DEFAULT_FEE_BPS = 10;

/** One hour in milliseconds. */
export const HOUR_MS = 3_600_000;

/** Game lengths the host may choose in the lobby (1h … 48h), in ms. */
export const GAME_LENGTH_OPTIONS_MS = [1, 2, 4, 8, 12, 24, 48].map((h) => h * HOUR_MS);

/** Default game length (48h). */
export const DEFAULT_GAME_LENGTH_MS = 48 * HOUR_MS;

/** Every game is split into this many trading sessions. */
export const SESSIONS_PER_GAME = 8;

/** Ticks stored per history chunk document. */
export const HISTORY_CHUNK = 120;

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

/** Host "predictability" knob: how strongly quality tilts expected returns. */
export const RESEARCH_EDGES = ['low', 'normal', 'high'] as const;
export type ResearchEdge = (typeof RESEARCH_EDGES)[number];

/** Whole-game expected log-return per unit of q, by research edge. */
export const EDGE_SPREAD: Record<ResearchEdge, number> = { low: 0.2, normal: 0.3, high: 0.4 };

/** News event categories. */
export const NEWS_TYPES = [
  'earnings',
  'merger',
  'discovery',
  'management',
  'regulatory',
  'scandal',
  'storm',
  'macro',
] as const;
export type NewsType = (typeof NEWS_TYPES)[number];

/** Letter grades, best first. */
export const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
export type Grade = (typeof GRADES)[number];

/** End-of-game reveal labels (signs of q and luck). */
export const REVEAL_LABELS = ['compounder', 'unlucky_gem', 'lucky_turnaround', 'decliner'] as const;
export type RevealLabel = (typeof REVEAL_LABELS)[number];

/**
 * Price-model parameters (spec §5.2). One game = one simulated trading year,
 * so all "per game" figures are annualized equivalents.
 */
export const MODEL = {
  tradingDaysPerGame: 252,
  mktDrift: 0.06,
  mktVol: 0.18,
  idioVolBase: 0.3,
  idioVolQuality: 0.05,
  idioVolJitter: 0.04,
  jumpVarPerGame: 0.0225,
  jumpUpBias: 0.3,
  maxJump: 0.25,
  macroJumpsMin: 1,
  macroJumpsMax: 2,
  macroJumpMin: 0.02,
  macroJumpMax: 0.08,
  garchAlphaDay: 0.12,
  garchPersistDay: 0.97,
  garchHMin: 0.1,
  garchHMax: 10,
  mispriceHalfLife: 0.05,
  mispriceSd: 0.03,
  impactY: 1.0,
  advDivisor: 150,
  impactVolRef: 0.3,
  maxImpact: 0.05,
  maxTickMove: 0.08,
  priceProtection: 0.02,
} as const;

/** Email domain used to map a team name to a Firebase Auth credential. */
export const TEAM_EMAIL_DOMAIN = 'deca-pirates.game';

/**
 * Canonical team-name → slug. MUST be identical on the server (which creates the
 * Auth user + teamId) and the web client (which derives the login email), or
 * teams with punctuation in their names can never log in. Single source of truth.
 *   "Anne's Revenge" → "anne-s-revenge"
 */
export function slugifyTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
