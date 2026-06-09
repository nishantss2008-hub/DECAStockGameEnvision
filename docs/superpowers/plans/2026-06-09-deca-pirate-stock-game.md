# DECA Pirate Stock Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cloud-hosted, pirate-themed, real-time 48-hour stock-market trading game where teams trade ~25 companies with themed currency, research real-format fundamentals, and react to news — with a server-authoritative engine that rewards research over time but keeps prices unpredictable, and a security model where clients can never write real data or see the future.

**Architecture:** A TypeScript monorepo with three workspaces — `shared` (types + zod schemas, the single source of truth for data shapes), `server` (a persistent Node/Fastify "authority service" that runs the price engine + validates trades via the Firebase Admin SDK), and `web` (a React/Vite pirate trading terminal). Firestore is both the durable store and the realtime push channel; clients read via Firestore listeners and write only through the authority service. The future (hidden intrinsic paths + scheduled news) lives only in a server-only `_schedule` collection and the server's memory.

**Tech Stack:** TypeScript, Node 20, Fastify, firebase-admin, Firebase (Firestore + Auth + Hosting), React 18, Vite, Recharts (or lightweight-charts), zod, Vitest, Firebase emulator suite.

**Firebase project:** `decastockenvision` (web config provided; service-account key kept out of git via env).

---

## File Structure & Ownership

```
package.json                     # root, npm workspaces [shared, server, web]
tsconfig.base.json
.env.example                     # documents all env vars (no secrets committed)
firebase.json                    # hosting + firestore rules/emulator config
firestore.rules                  # security rules
firestore.indexes.json
.firebaserc                      # default project: decastockenvision

shared/
  package.json
  src/
    constants.ts                 # game defaults, sectors, currency, archetype list
    types.ts                     # all domain types (the contract)
    schemas.ts                   # zod schemas mirroring types (request/response validation)
    index.ts                     # re-exports

server/
  package.json
  tsconfig.json
  src/
    index.ts                     # bootstrap Fastify + start engine loop
    config.ts                    # env parsing + runtime game config
    firebase.ts                  # admin SDK init (service account from env)
    lib/
      prng.ts                    # deterministic seeded RNG (mulberry32 + helpers)
      money.ts                   # integer-cents money math (no float drift)
      logger.ts                  # audit-log writer -> logs collection
    auth/
      middleware.ts              # verify Firebase ID token + custom claims (team/admin)
    engine/
      archetypes.ts              # fate archetypes + parameter ranges
      intrinsic.ts               # V(t) hidden intrinsic-value path generation
      orderflow.ts               # per-company net order flow + temporary-impact decay
      engine.ts                  # tick: compute P(t) from V, noise, flow, news
      state.ts                   # load/persist prices+tick+clock; resume-from-walltime
      loop.ts                    # the setInterval tick driver + leaderboard refresh
    news/
      schedule.ts                # generate hidden news schedule from seed
      scheduler.ts               # fire due events: apply jump, post news, log
    seed/
      roster.ts                  # the 25 pirate companies (names, tickers, sectors, emoji)
      generateFundamentals.ts    # deterministic real-format fundamentals per company
      seedFirestore.ts           # write companies, fundamentals, _schedule, game state
    services/
      trading.ts                 # validate + execute market order; update cash/holdings
      leaderboard.ts             # recompute team totals + ranks -> leaderboard/current
    routes/
      health.ts                  # GET /health
      orders.ts                  # POST /orders (auth: team)
      admin.ts                   # POST /admin/* (auth: admin): teams, game control, news
  test/
    prng.test.ts
    money.test.ts
    intrinsic.test.ts
    engine.test.ts
    trading.test.ts
    fundamentals.test.ts

web/
  package.json
  vite.config.ts
  index.html
  src/
    main.tsx
    App.tsx                      # router + auth gate
    firebase.ts                  # web SDK init (config from import.meta.env)
    lib/
      api.ts                     # POST helpers to authority service w/ ID token
      format.ts                  # currency (Ð) + number/percent formatting
      auth.tsx                   # AuthProvider + useAuth (team name -> credential)
    hooks/
      useCompanies.ts            # listener: companies collection
      useCompany.ts              # listener: one company + fundamentals
      usePriceHistory.ts         # listener: priceHistory (past+present)
      usePortfolio.ts            # listener: team doc + holdings
      useNews.ts                 # listener: news feed
      useLeaderboard.ts          # listener: leaderboard/current
      useGame.ts                 # listener: game/state (clock, phase)
    components/
      Nav.tsx, TickerStrip.tsx, PriceChart.tsx, TradeTicket.tsx,
      CompanyCard.tsx, FundamentalsPanel.tsx, FinancialStatements.tsx,
      NewsItem.tsx, PortfolioTable.tsx, LeaderboardTable.tsx, Countdown.tsx
    pages/
      Login.tsx, Terminal.tsx, Research.tsx, Portfolio.tsx,
      News.tsx, Leaderboard.tsx, Admin.tsx
    theme/
      tokens.css                 # pirate palette + fonts
      pirate.css                 # parchment/nautical component styles
```

**Ownership rule for parallel build:** `shared/` is authored first and frozen. Every other file imports types/schemas/constants from `@deca/shared`. Server and web files are disjoint, so agents can build them concurrently against the frozen contract.

---

## The Contract: `shared/src/types.ts` (authoritative shapes)

```ts
export type Phase = 'lobby' | 'live' | 'ended';
export type OrderSide = 'buy' | 'sell';
export type Role = 'team' | 'admin';
export type Archetype = 'compounder' | 'turnaround' | 'steady' | 'value_trap' | 'decliner';

export interface GameState {
  phase: Phase;
  startAt: number | null;       // epoch ms
  endAt: number | null;         // epoch ms
  currentTick: number;
  tickIntervalMs: number;       // 30_000
  serverTime: number;           // last engine heartbeat epoch ms
  currency: { name: string; symbol: string };  // Doubloons, Ð
  startingCapital: number;      // integer "cents" of Ð
}

export interface Company {
  id: string;                   // slug, e.g. "blackbeard"
  name: string;                 // "Blackbeard Incorporated"
  ticker: string;               // "BBRD"
  sector: string;
  emoji: string;                // themed glyph
  description: string;
  currentPrice: number;         // integer cents
  prevClose: number;            // integer cents (price 24h/reference ago)
  dayChange: number;            // signed fraction, e.g. 0.0123
  sharesOutstanding: number;
  marketCap: number;            // integer cents = currentPrice * sharesOutstanding
}

export interface Fundamentals {
  // valuation/size
  marketCap: number; sharesOutstanding: number; float: number;
  week52High: number; week52Low: number;
  peRatio: number; forwardPe: number; psRatio: number; pbRatio: number; evToEbitda: number;
  dividendYield: number; payoutRatio: number;
  // income statement (most recent period; `history` has prior periods)
  revenue: number; costOfRevenue: number; grossProfit: number; operatingIncome: number;
  netIncome: number; eps: number; ebitda: number;
  grossMargin: number; operatingMargin: number; netMargin: number;
  // balance sheet
  cash: number; totalAssets: number; totalDebt: number; totalLiabilities: number; equity: number;
  currentRatio: number; debtToEquity: number;
  // cash flow + returns
  operatingCashFlow: number; capex: number; freeCashFlow: number; roe: number; roa: number;
  // qualitative
  businessOverview: string;
  management: { name: string; role: string; bio: string; tenureYears: number }[];
  industry: { sector: string; tam: number; growthRate: number; competitivePosition: string; notes: string };
  marketingStrategy: string;
  riskFactors: string[];
  recentDevelopments: string[];
  analyst: { rating: string; priceTarget: number };
  history: { period: string; revenue: number; netIncome: number; eps: number }[];
}

export interface Team {
  id: string; name: string;
  cashBalance: number;          // integer cents of Ð
  totalValue: number;          // cash + holdings mark-to-market
  rank: number;
}
export interface Holding { companyId: string; shares: number; avgCost: number; }

export interface OrderRequest { companyId: string; side: OrderSide; quantity: number; }
export interface Trade {
  id: string; teamId: string; companyId: string; side: OrderSide;
  quantity: number; price: number; fee: number; executedAt: number;
  cashAfter: number; sharesAfter: number;
}

export interface NewsEvent {
  id: string; headline: string; body: string; companyIds: string[];
  impact: 'merger' | 'scandal' | 'storm' | 'discovery' | 'regulatory' | 'earnings' | 'management' | 'macro';
  magnitude: number;            // signed fractional jump applied to price
  firedAt: number;
}

export interface LeaderboardEntry { teamId: string; name: string; totalValue: number; rank: number; }
```

**`shared/src/constants.ts`** holds: currency default `{ name:'Doubloons', symbol:'Ð' }`, `STARTING_CAPITAL = 1_000_000_00` (cents), `TICK_INTERVAL_MS = 30_000`, `GAME_LENGTH_MS = 48*3600*1000`, the sector list, archetype list, and engine params `{ kappa, sigmaBase, lambda, impactDecay }`.

**`shared/src/schemas.ts`** holds zod schemas for `OrderRequest`, admin payloads (create team, fire news, set config), used by server routes for validation.

---

## Phase 1 — Foundation & contracts

### Task 1.1: Root monorepo + tooling
**Files:** Create `package.json` (workspaces), `tsconfig.base.json`, `.env.example`, `.firebaserc`, `firebase.json`, `firestore.indexes.json`.
- [ ] Root `package.json` with `workspaces: ["shared","server","web"]`, scripts: `dev`, `build`, `test`, `emulators`, `seed`.
- [ ] `.firebaserc` → `{ "projects": { "default": "decastockenvision" } }`.
- [ ] `.env.example` documenting: `FIREBASE_SERVICE_ACCOUNT` (JSON), `GAME_SEED`, `PORT`, `CORS_ORIGIN`, and web `VITE_FIREBASE_*` keys (apiKey/authDomain/projectId/etc.) using the provided config values.
- [ ] Commit.

### Task 1.2: `shared` workspace
**Files:** Create `shared/package.json`, `shared/src/{types,schemas,constants,index}.ts`.
- [ ] Author the full `types.ts`, `schemas.ts`, `constants.ts` exactly as the Contract section above.
- [ ] `npm run build -w shared` compiles clean.
- [ ] Commit.

---

## Phase 2 — Deterministic data generation (research-grounded)

> Research input: equity-research metric structure + realistic ranges (web-researched at build) inform `generateFundamentals`.

### Task 2.1: Seeded PRNG (`server/src/lib/prng.ts`)
- [ ] **Test first** (`test/prng.test.ts`): same seed → identical sequence; different seed → different; `range(min,max)` within bounds; `pick(arr)` deterministic.
- [ ] Implement mulberry32 + helpers `next()`, `range(min,max)`, `int(min,max)`, `pick(arr)`, `gauss()`.
- [ ] Tests pass. Commit.

### Task 2.2: Money math (`server/src/lib/money.ts`)
- [ ] **Test first** (`test/money.test.ts`): integer-cent add/sub/mul-by-shares, no float drift; format round-trips.
- [ ] Implement cents-based helpers. Tests pass. Commit.

### Task 2.3: Company roster (`server/src/seed/roster.ts`)
- [ ] 25 pirate companies: `{id,name,ticker,sector,emoji}` across sectors (Shipping & Salvage, Rum & Provisions, Naval Arms, Cartography & Navigation, Treasure Banking, Cursed Relics, Tortuga Hospitality, Parrot & Livestock, Maps & Instruments, Insurance/Letters of Marque). Examples: Blackbeard Incorporated (BBRD), Davy Jones Salvage Co. (DJON), Kraken Shipping Lines (KRKN), Calico Jack Rum Distillers (CJRD), Port Royal Banking (PRYL), Flying Dutchman Freight (FDUT), Anne Bonny Cartography (ABON), Tortuga Tavern Group (TRTG), Letters of Marque Assurance (LMAQ), Mary Read Munitions (MRED)…
- [ ] Commit.

### Task 2.4: Archetypes + intrinsic path (`engine/archetypes.ts`, `engine/intrinsic.ts`)
- [ ] **Test first** (`test/intrinsic.test.ts`): each archetype yields the expected long-run drift sign over the full tick range; path deterministic from seed; values stay positive.
- [ ] `archetypes.ts`: map archetype → `{ driftRange, volRange, fundamentalBias }`.
- [ ] `intrinsic.ts`: `generateIntrinsicPath(seed, companyId, archetype, ticks)` → smooth `V(t)` (drift + low-freq sine waves), plus `assignArchetypes(seed, companies)` (balanced spread). Deterministic.
- [ ] Tests pass. Commit.

### Task 2.5: Fundamentals generator (`seed/generateFundamentals.ts`)
- [ ] **Test first** (`test/fundamentals.test.ts`): internal consistency — `marketCap == price*shares`; `grossProfit == revenue-costOfRevenue`; `eps == netIncome/shares`; margins in [−1,1]; `peRatio == price/eps` when eps>0; archetype correlation (compounder avg margin > decliner avg margin across seeds).
- [ ] Implement: derive a consistent financial profile from price, shares, archetype bias, and seeded noise; generate management/industry/marketing/risks/analyst text from themed templates; 4 periods of history.
- [ ] Tests pass. Commit.

### Task 2.6: News schedule (`news/schedule.ts`)
- [ ] `generateNewsSchedule(seed, companies, ticks)` → hidden list of `{tick, companyIds, impact, magnitude, headline, body}`; spread across 48h; magnitudes correlate with archetype (compounders get more positive surprises). Deterministic. Unit-tested for count/spread/determinism. Commit.

---

## Phase 3 — Price engine

### Task 3.1: Order flow + impact (`engine/orderflow.ts`)
- [ ] **Test first**: recording buys increases pending flow; impact applied then decays geometrically by `impactDecay` each tick toward 0.
- [ ] Implement `OrderFlow` (per-company accumulator + decaying temporary impact). Tests pass. Commit.

### Task 3.2: Tick update (`engine/engine.ts`)
- [ ] **Test first** (`test/engine.test.ts`): with no noise/flow/news, `P` mean-reverts toward `V` (gap shrinks); a buy pushes price up that tick; a news jump moves price by magnitude; full run deterministic given seed; price stays > 0; per-tick move clamped.
- [ ] Implement `stepPrice({prev, intrinsic, sigma, netFlow, newsJump, rng})` using:
  `P = clampPos(prev + kappa*(V-prev) + sigma*gauss + lambda*netFlow + newsJump)` with move clamp.
- [ ] Tests pass. Commit.

### Task 3.3: State persistence + resume (`engine/state.ts`)
- [ ] Load/persist `{prices[], currentTick}` to Firestore; `resumeTick(now, startAt, tickIntervalMs)`; on boot, recompute target tick from wall-clock and fast-forward deterministically if behind.
- [ ] Unit-test resume math (no Firestore): given startAt/now/interval → correct tick. Commit.

### Task 3.4: Loop driver (`engine/loop.ts`)
- [ ] `setInterval` driver: each tick → advance intrinsic index, drain order flow, fire due news, `stepPrice` per company, write `companies.currentPrice` + `priceHistory/{tick}` + update `game/state`, refresh leaderboard. Batched Firestore writes. Heartbeat to `game/state.serverTime`.
- [ ] Commit (integration-tested in Phase 7 against emulator).

---

## Phase 4 — Authority server

### Task 4.1: Firebase admin + config (`firebase.ts`, `config.ts`)
- [ ] Init admin SDK from `FIREBASE_SERVICE_ACCOUNT` env JSON; export `db`, `auth`. Parse env config. Commit.

### Task 4.2: Auth middleware (`auth/middleware.ts`)
- [ ] Verify `Authorization: Bearer <idToken>` via `auth.verifyIdToken`; attach `{uid, teamId, role}` from custom claims; `requireTeam` / `requireAdmin` guards. Unit-test claim parsing. Commit.

### Task 4.3: Trading service (`services/trading.ts`)
- [ ] **Test first** (`test/trading.test.ts`, in-memory fakes): buy with enough cash → cash down, shares up, avgCost updated; insufficient cash rejected; sell more than held rejected; sell → cash up, shares down; fee applied; records flow.
- [ ] Implement `executeOrder(teamId, order)` as a Firestore transaction: read price + team + holding, validate, write trade + updated balances, log, record order flow. Tests pass. Commit.

### Task 4.4: Leaderboard (`services/leaderboard.ts`)
- [ ] `recompute()` → mark-to-market all teams, sort, write `leaderboard/current` + team ranks. Unit-test ranking. Commit.

### Task 4.5: Routes (`routes/{health,orders,admin}.ts`, `index.ts`)
- [ ] `GET /health`; `POST /orders` (requireTeam, zod-validate, rate-limit, `executeOrder`); admin: `POST /admin/teams` (create team → Auth user + claims + doc), `/admin/game/{start,pause,resume,end}`, `/admin/news` (fire custom event), `/admin/config`. Wire engine loop start in `index.ts`. Commit.

### Task 4.6: Logger + rate limit (`lib/logger.ts`)
- [ ] Append-only `logs` writer; simple per-team token-bucket rate limiter on orders. Commit.

---

## Phase 5 — Security

### Task 5.1: Firestore rules (`firestore.rules`)
- [ ] Public read: `game`, `companies` (+ `fundamentals`, `priceHistory`), `news`, `leaderboard`. Team-scoped read on `teams/{id}` + subcollections via `request.auth.token.teamId == id || admin`. Deny-all client reads on `_schedule`, `logs`. Deny **all** client writes everywhere. Commit.

### Task 5.2: Rules tests (Phase 7 emulator) — placeholder reference, implemented in Task 7.2.

---

## Phase 6 — Frontend (pirate-themed)

### Task 6.1: Web scaffold + firebase + theme
- [ ] `web/package.json`, `vite.config.ts`, `index.html`, `firebase.ts` (config from `VITE_FIREBASE_*`), `theme/tokens.css` + `theme/pirate.css` (parchment palette, nautical fonts), `main.tsx`, `App.tsx` (router + auth gate). Commit.

### Task 6.2: Auth + API libs
- [ ] `lib/auth.tsx` (AuthProvider, `login(teamName,password)` → maps to `<slug>@deca-pirates.game`, `signInWithEmailAndPassword`), `lib/api.ts` (POST with ID token), `lib/format.ts`. `pages/Login.tsx`. Commit.

### Task 6.3: Firestore hooks
- [ ] All hooks in `hooks/` returning live data via `onSnapshot`. Commit.

### Task 6.4: Components
- [ ] Nav, TickerStrip, PriceChart, TradeTicket, CompanyCard, FundamentalsPanel, FinancialStatements, NewsItem, PortfolioTable, LeaderboardTable, Countdown. Commit.

### Task 6.5: Pages
- [ ] Terminal (ticker + chart + trade ticket), Research (company list → detail w/ full fundamentals), Portfolio (live positions + P&L + history), News, Leaderboard, Admin (team mgmt, game control, fire news, audit view). Commit.

> Frontend visual polish uses the `frontend-design` skill at build time.

---

## Phase 7 — Testing & verification

### Task 7.1: Engine simulation harness
- [ ] Headless 5,760-tick sim (no Firestore) printing per-archetype final returns; assert compounders beat decliners on average across seeds; assert short-run autocorrelation low (unpredictable). Commit.

### Task 7.2: Firestore rules tests (emulator)
- [ ] `@firebase/rules-unit-testing`: client cannot read `_schedule`/`logs`; cannot read another team; cannot write any collection; can read public + own. Commit.

### Task 7.3: Integration (emulator)
- [ ] Seed → start engine → place orders via service → assert balances/holdings/leaderboard update; restart → resume tick correct. Commit.

---

## Phase 8 — Deploy & operate

### Task 8.1: Deploy docs (`docs/DEPLOY.md`)
- [ ] Click-by-click: enable Blaze; create service account + download key; set server env (`FIREBASE_SERVICE_ACCOUNT`, `GAME_SEED`, `CORS_ORIGIN`); deploy server to Cloud Run (or Render) with min-instances=1; `firebase deploy` rules + hosting; seed command; create teams; start game. Commit.

### Task 8.2: Operator runbook
- [ ] How to fire news, monitor, pause/resume, end + reveal. Commit.

---

## Self-Review

- **Spec coverage:** access(cloud)→§Arch+Deploy; research-payoff(mirror)→Phase 2/3 (intrinsic+noise+flow+news); 24/7→loop; large(25/12+)→roster+teams; tickers work→roster+engine; live pricing→loop+history; news→Phase 2.6/4.5; logging→logger; 48h→game clock+resume; volume→orderflow; live portfolios→trading+hooks; security→Phase 5+auth+server authority; hidden future→`_schedule` deny-all; passwords→Firebase Auth; themed money→currency/startingCapital; fundamentals/market cap/research→Phase 2.5 + Research page. All covered.
- **Placeholder scan:** none (Task 5.2 explicitly points to Task 7.2).
- **Type consistency:** route/service/hook names match `types.ts`; `executeOrder`, `recompute`, `stepPrice`, `generateIntrinsicPath` used consistently.

---

## Build approach (ultracode)

Given ultracode mode, execution will use **Workflow orchestration**: Phase 1–2 contracts authored first (frozen), then parallel build agents own disjoint files per phase, followed by an adversarial review/verify workflow. Web research (equity-research realism) runs as a parallel research phase feeding Task 2.5.
