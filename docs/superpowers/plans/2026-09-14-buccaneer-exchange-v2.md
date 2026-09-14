# Buccaneer Exchange v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Orchestration for this plan:** ultracode Workflow waves (see "Execution waves"). Parallel agents own disjoint files, and **agents never commit**: the orchestrator commits after each wave.

**Goal:** Replace the archetype-scripted price engine with a quality-weighted random market built on textbook models. Make every game feature work (configurable length, host settings, new game, crews, history, activity, reveal). Rebuild the web UI in the Black Pearl brokerage design.

**Architecture:** The TypeScript monorepo stays: `shared/` holds pure contracts and math, `server/` is the Fastify authority plus Firebase Admin, and `web/` is React/Vite. New pure modules (`shared/quality.ts`, `shared/estimate.ts`, `shared/clock.ts`, `server/engine/model.ts`, `server/seed/generateMarket.ts`) carry all math and are unit-tested without I/O. The IO layers (engine loop, services, routes, hooks) are thin. The web UI is rebuilt from the canvas artboards in `docs/design/canvas/`.

**Tech Stack:**
- Node ≥20, TypeScript 5.5, Fastify 4, firebase-admin 12, Firestore/Auth emulators (Java 21)
- React 18, Vite 5, react-router 6, lucide-react (icons, ISC), d3-hierarchy (treemap layout, ISC)
- vitest 2, simple-statistics (devDependency for calibration tests, ISC), @firebase/rules-unit-testing

**Spec:** `docs/superpowers/specs/2026-09-14-buccaneer-exchange-v2-design.md`. Design: `docs/design/BRIEF.md` plus `docs/design/canvas/*.dc.html`. Engine research prototype: `/private/tmp/claude-501/-Users-nishantshah-Desktop-Nishant-s-Claude-Obsidian-Projects-DECA-Envision-Stock-Game/9493fbfd-3b09-4fef-8fa6-b39526fe99b5/scratchpad/engine-math/model.ts`.

## Global Constraints

**Money, math and determinism**
- Money is INTEGER CENTS everywhere (1,000,000 Ð = `100_000_000`). Round only at the boundary.
- All randomness is seeded: `Prng`/`deriveSeed` from `server/src/lib/prng.ts`. `Math.random()` is banned in engine, seed and news code.
- Per-tick labels are exactly `mkt:${t}` and `co:${id}:${t}`. Draw `z` then `zO`, in that order. Jump schedule label is `jumps:${id}`, macro label is `macro`.
- Clock: `tickIntervalMs = clamp(round(gameLengthMs/720), 5000, 30000)`; `totalTicks = floor(gameLengthMs/tickIntervalMs)`; `sessionTicks = max(1, round(totalTicks/8))`; `HISTORY_CHUNK = 120`.
- Game length options (ms): 1h, 2h, 4h, 8h, 12h, 24h, 48h; default 48h. Fee default 10 bps. Starting capital default `100_000_000`.
- `researchEdge`: `low | normal | high` → quality spread `0.20 | 0.30 | 0.40`.

**Security and IP**
- Clients never write Firestore. The hidden future (`_schedule`, `_engine`, `_teamStats`, `_auth`, `logs`) is never readable by clients, and quality scores are never sent to crews before `phase === 'ended'`.
- `server/src/firebase.ts` must NOT load a service account when `FIRESTORE_EMULATOR_HOST` or `FIREBASE_AUTH_EMULATOR_HOST` is set. Tests never touch the real `decastockenvision` project.
- IP: no "Pirates of the Caribbean", film character names ("Barbossa", "Sparrow"), film ship names ("Black Pearl") or EITC marks in UI copy, code identifiers, CSS class names or sample data. The theme is called `midnight` in code. Roster `barbossa` becomes `bartholomew` / "Bartholomew Provisions" / `BRTH`.

**Copy and design**
- Plain finance labels; pirate flavor only in secondary copy (BRIEF §5). No alcohol words in UI copy (roster company and sector names are data). True minus `−` (U+2212). Signed values show sign + inline SVG caret + color; never `▲▼` glyphs (missing from the web fonts).
- Fonts:
  - Cinzel Decorative 700: wordmark and ceremonies.
  - Cormorant SC 700: eyebrows ≥13px, never numbers.
  - IBM Plex Sans with `font-variant-numeric: tabular-nums lining-nums`: everything else.
  - IBM Plex Mono 500: tickers and order ids.
  - Mobile tab labels: Plex Sans 600.
- Tokens: BRIEF §2 exactly. The order-filled seal is brass (`#C9982F`, monogram `#4A3509`); crimson `#8E1F1A` is reserved for game-over and destructive dialogs.
- Accessibility:
  - AA text contrast.
  - Focus ring 2px `#5FA39A` with 2px offset.
  - `aria-live="polite"` only for order results and phase changes.
  - Honor `prefers-reduced-motion`.
  - No auto-scrolling marquee.
- Beginner-first comprehension (BRIEF §9, spec §10b): plain label first, finance term second. Every metric has an `InfoTip` from `lib/glossary.ts`. Research/key-stat rows use `ExplainRow` with a sector average and never grade a company. No unexplained acronyms. Sentences are short (grade 8–9 reading level).
- Icons: `lucide-react` (strokeWidth 1.75). Custom SVG only for ornaments (CompassRose, WaxSeal, Medallion) and gain/loss carets.

**Process**
- Agents must NOT modify `shared/` after Task 1 is committed (frozen contract). If blocked, stop and report.
- Agents must NOT run `git commit`, `npm install` (dependencies are installed in Task 1) or `firebase deploy`.

---

## File Structure

```
shared/src/
  constants.ts      MODIFY  currency, defaults, sectors, MODEL params, EDGE_SPREAD, clock constants, news types
  types.ts          REWRITE all v2 domain types
  schemas.ts        REWRITE zod request schemas
  clock.ts          CREATE  deriveClock, tickAt, session/chunk helpers, rangeTabs
  mathx.ts          CREATE  clamp, normCdf, invNormCdf (Acklam), rankZ, spearman
  quality.ts        CREATE  computeQualityScores (AQR-style), gradeFor
  estimate.ts       CREATE  feeFor, marketImpact, fillPrice, estimateOrder, maxAffordableShares, sharesForAmount
  index.ts          MODIFY  re-export all
server/src/
  firebase.ts       MODIFY  emulator guard
  config.ts         keep
  lib/prng.ts money.ts logger.ts password.ts secret.ts   keep (money.feeFor delegates to shared)
  engine/model.ts   CREATE  pure per-tick math, derived params, GARCH/OU/impact, companyStep
  engine/news.ts    CREATE  pure news/jump schedule + headlines
  engine/state.ts   REWRITE EngineState types, init, serialize, recoverFromPrices
  engine/flow.ts    CREATE  FlowBook (net + gross volume per company)
  engine/loop.ts    REWRITE GameEngine (IO)
  engine/archetypes.ts intrinsic.ts orderflow.ts engine.ts   DELETE
  news/schedule.ts scheduler.ts   DELETE
  seed/roster.ts    MODIFY  BRTH rename, drop emoji field
  seed/generateMarket.ts CREATE pure market generator
  seed/generateFundamentals.ts DELETE
  seed/seedFirestore.ts reset.ts  REWRITE thin CLIs over services/market
  services/market.ts      CREATE createMarket, clearDynamicData
  services/leaderboard.ts REWRITE recomputeLeaderboard, finalizeLeaderboard (team history, sparks, research grade)
  services/trading.ts     REWRITE executeOrder (slippage, idempotency, price protection, order docs)
  services/crews.ts       CREATE createCrew, resetCrewPassword, setCrewTrading, removeCrew
  routes/admin.ts orders.ts health.ts   REWRITE; auth.ts keep
server/test/
  core.test.ts            MODIFY keep prng/money tests only
  clock.test.ts quality.test.ts estimate.test.ts generateMarket.test.ts model.test.ts news.test.ts calibration.test.ts trading.test.ts   CREATE/REWRITE
  sim.test.ts fundamentals.test.ts   DELETE
  integration/engine.int.test.ts rules.int.test.ts   CREATE
server/vitest.config.ts vitest.int.config.ts   CREATE
firestore.rules   MODIFY
package.json (root) scripts dev:local, test:integration   MODIFY
scripts/dev-local.sh   CREATE
web/src/
  theme/tokens.css base.css   REWRITE (pirate.css DELETE)
  lib/format.ts api.ts auth.tsx orderId.ts watchlist.ts   REWRITE/CREATE
  hooks/*   REWRITE (see Task 7)
  components/ui/*  charts/*  shell/*  trade/*  portfolio/*  market/*  research/*  standings/*  admin/*   CREATE
  components/*.tsx (old)   DELETE
  pages/*   REWRITE; pages/admin/* CREATE
  App.tsx main.tsx   REWRITE
docs/  QUICKSTART.md RUNBOOK.md DEPLOY.md README.md research-findings.md   MODIFY
```

## Execution waves

| Wave | Tasks (parallel within a wave) | Gate before next wave |
|---|---|---|
| 0 | T1 shared contracts + deps + roster rename | `npm run build:shared`, `npm test` pass; commit |
| 1 | T2 engine model/news/state/flow · T3 generateMarket · T7 web theme + ui primitives + charts + lib + hooks | server tests + web typecheck pass; commit |
| 2 | T4 engine loop + market service + leaderboard + CLIs · T5 trading + crews + routes · T8 web shell + routing + Login | server typecheck/tests + web typecheck/build pass; commit |
| 3 | T6 rules + emulator integration + dev:local · T9 Summary/Positions/Activity · T10 Trade/ticket/research tabs · T11 Markets/Research/News · T12 Standings/Results · T13 Host console · T13b Learn guide | all checks + integration pass; commit |
| 4 | T14 docs · adversarial review workflow + fixes · Playwright E2E vs canvas | final verification; commit |

---

### Task 1: Shared v2 contracts, math helpers, dependencies

**Files:**
- Modify: `shared/src/constants.ts`, `shared/src/index.ts`
- Rewrite: `shared/src/types.ts`, `shared/src/schemas.ts`
- Create: `shared/src/clock.ts`, `shared/src/mathx.ts`, `shared/src/quality.ts`, `shared/src/estimate.ts`
- Modify: `server/src/seed/roster.ts` (BRTH rename; remove `emoji`)
- Test: `server/test/clock.test.ts`, `server/test/quality.test.ts`, `server/test/estimate.test.ts`
- Deps: `npm i -w @deca/web lucide-react d3-hierarchy && npm i -D -w @deca/web @types/d3-hierarchy vitest && npm un -w @deca/web recharts && npm i -D -w @deca/server simple-statistics`

**Interfaces (Produces, frozen after this task):**

```ts
// constants.ts
export const CURRENCY = { name: 'Doubloons', symbol: 'Ð' } as const;
export const DEFAULT_STARTING_CAPITAL = 100_000_000;
export const DEFAULT_FEE_BPS = 10;
export const HOUR_MS = 3_600_000;
export const GAME_LENGTH_OPTIONS_MS = [1, 2, 4, 8, 12, 24, 48].map((h) => h * HOUR_MS);
export const DEFAULT_GAME_LENGTH_MS = 48 * HOUR_MS;
export const SESSIONS_PER_GAME = 8;
export const HISTORY_CHUNK = 120;
export const SECTORS = [/* unchanged 10 sectors */] as const; export type Sector = (typeof SECTORS)[number];
export const RESEARCH_EDGES = ['low', 'normal', 'high'] as const; export type ResearchEdge = (typeof RESEARCH_EDGES)[number];
export const EDGE_SPREAD: Record<ResearchEdge, number> = { low: 0.2, normal: 0.3, high: 0.4 };
export const NEWS_TYPES = ['earnings','merger','discovery','management','regulatory','scandal','storm','macro'] as const; export type NewsType = (typeof NEWS_TYPES)[number];
export const GRADES = ['A','B','C','D','F'] as const; export type Grade = (typeof GRADES)[number];
export const REVEAL_LABELS = ['compounder','unlucky_gem','lucky_turnaround','decliner'] as const; export type RevealLabel = (typeof REVEAL_LABELS)[number];
export const MODEL = {
  tradingDaysPerGame: 252, mktDrift: 0.06, mktVol: 0.18,
  idioVolBase: 0.30, idioVolQuality: 0.05, idioVolJitter: 0.04,
  jumpVarPerGame: 0.0225, jumpUpBias: 0.30, maxJump: 0.25,
  macroJumpsMin: 1, macroJumpsMax: 2, macroJumpMin: 0.02, macroJumpMax: 0.08,
  garchAlphaDay: 0.12, garchPersistDay: 0.97, garchHMin: 0.1, garchHMax: 10,
  mispriceHalfLife: 0.05, mispriceSd: 0.03,
  impactY: 1.0, advDivisor: 150, impactVolRef: 0.30, maxImpact: 0.05,
  maxTickMove: 0.08, priceProtection: 0.02,
} as const;
export const TEAM_EMAIL_DOMAIN = 'deca-pirates.game';
export function slugifyTeamName(name: string): string; // unchanged

// clock.ts
export interface GameClock { gameLengthMs: number; tickIntervalMs: number; totalTicks: number; sessionTicks: number; hours: number; }
export function deriveClock(gameLengthMs: number): GameClock;
export function tickAt(now: number, startAt: number | null, clock: GameClock): number; // clamp [0,totalTicks]
export function sessionStartTick(tick: number, sessionTicks: number): number;          // floor(t/s)*s
export function sessionNumber(tick: number, sessionTicks: number): number;             // 1-based, max SESSIONS_PER_GAME
export function chunkOf(tick: number): number;                                         // floor(t/HISTORY_CHUNK)
export interface RangeTab { key: string; label: string; ticks: number | null }        // null = whole game
export function rangeTabs(clock: GameClock): RangeTab[];
// candidates 5M,15M,1H,6H,24H filtered to ≤ gameLength/2, keep last 3, then {key:'all',label:'All',ticks:null}

// mathx.ts
export function clamp(x: number, lo: number, hi: number): number;
export function normCdf(x: number): number;          // Abramowitz-Stegun 7.1.26, |err|<1.5e-7
export function invNormCdf(p: number): number;       // Acklam; p in (0,1)
export function rankZ(values: Array<number | undefined>): number[]; // AQR rank-z, undefined ranks worst, ties avg
export function spearman(a: number[], b: number[]): number;

// quality.ts
export interface QualityInput {
  id: string; sector: Sector;
  grossProfit: number; totalAssets: number; roe: number; operatingCashFlow: number; netIncome: number;
  debtToEquity: number; currentRatio: number; operatingIncome: number; marketCap: number; totalLiabilities: number; revenue: number;
  peRatio: number; evToEbitda: number; psRatio: number;
  industryGrowthRate: number; history: { revenue: number; netIncome: number; eps: number }[]; // oldest→newest, length 4
}
export interface SectorRefs { pe: number; evEbitda: number; ps: number }
export interface QualityPillars { prof: number; grow: number; safe: number; val: number }
export interface QualityResult { id: string; score: number; q: number; grade: Grade; pillars: QualityPillars }
export function computeQualityScores(inputs: QualityInput[], refs: Record<string, SectorRefs>): QualityResult[]; // same order as inputs
export function gradeFor(rankIndex0: number, n: number): Grade;   // quintiles: top → 'A'

// estimate.ts
export function feeFor(notionalCents: number, feeBps: number): number;                   // round(n*bps/10000)
export function marketImpact(shares: number, beta: number, sharesOutstanding: number): number;
//   sigDay = sqrt(beta²·mktVol² + impactVolRef²)/sqrt(252); adv = sharesOutstanding/advDivisor; min(maxImpact, impactY·sigDay·sqrt(shares/adv))
export function fillPrice(side: OrderSide, lastPrice: number, impact: number): number;   // max(1, round(last·exp(±impact/2)))
export interface EstimateInput { side: OrderSide; quantity: number; lastPrice: number; beta: number; sharesOutstanding: number; feeBps: number; cash: number; sharesOwned: number; avgCost: number; totalValue: number }
export type EstimateError = 'bad_quantity' | 'insufficient_funds' | 'insufficient_shares';
export interface OrderEstimate { impact: number; impactBps: number; price: number; notional: number; fee: number; total: number; cashAfter: number; sharesAfter: number; avgCostAfter: number; positionValueAfter: number; pctOfAccountAfter: number; maxBuyShares: number; valid: boolean; error?: EstimateError; shortfall?: number }
export function maxAffordableShares(cash: number, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number; // binary search
export function sharesForAmount(amountCents: number, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number;
export function estimateOrder(i: EstimateInput): OrderEstimate;
//   buy: total = notional+fee, cashAfter = cash−total, avgCostAfter = round((owned·avg + notional)/(owned+q)), shortfall = total−cash when invalid
//   sell: total = notional−fee, cashAfter = cash+total, avgCostAfter = sharesAfter>0 ? avg : 0
//   pctOfAccountAfter = sharesAfter·lastPrice / (totalValue − fee)
```

```ts
// types.ts (complete)
export type Phase = 'lobby' | 'live' | 'paused' | 'ended';
export type OrderSide = 'buy' | 'sell';
export type Role = 'team' | 'admin';
export interface GameSettings { gameLengthMs: number; startingCapital: number; feeBps: number; researchEdge: ResearchEdge; currency: { name: string; symbol: string } }
export interface GameState extends GameSettings {
  phase: Phase; startAt: number | null; endAt: number | null; pausedAt: number | null; endedAt: number | null;
  currentTick: number; tickIntervalMs: number; totalTicks: number; sessionTicks: number;
  serverTime: number; lastTickAt: number | null; marketCreatedAt: number;
}
export interface CompanyReveal { quality: number; q: number; grade: Grade; pillars: QualityPillars; fairValue: number; expectedReturn: number; actualReturn: number; luck: number; label: RevealLabel }
export interface Company {
  id: string; name: string; ticker: string; sector: Sector; description: string;
  currentPrice: number; startPrice: number; sessionOpen: number; sessionHigh: number; sessionLow: number; sessionVolume: number;
  voyageHigh: number; voyageLow: number; sessionChange: number; voyageChange: number;
  sharesOutstanding: number; marketCap: number; beta: number; adv: number; lastTick: number;
  reveal?: CompanyReveal;
}
export interface ManagementMember { name: string; role: string; bio: string; tenureYears: number }
export interface IndustryAnalysis { sector: Sector; tam: number; growthRate: number; competitivePosition: string; notes: string }
export interface FinancialPeriod { period: string; revenue: number; netIncome: number; eps: number }
export interface Fundamentals { /* all v1 fields unchanged */ beta: number }
export interface HistoryChunk { chunk: number; startTick: number; prices: number[]; volumes: number[] }
export interface ValueChunk { chunk: number; startTick: number; values: number[] }
export interface IndexQuote { value: number; open: number; sessionOpen: number; change: number; sessionChange: number }
export interface MarketBreadth { advancers: number; decliners: number; unchanged: number; voyageHighs: number; voyageLows: number; sessionVolume: number; advancingVolume: number; decliningVolume: number }
export interface MarketSummary { lastTick: number; updatedAt: number; composite: IndexQuote; sectors: Record<string, IndexQuote>; breadth: MarketBreadth }
export interface Team { id: string; name: string; cashBalance: number; totalValue: number; rank: number; realizedPnl: number; feesPaid: number; tradeCount: number; tradingDisabled: boolean; sessionOpenValue: number; holdingsCount: number; createdAt: number }
export interface Holding { companyId: string; shares: number; avgCost: number }
export interface OrderRequest { companyId: string; side: OrderSide; quantity: number; clientOrderId: string; quotedPrice?: number }
export interface Trade { id: string; teamId: string; companyId: string; side: OrderSide; quantity: number; price: number; lastPrice: number; impactBps: number; fee: number; realizedPnl: number; executedAt: number; tick: number; cashAfter: number; sharesAfter: number; clientOrderId: string }
export type OrderStatus = 'filled' | 'rejected';
export interface OrderRecord { id: string; teamId: string; clientOrderId: string; companyId: string; side: OrderSide; quantity: number; status: OrderStatus; code?: string; reason?: string; tradeId?: string; createdAt: number; tick: number }
export interface NewsEvent { id: string; headline: string; body: string; companyIds: string[]; type: NewsType; sentiment: 'bullish' | 'bearish'; source: 'scheduled' | 'macro' | 'host'; tick: number; firedAt: number; priceAtFire: Record<string, number> }
export interface LeaderboardEntry { teamId: string; name: string; totalValue: number; rank: number; prevRank: number; returnPct: number; sessionChangePct: number; cashPct: number; holdings: number; spark: number[] }
export interface FinalEntry extends LeaderboardEntry { researchScore: number; researchGrade: Grade }
export interface Leaderboard { updatedAt: number; tick: number; entries: LeaderboardEntry[]; final?: { endedAt: number; entries: FinalEntry[] } }
export interface AuthClaims { role: Role; teamId?: string }
export interface ApiError { error: string; message: string }
export interface OrderResult { trade: Trade }
export interface AdminMarketRow { companyId: string; ticker: string; name: string; sector: Sector; price: number; sessionChange: number; sessionVolume: number; netFlow: number; quality: number; q: number; grade: Grade; fairValue: number; deviation: number }
export interface ScheduledNewsView { tick: number; companyIds: string[]; type: NewsType; sentiment: 'bullish' | 'bearish'; headline: string; fired: boolean; source: 'scheduled' | 'macro' | 'host' }
export interface HealthResponse { ok: true; phase: Phase; tick: number; totalTicks: number; serverTime: number; lastTickAt: number | null; ticksBehind: number }
```

```ts
// schemas.ts
export const orderRequestSchema = z.object({ companyId: z.string().min(1).max(64), side: z.enum(['buy','sell']), quantity: z.number().int().positive().max(100_000_000), clientOrderId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), quotedPrice: z.number().int().positive().optional() });
export const createTeamSchema = z.object({ name: z.string().trim().min(1).max(60), password: z.string().min(4).max(100) });
export const loginSchema = z.object({ name: z.string().min(1).max(60), password: z.string().min(1).max(100) });
export const resetPasswordSchema = z.object({ password: z.string().min(4).max(100) });
export const tradingToggleSchema = z.object({ enabled: z.boolean() });
export const settingsSchema = z.object({ gameLengthMs: z.number().int().refine((v) => GAME_LENGTH_OPTIONS_MS.includes(v)).optional(), startingCapital: z.number().int().min(1_000_00).max(1_000_000_000_00).optional(), feeBps: z.number().int().min(0).max(200).optional(), researchEdge: z.enum(RESEARCH_EDGES).optional(), currencyName: z.string().min(1).max(40).optional(), currencySymbol: z.string().min(1).max(8).optional() });
export const newGameSchema = z.object({ keepCrews: z.boolean() });
export const fireNewsSchema = z.object({ companyIds: z.array(z.string().min(1)).min(1).max(25), type: z.enum(NEWS_TYPES), magnitude: z.number().min(-0.5).max(0.5).refine((m) => m !== 0), headline: z.string().trim().min(1).max(200), body: z.string().max(2000).default('') });
// export inferred Input types: OrderRequestInput, CreateTeamInput, LoginInput, ResetPasswordInput, TradingToggleInput, SettingsInput, NewGameInput, FireNewsInput
```

- [ ] **Step 1: Write failing tests** — `server/test/clock.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveClock, tickAt, sessionStartTick, sessionNumber, chunkOf, rangeTabs, HOUR_MS } from '@deca/shared';
describe('clock', () => {
  it('derives tick interval, totals and sessions per game length', () => {
    expect(deriveClock(48 * HOUR_MS)).toMatchObject({ tickIntervalMs: 30_000, totalTicks: 5760, sessionTicks: 720, hours: 48 });
    expect(deriveClock(1 * HOUR_MS)).toMatchObject({ tickIntervalMs: 5_000, totalTicks: 720, sessionTicks: 90 });
    expect(deriveClock(2 * HOUR_MS).tickIntervalMs).toBe(10_000);
    expect(deriveClock(12 * HOUR_MS).tickIntervalMs).toBe(30_000);
  });
  it('computes tick from wall clock, clamped', () => {
    const c = deriveClock(HOUR_MS);
    expect(tickAt(1_000 + 12_500, 1_000, c)).toBe(2);
    expect(tickAt(0, 1_000, c)).toBe(0);
    expect(tickAt(1e12, 0, c)).toBe(720);
    expect(tickAt(5, null, c)).toBe(0);
  });
  it('session and chunk helpers', () => {
    expect(sessionStartTick(1284, 720)).toBe(720);
    expect(sessionNumber(1284, 720)).toBe(2);
    expect(sessionNumber(5760, 720)).toBe(8);
    expect(chunkOf(119)).toBe(0); expect(chunkOf(120)).toBe(1);
  });
  it('range tabs scale with game length and always end with All', () => {
    expect(rangeTabs(deriveClock(48 * HOUR_MS)).map((r) => r.label)).toEqual(['1H', '6H', '24H', 'All']);
    expect(rangeTabs(deriveClock(1 * HOUR_MS)).map((r) => r.label)).toEqual(['5M', '15M', 'All']);
    expect(rangeTabs(deriveClock(48 * HOUR_MS))[0]).toEqual({ key: '1h', label: '1H', ticks: 120 });
  });
});
```
`server/test/quality.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rankZ, computeQualityScores, gradeFor, spearman, invNormCdf, normCdf, type QualityInput } from '@deca/shared';
const mk = (id: string, k: number): QualityInput => ({
  id, sector: 'Naval Arms', grossProfit: 400 * k, totalAssets: 1000, roe: 0.05 * k, operatingCashFlow: 90 * k, netIncome: 60 * k,
  debtToEquity: 2.5 / k, currentRatio: 0.5 * k, operatingIncome: 80 * k, marketCap: 5000, totalLiabilities: 600, revenue: 900 + 50 * k,
  peRatio: 30 - k, evToEbitda: 20 - k, psRatio: 5 - 0.3 * k, industryGrowthRate: 0.01 * k,
  history: [0, 1, 2, 3].map((y) => ({ revenue: 800 * (1 + 0.02 * k) ** y, netIncome: 50 * k * (1 + 0.02 * k) ** y, eps: 100 * k * (1 + 0.02 * k) ** y })),
});
describe('mathx', () => {
  it('rankZ is mean 0 sd 1 and spans ±1.664 for N=25', () => {
    const z = rankZ(Array.from({ length: 25 }, (_, i) => i));
    expect(Math.max(...z)).toBeCloseTo(1.664, 3); expect(Math.min(...z)).toBeCloseTo(-1.664, 3);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
  });
  it('rankZ averages ties and ranks undefined worst', () => {
    const z = rankZ([5, 5, undefined, 9]);
    expect(z[0]).toBeCloseTo(z[1]!, 12); expect(z[2]).toBeLessThan(z[0]!); expect(z[3]).toBeGreaterThan(z[0]!);
  });
  it('normal cdf helpers invert each other', () => {
    for (const p of [0.01, 0.2, 0.5, 0.9, 0.999]) expect(normCdf(invNormCdf(p))).toBeCloseTo(p, 5);
  });
  it('spearman of identical order is 1', () => { expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12); });
});
describe('quality score', () => {
  const inputs = Array.from({ length: 10 }, (_, i) => mk(`c${i}`, i + 1));
  const refs = { 'Naval Arms': { pe: 18, evEbitda: 12, ps: 2.5 } };
  const res = computeQualityScores(inputs, refs);
  it('keeps input order and maps q into (-1,1)', () => {
    expect(res.map((r) => r.id)).toEqual(inputs.map((i) => i.id));
    for (const r of res) { expect(r.q).toBeGreaterThan(-1); expect(r.q).toBeLessThan(1); }
  });
  it('better fundamentals score higher', () => {
    expect(res[9]!.score).toBeGreaterThan(res[0]!.score);
    expect(res[9]!.grade).toBe('A'); expect(res[0]!.grade).toBe('F');
  });
  it('grades by quintile', () => { expect(gradeFor(0, 25)).toBe('A'); expect(gradeFor(24, 25)).toBe('F'); expect(gradeFor(12, 25)).toBe('C'); });
});
```
`server/test/estimate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { feeFor, marketImpact, fillPrice, estimateOrder, maxAffordableShares, sharesForAmount } from '@deca/shared';
const base = { lastPrice: 8412, beta: 1, sharesOutstanding: 242_000_000, feeBps: 10, cash: 31_240_018, sharesOwned: 3000, avgCost: 7350, totalValue: 108_421_955 };
describe('estimate', () => {
  it('fee is round-half-up bps', () => { expect(feeFor(4_206_000, 10)).toBe(4206); });
  it('impact follows the square-root law and caps at 5%', () => {
    const small = marketImpact(83_000, 1, 8_000_000);
    expect(small).toBeGreaterThan(0.02); expect(small).toBeLessThan(0.035);
    expect(marketImpact(1e9, 1, 8_000_000)).toBe(0.05);
    expect(marketImpact(0, 1, 8_000_000)).toBe(0);
  });
  it('fill price applies half the impact against the trader', () => {
    expect(fillPrice('buy', 10_000, 0.02)).toBe(Math.round(10_000 * Math.exp(0.01)));
    expect(fillPrice('sell', 10_000, 0.02)).toBe(Math.round(10_000 * Math.exp(-0.01)));
  });
  it('estimates a buy', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 500 });
    expect(e.valid).toBe(true);
    expect(e.notional).toBe(500 * e.price);
    expect(e.total).toBe(e.notional + e.fee);
    expect(e.cashAfter).toBe(base.cash - e.total);
    expect(e.sharesAfter).toBe(3500);
  });
  it('flags insufficient funds with shortfall and max', () => {
    const e = estimateOrder({ ...base, side: 'buy', quantity: 4000 });
    expect(e.valid).toBe(false); expect(e.error).toBe('insufficient_funds');
    expect(e.shortfall).toBe(e.total - base.cash);
    const max = maxAffordableShares(base.cash, base.lastPrice, 1, base.sharesOutstanding, 10);
    expect(estimateOrder({ ...base, side: 'buy', quantity: max }).valid).toBe(true);
    expect(estimateOrder({ ...base, side: 'buy', quantity: max + 1 }).valid).toBe(false);
  });
  it('rejects overselling and bad quantity; sells credit notional minus fee', () => {
    expect(estimateOrder({ ...base, side: 'sell', quantity: 3001 }).error).toBe('insufficient_shares');
    expect(estimateOrder({ ...base, side: 'sell', quantity: 0 }).error).toBe('bad_quantity');
    const s = estimateOrder({ ...base, side: 'sell', quantity: 3000 });
    expect(s.total).toBe(s.notional - s.fee); expect(s.avgCostAfter).toBe(0);
  });
  it('converts an amount to whole affordable shares', () => {
    const n = sharesForAmount(500_000, 8412, 1, 242_000_000, 10);
    expect(n).toBe(59);
  });
});
```
- [ ] **Step 2:** `npm run build:shared` fails, or the tests fail on missing exports. Confirm.
- [ ] **Step 3: Implement** the files exactly per the Interfaces block.
  - `invNormCdf`: Acklam coefficients.
  - `rankZ`: sort indices, then average ranks for ties; undefined values get rank 0.5 below the minimum (i.e. treated as −∞ and tied among themselves).
  - `computeQualityScores`: spec §3 (PROF 4 items, GROW 3, SAFE 4, VAL 3). Use `refs[sector]` or else the universe median multiples. `q = −1 + 2·(rank(s)+0.5)/N` with 0-based rank ascending.
  - `gradeFor(rankIndex0, n)`: rankIndex0 counts from the best (0 = best), quintile index `floor(5·rankIndex0/n)` → `['A','B','C','D','F']`.
  - Roster: rename `barbossa` to `{ id:'bartholomew', name:'Bartholomew Provisions', ticker:'BRTH', sector:'Rum & Provisions' }` and delete `emoji` from all entries and the `RosterEntry` type.
- [ ] **Step 4:** Run `npm run build:shared && npm test -w @deca/server -- clock quality estimate`. Expected PASS. The old tests importing deleted constants (`TOTAL_TICKS`, `ENGINE_PARAMS`) will fail: delete `server/test/sim.test.ts` and `server/test/fundamentals.test.ts`, and trim `core.test.ts` to prng + money only. Server `tsc` may fail on old engine files; that is expected until Wave 1–2 (the gate for Wave 0 is shared build + the three new test files).
- [ ] **Step 5:** Install deps (command above). Orchestrator commits: `feat(shared): v2 contracts — clock, quality score, order estimate`.

---

### Task 1b: Contract amendments from the quant review (orchestrator, applied after Task 1)

**Files:** `shared/src/types.ts`, `shared/src/constants.ts`, `shared/src/schemas.ts`, `shared/src/estimate.ts`, `shared/src/quality.ts`; test `server/test/estimate.test.ts`, `server/test/quality.test.ts`.

1. **Quality score (spec §3 revised):**
   - PROF uses ROA instead of ROE.
   - SAFE drops Altman-lite (3 items).
   - VAL drops P/S; `pe` is WORST when `netIncome ≤ 0` and `evToEbitda` is WORST when `operatingIncome ≤ 0`.
   - `QualityInput` keeps its fields (superset) so callers don't change.
2. **Position limit:**
   - `constants.ts`: `POSITION_LIMIT_OPTIONS = [1, 0.5, 0.35, 0.25] as const`, `DEFAULT_MAX_POSITION_PCT = 0.5`.
   - `GameSettings.maxPositionPct: number`.
   - `settingsSchema.maxPositionPct: z.number().refine(v => POSITION_LIMIT_OPTIONS.includes(v)).optional()`.
   - `EstimateInput.maxPositionPct?: number` (default 1).
   - `EstimateError` adds `'position_limit'`.
   - `estimateOrder` flags a buy where `sharesAfter·lastPrice > maxPositionPct·(totalValue − fee)`, unless `maxPositionPct ≥ 1`.
   - `OrderEstimate.maxBuyShares` respects both cash and the limit.
   - New export `maxSharesUnderLimit(i: EstimateInput): number`.
   - Server `TradeError` code adds `'position_limit'` (Task 5 `computeFill` receives `maxPositionPct` and `totalValue`).
3. **Tests added:**
   - `estimateOrder({...base, side:'buy', quantity: 1000, maxPositionPct: 0.25})` → `position_limit`.
   - The same with `maxPositionPct: 1` → valid when cash allows.
   - `maxBuyShares` ≤ the limit shares.
   - Quality: a loss-maker (netIncome −10, peRatio 0) has a VAL pillar below every profitable company.

### Task 1c: Engine-math amendments from the final quant review (orchestrator, applied with 1b)

Why: the review showed that the square-root impact rule plus per-order slippage can be gamed.
Splitting one order into many earns +2.2%; accumulating over 10 ticks and dumping earns +10.5%.
Theory backs this: exponential decay is only arbitrage-free with **linear** impact (Gatheral
2010; Huberman–Stanzl 2004). Other findings folded in here:
- the fixed 0.08 clamp distorted 1h games
- the short-lived mispricing (OU) layer added nothing
- portfolio-level outcomes were nearly deterministic without a hidden surprise
- final marks could be pumped in the last interval

**Files:** `shared/src/constants.ts`, `shared/src/types.ts`, `shared/src/estimate.ts`; test `server/test/estimate.test.ts`.

1. **`MODEL` changes:**
   - remove `maxImpact` and `maxTickMove`
   - `impactY: 1.10` (Almgren et al. 2005 linear coefficient `0.314·150^(1/4)`)
   - add `tickMoveSds: 3` (clamp `|dv| ≤ 3·√dt`)
   - `mispriceSd: 0` (OU layer off by default; the code path stays)
   - `surpriseWeight: 0.75` (`qEff = 0.75·q + 0.25·ξ`, `ξ ~ U[−1,1]` seeded `surprise:${id}`)
   - `intervalAdvCap: 1` (max 1 ADV of shares per crew, per company, per tick interval)
2. **`CompanyReveal`** adds `qEff: number; surprise: number` (`surprise = ξ`).
   **`EstimateError`** adds `'interval_limit'`.
3. **`estimate.ts`:** replace `marketImpact`/`fillPrice` with:
```ts
export function impactLambda(beta: number, sharesOutstanding: number): number; // Y·sigD/ADV per share (log units); sigD = sqrt(beta²·mktVol² + impactVolRef²)/sqrt(252); ADV = sharesOutstanding/advDivisor
export function intervalShareCap(sharesOutstanding: number): number;          // floor(intervalAdvCap·sharesOutstanding/advDivisor)
export function estFillPrice(side: OrderSide, lastPrice: number, lambda: number, quantity: number, pendingNet?: number): number; // UNROUNDED cents: last·exp(λ·(pendingNet + s·q/2)), s = +1 buy / −1 sell
export function notionalFor(quantity: number, unroundedPrice: number): number; // round(q·px)
```
   - `estimateOrder`: `price = round(fill)` for display, `notional = notionalFor(q, fill)`,
     `impactBps = round(λ·q/2·1e4)`. It flags `interval_limit` when `q > intervalShareCap`.
   - `maxAffordableShares` / `sharesForAmount` use the same fill math.
4. **Tests** (replace the two impact tests in `estimate.test.ts`):
```ts
it('linear impact: 1 ADV moves price ~2.42% (beta 1)', () => {
  const so = 8_000_000; expect(impactLambda(1, so) * (so / 150)).toBeCloseTo(0.02424, 4);
});
it('fill applies half the order impact and notional uses the unrounded price', () => {
  const lam = impactLambda(1, 8_000_000); const px = estFillPrice('buy', 1_200, lam, 10_000);
  expect(px).toBeCloseTo(1_200 * Math.exp(lam * 5_000), 9);
  expect(estFillPrice('sell', 1_200, lam, 10_000)).toBeCloseTo(1_200 * Math.exp(-lam * 5_000), 9);
  expect(notionalFor(10_000, px)).toBe(Math.round(10_000 * px));
});
it('splitting an order costs the same as one order (pending flow priced in)', () => {
  const lam = impactLambda(1, 8_000_000); const q = 5_000;
  const one = notionalFor(q, estFillPrice('buy', 1_200, lam, q));
  let pending = 0; let split = 0;
  for (let k = 0; k < 50; k++) { split += (q / 50) * estFillPrice('buy', 1_200, lam, q / 50, pending); pending += q / 50; }
  expect(Math.abs(split - one)).toBeLessThan(1);
});
it('flags more than one ADV per interval', () => {
  const e = estimateOrder({ ...base, side: 'buy', quantity: intervalShareCap(base.sharesOutstanding) + 1, cash: 1e15, totalValue: 1e15 });
  expect(e.error).toBe('interval_limit');
});
```

### Task 2: Engine model, news schedule, state, flow (pure)

**Files:**
- Create: `server/src/engine/model.ts`, `server/src/engine/news.ts`, `server/src/engine/flow.ts`
- Rewrite: `server/src/engine/state.ts`
- Delete: `server/src/engine/archetypes.ts`, `intrinsic.ts`, `orderflow.ts`, `engine.ts`, `server/src/news/schedule.ts`, `server/src/news/scheduler.ts`
- Test: `server/test/model.test.ts`, `server/test/news.test.ts`, `server/test/calibration.test.ts`

**Interfaces:**
- Consumes: `MODEL`, `EDGE_SPREAD`, `GameClock`, `deriveClock`, `clamp`, `impactLambda` from `@deca/shared` (after Task 1c); `Prng`, `deriveSeed` from `../lib/prng`.
- Produces:
```ts
// model.ts
export interface ModelCompany { id: string; qEff: number; beta: number; idioVol: number; sharesOutstanding: number; lambda: number } // lambda = impactLambda(beta, sharesOutstanding)
export interface CompanyState { v: number; m: number; f: number; h: number }  // v = ln(fair value cents); m = optional OU mispricing (0 when mispriceSd = 0); f = transient impact
export interface MarketState { hM: number }
export interface Derived { dt: number; K: number; phi: number; alpha: number; beta: number; decay: number; ouSd: number; jumpMean: number; truncMean: number; spread: number; moveCap: number }
export function derive(clock: GameClock, spread: number): Derived;   // decay = e^(−(ln2/0.05)·dt); ouSd = mispriceSd·√(1−decay²); moveCap = tickMoveSds·√dt
export function garchStep(h: number, z: number, d: Derived): number;
export function drift(c: ModelCompany, d: Derived): number;           // spread·qEff − K·(2·pUp−1)·truncMean, pUp = 0.5 + 0.30·qEff
export function marketStep(seed: string, t: number, mk: MarketState, d: Derived): number; // returns rM, mutates hM
export function companyStep(seed: string, t: number, c: ModelCompany, s: CompanyState, rM: number, jump: number, netShares: number, d: Derived): number; // mutates s; f = decay·(f + lambda·netShares) (decay AFTER adding flow); returns price cents
export function initialState(startPriceCents: number): CompanyState;  // {v: ln(p), m:0, f:0, h:1}
export function idioVolFor(seed: string, id: string, q: number): number; // 0.30 − 0.05q ± U(0.04), label `vol:${id}`
export function surpriseFor(seed: string, id: string): number;          // U[−1,1], label `surprise:${id}`
export function effectiveQuality(q: number, surprise: number, weight?: number): number; // weight(default MODEL.surpriseWeight)·q + (1−weight)·surprise
export function fillPriceExact(s: CompanyState, lambda: number, pendingNet: number, signedQty: number): number; // UNROUNDED cents: exp(v+m+f+λ·(pendingNet + signedQty/2))
export function closePrice(s: CompanyState): number;                     // max(1, round(exp(v+m))) — closing mark excludes impact
// news.ts
export interface NewsCompany { id: string; name: string; ticker: string; sector: string; qEff: number; beta: number }
export interface ScheduledEvent { tick: number; companyIds: string[]; jumps: Record<string, number>; type: NewsType; sentiment: 'bullish'|'bearish'; source: 'scheduled'|'macro'|'host'; headline: string; body: string }
export function buildSchedule(seed: string, clock: GameClock, companies: NewsCompany[], d: Derived): ScheduledEvent[]; // sorted by tick
export function hostEvent(tick: number, companies: NewsCompany[], input: { companyIds: string[]; type: NewsType; magnitude: number; headline: string; body: string }): ScheduledEvent; // jumps = ln(1+m)
export function jumpsAtTick(events: ScheduledEvent[]): Map<number, ScheduledEvent[]>;
// flow.ts
export class FlowBook { reserve(teamId: string, companyId: string, signedShares: number): () => void; drain(companyId: string): { net: number; volume: number }; pendingNet(companyId: string): number; teamGross(teamId: string, companyId: string): number; resetInterval(): void } // reserve returns a release() that undoes it
// state.ts
export interface EngineState { lastTick: number; hM: number; companies: Record<string, CompanyState> }
export function serializeState(s: EngineState): EngineState;  // deep plain copy (JSON-safe)
export function replayFairValue(seed: string, clock: GameClock, spread: number, companies: ModelCompany[], startPrices: Record<string, number>, events: ScheduledEvent[], toTick: number): EngineState; // Q=0 replay, f=0
export function recoverImpact(state: EngineState, prices: Record<string, number>): EngineState;  // f = ln(price) − v − m
```

**Headline rules (news.ts):**
- Company events per company: `n ~ Poisson(d.K)` (Knuth, label `jumps:${id}`). For each event: `tick = 1 + floor(U·N)`; `up = U < 0.5 + 0.30·qEff`; `size = min(0.25, −d.jumpMean·ln(1−U))`; `jump = up ? ln(1+size) : ln(max(0.05, 1−size))`.
- Type by size: `size<0.06` → earnings; `<0.12` → up ? (management|regulatory) : (regulatory|management); else up ? (merger|discovery) : (scandal|storm).
- Macro events: `rng('macro')` count `int(1,2)`; tick uniform in [5%, 95%]; `J = ±U(0.02, 0.08)`; `jumps[id] = ln(1 + beta·J)` for all companies; type `macro`.
- Headline templates are plain English with light flavor, one per (type, sentiment) with 2–3 variants each. No alcohol words.
  - Examples: earnings up "{name} beats forecasts as quarterly revenue climbs"; storm down "{name} loses ships to a storm off {port}"; merger up "{name} agrees to acquire a rival fleet at a premium".
  - Body: "{name} ({ticker}, {sector}) — {one sentence}."

- [ ] **Step 1: Write failing tests** — `server/test/model.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveClock, HOUR_MS, impactLambda } from '@deca/shared';
import { derive, garchStep, marketStep, companyStep, initialState, drift, idioVolFor, fillPriceExact, closePrice, effectiveQuality, surpriseFor, type ModelCompany } from '../src/engine/model';
import { replayFairValue, recoverImpact, serializeState } from '../src/engine/state';
import { buildSchedule, jumpsAtTick } from '../src/engine/news';

const cos = (n: number): ModelCompany[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, qEff: -1 + 2 * (i + 0.5) / n, beta: 1, idioVol: 0.3, sharesOutstanding: 50_000_000, lambda: impactLambda(1, 50_000_000) }));
function run(seed: string, hours: number, companies: ModelCompany[], flowAt?: (t: number, id: string) => number, stopAt?: number) {
  const clock = deriveClock(hours * HOUR_MS); const d = derive(clock, 0.3);
  const events = jumpsAtTick(buildSchedule(seed, clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id.toUpperCase(), sector: 'Naval Arms' })), d));
  const mk = { hM: 1 }; const st = Object.fromEntries(companies.map((c) => [c.id, initialState(10_000)]));
  const prices: Record<string, number[]> = Object.fromEntries(companies.map((c) => [c.id, [10_000]]));
  const end = stopAt ?? clock.totalTicks;
  for (let t = 1; t <= end; t++) {
    const rM = marketStep(seed, t, mk, d);
    const evs = events.get(t) ?? [];
    for (const c of companies) {
      const jump = evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0);
      prices[c.id]!.push(companyStep(seed, t, c, st[c.id]!, rM, jump, flowAt?.(t, c.id) ?? 0, d));
    }
  }
  return { clock, d, mk, st, prices };
}

describe('model parameters', () => {
  it('GARCH per-tick parameters are stationary with finite kurtosis for every game length', () => {
    for (const h of [1, 2, 4, 8, 12, 24, 48]) {
      const d = derive(deriveClock(h * HOUR_MS), 0.3);
      expect(d.alpha + d.beta).toBeLessThan(1);
      expect(3 * d.alpha ** 2 + 2 * d.alpha * d.beta + d.beta ** 2).toBeLessThan(1);
    }
  });
  it('GARCH h stays within [0.1, 10] and has mean ~1 under z²=1', () => {
    const d = derive(deriveClock(48 * HOUR_MS), 0.3);
    expect(garchStep(1, 1, d)).toBeCloseTo(1, 10);
    expect(garchStep(9.9, 50, d)).toBeLessThanOrEqual(10);
  });
  it('impact half-life is 5% of the game and the diffusion clamp scales as 3·√dt', () => {
    for (const h of [1, 12, 48]) { const c = deriveClock(h * HOUR_MS); const d = derive(c, 0.3);
      expect(d.decay ** Math.round(0.05 * c.totalTicks)).toBeCloseTo(0.5, 2); expect(d.moveCap).toBeCloseTo(3 * Math.sqrt(1 / c.totalTicks), 12); }
  });
  it('hidden surprise mixes 25% seeded noise into quality', () => {
    const x = surpriseFor('s', 'a'); expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(1);
    expect(effectiveQuality(0.8, x)).toBeCloseTo(0.75 * 0.8 + 0.25 * x, 12); expect(surpriseFor('s', 'a')).toBe(x);
  });
  it('compensated drift gives expected quality return spread·q regardless of K', () => {
    const d = derive(deriveClock(48 * HOUR_MS), 0.3);
    const c = { id: 'x', qEff: 0.5, beta: 1, idioVol: 0.3, sharesOutstanding: 1e7, lambda: impactLambda(1, 1e7) };
    const jumpDrift = d.K * (2 * (0.5 + 0.3 * c.qEff) - 1) * d.truncMean;
    expect(drift(c, d) + jumpDrift).toBeCloseTo(0.15, 10);
  });
  it('idiosyncratic vol is lower for quality and seeded', () => {
    expect(idioVolFor('s', 'a', 1)).toBeLessThanOrEqual(0.29);
    expect(idioVolFor('s', 'a', -1)).toBeGreaterThanOrEqual(0.31);
    expect(idioVolFor('s', 'a', 0)).toBe(idioVolFor('s', 'a', 0));
  });
});

describe('determinism and resume', () => {
  it('same seed → identical prices; different seed → different', () => {
    const a = run('seed-a', 1, cos(5)); const b = run('seed-a', 1, cos(5)); const c = run('seed-b', 1, cos(5));
    expect(a.prices).toEqual(b.prices); expect(a.prices.c0).not.toEqual(c.prices.c0);
  });
  it('stop, JSON round-trip, continue → byte-identical prices (with player flow)', () => {
    const companies = cos(4); const flow = (t: number, id: string) => (t % 37 === 0 && id === 'c1' ? 200_000 : 0);
    const full = run('resume', 1, companies, flow);
    const clock = full.clock; const d = full.d;
    const part = run('resume', 1, companies, flow, 300);
    const saved = JSON.parse(JSON.stringify({ mk: part.mk, st: serializeState({ lastTick: 300, hM: part.mk.hM, companies: part.st }) }));
    const events = jumpsAtTick(buildSchedule('resume', clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id, sector: 'Naval Arms' })), d));
    const mk = { hM: saved.st.hM }; const st = saved.st.companies;
    for (let t = 301; t <= clock.totalTicks; t++) {
      const rM = marketStep('resume', t, mk, d); const evs = events.get(t) ?? [];
      for (const c of companies) {
        const p = companyStep('resume', t, c, st[c.id], rM, evs.reduce((a, e) => a + (e.jumps[c.id] ?? 0), 0), flow(t, c.id), d);
        expect(p).toBe(full.prices[c.id]![t]);
      }
    }
  });
  it('fair value v and GARCH h do not depend on player flow', () => {
    const noFlow = run('flow', 1, cos(3)); const withFlow = run('flow', 1, cos(3), () => 1_000_000);
    for (const id of ['c0', 'c1', 'c2']) { expect(withFlow.st[id]!.v).toBe(noFlow.st[id]!.v); expect(withFlow.st[id]!.h).toBe(noFlow.st[id]!.h); }
  });
  it('replay + recoverImpact reconstructs state from persisted prices', () => {
    const companies = cos(3); const r = run('rec', 1, companies, (t) => (t === 100 ? 500_000 : 0), 400);
    const d = r.d; const events = buildSchedule('rec', r.clock, companies.map((c) => ({ ...c, name: c.id, ticker: c.id, sector: 'Naval Arms' })), d);
    const replay = replayFairValue('rec', r.clock, 0.3, companies, { c0: 10_000, c1: 10_000, c2: 10_000 }, events, 400);
    const rec = recoverImpact(replay, { c0: r.prices.c0![400]!, c1: r.prices.c1![400]!, c2: r.prices.c2![400]! });
    for (const id of ['c0', 'c1', 'c2']) {
      expect(rec.companies[id]!.v).toBeCloseTo(r.st[id]!.v, 9);
      expect(Math.round(Math.exp(rec.companies[id]!.v + rec.companies[id]!.m + rec.companies[id]!.f))).toBe(r.prices[id]![400]);
    }
  });
});

describe('anti-manipulation (zero noise, linear transient impact)', () => {
  const clock = deriveClock(48 * HOUR_MS); const d = derive(clock, 0.3); const so = 8_000_000;
  const quiet: ModelCompany = { id: 'z', qEff: 0, beta: 1, idioVol: 0, sharesOutstanding: so, lambda: impactLambda(1, so) };
  // deterministic zero-noise stepper: rM = 0, jump = 0, idioVol = 0, qEff = 0 → v constant; only f moves
  const step = (s: ReturnType<typeof initialState>, net: number) => companyStep('am', 1, quiet, s, 0, 0, net, d);
  function roundTrip(plan: number[]) { // plan[t] = signed shares traded in interval t (sum must be 0)
    const s = initialState(1_200); let cash = 0; let gross = 0;
    for (const q of plan) { if (q !== 0) { const px = fillPriceExact(s, quiet.lambda, 0, q); cash -= q * px; gross += Math.abs(q) * px; } step(s, q); }
    return { cash, gross };
  }
  it('update order dec·(f + λQ) makes any long-only round trip unprofitable before fees', () => {
    let worst = -Infinity;
    for (let k = 0; k < 2_000; k++) {
      const n = 3 + (k % 20); const buys = Array.from({ length: n }, (_, i) => ((k * 7919 + i * 104729) % 40_000));
      const total = buys.reduce((a, b) => a + b, 0); const plan = [...buys, 0, -total];
      const r = roundTrip(plan); worst = Math.max(worst, r.cash / Math.max(1, r.gross));
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });
  it('accumulate for 10 intervals then dump loses money before fees', () => {
    const r = roundTrip([...Array(10).fill(8_333), -83_330]); expect(r.cash).toBeLessThan(0);
  });
  it('closing mark excludes impact', () => {
    const s = initialState(1_200); step(s, 50_000); expect(closePrice(s)).toBe(1_200);
    expect(Math.round(Math.exp(s.v + s.m + s.f))).toBeGreaterThan(1_200);
  });
});
```
`server/test/news.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveClock, HOUR_MS } from '@deca/shared';
import { derive } from '../src/engine/model';
import { buildSchedule, hostEvent } from '../src/engine/news';
const companies = Array.from({ length: 25 }, (_, i) => ({ id: `c${i}`, name: `Company ${i}`, ticker: `C${i}`, sector: 'Naval Arms', q: -1 + 2 * (i + 0.5) / 25, beta: 1 }));
describe('news schedule', () => {
  const clock = deriveClock(48 * HOUR_MS); const d = derive(clock, 0.3);
  it('is deterministic and sorted', () => {
    const a = buildSchedule('n', clock, companies, d); const b = buildSchedule('n', clock, companies, d);
    expect(a).toEqual(b); expect(a.map((e) => e.tick)).toEqual([...a.map((e) => e.tick)].sort((x, y) => x - y));
  });
  it('averages about K company events and caps jump size', () => {
    let n = 0; let maxAbs = 0;
    for (let s = 0; s < 20; s++) for (const e of buildSchedule(`s${s}`, clock, companies, d)) if (e.source === 'scheduled') { n++; for (const j of Object.values(e.jumps)) maxAbs = Math.max(maxAbs, Math.abs(Math.exp(j) - 1)); }
    expect(n / (20 * 25)).toBeGreaterThan(d.K * 0.8); expect(n / (20 * 25)).toBeLessThan(d.K * 1.2);
    expect(maxAbs).toBeLessThanOrEqual(0.25 + 1e-9);
  });
  it('good news is more likely for higher quality', () => {
    let upHi = 0, totHi = 0, upLo = 0, totLo = 0;
    for (let s = 0; s < 40; s++) for (const e of buildSchedule(`q${s}`, clock, companies, d)) {
      if (e.source !== 'scheduled') continue; const q = companies.find((c) => c.id === e.companyIds[0])!.q;
      if (q > 0.6) { totHi++; if (e.sentiment === 'bullish') upHi++; } if (q < -0.6) { totLo++; if (e.sentiment === 'bullish') upLo++; }
    }
    expect(upHi / totHi).toBeGreaterThan(0.65); expect(upLo / totLo).toBeLessThan(0.35);
  });
  it('macro events hit every company with beta-scaled jumps', () => {
    const macro = buildSchedule('m', clock, companies, d).filter((e) => e.source === 'macro');
    expect(macro.length).toBeGreaterThanOrEqual(1); expect(macro.length).toBeLessThanOrEqual(2);
    expect(macro[0]!.companyIds.length).toBe(25);
  });
  it('host events convert magnitude to a log jump', () => {
    const e = hostEvent(10, companies, { companyIds: ['c1'], type: 'merger', magnitude: 0.1, headline: 'H', body: '' });
    expect(e.jumps.c1).toBeCloseTo(Math.log(1.1), 12); expect(e.sentiment).toBe('bullish'); expect(e.source).toBe('host');
  });
  it('headlines contain no alcohol words', () => {
    for (const e of buildSchedule('w', clock, companies, d)) expect(/rum|grog|ale|beer|wine|tavern|drunk/i.test(e.headline + e.body.replace(/Company \d+/g, ''))).toBe(false);
  });
});
```
`server/test/calibration.test.ts`: simulate 25 companies with rank-uniform q, spread 0.30, no flow, 30 seeds at 1h and 12 seeds at 48h (budget ≤ 20 s). Assert:
- mean per-game realized vol `sd(tick log-returns)·√N` in [0.34, 0.42] at both lengths, and |vol_1h − vol_48h| < 0.03
- mean lag-1 ACF of tick returns within ±0.03
- mean pairwise tick-return correlation in [0.15, 0.32]
- with qEff = 0.75·q + 0.25·ξ: top-quintile (by q) mean game log return > bottom-quintile in ≥ 85% of seeds; mean top−bottom spread in [0.25, 0.50]
- mean Spearman(q, return) in [0.25, 0.48]

Use `simple-statistics` (`sampleCorrelation`, `standardDeviation`, `mean`).
- [ ] **Step 2:** Run `npm test -w @deca/server -- model news calibration`. Expected FAIL (modules missing).
- [ ] **Step 3: Implement** by porting the research prototype `model.ts`/`jumpSchedule` into the interfaces above:
  - `derive`: `c = −ln(garchPersistDay)·252`, `a = garchAlphaDay·√252`, `phi = e^(−c·dt)`, `alpha = min(0.3, a·√dt)`, `beta = phi − alpha`; `kap = ln2/mispriceHalfLife`, `ouDecay = e^(−kap·dt)`, `ouSd = mispriceSd·√(1−ouDecay²)`; `K = clamp(round(1.5·√hours), 2, 12)`; `jumpMean = √(jumpVarPerGame/(2K))`; `truncMean = jumpMean·(1−e^(−maxJump/jumpMean))`.
  - `companyStep`: exactly spec §5.3 (v2.1). Clamp only the diffusive `dv` to `±moveCap`; impact `f = decay·(f + lambda·netShares)`; `m` updates only when `ouSd > 0`, but `zO` is always drawn.
  - `replayFairValue` iterates the model with `netShares=0` and `f` left at 0.
- [ ] **Step 4:** Run the same command. Expected PASS. Record the calibration test runtime (must be < 20 s).
- [ ] **Step 5:** Orchestrator commits: `feat(engine): quality-tilted single-index jump-diffusion model with GARCH, OU, sqrt impact`.

---

### Task 3: Market generator (latent quality → consistent fundamentals → measured score)

**Files:**
- Create: `server/src/seed/generateMarket.ts`
- Delete: `server/src/seed/generateFundamentals.ts`
- Modify: `server/src/seed/research.json` (read-only use; no changes needed)
- Test: `server/test/generateMarket.test.ts`

**Interfaces:**
- Consumes: `ROSTER` (Task 1), `computeQualityScores`, `invNormCdf`, `normCdf`, `clamp`, `MODEL`, types from `@deca/shared`; `Prng`, `deriveSeed`.
- Produces:
```ts
export interface GeneratedCompany { company: Company; fundamentals: Fundamentals; quality: QualityResult; idioVol: number; startPriceCents: number }
export interface GeneratedMarket { seed: string; companies: GeneratedCompany[] }
export function generateMarket(seed: string): GeneratedMarket;  // company order = ROSTER order
export function sectorRefs(): Record<string, SectorRefs>;       // from research.json profiles: pe=(peLow+peHigh)/2, evEbitda, ps=(psLow+psHigh)/2
```
`company` initial fields: `currentPrice = startPrice = sessionOpen = sessionHigh = sessionLow = voyageHigh = voyageLow = startPriceCents`, `sessionVolume 0`, `sessionChange 0`, `voyageChange 0`, `adv = round(shares/150)`, `lastTick 0`, `description = "{name} — {sector}."`. `idioVol` comes from `idioVolFor(seed, id, q)` (import from `../engine/model`).

- [ ] **Step 1: Write failing test** `server/test/generateMarket.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { spearman, GRADES } from '@deca/shared';
import { generateMarket } from '../src/seed/generateMarket';
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * tol);
describe('generateMarket', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(generateMarket('x')).toEqual(generateMarket('x'));
    expect(generateMarket('x').companies[0]!.company.currentPrice).not.toBe(generateMarket('y').companies[0]!.company.currentPrice);
  });
  it('holds accounting identities for 50 seeds', () => {
    for (let s = 0; s < 50; s++) for (const { company: c, fundamentals: f } of generateMarket(`id${s}`).companies) {
      expect(f.grossProfit).toBe(f.revenue - f.costOfRevenue);
      expect(near(f.totalAssets, f.equity + f.totalLiabilities)).toBe(true);
      expect(near(f.totalDebt, f.debtToEquity * f.equity, 0.02)).toBe(true);
      expect(f.freeCashFlow).toBe(f.operatingCashFlow - f.capex);
      expect(c.marketCap).toBe(c.currentPrice * c.sharesOutstanding);
      expect(f.marketCap).toBe(c.marketCap);
      if (f.netIncome > 0) expect(near(f.peRatio, f.marketCap / f.netIncome, 0.02)).toBe(true);
      expect(c.startPrice).toBeGreaterThanOrEqual(1200); expect(c.startPrice).toBeLessThanOrEqual(52000);
      expect(f.history).toHaveLength(4); expect(c.beta).toBeGreaterThanOrEqual(0.7); expect(c.beta).toBeLessThanOrEqual(1.4);
      expect(f.beta).toBe(c.beta);
    }
  });
  it('spreads quality: all grades present, q spans, some loss-makers overall', () => {
    let losses = 0; let total = 0;
    for (let s = 0; s < 20; s++) {
      const m = generateMarket(`g${s}`); const grades = new Set(m.companies.map((g) => g.quality.grade));
      for (const g of GRADES) expect(grades.has(g)).toBe(true);
      const qs = m.companies.map((g) => g.quality.q); expect(Math.min(...qs)).toBeLessThan(-0.9); expect(Math.max(...qs)).toBeGreaterThan(0.9);
      losses += m.companies.filter((g) => g.fundamentals.netIncome <= 0).length; total += 25;
    }
    expect(losses / total).toBeGreaterThan(0.02); expect(losses / total).toBeLessThan(0.2);
  });
  it('analyst view is only a noisy hint of quality', () => {
    let rho = 0;
    for (let s = 0; s < 20; s++) { const m = generateMarket(`a${s}`).companies; rho += spearman(m.map((g) => g.quality.score), m.map((g) => g.fundamentals.analyst.priceTarget / g.company.startPrice)); }
    expect(rho / 20).toBeGreaterThan(0.2); expect(rho / 20).toBeLessThan(0.8);
  });
  it('uses the renamed roster entry', () => {
    const m = generateMarket('r'); expect(m.companies.some((g) => g.company.ticker === 'BRTH')).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/barbossa/i);
  });
});
```
- [ ] **Step 2:** Run `npm test -w @deca/server -- generateMarket`. Expected FAIL.
- [ ] **Step 3: Implement** spec §4:
  - Latin-hypercube latent (label `q`); items via the one-factor copula (labels `item:${k}:${id}`).
  - Sector ranges come from `research.json`.
  - History is built backwards from the latest FY (periods `FY2022..FY2025`).
  - Cheapness latent (label `value:${id}`); shares chosen so the start price lands in [Ð12, Ð520].
  - Analyst rating by quintile of `analystZ`; management, risks and developments text from the existing templates, minus the rum/alcohol words.
  - Risk factors add "Heavy debt load" when D/E > 1.8 and "Thin cash cushion" when currentRatio < 0.9.
  - Finally call `computeQualityScores(inputs, sectorRefs())` and attach the result.
- [ ] **Step 4:** Run the same command. Expected PASS.
- [ ] **Step 5:** Orchestrator commits: `feat(seed): latent-quality market generator with accounting identities and measured quality`.

---

### Task 4: Engine loop, market service, leaderboard, CLIs, emulator guard

**Files:**
- Rewrite: `server/src/engine/loop.ts`, `server/src/services/leaderboard.ts`, `server/src/seed/seedFirestore.ts`, `server/src/seed/reset.ts`
- Create: `server/src/services/market.ts`
- Modify: `server/src/firebase.ts` (emulator guard), `server/src/index.ts` (no API change)
- Test: covered by Task 6 integration; unit-test pure helpers in `server/test/loopHelpers.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts; Task 2 `derive, marketStep, companyStep, initialState, buildSchedule, hostEvent, jumpsAtTick, FlowBook, replayFairValue, recoverImpact, EngineState, ScheduledEvent`; Task 3 `generateMarket`.
- Produces (used by Task 5 routes and Task 6 tests):
```ts
// engine/loop.ts
export interface EngineCompany { id: string; ticker: string; name: string; sector: Sector; sharesOutstanding: number; beta: number; idioVol: number; q: number; surprise: number; qEff: number; lambda: number; quality: number; grade: Grade; pillars: QualityPillars; startPriceCents: number }
export class GameEngine {
  state: GameState;                                   // mirror of game/state
  load(): Promise<void>;                              // game/state, companies, _schedule/*, _engine/state (or replay+recover), current history chunks, market/summary; rebuild pending flow from trades with executedAt > lastTickAt
  start(): void; stop(): void;
  reload(): Promise<void>;                            // stop → clear memory → load → start
  getPrice(companyId: string): number;                // 0 if unknown
  getCompany(companyId: string): EngineCompany | undefined;
  companies(): EngineCompany[];
  quote(companyId: string, side: OrderSide, quantity: number): { lastPrice: number; fillPrice: number; impactBps: number; intervalRemaining: number }; // fillPrice unrounded, includes pending flow
  reserveFlow(teamId: string, companyId: string, side: OrderSide, quantity: number): { lastPrice: number; fillPrice: number; impactBps: number; release(): void }; // SYNCHRONOUS; adds signed qty to pending flow before any await; throws EngineError('market_closed'|'unknown_company'|'interval_limit')
  closePrice(companyId: string): number;              // round(exp(v+m)) — used for final standings and reveal
  applySettings(input: SettingsInput): Promise<GameState>;  // lobby only else throws EngineError('not_lobby')
  startGame(): Promise<void>;                         // lobby only: clock from settings, startAt/endAt, buildSchedule → _schedule/_news, init _engine/state, persist
  pauseGame(): Promise<void>; resumeGame(): Promise<void>;
  endGame(): Promise<void>;                           // phase ended, endedAt, reveal per company, finalizeLeaderboard
  queueHostNews(input: FireNewsInput): Promise<void>; // live/paused only; fires at next tick
  tickOnce(now?: number): Promise<void>;              // exported for integration tests
  adminMarket(): AdminMarketRow[];
  scheduledNews(): ScheduledNewsView[];
  health(now?: number): HealthResponse;
}
export class EngineError extends Error { constructor(public code: string, message: string) }
export const engine: GameEngine;
// services/market.ts
export interface CreateMarketOptions { seed?: string; keepCrews: boolean; adminPassword?: string; settings?: Partial<GameSettings> }
export interface CreateMarketResult { seed: string; companies: number; adminPasswordSet: boolean; generatedAdminPassword?: string }
export function clearDynamicData(opts: { keepCrews: boolean; startingCapital: number }): Promise<void>;
export function createMarket(opts: CreateMarketOptions): Promise<CreateMarketResult>;
// services/leaderboard.ts
export function recomputeLeaderboard(engine: GameEngine, tick: number): Promise<void>;
export function finalizeLeaderboard(engine: GameEngine): Promise<void>;
export function resetLeaderboardCache(): void;
```

**Behavior details:**
- **`clearDynamicData`:** recursively deletes `trades`, `orders`, `news`, `leaderboard`, `market`, `_engine`, `_teamStats`, `companies/*/history`, `companies/*/fundamentals`, `companies`, `_schedule`.
  - `keepCrews=true`: for each team, delete its `holdings` + `history` and set `{cashBalance: startingCapital, totalValue: startingCapital, rank: 0, realizedPnl: 0, feesPaid: 0, tradeCount: 0, sessionOpenValue: startingCapital, holdingsCount: 0}`.
  - `keepCrews=false`: delete `teams` and every `_auth` doc except `_admin`.
- **`createMarket`:**
  1. Read existing `game/state` settings (defaults if none) and merge `opts.settings`.
  2. `clearDynamicData`.
  3. `generateMarket(seed || randomToken())`.
  4. Write per company: `companies/{id}`, `fundamentals/data`, `history/0 = {chunk:0,startTick:0,prices:[start],volumes:[0]}`, and `_schedule/{id} = {q, quality, grade, pillars, idioVol, beta, sharesOutstanding, startPriceCents, ticker, name, sector}`.
  5. Write `_schedule/_meta = {seed, createdAt}`, `market/summary` initial (composite 1000.00, sectors 1000.00), and `game/state` lobby with the clock derived from settings.
  6. Admin password: set `_auth/_admin` only when `adminPassword` is given or no admin doc exists (return the generated one).
- **`tickOnce(now)`:** runs only when `live`. `target = tickAt(now, startAt, clock)`. For each `t` in `(currentTick, target]`:
  - `rM = marketStep`.
  - Gather events at `t`, plus queued host events when `t === target`.
  - Per company: `{net, volume} = flow.drain` (only on the first iteration of a catch-up), `jump = Σ events.jumps[id]`, `price = companyStep`. Call `flow.resetInterval()` after the first iteration (per-crew interval caps reset every tick).
  - Update session fields: at `t % sessionTicks === 0`, `sessionOpen = price` and high/low/volume reset. Voyage high/low update every tick.
  - Append to the in-memory chunk arrays and mark chunk dirty.
  - Fired events become `news/{source}-{t}-{firstId}-{seq}` with `priceAtFire`.
- **One batch per call:** dirty chunks (`companies/{id}/history/{chunk}`), company snapshots, `market/summary` + `market/summary/history/{chunk}` (composite values), news, `game/state {currentTick, serverTime, lastTickAt}`, `_engine/state`. Split into multiple batches at 450 ops.
  - Composite = `1000 · Σ(price·shares)/Σ(start·shares)`; sectors likewise. Breadth from sessionChange sign, voyage highs/lows touched this tick, and session volumes.
- **After the commit:** `recomputeLeaderboard(this, target)`; if `target ≥ totalTicks` or `now ≥ endAt`, call `endGame()`. A heartbeat-only update happens when `target ≤ currentTick`.
- **Timer:** `setInterval(tickOnce, min(tickIntervalMs, 5000))` so catch-up stays prompt at any interval. Guard re-entrancy with `ticking`.
- **`recomputeLeaderboard`:**
  - Load teams + holdings, then `value = cash + Σ shares·price`.
  - In-memory `valueSeries[teamId]`: on the first call load all `teams/{id}/history/*` chunks.
  - Write `teams/{id}` `{totalValue, rank, holdingsCount}`, plus `sessionOpenValue` when `tick % sessionTicks === 0`.
  - Write `teams/{id}/history/{chunk}`.
  - `_teamStats/{id}`: `exposure += Σ(value_i·q_i)` (the visible-fundamentals `q`, not `qEff`, so the grade rewards research rather than luck), `weight += Σ value_i` (holdings only).
  - `leaderboard/current` entries: `prevRank` from the previous doc, `spark` = 40 evenly sampled points of the series.
- **Closing mark:** `endGame()` values every holding at `closePrice(id)` (impact excluded), writes those values to teams and the final leaderboard, and sets `companies/{id}.currentPrice` to the close. This stops last-interval pumping of final marks.
- **`finalizeLeaderboard`:** `researchScore = exposure/weight` (0 if weight 0) → grade via quintile thresholds of q (`≥0.6 A, ≥0.2 B, ≥−0.2 C, ≥−0.6 D, else F`). Write `leaderboard/current.final`.
- **Reveal:**
  - `expectedReturn = spread·qEff + beta·mktDrift`, `actualReturn = ln(close/start)`, `luck = actual − expected`, `fairValue = round(exp(v))`, `qEff`, `surprise`. Plain-language copy explains the surprise: "Some companies had hidden strengths or problems that didn't show in their financials."
  - Label: `q≥0 & luck≥0` compounder; `q≥0 & luck<0` unlucky_gem; `q<0 & luck≥0` lucky_turnaround; else decliner.
- **`firebase.ts`:** when either emulator env var is set → `initializeApp({ projectId })` only, with a `console.info('[firebase] emulator mode — service account ignored')`.
- **CLIs:** `seedFirestore.ts` → `createMarket({ seed: config.seed || undefined, keepCrews: true, adminPassword: config.adminPassword || undefined })` and print the seed + admin password when generated. `reset.ts` → `clearDynamicData({ keepCrews: false, startingCapital })`, printing next steps.

- [ ] **Step 1: Write failing unit tests** for pure helpers extracted into `server/src/engine/loopHelpers.ts`:
```ts
// loopHelpers.ts (produced)
export function compositeValue(prices: Record<string, number>, starts: Record<string, number>, shares: Record<string, number>, ids: string[]): number; // 2-dp float, 1000 at start
export function sampleSpark(series: number[], points?: number): number[]; // default 40, includes first & last
export function revealLabel(q: number, luck: number): RevealLabel;
export function researchGrade(score: number): Grade;
```
`server/test/loopHelpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { compositeValue, sampleSpark, revealLabel, researchGrade } from '../src/engine/loopHelpers';
describe('loop helpers', () => {
  it('composite is cap-weighted and 1000 at start', () => {
    const ids = ['a', 'b']; const starts = { a: 100, b: 1000 }; const shares = { a: 10, b: 1 };
    expect(compositeValue(starts, starts, shares, ids)).toBe(1000);
    expect(compositeValue({ a: 200, b: 1000 }, starts, shares, ids)).toBe(1500);
  });
  it('spark keeps endpoints and length', () => {
    const s = sampleSpark(Array.from({ length: 1000 }, (_, i) => i));
    expect(s).toHaveLength(40); expect(s[0]).toBe(0); expect(s[39]).toBe(999);
    expect(sampleSpark([5, 6])).toEqual([5, 6]);
  });
  it('labels and grades', () => {
    expect(revealLabel(0.5, 0.1)).toBe('compounder'); expect(revealLabel(0.5, -0.1)).toBe('unlucky_gem');
    expect(revealLabel(-0.5, 0.1)).toBe('lucky_turnaround'); expect(revealLabel(-0.5, -0.1)).toBe('decliner');
    expect(researchGrade(0.7)).toBe('A'); expect(researchGrade(0)).toBe('C'); expect(researchGrade(-0.9)).toBe('F');
  });
});
```
- [ ] **Step 2:** Run it. Expected FAIL.
- [ ] **Step 3:** Implement the helpers, loop, market service, leaderboard, CLIs and emulator guard per the details above.
- [ ] **Step 4:** Run `npm test -w @deca/server && npm run typecheck -w @deca/server`. Expected PASS; typecheck may report only Task 5 route files if Task 5 is not merged yet (that is the Wave 2 gate).
- [ ] **Step 5:** Orchestrator commits: `feat(engine): IO loop with chunked history, market summary, leaderboard sparks, reveal, market service`.

---

### Task 5: Trading, crews, routes

**Files:**
- Rewrite: `server/src/services/trading.ts`, `server/src/routes/orders.ts`, `server/src/routes/admin.ts`, `server/src/routes/health.ts`
- Create: `server/src/services/crews.ts`
- Rewrite test: `server/test/trading.test.ts`

**Interfaces:**
- Consumes: Task 1/1b/1c (`orderRequestSchema`, `estimateOrder`, `notionalFor`, `feeFor`, `settingsSchema`, `newGameSchema`, `resetPasswordSchema`, `tradingToggleSchema`, `fireNewsSchema`, `createTeamSchema`); Task 4 `engine` API and `createMarket`; `db` from firebase; `hashPassword`; `auditLog`.
- Produces:
```ts
// services/trading.ts
export class TradeError extends Error { constructor(public code: 'market_closed'|'trading_disabled'|'unknown_company'|'bad_quantity'|'price_moved'|'insufficient_funds'|'insufficient_shares'|'position_limit'|'interval_limit'|'no_team', message: string) }
export interface FillInput { side: OrderSide; quantity: number; fillPrice: number /* unrounded cents from engine.reserveFlow */; lastPrice: number; feeBps: number; cash: number; sharesOwned: number; avgCost: number; totalValue: number; maxPositionPct: number }
export interface FillOutcome { price: number /* round(fillPrice) for display */; notional: number /* round(q·fillPrice) */; fee: number; cashAfter: number; sharesAfter: number; avgCostAfter: number; realizedPnl: number }
export function computeFill(i: FillInput): FillOutcome;  // throws TradeError on insufficient funds/shares/bad quantity
export function checkPriceProtection(lastPrice: number, quotedPrice: number | undefined): void; // throws price_moved if > MODEL.priceProtection
export function executeOrder(engine: GameEngine, teamId: string, order: OrderRequest): Promise<Trade>;
// services/crews.ts
export function createCrew(name: string, password: string, startingCapital: number): Promise<{ id: string; name: string }>; // throws CrewError('exists'|'bad_name')
export function resetCrewPassword(teamId: string, password: string): Promise<void>;
export function setCrewTrading(teamId: string, enabled: boolean): Promise<void>;
export function removeCrew(teamId: string): Promise<void>;
export class CrewError extends Error { constructor(public code: 'exists'|'bad_name'|'not_found', message: string) }
```
- **Realized P&L on sell** = `notional − round(avgCost·quantity) − fee`; on buy it is 0 and `fee` goes into `feesPaid`. Position limit values the position at `lastPrice`.
- **`executeOrder`:**
  1. Validate phase, company and `team.tradingDisabled` (read in the transaction).
  2. Price protection against `engine.getPrice`.
  3. `const r = engine.reserveFlow(teamId, companyId, side, quantity)`, synchronously and BEFORE the transaction (EngineError `interval_limit` → TradeError `interval_limit`). If the transaction throws, call `r.release()`.
  4. Transaction: if `orders/{teamId}_{clientOrderId}` exists with a `tradeId`, return that trade. Otherwise read team + holding, run `computeFill`, write team `{cashBalance, realizedPnl+=, feesPaid+=, tradeCount+=1, holdingsCount}`, the holding, the trade `{…, tick: engine.state.currentTick}` and the order `{status:'filled', tradeId}`.
  5. After commit: `auditLog('order.fill')` (flow is already reserved).
  6. On `TradeError`, best-effort write order `{status:'rejected', code, reason}` (skipped for `price_moved`/`market_closed` spam? No: always write, it is cheap) and rethrow.
- **Routes** (spec §8): `POST /orders` maps TradeError → 400 `{error: code, message}`; `409` for `price_moved`.
- **Admin routes:** settings → `engine.applySettings` (EngineError not_lobby → 409); `game/new` → `engine.stop(); await createMarket({keepCrews}); resetLeaderboardCache(); await engine.reload()`, returns `{ok, seed: undefined}` (never return the seed); teams CRUD via crews.ts with `startingCapital` from `engine.state.startingCapital`; `GET /admin/market` → `engine.adminMarket()`; `GET /admin/news/scheduled` → `engine.scheduledNews()`; `POST /admin/news` → `engine.queueHostNews` (EngineError → 409).
- **`GET /health`** → `engine.health()`.
- Every admin mutation calls `auditLog`.

- [ ] **Step 1: Write failing test** `server/test/trading.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeFill, checkPriceProtection, TradeError } from '../src/services/trading';
const b = { lastPrice: 10_000, fillPrice: 10_003.7, feeBps: 10, cash: 1_000_000, sharesOwned: 0, avgCost: 0, totalValue: 1_000_000, maxPositionPct: 1 };
describe('computeFill', () => {
  it('buy pays slippage + fee and updates avg cost', () => {
    const f = computeFill({ ...b, side: 'buy', quantity: 50 });
    expect(f.price).toBe(10_004); expect(f.notional).toBe(Math.round(50 * 10_003.7));
    expect(f.cashAfter).toBe(1_000_000 - f.notional - f.fee); expect(f.avgCostAfter).toBe(Math.round(f.notional / 50)); expect(f.realizedPnl).toBe(0);
  });
  it('sell receives price below last, realizes P&L net of fee', () => {
    const f = computeFill({ ...b, side: 'sell', quantity: 40, sharesOwned: 50, avgCost: 9_000, fillPrice: 9_996.2 });
    expect(f.notional).toBe(Math.round(40 * 9_996.2));
    expect(f.realizedPnl).toBe(f.notional - 9_000 * 40 - f.fee);
    expect(f.sharesAfter).toBe(10); expect(f.avgCostAfter).toBe(9_000);
  });
  it('rejects insufficient funds/shares and bad quantity', () => {
    expect(() => computeFill({ ...b, side: 'buy', quantity: 101 })).toThrow(TradeError);
    expect(() => computeFill({ ...b, side: 'sell', quantity: 1 })).toThrow(/shares/);
    expect(() => computeFill({ ...b, side: 'buy', quantity: 1.5 })).toThrow(TradeError);
  });
  it('enforces the host position limit on buys', () => {
    expect(() => computeFill({ ...b, side: 'buy', quantity: 30, maxPositionPct: 0.25 })).toThrow(/limit/);
    expect(() => computeFill({ ...b, side: 'buy', quantity: 20, maxPositionPct: 0.25 })).not.toThrow();
  });
  it('price protection allows ≤2% moves and rejects larger', () => {
    expect(() => checkPriceProtection(10_200, 10_000)).not.toThrow();
    expect(() => checkPriceProtection(10_201, 10_000)).toThrow(/moved/);
    expect(() => checkPriceProtection(10_500, undefined)).not.toThrow();
  });
});
```
- [ ] **Step 2:** Run. Expected FAIL.
- [ ] **Step 3:** Implement the services and routes.
- [ ] **Step 4:** Run `npm test -w @deca/server && npm run typecheck -w @deca/server`. Expected PASS once Task 4 is merged.
- [ ] **Step 5:** Orchestrator commits: `feat(server): slippage-aware idempotent trading, crew management, v2 admin API`.

---

### Task 6: Security rules, emulator integration tests, local dev stack

**Files:**
- Modify: `firestore.rules`, root `package.json`, `server/package.json`
- Create: `server/vitest.config.ts`, `server/vitest.int.config.ts`, `server/test/integration/engine.int.test.ts`, `server/test/integration/rules.int.test.ts`, `scripts/dev-local.sh`

**Interfaces:**
- Consumes: Task 4 `engine`, `createMarket`; Task 5 `executeOrder`, `createCrew`.
- Produces scripts:
  - root `test:integration` = `firebase emulators:exec --only firestore,auth --project demo-deca "npm run test:int -w @deca/server"`
  - server `test:int` = `vitest run -c vitest.int.config.ts`
  - root `dev:local` = `bash scripts/dev-local.sh`

**Rules changes:** add `match /market/{doc=**} { allow read: if true; }`, `match /companies/{id}/history/{c} { allow read: if true; }` (remove `priceHistory`), and `match /teams/{teamId}/history/{c} { allow read: if isAdmin() || ownsTeam(teamId); }`. `_engine` and `_teamStats` fall under the default deny (add explicit deny blocks for documentation).

- [ ] **Step 1: Write the integration test** `engine.int.test.ts`. It uses `FIRESTORE_EMULATOR_HOST` and `GCLOUD_PROJECT=demo-deca`, and imports `db`, `engine`, `createMarket`, `createCrew`, `executeOrder`, `finalizeLeaderboard`. Scenario, each step an `expect`:
  1. `createMarket({seed:'int', keepCrews:false, adminPassword:'pw', settings:{gameLengthMs: HOUR_MS}})`.
  2. `engine.reload()`: phase lobby, 25 companies, `totalTicks` 720.
  3. `engine.applySettings({ startingCapital: 50_000_000 })`, then `createCrew('Test Crew','pass', 50_000_000)`: team cash 50,000,000.
  4. `engine.startGame()`: phase live, `_schedule/_news` exists.
  5. `executeOrder(engine,'test-crew',{companyId: first, side:'buy', quantity:10, clientOrderId:'int-order-1', quotedPrice: engine.getPrice(first)})`: trade written, team cash decreased by notional+fee, holding shares 10.
  6. Same clientOrderId again: same trade id, no double charge.
  7. `engine.tickOnce(startAt + 3·tickIntervalMs + 10)`: `currentTick` 3, `companies/{id}/history/0.prices.length === 4`, `market/summary.lastTick === 3`, `leaderboard/current.entries[0].spark.length ≥ 1`, `teams/test-crew/history/0` exists.
  8. `pauseGame` then `resumeGame`: phase live and `startAt` shifted.
  9. `endGame()`: every company has `reveal`, `leaderboard/current.final.entries[0].researchGrade` in GRADES.
  10. `createMarket({keepCrews:true})` then `reload`: team cash 50,000,000, no holdings, lobby.

  `rules.int.test.ts` uses `@firebase/rules-unit-testing` with rules loaded from `../../firestore.rules`:
  - unauthenticated user can read `game/state`, `companies/x`, `companies/x/history/0`, `market/summary`, `news/n`, `leaderboard/current`
  - cannot read `_schedule/x`, `_engine/state`, `_teamStats/t`, `_auth/t`, `logs/l`, `teams/t`
  - team `t` can read `teams/t`, `teams/t/holdings/h`, `teams/t/history/0`, and own trades/orders; cannot read `teams/u`
  - admin can read `teams/u`
  - nobody can write anything
- [ ] **Step 2:** Run `JAVA_HOME=<scratchpad jre>/Contents/Home PATH=$JAVA_HOME/bin:$PATH npm run test:integration`. Expected FAIL before the rules and config changes.
- [ ] **Step 3:** Implement the rules, vitest configs (unit config excludes `test/integration/**`; int config includes only it, `testTimeout: 60000`, `fileParallelism: false`) and `scripts/dev-local.sh`:
  - start emulators in the background (`firebase emulators:start --only firestore,auth --project demo-deca`)
  - wait for port 8080
  - export emulator env vars + `GCLOUD_PROJECT=demo-deca`
  - `npm run seed` with `ADMIN_PASSWORD=${ADMIN_PASSWORD:-captain}`
  - start the server (`npm run dev:server`) and web (`VITE_USE_EMULATORS=1 VITE_API_BASE=http://localhost:8081 VITE_FIREBASE_PROJECT_ID=demo-deca npm run dev:web`)
  - trap to kill children
  - `web/src/firebase.ts` must accept `VITE_FIREBASE_PROJECT_ID=demo-deca` with a placeholder apiKey when `VITE_USE_EMULATORS=1`
- [ ] **Step 4:** Run the integration command again. Expected PASS for both files.
- [ ] **Step 5:** Orchestrator commits: `test: emulator integration + rules tests; dev:local stack`.

---

### Task 7: Web foundation: theme, primitives, charts, lib, hooks

**Files:**
- Rewrite: `web/src/theme/tokens.css`; create `web/src/theme/base.css`; delete `web/src/theme/pirate.css`
- Create `web/src/components/ui/`: `Panel.tsx`, `Button.tsx`, `Segmented.tsx`, `Pill.tsx`, `Crest.tsx`, `SignedChange.tsx`, `Tabs.tsx`, `Field.tsx`, `Modal.tsx`, `TypedConfirm.tsx`, `Toast.tsx`, `EmptyState.tsx`, `Loader.tsx`, `DataTable.tsx`, `ornaments.tsx` (CompassRose, WaxSeal, Medallion, RopeRule), `ui.css`
- Create `web/src/components/charts/`: `Sparkline.tsx`, `AreaChart.tsx`, `VolumeBars.tsx`, `RangeBar.tsx`, `ScatterChart.tsx`, `Treemap.tsx`, `charts.css`
- Rewrite `web/src/lib/`: `format.ts`, `api.ts`, `auth.tsx`; create `orderId.ts`, `watchlist.ts`, `sector.ts`
- Rewrite `web/src/hooks/`: `useGame.ts`, `useCompanies.ts`, `useCompany.ts`, `useHistory.ts`, `useMarket.ts`, `usePortfolio.ts`, `useTeamHistory.ts`, `useTrades.ts`, `useOrders.ts`, `useNews.ts`, `useLeaderboard.ts`, `useCountdown.ts`, `useAdmin.ts`, `useAllFundamentals.ts`; create `web/src/lib/market.ts`, `web/src/lib/glossary.ts`, `web/src/lib/compare.ts` (+ tests `glossary.test.ts`, `compare.test.ts`), and primitives `web/src/components/ui/InfoTip.tsx`, `web/src/components/ui/ExplainRow.tsx`
- Delete old `web/src/components/*.tsx`, `web/src/hooks/usePriceHistory.ts`
- Test: `web/src/lib/format.test.ts`; add `"test": "vitest run"` to `web/package.json`

**Interfaces (Produces):**
```ts
// lib/format.ts
export function formatMoney(cents: number, opts?: { symbol?: string; signed?: boolean; compact?: boolean }): string; // 'Ð1,234.56', signed '+Ð1.00' / '−Ð1.00', compact 'Ð4.67B'
export function formatPct(frac: number, opts?: { signed?: boolean; digits?: number }): string;                   // '+2.31%' / '−0.53%' / '0.00%'
export function formatNumber(n: number, digits?: number): string;
export function formatCompact(n: number): string;   // 242.0M
export function formatIndex(v: number): string;     // 1,048.62
export function formatClock(ms: number): string;    // '41:17:08'
export function formatTickTime(epochMs: number): string; // '14:02:30'
export function direction(x: number): 'up' | 'down' | 'flat';
export function classNames(...args: Array<string | false | null | undefined | Record<string, boolean>>): string;
// lib/orderId.ts
export function newClientOrderId(): string; // 20-char [A-Za-z0-9_-] via crypto.getRandomValues
// lib/watchlist.ts
export function useWatchlist(teamId: string | null): { symbols: string[]; toggle(id: string): void; has(id: string): boolean }; // localStorage `bx.watchlist.${teamId}`, default ['kraken','port-royal','cursed-doubloon','astrolabe','grog-galleon'] filtered to existing ids by caller
// lib/sector.ts
export const SECTOR_COLORS: Record<Sector, string>; // BRIEF §2 crest fills
export function initials(name: string): string;     // 'Kraken Shipping Lines' → 'KS'
// lib/api.ts
export class ApiRequestError extends Error { status: number; code: string }
export function apiPost<T>(path: string, body?: unknown): Promise<T>;
export function apiGet<T>(path: string): Promise<T>;
export function apiDelete<T>(path: string): Promise<T>;
// lib/auth.tsx  (unchanged API) AuthProvider, useAuth(): { user, role, teamId, loading, login(name,pw), loginAdmin(pw), logout() }
// hooks
export function useGame(): { game: GameState | null; clock: GameClock | null; loading: boolean };
export function useCompanies(): { companies: Company[]; byId: Record<string, Company>; loading: boolean };
export function useCompany(id?: string | null): { company: Company | null; fundamentals: Fundamentals | null; loading: boolean };
export function useHistory(companyId: string | null | undefined, fromTick: number | null, toTick: number): { points: { tick: number; price: number; volume: number }[]; loading: boolean }; // subscribes to chunks covering the range
export function useMarket(): { market: MarketSummary | null; loading: boolean };
export function useCompositeHistory(fromTick: number | null, toTick: number): { points: { tick: number; value: number }[]; loading: boolean };
export function usePortfolio(): { team: Team | null; holdings: Holding[]; loading: boolean };
export function useTeamHistory(teamId: string | null, fromTick: number | null, toTick: number): { points: { tick: number; value: number }[]; loading: boolean };
export function useTrades(limit?: number): { trades: Trade[]; loading: boolean };
export function useOrders(limit?: number): { orders: OrderRecord[]; loading: boolean };
export function useNews(limit?: number): { news: NewsEvent[]; loading: boolean };
export function useLeaderboard(): { leaderboard: Leaderboard | null; loading: boolean };
export function useCountdown(game: GameState | null): { remainingMs: number; label: string }; // updates every 1s; paused → frozen at pausedAt
export function useAdminTeams(): { teams: Team[]; loading: boolean };           // Firestore listener (admin)
export function useAdminPoll<T>(path: string, intervalMs: number): { data: T | null; error: string | null; refresh(): void };
export function useAllFundamentals(): { byId: Record<string, Fundamentals>; loading: boolean }; // one-shot getDocs(collectionGroup('fundamentals')), doc parent id = company id
// lib/glossary.ts
export interface GlossaryEntry { id: string; label: string; term: string; whatItIs: string; whyItMatters: string; usuallyGoodWhen: string; related: string[]; group: 'basics' | 'profit' | 'growth' | 'debt' | 'value' | 'trading' | 'game' }
export const GLOSSARY: Record<string, GlossaryEntry>; // required ids are listed in glossary.test.ts
export const NEWS_EXPLAIN: Record<NewsType, { bullish: string; bearish: string }>; // "What this means" sentences
export function glossarySearch(q: string): GlossaryEntry[]; // matches label/term/whatItIs, case-insensitive
// lib/compare.ts
export type MetricId = 'marketCap' | 'revenue' | 'netIncome' | 'netMargin' | 'grossMargin' | 'revenueGrowth' | 'eps' | 'peRatio' | 'forwardPe' | 'psRatio' | 'pbRatio' | 'evToEbitda' | 'dividendYield' | 'debtToEquity' | 'currentRatio' | 'freeCashFlow' | 'roe' | 'roa' | 'beta';
export function metricValue(id: MetricId, f: Fundamentals, c: Company): number | null; // revenueGrowth = (h3/h0)^(1/3)-1 from history; peRatio/forwardPe null when netIncome ≤ 0
export interface SectorAverage { scope: 'sector' | 'market'; sector: Sector; value: number | null; count: number }
export function sectorAverages(fundamentalsById: Record<string, Fundamentals>, companiesById: Record<string, Company>): (id: MetricId, sector: Sector) => SectorAverage; // medians; sector with <3 → market
export interface Explained { valueText: string; sentence: string; averageText: string }
export function explainMetric(id: MetricId, value: number | null, avg: SectorAverage, currencySymbol: string): Explained;
// peRatio 17.8 → sentence 'You pay Ð17.80 for every Ð1 of yearly profit.', averageText 'Sector average: 22.1' ('Market average: …' when scope market)
// debtToEquity 0.62 → 'It owes Ð0.62 for every Ð1 its owners have put in.'
// currentRatio 1.84 → 'It has Ð1.84 of short-term money for every Ð1 of bills due within a year.'
// netMargin 0.14 → 'It keeps Ð14 of profit from every Ð100 of sales.'
// revenueGrowth 0.07 → 'Sales grew about 7% a year over the last 3 years.'
// value null for peRatio/forwardPe → { valueText: '—', sentence: 'Not meaningful because the company is losing money.' }
// components/ui/InfoTip.tsx {termId: string} — '?' button (≥24px hit area) opens popover on hover/focus/tap: label, whatItIs, whyItMatters, 'Usually a good sign when…'; Esc closes; aria-describedby
// components/ui/ExplainRow.tsx {metric: MetricId; value: number | null; average: SectorAverage; currencySymbol: string; labelOverride?: string}
// lib/market.ts (pure)
export type MoverKind = 'gainers' | 'losers' | 'active';
export function movers(companies: Company[], kind: MoverKind, n?: number): Company[]; // sessionChange desc / asc / sessionVolume desc; default n=6
export function sectorSummaries(companies: Company[]): { sector: Sector; sessionChange: number; voyageChange: number; marketCap: number }[]; // cap-weighted
export function sinceReport(event: NewsEvent, byId: Record<string, Company>): { companyId: string; pct: number }[]; // current vs priceAtFire
```
**Primitives (props):**
- `Panel {title?: ReactNode; actions?: ReactNode; classified?: boolean; children; className?}` renders an eyebrow header. `classified` adds a sea-glass dashed border and a lock icon.
- `Button {variant: 'primary'|'ghost'|'buy'|'sell'|'danger'|'gold'; size?: 'sm'|'md'|'lg'; loading?; icon?; ...button}`.
- `Segmented<T extends string> {options: {value: T; label: ReactNode}[]; value: T; onChange(v: T); ariaLabel: string}` uses `role="radiogroup"`.
- `Pill {tone: 'gain'|'loss'|'info'|'neutral'|'gold'|'dark'; children}`.
- `Crest {name: string; sector: Sector; size?: 28|32|40}` renders an initials roundel.
- `SignedChange {value: number; kind: 'money'|'pct'; showArrow?; strong?; srLabel?}` renders the SVG caret, sign and colour, plus sr-only "up 2.31 percent".
- `DataTable<Row> {columns: {key; header; align?: 'left'|'right'; render(row); sort?(a,b)}[]; rows; rowKey(row); footer?; compact?; stickyFirst?; caption}` with `aria-sort`.
- `Modal {open; title; onClose; children; footer}` has a focus trap and closes on Esc.
- `TypedConfirm {open; title; body; confirmWord; confirmLabel; onConfirm; onCancel; danger?}`.
- `Toast` via a `ToastProvider` + `useToast().push({tone, title, body})` with an `aria-live` region.
- `EmptyState {icon?; title; body; action?}`.
- `Loader {label?}` shows a spinning CompassRose that is static under reduced motion.
- `WaxSeal {tone: 'brass'|'crimson'; monogram?: string; size?}`, `Medallion {rank: 1|2|3|number; size?}`, `CompassRose {size?; spin?}`, `RopeRule`.

**Charts (custom SVG, responsive via ResizeObserver):**
- `Sparkline {values: number[]; width?; height?; tone?: 'auto'|'gain'|'loss'|'neutral'}`.
- `AreaChart {series: {x: number; y: number}[]; compare?: {x; y}[]; baseline?: {y: number; label: string}; height; formatY(v): string; formatX(x): string; tone?: 'auto'|'neutral'; markers?: {x: number; label: string}[]}` has a crosshair tooltip on pointer and keyboard, and a right-side y axis.
- `VolumeBars {values: {x; v}[]; height}`.
- `RangeBar {low; high; value; formatter}`.
- `ScatterChart {points: {x; y; label; tone?}[]; xLabel; yLabel; trend?: boolean; annotations?: {label; x; y}[]}`.
- `Treemap {items: {id; label; group; size; value /* pct */}[]; height; onSelect?(id)}` uses `d3-hierarchy` `treemapSquarify`, colour by a diverging scale with text contrast chosen per tile.

- [ ] **Step 1: Write failing test** `web/src/lib/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatMoney, formatPct, formatCompact, formatClock, direction } from './format';
describe('format', () => {
  it('money with true minus and sign', () => {
    expect(formatMoney(123456)).toBe('Ð1,234.56');
    expect(formatMoney(-2200, { signed: true })).toBe('−Ð22.00');
    expect(formatMoney(190, { signed: true })).toBe('+Ð1.90');
    expect(formatMoney(467_000_000_000, { compact: true })).toBe('Ð4.67B');
  });
  it('percent', () => { expect(formatPct(0.0231, { signed: true })).toBe('+2.31%'); expect(formatPct(-0.0053, { signed: true })).toBe('−0.53%'); expect(formatPct(0, { signed: true })).toBe('0.00%'); });
  it('compact numbers and clock', () => { expect(formatCompact(242_000_000)).toBe('242.0M'); expect(formatClock(148_628_000)).toBe('41:17:08'); });
  it('direction', () => { expect(direction(1)).toBe('up'); expect(direction(-1)).toBe('down'); expect(direction(0)).toBe('flat'); });
});
```
Also write `web/src/lib/market.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { movers, sectorSummaries, sinceReport } from './market';
const c = (id: string, sc: number, vol: number, cap: number, sector = 'Naval Arms') => ({ id, sessionChange: sc, sessionVolume: vol, marketCap: cap, voyageChange: sc, sector, currentPrice: 110 } as any);
describe('movers', () => {
  const cs = [c('a', 0.05, 10, 100), c('b', -0.03, 50, 300), c('d', 0.01, 5, 100, 'Cursed Relics')];
  it('orders gainers, losers, active', () => {
    expect(movers(cs, 'gainers').map((x) => x.id)).toEqual(['a', 'd', 'b']);
    expect(movers(cs, 'losers', 1).map((x) => x.id)).toEqual(['b']);
    expect(movers(cs, 'active').map((x) => x.id)).toEqual(['b', 'a', 'd']);
  });
  it('cap-weights sector change', () => {
    const naval = sectorSummaries(cs).find((s) => s.sector === 'Naval Arms')!;
    expect(naval.sessionChange).toBeCloseTo((0.05 * 100 - 0.03 * 300) / 400, 10);
  });
  it('since report', () => { expect(sinceReport({ companyIds: ['a'], priceAtFire: { a: 100 } } as any, { a: cs[0]! })[0]!.pct).toBeCloseTo(0.1, 10); });
});
```
Also write `web/src/lib/glossary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GLOSSARY, NEWS_EXPLAIN, glossarySearch } from './glossary';
import { NEWS_TYPES } from '@deca/shared';
const REQUIRED = ['stock','price','marketCap','sector','index','volume','beta','analystRating','priceTarget','voyageRange','sessionChange','revenue','netIncome','netMargin','grossMargin','operatingMargin','eps','roe','roa','ebitda','revenueGrowth','industryGrowth','tam','debtToEquity','currentRatio','totalDebt','cash','equity','totalAssets','totalLiabilities','operatingCashFlow','capex','freeCashFlow','peRatio','forwardPe','psRatio','pbRatio','evToEbitda','dividendYield','payoutRatio','marketOrder','fee','priceImpact','avgCost','costBasis','totalGain','realizedGain','unrealizedGain','positionLimit','diversification','cashAvailable','tick','session','quality','news','researchEdge'];
describe('glossary', () => {
  it('has every required term with all explanation lines', () => {
    for (const id of REQUIRED) {
      const e = GLOSSARY[id]; expect(e, id).toBeDefined();
      for (const k of ['label', 'term', 'whatItIs', 'whyItMatters', 'usuallyGoodWhen'] as const) expect(e![k].length, `${id}.${k}`).toBeGreaterThan(8);
    }
  });
  it('keeps sentences short and plain', () => {
    for (const e of Object.values(GLOSSARY)) for (const t of [e.whatItIs, e.whyItMatters, e.usuallyGoodWhen]) {
      expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(32);
      expect(/\b(rum|grog|beer|wine|ale)\b|black pearl|sparrow|barbossa/i.test(t)).toBe(false);
    }
  });
  it('explains every news type both ways and searches', () => {
    for (const t of NEWS_TYPES) { expect(NEWS_EXPLAIN[t].bullish.length).toBeGreaterThan(10); expect(NEWS_EXPLAIN[t].bearish.length).toBeGreaterThan(10); }
    expect(glossarySearch('p/e').map((e) => e.id)).toContain('peRatio');
    expect(glossarySearch('debt').map((e) => e.id)).toContain('debtToEquity');
  });
});
```
And `web/src/lib/compare.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sectorAverages, explainMetric, metricValue } from './compare';
const f = (pe: number, de: number, ni = 100) => ({ peRatio: pe, debtToEquity: de, netIncome: ni, revenue: 1000, netMargin: ni / 1000, history: [{ revenue: 800 }, { revenue: 850 }, { revenue: 900 }, { revenue: 1000 }] } as any);
const c = (id: string, sector: string) => ({ id, sector } as any);
describe('compare', () => {
  const fundamentals = { a: f(10, 0.5), b: f(20, 1), d: f(30, 1.5), e: f(40, 2.0) };
  const companies = { a: c('a', 'Naval Arms'), b: c('b', 'Naval Arms'), d: c('d', 'Naval Arms'), e: c('e', 'Cursed Relics') };
  const avg = sectorAverages(fundamentals, companies);
  it('uses sector median when ≥3 companies, else market median', () => {
    expect(avg('peRatio', 'Naval Arms')).toMatchObject({ scope: 'sector', value: 20, count: 3 });
    expect(avg('peRatio', 'Cursed Relics')).toMatchObject({ scope: 'market', value: 25 });
  });
  it('explains in everyday numbers', () => {
    const pe = explainMetric('peRatio', 17.8, { scope: 'sector', sector: 'Naval Arms', value: 22.1, count: 3 }, 'Ð');
    expect(pe.sentence).toBe('You pay Ð17.80 for every Ð1 of yearly profit.'); expect(pe.averageText).toBe('Sector average: 22.1');
    expect(explainMetric('netMargin', 0.14, avg('netMargin', 'Naval Arms'), 'Ð').sentence).toBe('It keeps Ð14 of profit from every Ð100 of sales.');
    expect(explainMetric('peRatio', null, avg('peRatio', 'Naval Arms'), 'Ð').valueText).toBe('—');
  });
  it('computes revenue growth from history', () => { expect(metricValue('revenueGrowth', f(1, 1), c('a', 'Naval Arms'))).toBeCloseTo((1000 / 800) ** (1 / 3) - 1, 10); });
});
```
- [ ] **Step 2:** Run `npm test -w @deca/web`. Expected FAIL.
- [ ] **Step 3:** Implement everything in this task:
  - `tokens.css` copies BRIEF §2 as CSS custom properties with the semantic names (`--chrome`, `--sheet`, `--gain`…). `base.css` holds the Google Fonts `@import` (BRIEF §3 URL), reset, body `var(--paper)`, typography scale, `.num`, `.sr-only` and focus ring.
  - Visual reference for primitives: copy the helmet CSS vocabulary from `docs/design/canvas/Main.dc.html` (`.panel`, `.panel-head`, `.eyebrow`, `.seg`, `.btn`, `.pill`, table styles, `.crest`).
- [ ] **Step 4:** Run `npm test -w @deca/web && npm run typecheck -w @deca/web` (pages may still import deleted components; Task 8 replaces them. For this wave the gate is `tsc --noEmit -p web` limited by temporarily excluding `src/pages` and `src/App.tsx` via `tsconfig.foundation.json` extending tsconfig with `"exclude": ["src/pages", "src/App.tsx", "src/main.tsx"]`).
- [ ] **Step 5:** Orchestrator commits: `feat(web): midnight theme tokens, UI primitives, SVG charts, v2 hooks`.

---

### Task 8: Web shell, routing, Login

**Files:**
- Create `web/src/components/shell/`: `AppShell.tsx`, `Header.tsx`, `IndexStrip.tsx`, `MobileTabBar.tsx`, `PhaseBanner.tsx`, `HostShell.tsx`, `SymbolSearch.tsx`, `shell.css`
- Rewrite: `web/src/App.tsx`, `web/src/main.tsx`, `web/src/pages/Login.tsx` (+ `Login.css`), `web/index.html` (title "Buccaneer Exchange", compass SVG favicon)
- Create `web/src/components/shell/Walkthrough.tsx`: 3-step card (Research a company → Place a small practice order → Track it on Summary) + "Open the Learn guide" link; dismissal stored in localStorage `bx.walkthrough.${teamId}`; `useWalkthrough()` → `{open, show(), dismiss()}`; crew menu item "How to play" reopens it.
- Create stub `web/src/pages/Learn.tsx` (Task 13b replaces it) and route `/learn`.
- Create stub `web/src/components/trade/TicketDrawer.tsx` exporting `export default function TicketDrawer() { return null; }` (Task 10 replaces it).
- Create stubs `web/src/pages/{Summary,Positions,Activity,Trade,Markets,Research,News,Standings,Results}.tsx` and `web/src/pages/admin/{Control,Crews,Market,NewsDesk,Tape,Audit}.tsx`. Each exports a default component rendering `<Panel title="…">Coming aboard…</Panel>`; later tasks replace them.

**Interfaces:**
- Consumes: Task 7 primitives and hooks.
- Produces:
  - `AppShell {children}`: Header + IndexStrip + PhaseBanner + `<main>` + MobileTabBar + TicketDrawer mount point (`<div id="ticket-root">`).
  - `HostShell {children}`: host header with host nav.
  - `SymbolSearch` (`/` hotkey focus; results navigate to `/trade/:ticker`).
  - Route table exactly as spec §10.
  - `RequireAuth {adminOnly?}`: crews visiting `/admin*` redirect to `/`; admins visiting crew routes redirect to `/admin`.
  - `/results` redirects to `/standings` unless `phase === 'ended'`; when ended, the Summary shows a banner linking to `/results`.
  - Context `TicketContext`: `openTicket({ companyId?: string; side?: OrderSide })` via `useTicket()`. The provider lives in AppShell and renders `<TicketDrawer/>` (static import of the stub; Task 10 replaces the file).
- Visual references: `docs/design/canvas/Main.dc.html` (header, index strip), `Login.dc.html`, `MobileSummary.dc.html` (tab bar).
  - Header must not wrap at 1280px. Below 1100px the nav collapses into a "Menu" button.
  - Below 600px, header = compass + short wordmark + status dot + cash chip, with a bottom tab bar of 5 items.

- [ ] **Step 1:** Write `web/src/components/shell/nav.test.ts` testing the pure `navItemsFor(role: Role | null): {to; label}[]` (exported from `shell/nav.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { navItemsFor, mobileItems } from './nav';
describe('nav', () => {
  it('crew nav order', () => { expect(navItemsFor('team').map((n) => n.label)).toEqual(['Summary', 'Positions', 'Trade', 'Markets', 'Research', 'Dispatches', 'Standings', 'Learn']); });
  it('host nav order', () => { expect(navItemsFor('admin').map((n) => n.label)).toEqual(['Control', 'Crews', 'Market', 'News desk', 'Trade tape', 'Audit']); });
  it('mobile has five with Trade centered', () => { const m = mobileItems(); expect(m).toHaveLength(5); expect(m[2]!.label).toBe('Trade'); });
});
```
- [ ] **Step 2:** Run. Expected FAIL.
- [ ] **Step 3:** Implement the shell, routes, Login (crew/host tabs, error states mapped from API codes) and stubs.
- [ ] **Step 4:** Run `npm test -w @deca/web && npm run typecheck -w @deca/web && npm run build -w @deca/web`. Expected PASS.
- [ ] **Step 5:** Orchestrator commits: `feat(web): app shell, host shell, routing, login`.

---

### Task 9: Summary, Positions, Activity & Balances pages

**Files:**
- Create `web/src/components/portfolio/`: `AccountCard.tsx`, `PositionsTable.tsx`, `WatchlistPanel.tsx`, `ActivityTable.tsx`, `BalancesPanel.tsx`, `derive.ts`, `portfolio.css`
- Rewrite: `web/src/pages/Summary.tsx`, `Positions.tsx`, `Activity.tsx`
- Test: `web/src/components/portfolio/derive.test.ts`

**Interfaces:**
- Consumes: Task 7 hooks/primitives, Task 8 `useTicket`.
- Produces:
```ts
// derive.ts
export interface PositionRow { companyId: string; ticker: string; name: string; sector: Sector; shares: number; avgCost: number; last: number; sessionChangePerShare: number; sessionGain: number; sessionPct: number; totalGain: number; totalPct: number; value: number; pctOfAccount: number; costBasis: number }
export function buildPositions(holdings: Holding[], byId: Record<string, Company>, totalValue: number): PositionRow[]; // sorted by value desc
export function accountTotals(team: Team, rows: PositionRow[]): { invested: number; cashPct: number; sessionGain: number; sessionPct: number; totalGain: number; totalPct: number; startingCapital: number };
// sessionGain = Σ shares·(last − sessionOpen); sessionPct = (totalValue − team.sessionOpenValue)/team.sessionOpenValue; totalPct vs game.startingCapital
```
- **Summary** (`Main.dc.html`):
  - left rail: AccountCard (value, session/total change, cash/invested bar, rank, "vs Pirate Composite ±x pts", Trade/Positions buttons) and WatchlistPanel
  - center: account value AreaChart (range tabs from `rangeTabs(clock)`, starting-chest baseline, composite comparison rebased to starting capital) and a Top-5 positions table (6 columns) with a "View all N positions" link
  - right rail: movers (`movers(companies,'gainers',4)` from `lib/market.ts`), dispatches (3, compact list local to the page with `sinceReport`), standings top 5 with your crew highlighted
  - `<Walkthrough/>` above the grid on first visit (until dismissed)
  - account card labels in plain terms with InfoTips: Cash available to trade (cashAvailable), Invested, Session change (sessionChange), Total gain/loss (totalGain)
  - lobby/empty state: EmptyState "No positions yet. Every fortune starts with a single share." with Markets/Research actions
- **Positions:** the full table with views Overview | Performance | Fundamentals (Segmented), sortable, a cash row, an account total row, row actions Buy/Sell (`openTicket`), and an expand row showing that company's fills from `useTrades`.
- **Activity:** tabs Orders (all `OrderRecord`s with status pills and rejection reasons) | Fills (`Trade`s: time, order # (last 6 of id, Plex Mono), action pill, symbol, qty, fill price, impact bps, amount, fee, net, cash after), plus BalancesPanel (total value, cash, market value, starting chest, total gain/loss, realized/unrealized P&L, fees paid, trade count).
- [ ] **Step 1:** Write `derive.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildPositions, accountTotals } from './derive';
const co = (id: string, last: number, open: number) => ({ id, ticker: id.toUpperCase(), name: id, sector: 'Naval Arms', currentPrice: last, sessionOpen: open, startPrice: open } as any);
describe('portfolio derive', () => {
  it('computes session and total gains per row', () => {
    const rows = buildPositions([{ companyId: 'krkn', shares: 3000, avgCost: 7350 }], { krkn: co('krkn', 8412, 8222) }, 108_421_955);
    expect(rows[0]).toMatchObject({ value: 25_236_000, sessionGain: 570_000, totalGain: 3_186_000, costBasis: 22_050_000 });
    expect(rows[0]!.totalPct).toBeCloseTo(0.14449, 4); expect(rows[0]!.pctOfAccount).toBeCloseTo(0.2328, 3);
  });
  it('account totals', () => {
    const rows = buildPositions([{ companyId: 'a', shares: 10, avgCost: 100 }], { a: co('a', 120, 110) }, 11_200);
    const t = accountTotals({ cashBalance: 10_000, totalValue: 11_200, sessionOpenValue: 11_100 } as any, rows);
    expect(t.invested).toBe(1_200); expect(t.sessionGain).toBe(100); expect(t.cashPct).toBeCloseTo(10_000 / 11_200, 6);
  });
});
```
- [ ] **Step 2:** Run. Expected FAIL.
- [ ] **Step 3:** Implement the components and pages, matching `Main.dc.html` layout, spacing and copy.
- [ ] **Step 4:** Run `npm test -w @deca/web && npm run typecheck -w @deca/web && npm run build -w @deca/web`. Expected PASS.
- [ ] **Step 5:** Orchestrator commits: `feat(web): summary, positions, activity & balances`.

---

### Task 10: Trade page, order ticket, research tabs

**Files:**
- Create `web/src/components/trade/`: `TradeTicket.tsx`, `TicketDrawer.tsx`, `OrderPreview.tsx`, `OrderFilled.tsx`, `useTicketState.ts`, `trade.css`
- Create `web/src/components/research/`: `QuoteHeader.tsx`, `PositionStrip.tsx`, `KeyStats.tsx`, `AnalystCard.tsx`, `FinancialsTab.tsx`, `CrewTab.tsx`, `CompanyNews.tsx`, `research.css`
- Rewrite: `web/src/pages/Trade.tsx`
- Test: `web/src/components/trade/useTicketState.test.ts`

**Interfaces:**
- Consumes: `estimateOrder`, `sharesForAmount`, `maxAffordableShares` (shared); `newClientOrderId`; `apiPost('/orders')`; `useTicket` context (Task 8).
- Produces:
```ts
// useTicketState.ts (pure reducer, testable)
export type TicketStage = 'entry' | 'preview' | 'placing' | 'filled' | 'rejected';
export interface TicketState { stage: TicketStage; side: OrderSide; mode: 'shares' | 'amount'; input: string; companyId: string | null; clientOrderId: string; quotedPrice: number | null; previewTick: number | null; trade: Trade | null; error: { code: string; message: string } | null }
export type TicketAction =
  | { type: 'setSide'; side: OrderSide } | { type: 'setMode'; mode: 'shares' | 'amount' } | { type: 'setInput'; input: string }
  | { type: 'setCompany'; companyId: string } | { type: 'preview'; price: number; tick: number } | { type: 'edit' }
  | { type: 'placing' } | { type: 'filled'; trade: Trade } | { type: 'rejected'; code: string; message: string } | { type: 'reset'; clientOrderId: string };
export function ticketReducer(s: TicketState, a: TicketAction): TicketState;
export function initialTicket(clientOrderId: string, companyId: string | null, side?: OrderSide): TicketState;
export function quantityFrom(s: TicketState, lastPrice: number, beta: number, sharesOutstanding: number, feeBps: number): number;
export function isStale(s: TicketState, lastPrice: number): boolean; // |last − quoted|/quoted > MODEL.priceProtection
```
- **Trade page** `/trade/:ticker?` (`Trade.dc.html`):
  - No ticker: redirect to the largest holding or else the first company.
  - QuoteHeader (price, session change, as of tick, Buy/Sell/watchlist), PositionStrip, tabs `?tab=snapshot|financials|analysts|news|crew`.
  - Snapshot: AreaChart price (range tabs, session-open baseline, news markers) + VolumeBars, performance chips (range returns), key facts (latest company news), about. Right column: TradeTicket (embedded); KeyStats built from `ExplainRow`s with sector averages (Company size, Price vs. profit (P/E), Profit margin, Sales growth, Debt vs. equity, Short-term bill coverage, Dividend yield, Swings vs. market (beta)) plus RangeBar for the game range; AnalystCard in plain words ("Analysts lean Buy: they expect the price to rise about 14%. Analysts are often too optimistic.").
  - Financials: `ResearchReport.dc.html` statements and valuation vs sector medians (sector medians from `useAllFundamentals`). Each statement section opens with a 1–2 sentence plain summary ("Sales grew from Ð6.6B to Ð8.1B over 4 years; profit grew alongside."), row labels carry InfoTips, and a "Read this company in 5 questions" panel at the top links each question to its section (no verdicts).
  - Crew: management cards + industry + risks + developments.
- **TradeTicket** (`Trade.dc.html` right column, `OrderFlow.dc.html`, `MobileTrade.dc.html`):
  - Stages per the reducer. Estimates are from `estimateOrder`.
  - Plain explanations under the estimate, each with an InfoTip: Market order ("Buys right away at about the current price"), Fee ("0.10% charged on every trade"), Price impact ("Big orders nudge the price against you"), and share of account ("This order would make KRKN 27% of your account").
  - Quick chips: buy 10/50/100/Max, sell 25%/50%/All. Amount mode shows "≈ N shares · Ð x stays as cash".
  - Disabled with the reason when the phase is not live or `team.tradingDisabled`.
  - Position limit: when `estimateOrder` returns `position_limit`, show "This would put more than {pct}% of your account in {TICKER}. You can buy up to N more shares." with a "Use N" fix.
  - Preview shows the recap sentence, Now → After rows and an "Estimated" note. Place posts `{companyId, side, quantity, clientOrderId, quotedPrice}`.
  - `409 price_moved` returns to preview with the updated estimate and message "Price has moved since preview. Review the updated estimate."
  - Filled shows the brass WaxSeal, "Order filled: Bought N TICKER at Ð… (Ð…). Fair winds." and a Toast.
  - Errors show icon + text and focus the first invalid control.
  - Mobile (<600px) renders full-screen inside TicketDrawer.
- [ ] **Step 1:** Write `useTicketState.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ticketReducer, initialTicket, quantityFrom, isStale } from './useTicketState';
describe('ticket state', () => {
  const s0 = initialTicket('abcdefgh12', 'kraken');
  it('moves entry → preview → placing → filled and keeps the clientOrderId until reset', () => {
    let s = ticketReducer(s0, { type: 'setInput', input: '500' });
    s = ticketReducer(s, { type: 'preview', price: 8412, tick: 1284 }); expect(s.stage).toBe('preview'); expect(s.quotedPrice).toBe(8412);
    s = ticketReducer(s, { type: 'placing' }); expect(s.stage).toBe('placing');
    s = ticketReducer(s, { type: 'filled', trade: { id: 't' } as any }); expect(s.stage).toBe('filled'); expect(s.clientOrderId).toBe('abcdefgh12');
    s = ticketReducer(s, { type: 'reset', clientOrderId: 'zzzzzzzz99' }); expect(s.stage).toBe('entry'); expect(s.input).toBe(''); expect(s.clientOrderId).toBe('zzzzzzzz99');
  });
  it('edit returns to entry keeping input; rejected keeps error', () => {
    let s = ticketReducer({ ...s0, input: '5', stage: 'preview' }, { type: 'edit' }); expect(s.stage).toBe('entry'); expect(s.input).toBe('5');
    s = ticketReducer(s, { type: 'rejected', code: 'insufficient_funds', message: 'x' }); expect(s.stage).toBe('rejected'); expect(s.error?.code).toBe('insufficient_funds');
  });
  it('quantity from shares or amount', () => {
    expect(quantityFrom({ ...s0, input: '12' }, 8412, 1, 242e6, 10)).toBe(12);
    expect(quantityFrom({ ...s0, mode: 'amount', input: '5000' }, 8412, 1, 242e6, 10)).toBe(59);
    expect(quantityFrom({ ...s0, input: 'abc' }, 8412, 1, 242e6, 10)).toBe(0);
  });
  it('staleness uses the 2% protection band', () => {
    expect(isStale({ ...s0, quotedPrice: 10_000 }, 10_200)).toBe(false); expect(isStale({ ...s0, quotedPrice: 10_000 }, 10_201)).toBe(true);
  });
});
```
- [ ] **Step 2:** Run. Expected FAIL.
- [ ] **Step 3:** Implement the reducer, ticket, drawer, research components and page per the artboards.
- [ ] **Step 4:** Run `npm test -w @deca/web && npm run typecheck -w @deca/web && npm run build -w @deca/web`. Expected PASS.
- [ ] **Step 5:** Orchestrator commits: `feat(web): trade page with previewed, idempotent order ticket and research tabs`.

---

### Task 11: Markets, Research directory, Dispatches

**Files:**
- Create `web/src/components/market/`: `CompositePanel.tsx`, `BreadthPanel.tsx`, `SectorCards.tsx`, `HeatmapPanel.tsx`, `SectorBars.tsx`, `MoversTable.tsx`, `DispatchList.tsx`, `market.css`
- Rewrite: `web/src/pages/Markets.tsx`, `web/src/pages/Research.tsx`, `web/src/pages/News.tsx`
- Test: logic tests live in `web/src/lib/market.test.ts` (Task 7); this task adds none

**Interfaces:**
- Consumes: `movers`, `sectorSummaries`, `sinceReport` from `web/src/lib/market.ts` and `useAllFundamentals` from `web/src/hooks/useAllFundamentals.ts` (both Task 7).
- **Markets** (`Markets.dc.html`): composite chart (`useCompositeHistory`), breadth, 10 sector cards (from `market.sectors`), heatmap (Treemap: size = marketCap, value = sessionChange; controls Size: Market cap | Equal), sector bars, movers table with tabs and Buy/Sell actions, latest dispatches.
- **Research** (`ResearchDirectory.dc.html`): screener with views **Basics (default)** | Valuation | Financial health | Analysts (fundamentals via `useAllFundamentals`). Basics columns: Company, Sector, Price, Session change, Company size, Sales growth (per year, 3y), Profit margin, Price vs. profit (P/E), Debt vs. equity. Every header has an InfoTip, and a helper line sits above the table: "New to this? Start with profit margin, sales growth and debt, then compare P/E with similar companies." Also sector chips, search, sortable columns. Rows link to `/trade/:ticker?tab=financials`.
- **Dispatches:** filter chips All | My holdings | Watchlist | sector; items show type badge, time + tick, headline, a "What this means" line from `NEWS_EXPLAIN[type][sentiment]`, body (expand), ticker chips with since-report %, a "Trade" link opening the ticket, and a sentiment label as text + icon. Never show magnitude.
- [ ] **Step 1:** No new pure helpers are expected; if you add one, test it in `web/src/lib/market.test.ts`.
- [ ] **Step 2:** Run. Expected FAIL. **Step 3:** Implement. **Step 4:** Run the web test/typecheck/build. Expected PASS. **Step 5:** Orchestrator commits: `feat(web): markets overview, research screener, dispatches`.

---

### Task 12: Standings and Final Reckoning

**Files:**
- Create `web/src/components/standings/`: `Podium.tsx`, `StandingsTable.tsx`, `RevealScatter.tsx`, `RevealTable.tsx`, `reveal.ts`, `standings.css`
- Rewrite: `web/src/pages/Standings.tsx`, `web/src/pages/Results.tsx`
- Test: `web/src/components/standings/reveal.test.ts`

**Interfaces:**
```ts
// reveal.ts
export function movement(entry: LeaderboardEntry): { dir: 'up' | 'down' | 'flat'; by: number }; // prevRank − rank
export function revealRows(companies: Company[]): { companyId: string; ticker: string; name: string; quality: number; grade: Grade; expected: number; actual: number; luck: number; label: RevealLabel; drivers: string }[]; // sorted by quality desc; drivers = top 2 pillars by value mapped to phrases
export const LABEL_COPY: Record<RevealLabel, string>; // compounder 'Compounder', unlucky_gem 'Unlucky gem', lucky_turnaround 'Lucky turnaround', decliner 'Decliner'
export const PILLAR_COPY: Record<keyof QualityPillars, { high: string; low: string }>;
```
- **Standings** (`Standings.dc.html`): Podium (Medallion 1–3), table (rank + movement, crew, total value, return, gain/loss, session %, cash %, holdings, Sparkline), your crew highlighted, and an "Updated tick N · time" stamp.
- **Results** (`FinalReckoning.dc.html`): only when ended. All reveal copy is plain language ("Healthier finances tilted the odds, but luck and news still mattered"); drivers use `PILLAR_COPY` phrases ("Strong profits", "Heavy debt", "Shrinking sales", "Cheap for its profits"). Ceremony hero ("Final Standings", crimson WaxSeal on the certificate), winner + runners-up, "Market reveal" explainer, ScatterChart (quality 0–100 = `(score + 1.664)/3.328·100` clamped, vs actual return %, trend line, annotate the max |luck| lucky and unlucky), RevealTable, "Your crew's research grade" card from `leaderboard.final`.
- [ ] **Step 1:** Write `reveal.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { movement, revealRows } from './reveal';
describe('reveal', () => {
  it('movement from prevRank', () => {
    expect(movement({ rank: 3, prevRank: 5 } as any)).toEqual({ dir: 'up', by: 2 });
    expect(movement({ rank: 3, prevRank: 3 } as any)).toEqual({ dir: 'flat', by: 0 });
  });
  it('rows sorted by quality with drivers', () => {
    const mk = (id: string, quality: number) => ({ id, ticker: id, name: id, reveal: { quality, q: 0, grade: 'A', pillars: { prof: 1, grow: -1, safe: 0.5, val: 0 }, fairValue: 1, expectedReturn: 0.1, actualReturn: 0.2, luck: 0.1, label: 'compounder' } } as any);
    const rows = revealRows([mk('a', -1), mk('b', 1)]);
    expect(rows.map((r) => r.companyId)).toEqual(['b', 'a']); expect(rows[0]!.drivers.length).toBeGreaterThan(0);
  });
});
```
- [ ] **Steps 2–5:** as in Task 11. Commit: `feat(web): standings with podium and final reckoning market reveal`.

---

### Task 13: Host console

**Files:**
- Create `web/src/components/admin/`: `GameControlCard.tsx`, `SettingsCard.tsx`, `CrewsTable.tsx`, `CrewDialogs.tsx`, `MarketTable.tsx`, `NewsComposer.tsx`, `ScheduledNews.tsx`, `TradeTape.tsx`, `AuditTable.tsx`, `DangerZone.tsx`, `adminFormat.ts`, `admin.css`
- Rewrite: `web/src/pages/admin/{Control,Crews,Market,NewsDesk,Tape,Audit}.tsx`
- Test: `web/src/components/admin/adminFormat.test.ts`

**Interfaces:**
```ts
// adminFormat.ts
export function lengthLabel(ms: number): string;                    // 3600000 → '1 hour', 172800000 → '48 hours'
export function ticksFor(ms: number): { tickIntervalMs: number; totalTicks: number }; // via deriveClock
export function heartbeat(game: GameState, now: number): { tone: 'ok' | 'warn' | 'bad'; label: string }; // ok ≤2×interval since lastTickAt, warn ≤6×, else bad; not live → neutral 'Engine idle'
export function magnitudeLabel(m: number): string;                 // 0.08 → '+8%'
```
- **Control** (`HostConsole.dc.html` top):
  - GameControlCard: phase pill, countdown, tick progress, heartbeat from `/health` polled every 5s, Start/Pause/Resume/End each behind `Modal` confirmations restating consequences.
  - SettingsCard: lobby-editable (length select from `GAME_LENGTH_OPTIONS_MS` with derived ticks, starting chest, fee bps, research edge low/normal/high explained plainly ("How much company health affects prices: Low = more luck, High = research matters more"), position limit Off/50%/35%/25% with the explanation "Caps any one company's share of a crew's account, so diversified research decides the standings", currency); locked with lock icons when not lobby; POST `/admin/settings`.
  - DangerZone: "Start a new game" (TypedConfirm word `NEW GAME`, checkbox "Keep crews and passwords" default on) → POST `/admin/game/new`; plain copy.
- **Crews:** CrewsTable from `useAdminTeams` (value, cash, return %, trades, rank, trading enabled) with actions View portfolio (Modal listing holdings via Firestore admin read), Reset password (Modal form), Disable/Enable trading, Remove (TypedConfirm `REMOVE`), plus the Add crew form.
- **Market:** Panel `classified` "Host only · hidden from crews" with MarketTable from `useAdminPoll('/admin/market', 5000)`: ticker, last, session %, volume, net flow, quality, grade, fair value, price vs fair value %.
- **News desk:** NewsComposer (company chips multi-select, type select, magnitude slider −50%..+50% step 1%, headline, body, "Publish at next tick"; disabled unless live/paused) and ScheduledNews from `useAdminPoll('/admin/news/scheduled', 15000)` with fired/upcoming status.
- **Trade tape:** live Firestore listener on `trades` ordered by `executedAt desc` limit 100 (admin rule).
- **Audit:** `/admin/logs` table with refresh.
- [ ] **Step 1:** Write `adminFormat.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { lengthLabel, ticksFor, heartbeat, magnitudeLabel } from './adminFormat';
describe('admin format', () => {
  it('labels lengths and ticks', () => { expect(lengthLabel(3_600_000)).toBe('1 hour'); expect(lengthLabel(172_800_000)).toBe('48 hours'); expect(ticksFor(3_600_000)).toEqual({ tickIntervalMs: 5000, totalTicks: 720 }); });
  it('heartbeat tones', () => {
    const g = { phase: 'live', tickIntervalMs: 30_000, lastTickAt: 1_000_000 } as any;
    expect(heartbeat(g, 1_050_000).tone).toBe('ok'); expect(heartbeat(g, 1_150_000).tone).toBe('warn'); expect(heartbeat(g, 1_300_000).tone).toBe('bad');
  });
  it('magnitude label', () => { expect(magnitudeLabel(0.08)).toBe('+8%'); expect(magnitudeLabel(-0.125)).toBe('−13%'); });
});
```
- [ ] **Steps 2–5:** as in Task 11. Commit: `feat(web): host console — control, settings, crews, classified market, news desk, tape, audit`.

---

### Task 13b: Learn guide

**Files:**
- Rewrite: `web/src/pages/Learn.tsx`
- Create `web/src/components/learn/`: `GameGuide.tsx`, `FiveQuestions.tsx`, `fiveQuestions.ts`, `TradingBasics.tsx`, `GlossaryBrowser.tsx`, `learn.css`
- Test: `web/src/components/learn/fiveQuestions.test.ts`

**Interfaces:**
- Consumes: `GLOSSARY`, `glossarySearch` (Task 7); `useGame` settings.
- Produces:
```ts
// components/learn/fiveQuestions.ts
export interface Question { id: 'profit' | 'growth' | 'debt' | 'price' | 'news'; question: string; lookAt: string[]; where: string; tip: string }
export const FIVE_QUESTIONS: Question[]; // lookAt = glossary ids; where = plain UI location ("Trade → Financials → Income statement")
```
- **Layout** (`Learn.dc.html`): left sticky contents list, main column.
  1. "How the game works": starting chest from settings, ticks and sessions, news, fees, position limit from settings, and "Companies with healthier finances tend to do better over the whole game, but news and luck still move prices, so spread your bets."
  2. "Read a company in 5 questions": cards with the question, metrics to look at (InfoTips), where to find them, and a caution tip.
  3. "Trading basics": market order, fee, price impact, average cost, gains, diversification, with worked examples in doubloons ("Buy 10 shares at Ð84.12 → cost Ð841.20 + Ð0.84 fee").
  4. Glossary browser: search plus group chips, rendered from `GLOSSARY`.
- No verdicts about specific companies; no disclosure of scoring weights.
- [ ] **Step 1:** Write `fiveQuestions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FIVE_QUESTIONS } from './fiveQuestions';
import { GLOSSARY } from '../../lib/glossary';
describe('five questions', () => {
  it('has the five questions in order and only references real glossary terms', () => {
    expect(FIVE_QUESTIONS.map((q) => q.id)).toEqual(['profit', 'growth', 'debt', 'price', 'news']);
    for (const q of FIVE_QUESTIONS) for (const id of q.lookAt) expect(GLOSSARY[id], id).toBeDefined();
  });
});
```
- [ ] **Steps 2–5:** Run it (FAIL), implement, then run the web test/typecheck/build (PASS). Commit: `feat(web): Learn guide with 5-question method, trading basics and glossary`.

### Task 14: Documentation

**Files:** Modify `README.md`, `docs/QUICKSTART.md`, `docs/RUNBOOK.md`, `docs/DEPLOY.md`, `docs/research-findings.md`.
- README: what the game is, a feature list, a screenshot placeholder removed (no placeholders; link the canvas artifact instead), a quick start (`npm run dev:local`) and test commands.
- QUICKSTART:
  - Path A local emulator (Java 21 requirement + `JAVA_HOME`)
  - Path B real Firebase (existing console steps; admin login is name `admin`, not an email)
  - Path C deploy
- RUNBOOK: host console walkthrough (settings in lobby, crews, start, pause, host news, new game keepCrews, end + reveal) and troubleshooting via heartbeat and `/health`.
- DEPLOY: env vars unchanged + `CORS_ORIGIN`; note the ~90 writes/tick cost estimate.
- research-findings.md: append "v2 engine & quality score" summarizing models, parameters and calibration targets with source links from the research (GBM/Sigman notes, Engle 2001, Merton 1976, Kou 2002, Sharpe single-index, Toth et al. 2011 square-root law, Almgren et al. 2005, AQR QMJ 2019, Piotroski 2000, Novy-Marx 2013, MSCI Quality).
- [ ] **Step 1:** Write the docs. **Step 2:** Verify every command in QUICKSTART actually runs (`npm run test:integration`, `npm run dev:local` starts and `/health` responds). **Step 3:** Orchestrator commits: `docs: v2 quickstart, runbook, deploy, research`.

---

### Task 15: Verification (orchestrator)

- [ ] `npm run build:shared && npm test && npm run typecheck -w @deca/server && npm test -w @deca/web && npm run typecheck -w @deca/web && npm run build -w @deca/web`: all green.
- [ ] `npm run test:integration` with scratchpad JAVA_HOME: green.
- [ ] Adversarial review workflow over the full diff (correctness, security/hidden-future leaks, determinism/resume, money math, a11y/contrast, IP/copy rules) → verify → fix → re-run checks.
- [ ] Beginner comprehension check: a fresh reviewer agent role-playing a first-time player with no finance background must answer "Is KRKN making money, growing, handling its debt, and priced reasonably vs. similar companies?" using only the running UI and the Learn guide; every term they meet has an InfoTip.
- [ ] `npm run dev:local`; Playwright at 1440×900 and 390×844:
  1. Host login → settings 1h → create 3 crews → Start.
  2. Crew login → Summary renders → Trade KRKN 10 shares via preview → filled seal → Positions/Activity show it.
  3. Host fires news → Dispatches shows it.
  4. Host pause (banner, ticket disabled) → resume → End → Results reveal.
  5. Host New game (keep crews) → lobby with reset cash.

  Screenshot each page and compare against the canvas artboards; fix deviations.
- [ ] Final commit and summary to the user.
