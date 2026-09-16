/**
 * Game-wide constants and tunable defaults.
 *
 * Money is represented as INTEGER CENTS of the themed currency to avoid
 * floating-point drift. 1,000,000 Ð is stored as 100_000_000.
 */

export const CURRENCY = { name: 'Doubloons', symbol: 'Ð' } as const;

/** Default starting capital per team, in integer cents of Ð (= 250,000 Ð). */
export const DEFAULT_STARTING_CAPITAL = 25_000_000;

/** Default trading fee charged on each fill, in basis points (10 bps = 0.10%). */
export const DEFAULT_FEE_BPS = 10;

/** One hour in milliseconds. */
export const HOUR_MS = 3_600_000;

/** One minute in milliseconds. */
export const MINUTE_MS = 60_000;

/**
 * Game lengths the host may choose in the lobby (10 … 30 minutes), in ms.
 *
 * A game runs at most 30 minutes (2026-09-15 requirement). With the 5s tick
 * floor in `deriveClock` that is 120–360 ticks and 8 sessions of 75–270s.
 */
export const GAME_LENGTH_OPTIONS_MS = [10, 15, 20, 30].map((m) => m * MINUTE_MS);

/** Default game length (30 minutes — the longest option). */
export const DEFAULT_GAME_LENGTH_MS = 30 * MINUTE_MS;

/**
 * Tick cadence to assume before a game's own settings have loaded (5 seconds).
 *
 * `deriveClock` clamps the interval to a 5s floor, and every length in
 * `GAME_LENGTH_OPTIONS_MS` (10–30 minutes) lands on that floor, so this is not
 * merely a default: it is the cadence of every game the host can start. Checked
 * by `shared-edge.test.ts`, so shortening the tick floor breaks the placeholder too.
 */
export const DEFAULT_TICK_INTERVAL_MS = 5_000;

/**
 * Host position-limit choices: the most of a crew's total account value one
 * company may hold after a buy. 1 means no limit.
 */
export const POSITION_LIMIT_OPTIONS = [1, 0.5, 0.35, 0.25] as const;

/** Default position limit (50% of account value per company). */
export const DEFAULT_MAX_POSITION_PCT = 0.5;

/** Every game is split into this many trading sessions. */
export const SESSIONS_PER_GAME = 8;

/** Ticks stored per history chunk document. */
export const HISTORY_CHUNK = 120;

/**
 * Every fund opens at exactly Ð100.00. A fund's divisor is chosen at seed time to make
 * that true (`price = Σ wᵢ·pᵢ / divisor`), the way a real index divisor works, so the
 * three funds start at the same round number and can be compared at a glance.
 */
export const FUND_OPEN_PRICE = 10_000;

/** Pirate-themed market sectors: five, each holding exactly three companies. */
export const SECTORS = [
  'Shipping & Salvage',
  'Provisions & Spice',
  'Naval Arms',
  'Cartography & Navigation',
  'Treasure Banking',
] as const;
export type Sector = (typeof SECTORS)[number];

/** Host "predictability" knob: how strongly quality tilts expected returns. */
export const RESEARCH_EDGES = ['low', 'normal', 'high'] as const;
export type ResearchEdge = (typeof RESEARCH_EDGES)[number];

/**
 * Whole-game expected log-return per unit of q, by research edge: a company with the
 * best hidden quality (qEff ≈ +1) is expected to end `spread` higher in log terms than
 * an average one, and the worst `spread` lower. It is the ONLY knob that decides how
 * much reading the statements pays.
 *
 * CALIBRATED FOR THE 15-COMPANY ROSTER (2026-09-16). `normal` is the smallest value at
 * which the best three companies beat the worst three in ~95% of seeds (measured over
 * 500 games × 10 seed families per candidate: 0.36 → 94.1%, 0.37 → 94.2%, 0.38 → 94.6%,
 * 0.39 → 95.0%, 0.40 → 95.4%). `low` and `high` keep the original 2:3:4 proportions.
 * The spread enters only the deterministic drift, so it moves NO other calibrated
 * property — volatility, tick autocorrelation and pairwise correlation are unchanged.
 *
 * A SMALLER ROSTER NEEDS A LARGER SPREAD for the same hit rate (25 names reached 95% at
 * 0.30). If the roster size changes again, re-run `server/test/calibration.test.ts`,
 * re-measure this sweep, and re-derive that test's Spearman and top-minus-bottom bands.
 */
export const EDGE_SPREAD: Record<ResearchEdge, number> = { low: 0.26, normal: 0.39, high: 0.52 };

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
 * Price-model parameters (spec §5.2, v2.1). One game = one simulated trading
 * year, so all "per game" figures are annualized equivalents.
 *
 * Impact is linear and transient (arbitrage-free with exponential decay):
 * λ = impactY·sigD/ADV per share, ADV = sharesOutstanding/advDivisor, and a
 * crew may trade at most intervalAdvCap·ADV shares of a company per tick
 * interval. The diffusion move per tick is clamped to ±tickMoveSds·√dt.
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
  /** OU mispricing layer; 0 = off (the code path stays). */
  mispriceSd: 0,
  /**
   * Almgren et al. 2005 linear coefficient 0.314·150^(1/4).
   *
   * DELIBERATE, decided 2026-09-16: with Ð250,000 of starting cash a crew's order
   * moves a price by well under a basis point, and `intervalAdvCap` below is
   * unreachable — capping out the cheapest company costs Ð0.74M–Ð3.4M, several
   * times a whole account. Both were measured end to end. The guardrails stay in
   * because they still bind if a host raises starting cash, but the game is
   * intentionally one where students read the market rather than push it.
   * Do NOT "fix" this by shrinking company size or raising starting cash without
   * asking — it was offered and declined.
   */
  impactY: 1.1,
  advDivisor: 150,
  impactVolRef: 0.3,
  /** Clamp |dv| ≤ tickMoveSds·√dt. */
  tickMoveSds: 3,
  /** qEff = surpriseWeight·q + (1 − surpriseWeight)·ξ, ξ ~ U[−1,1] seeded `surprise:${id}`. */
  surpriseWeight: 0.75,
  /** Max ADVs of shares per crew, per company, per tick interval. */
  intervalAdvCap: 1,
  priceProtection: 0.02,
} as const;

/**
 * Canonical team-name → slug. MUST be identical on the server (which stores the crew
 * under this id) and the web client (which signs in with the name a crew types), or
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
