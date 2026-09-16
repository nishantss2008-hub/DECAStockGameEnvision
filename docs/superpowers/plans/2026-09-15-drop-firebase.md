# Drop Firebase: server-owned SQLite + SSE (v3)

> **For agentic workers:** this plan is executed by ultracode workflows. Agents own disjoint files, never `git commit`, and report short summaries.

**Goal:** remove every Firebase dependency. The authority server owns its data in SQLite, pushes live updates to phones over SSE, issues its own session tokens, and serves the built web app — one free-hostable process, one URL.

**Why:** the user requires a free deployment. Firestore's free tier allows ~20k writes/day; a game writes ~518k per 48h. SQLite has no write cap (`docs/HOSTING-FREE.md`).

**Keeps unchanged:** the engine math (`server/src/engine/model.ts`, `news.ts`, `state.ts`, `flow.ts`), the market generator, `shared/`, every web screen, component, hook SIGNATURE, the copy deck and the design system.

## Target architecture

```
Browser (PWA)  ──HTTPS──▶  Fastify server (single process, Oracle Always Free VM)
  React app  ◀─SSE /api/stream─┤  engine tick loop (in memory) + SQLite (WAL) + Litestream → B2
  static files ◀──────────────┘
```

## Global constraints

- Node ≥20; SQLite through `better-sqlite3` (fallback `node:sqlite` if the native build fails on ARM — report if so).
- All money stays integer cents. Engine determinism and resume behaviour must not change: `_engine/state` becomes the `engine_state` row, nothing else about the math moves.
- One SQLite transaction per tick (~90 writes → 1 commit), WAL mode, `synchronous=NORMAL`.
- No Firebase package anywhere when done: `firebase-admin` and `firebase` are removed from both workspaces, and `firestore.rules`, `firestore.indexes.json`, `firebase.json` and `.firebaserc` are deleted.
- Auth: HS256 JWT signed with `SESSION_SECRET` (generated and stored in the `meta` table when unset). 12-hour expiry. `sessions.token_version` per crew allows instant revocation on password reset or removal.
- Every response a crew receives is filtered server-side; hidden fields (`q`, `qEff`, `surprise`, `quality`, `pillars`, `fairValue`, scheduled news, seed) never leave the server before `phase === 'ended'`.
- Tests: no emulator. Integration tests run against a temp SQLite file and are fast.

## Wave A0 — game length: 30 minutes maximum (part of A1)

User requirement (2026-09-15): **a game runs at most 30 minutes.**
- `shared/src/constants.ts`: `GAME_LENGTH_OPTIONS_MS = [10, 15, 20, 30].map(m => m * 60_000)`, `DEFAULT_GAME_LENGTH_MS = 30 * 60_000`. Keep the 5s tick floor, so a game is 120–360 ticks and 8 sessions of 75–270s.
- `deriveClock` is unchanged; update `clock.test.ts` expectations (30 min → 5s ticks, 360 ticks, 45 session ticks; 10 min → 120 ticks) and `rangeTabs` (candidates become 1M, 5M, 15M filtered to ≤ half the game, then All).
- `calibration.test.ts` runs 10-minute and 30-minute games instead of 1h and 48h; the bands are unchanged because the model is scale-free (verify and report the measured numbers).
- News: `K = clamp(round(1.5·√hours), 2, 12)` gives K = 2 per company (about 50 events per game), which is right for a fast game. Do not change it.
- Copy and docs: replace every "48-hour"/"1h–48h" mention in `docs/design/COPY.md` (§7 guide, §11 host settings), `README.md`, `docs/QUICKSTART.md`, `docs/RUNBOOK.md`, `docs/DEPLOY.md` and `docs/design/MOBILE.md` §7 with the 10–30 minute options; the host settings list becomes "10 / 15 / 20 / 30 minutes".
- Cost note in the docs: a 30-minute game is about 32k writes, which SQLite handles locally with no quota.

## Wave A — server (3 agents, disjoint files)

### A1 — storage layer, market service, seed CLIs
**Owns:** `server/src/store/**`, `server/src/services/market.ts`, `server/src/seed/*.ts`, `server/src/config.ts`, plus Wave A0 (`shared/src/constants.ts`, `server/test/clock.test.ts`, `server/test/calibration.test.ts`).

```ts
// store/schema.sql — tables (all ids TEXT unless noted)
meta(key PRIMARY KEY, value)                                  -- seed, session_secret, schema_version
game_state(id INTEGER PRIMARY KEY CHECK (id = 1), json)       -- whole GameState as JSON
engine_state(id INTEGER PRIMARY KEY CHECK (id = 1), json)     -- {lastTick, hM, companies:{...}}
companies(id PK, ticker, name, sector, json)                  -- public Company fields in json
fundamentals(company_id PK, json)
company_secret(company_id PK, json)                           -- q, qEff, surprise, quality, grade, pillars, idioVol, beta, adv, startPriceCents
price_history(company_id, tick INTEGER, price INTEGER, volume INTEGER, PRIMARY KEY (company_id, tick))
market_summary(id INTEGER PRIMARY KEY CHECK (id = 1), json)
market_history(tick INTEGER PRIMARY KEY, value REAL)
crews(id PK, name, password_hash, cash INTEGER, total_value INTEGER, rank INTEGER, realized_pnl INTEGER, fees_paid INTEGER, trade_count INTEGER, trading_disabled INTEGER, session_open_value INTEGER, holdings_count INTEGER, token_version INTEGER, created_at INTEGER)
holdings(crew_id, company_id, shares INTEGER, avg_cost INTEGER, PRIMARY KEY (crew_id, company_id))
crew_history(crew_id, tick INTEGER, value INTEGER, PRIMARY KEY (crew_id, tick))
crew_stats(crew_id PK, exposure REAL, weight REAL)
trades(id PK, crew_id, company_id, side, quantity INTEGER, price INTEGER, last_price INTEGER, impact_bps INTEGER, fee INTEGER, realized_pnl INTEGER, executed_at INTEGER, tick INTEGER, cash_after INTEGER, shares_after INTEGER, client_order_id)
orders(id PK, crew_id, client_order_id, company_id, side, quantity INTEGER, status, code, reason, trade_id, created_at INTEGER, tick INTEGER, UNIQUE(crew_id, client_order_id))
news(id PK, tick INTEGER, fired_at INTEGER, json)             -- public NewsEvent
news_schedule(id INTEGER PRIMARY KEY AUTOINCREMENT, json, fired INTEGER)
leaderboard(id INTEGER PRIMARY KEY CHECK (id = 1), json)
audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, action, actor, payload, timestamp INTEGER)
-- indexes: trades(crew_id, executed_at DESC), orders(crew_id, created_at DESC), news(fired_at DESC), price_history(tick)
```

```ts
// store/index.ts — the ONLY module that touches SQLite
export function openStore(file?: string): Store;            // file default: env DB_FILE ?? ./data/game.db; ':memory:' allowed in tests
export interface Store {
  raw: Database;                                            // better-sqlite3 handle (tests only)
  tx<T>(fn: () => T): T;                                    // IMMEDIATE transaction, nested-safe
  meta: { get(k: string): string | null; set(k: string, v: string): void };
  game: { get(): GameState | null; set(s: GameState): void };
  engine: { get(): EngineStateRow | null; set(s: EngineStateRow): void };
  companies: { all(): Company[]; get(id: string): Company | null; upsertMany(c: Company[]): void; update(id: string, patch: Partial<Company>): void };
  fundamentals: { all(): Record<string, Fundamentals>; get(id: string): Fundamentals | null; upsertMany(f: Record<string, Fundamentals>): void };
  secrets: { all(): Record<string, CompanySecret>; upsertMany(s: Record<string, CompanySecret>): void };
  history: { append(rows: { companyId: string; tick: number; price: number; volume: number }[]): void; range(companyId: string, from: number, to: number): PricePoint[]; latestTick(companyId: string): number };
  market: { get(): MarketSummary | null; set(m: MarketSummary): void; appendHistory(tick: number, value: number): void; historyRange(from: number, to: number): { tick: number; value: number }[] };
  crews: { all(): Team[]; get(id: string): Team | null; byName(id: string): Team | null; create(row: NewCrew): void; update(id: string, patch: Partial<CrewRow>): void; remove(id: string): void; passwordHash(id: string): string | null; bumpTokenVersion(id: string): number };
  holdings: { forCrew(id: string): Holding[]; get(crewId: string, companyId: string): Holding | null; upsert(crewId: string, h: Holding): void; remove(crewId: string, companyId: string): void; all(): Record<string, Holding[]> };
  crewHistory: { append(rows: { crewId: string; tick: number; value: number }[]): void; range(crewId: string, from: number, to: number): { tick: number; value: number }[]; series(crewId: string): number[] };
  crewStats: { add(crewId: string, exposure: number, weight: number): void; get(crewId: string): { exposure: number; weight: number } };
  trades: { insert(t: Trade): void; forCrew(id: string, limit: number): Trade[]; sinceTick(tick: number): Trade[]; recent(limit: number): Trade[] };
  orders: { insert(o: OrderRecord): void; byClientId(crewId: string, clientOrderId: string): OrderRecord | null; forCrew(id: string, limit: number): OrderRecord[] };
  news: { insert(n: NewsEvent[]): void; recent(limit: number): NewsEvent[]; forCompany(id: string, limit: number): NewsEvent[] };
  newsSchedule: { set(events: ScheduledEvent[]): void; all(): ScheduledEvent[]; markFired(ids: number[]): void };
  leaderboard: { get(): Leaderboard | null; set(l: Leaderboard): void };
  audit: { add(action: string, actor: string, payload: unknown): void; recent(limit: number): LogEntry[] };
  clearDynamic(opts: { keepCrews: boolean; startingCapital: number }): void;
  close(): void;
}
export const store: Store;                                   // process singleton, opened lazily
```
- `store/migrate.ts` applies `schema.sql` idempotently and records `schema_version` in `meta`.
- `services/market.ts`: same exported API (`createMarket`, `clearDynamicData`), rewritten on `store`; admin password lives in `meta.admin_password_hash`.
- `seed/seedFirestore.ts` → rename to `seed/seedMarket.ts` (keep `npm run seed`); `reset.ts`, `setHostPassword.ts` ported.
- Delete `server/src/firebase.ts` and every `firebase-admin` import in owned files.
- Tests: `server/test/store.test.ts` (schema round-trips, tx rollback, clearDynamic with and without crews, history ranges), `market.test.ts` (createMarket writes 25 companies, secrets separated, idempotent re-run).

### A2 — engine loop + leaderboard on the store
**Owns:** `server/src/engine/loop.ts`, `engine/loopHelpers.ts`, `services/leaderboard.ts`.
- Same public API as today (`engine.load/start/stop/tickOnce/quote/reserveFlow/closePrice/startGame/pauseGame/resumeGame/endGame/queueHostNews/adminMarket/scheduledNews/health/applySettings`), with Firestore batches replaced by ONE `store.tx()` per tick that writes: price history rows, company snapshots, market summary + history, fired news, game state, engine state.
- Pending-flow rebuild on load uses `store.trades.sinceTick(engineState.lastTick + 1)`.
- `recomputeLeaderboard` / `finalizeLeaderboard` read and write through the store; sparks come from `crewHistory.series`.
- After each successful tick commit, call `publishTick(...)` from A3's realtime hub (import type only; if the module is not there yet, code against the interface below).
- Tests: port `engineLoop.test.ts` to a `:memory:` store; keep `loopHelpers.test.ts`.

### A3 — sessions, trading, crews, routes, SSE, static hosting
**Owns:** `server/src/auth/**`, `server/src/realtime/**`, `server/src/services/trading.ts`, `services/crews.ts`, `server/src/routes/**`, `server/src/index.ts`.

```ts
// auth/sessions.ts
export function issueToken(subject: { role: Role; teamId?: string; tokenVersion: number }): { token: string; expiresAt: number };
export function verifyToken(token: string): { role: Role; teamId?: string; tokenVersion: number } | null;  // checks signature, expiry, and crew token_version
export function sessionSecret(): string;                      // meta.session_secret, generated on first use
// auth/middleware.ts — same requireTeam / requireAdmin guards, now reading the Bearer JWT
// realtime/hub.ts
export type StreamEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'tick'; data: { tick: number; serverTime: number; prices: Record<string, number>; market: MarketSummary; leaderboard: Leaderboard; game: GameState } }
  | { type: 'news'; data: NewsEvent[] }
  | { type: 'portfolio'; data: { team: Team; holdings: Holding[]; trades: Trade[]; orders: OrderRecord[] } }
  | { type: 'phase'; data: GameState }
  | { type: 'ping'; data: { t: number } };
export function subscribe(res: FastifyReply, ctx: { role: Role; teamId?: string }): () => void;
export function publishTick(payload: Extract<StreamEvent, { type: 'tick' }>['data']): void;   // public fan-out
export function publishNews(events: NewsEvent[]): void;
export function publishPhase(game: GameState): void;
export function publishPortfolio(teamId: string): void;        // reads the crew's rows and sends only to that crew's connections
export function connectionCount(): number;
```
- `GET /api/stream` (Bearer token; also accepts `?token=` because `EventSource` cannot set headers — the web client uses fetch streaming, so the query form is a fallback) sends `snapshot` immediately, then events; `ping` every 15s; `Cache-Control: no-store`, `X-Accel-Buffering: no`.
- **Read endpoints** (all JSON, crew-filtered):
  `GET /api/bootstrap` (game, companies, market, leaderboard, recent news, own portfolio when a crew) ·
  `GET /api/companies` · `GET /api/companies/:id` (company + fundamentals) · `GET /api/fundamentals` ·
  `GET /api/companies/:id/history?from&to` · `GET /api/market/history?from&to` ·
  `GET /api/news?limit` · `GET /api/standings` · `GET /api/portfolio` · `GET /api/portfolio/history?from&to` ·
  `GET /api/trades?limit` · `GET /api/orders?limit`.
  Reveal fields are stripped from `/api/companies*` unless `phase === 'ended'`.
- **Unchanged contracts:** `POST /auth/login` (now returns `{ token, role, teamId, expiresAt }`), `POST /orders`, every `/admin/*` route, `GET /health` (add `connections`).
- Static hosting: `@fastify/static` serves `web/dist` when it exists (`WEB_DIR` env overrides), with an SPA fallback that never swallows `/api`, `/auth`, `/admin`, `/orders` or `/health`; `sw.js` and `index.html` get `no-cache`, hashed assets get one year.
- `crews.ts`: password reset and removal bump `token_version` (instant sign-out).
- Tests: `auth.test.ts` (sign, verify, expiry, version bump), `routes.test.ts` (rewritten with `fastify.inject`, covering every endpoint's auth and crew filtering), `stream.test.ts` (subscribe/publish fan-out and per-crew isolation).

## Wave B — web (2 agents)

### B1 — transport and store
**Owns:** `web/src/lib/api.ts`, `web/src/lib/live.ts` (new), `web/src/lib/auth.tsx`, `web/src/firebase.ts` (delete), `web/src/lib/liveStore.ts` (new).
- `live.ts`: one connection per session using `fetch` + `ReadableStream` SSE parsing (auto-reconnect with backoff, resubscribe after wake, `visibilitychange` resume, offline flag), feeding a small observable store (`subscribe(selector)`), seeded by `GET /api/bootstrap`.
- `auth.tsx`: same `useAuth()` API; `login()` posts to `/auth/login`, stores the token in `localStorage` (`bx.session`), attaches `Authorization` to every request and to the stream, clears on 401 and on sign-out.
- `api.ts`: same helpers, now with the session token and a typed `apiGet<T>` for the new read endpoints.

### B2 — hooks on the live store
**Owns:** `web/src/hooks/**`.
- Every existing hook keeps its exact name, arguments and return shape (`useGame`, `useCompanies`, `useCompany`, `useHistory`, `useMarket`, `useCompositeHistory`, `usePortfolio`, `useTeamHistory`, `useTrades`, `useOrders`, `useNews`, `useLeaderboard`, `useCountdown`, `useAllFundamentals`, `useAdminTeams`, `useAdminPoll`), now reading from the live store plus REST range fetches.
- Delete every `firebase/firestore` import; remove `firebase` from `web/package.json`.
- Tests: update the hook tests to drive a fake live store; keep the screens untouched.

## Wave C — integration, docs, deploy (1–2 agents)

- `server/test/integration/*.int.test.ts` rewritten against a temp SQLite file (no emulator): the full scenario, resume, endpoint authorization (a crew cannot read another crew or any hidden field), and the SSE fan-out.
- `scripts/dev-local.sh`: drop the emulators; start the server (`DB_FILE=./data/dev.db`) and Vite, keep `PORT_OFFSET` and `LAN=1`.
- Root scripts: remove `emulators`, `test:integration` becomes plain vitest, `deploy:rules`/`deploy:hosting` removed, add `build:web`, `start` (serves `web/dist`).
- Delete `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, and the Firebase sections of the docs.
- `docs/DEPLOY.md` rewritten around `docs/HOSTING-FREE.md` (Oracle Always Free + Litestream to B2 + Caddy), keeping the Vercel note only as "web-only, optional".
- `docs/QUICKSTART.md`, `RUNBOOK.md`, `README.md`: no Firebase, no Java; a single `npm run dev:local`.
- E2E: the existing full-game Playwright spec runs against the new stack unchanged apart from setup.

## Verification gate

`npm run build:shared && npm test -w @deca/server && npm test -w @deca/web && npx tsc --noEmit` in both workspaces, `npx vite build`, the server integration suite, and the full-game Playwright run on iPhone 15 + SE in WebKit and Chromium. Then `grep -ri firebase --exclude-dir=node_modules` returns only historical mentions in `docs/superpowers/`.
