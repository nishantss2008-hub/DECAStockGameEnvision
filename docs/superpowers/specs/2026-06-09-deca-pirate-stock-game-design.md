# DECA Pirate Stock Game — Design Spec

**Date:** 2026-06-09
**Status:** Approved design → ready for implementation planning
**Repo:** `nishantss2008-hub/DECAStockGameEnvision`

---

## 1. Overview

An interactive, pirate-themed stock-market trading simulation for a DECA Envision
event. Teams log in with passwords, trade ~25 pirate-themed companies with themed
currency over a continuous **48-hour** live session, research company fundamentals,
and react to news events — **without ever knowing in advance how prices will move**.

The market is engineered to "mirror the real market": fundamentals act as a long-run
gravitational pull (so diligent research is rewarded), while news shocks, random
volatility, and other teams' order flow dominate the short run (so the price path is
genuinely unpredictable moment to moment).

### Goals

1. Real-time, multi-team trading over 48 continuous hours, cloud-hosted.
2. ~25 companies, each with a full real-company-format research profile (market cap,
   financial statements, valuation multiples, management, industry analysis, etc.).
3. A price engine where good fundamental research pays off over time, but short-term
   prices are unpredictable and reactive to trading + news.
4. Hard security: clients can never write "real" data and can never see the future.
5. Live portfolios, live leaderboard, live news feed.
6. Complete audit logging of every action.
7. Host/admin controls to run the game (create teams, start/stop, fire news, monitor).

### Non-goals (YAGNI)

- No real money, real brokerage, or real market data.
- No limit/stop orders in v1 — **market orders only** (extensible later).
- No options/derivatives/shorting in v1 (long-only).
- No mobile native apps — responsive web only.
- No multi-game tenancy in v1 — one game instance per deployment.

---

## 2. Decisions locked in (from brainstorming)

| Decision | Choice |
|---|---|
| Access model | **Cloud-hosted** (accessible anywhere) |
| Research payoff | **Mirror the real market** — fundamentals (long-run) + news + order flow (short-run) all present |
| Market hours | **Fully 24/7 intensity** — continuous, no close, full intensity around the clock |
| Scale | **Large** — 12+ teams, ~25 companies |
| Stack | **A + Firebase** — Node/TS authority service + Firestore + Firebase Auth + Firebase Hosting + React |

### Configurable defaults (tweakable before/at game creation)

- **Themed currency:** Doubloons (symbol `Ð`).
- **Starting capital:** 1,000,000 Ð per team.
- **Game length:** 48 hours.
- **Tick interval:** 30 seconds (~5,760 ticks over 48h).
- **Companies:** ~25 across pirate-themed sectors.
- **Teams:** 12+ (configurable; created by host).

---

## 3. Architecture (A + Firebase)

Three components, one source of truth:

```
            ┌─────────────────────────────┐
            │   React frontend (SPA)       │
            │   Firebase Hosting           │
            └───────┬─────────────┬────────┘
        reads (realtime)      writes (trades/admin)
                    │             │  + Firebase ID token
                    ▼             ▼
        ┌───────────────┐   ┌──────────────────────────┐
        │  Firestore    │◄──│  Authority service        │
        │  (data +      │   │  Node/TS, persistent      │
        │   realtime)   │   │  Firebase Admin SDK       │
        │               │   │  • price-engine tick loop │
        │  Security     │   │  • trade/admin endpoints  │
        │  Rules gate   │   │  • news scheduler         │
        │  client R/W   │   │  Deploy: Cloud Run/Render │
        └───────────────┘   └──────────────────────────┘
```

- **Authority service** — the *only* writer of real data. Persistent Node/TypeScript
  process running (a) the price-engine tick loop, (b) validated HTTPS endpoints for
  trades + admin actions, (c) the news scheduler. Uses Firebase Admin SDK (bypasses
  security rules). Deploy target: **Cloud Run** (min-instances=1) or Render/Railway/Fly.
- **Firestore** — durable storage *and* the realtime push channel. Clients subscribe to
  listeners for live prices, their own portfolio, news, and leaderboard. Replaces a
  hand-built WebSocket layer.
- **React frontend** — pirate trading terminal. Reads via Firestore listeners; writes
  only via the authority service's authenticated endpoints.

**Golden rule:** clients may read public + own data only; they can never write
prices/cash/holdings and can never read the future.

### Tech stack

- **Language:** TypeScript end-to-end.
- **Authority service:** Node.js + Fastify (HTTP), `firebase-admin` SDK, a tick scheduler.
- **DB / realtime / auth / hosting:** Firebase (Firestore, Auth, Hosting). Blaze plan.
- **Frontend:** React + Vite, Firebase JS SDK (Auth + Firestore listeners), charting lib
  (lightweight-charts or Recharts), pirate-themed design system.
- **Shared:** a `shared/` package of TypeScript types + zod schemas used by both service
  and frontend (single source of truth for data shapes).
- **Testing:** Vitest (unit) for the engine + validation; Firestore emulator for rules
  and integration tests.

---

## 4. Price engine — "mirror the real market"

### 4.1 Hidden intrinsic-value trajectory

At game creation, each company is assigned (from a seeded RNG, stored server-only in
`_schedule`) a **hidden fate archetype** and a smooth intrinsic-value path `V(t)`:

| Archetype | Long-run intrinsic drift | Correlated fundamentals |
|---|---|---|
| Compounder | Strong upward | High margins, growing TAM, strong mgmt, low debt |
| Turnaround | Down then up | Weak current margins, improving guidance, new mgmt |
| Steady | Flat / slight up | Stable margins, mature industry, dividend |
| Value trap | Flat then down | Optically cheap (low P/E) but declining revenue |
| Decliner | Downward | Shrinking TAM, high debt, margin compression |

`V(t)` is generated as a deterministic function of `(seed, companyId, t)`. **It is never
sent to any client.** The published fundamentals correlate with the archetype, so
research that reads the financials + qualitative signals can estimate the fate — but the
realized path is still noisy and reactive.

### 4.2 Realized price update (per tick)

```
P(t) = P(t-1)
     + κ · (V(t) − P(t-1))        // mean-reversion toward hidden intrinsic value
     + σ_i · ε                    // per-company stochastic volatility, ε ~ N(0,1)
     + λ · netOrderFlow_i(t)      // order-flow price impact (buy ↑ / sell ↓)
     + newsJump_i(t)              // scheduled + host-triggered event shocks
```

Parameters:
- `κ` — mean-reversion speed (small; intrinsic pull is gentle so short-run can deviate).
- `σ_i` — per-company volatility (from a hidden "beta/volatility" profile).
- `λ` — price-impact coefficient. `netOrderFlow_i(t)` = (buy volume − sell volume) since
  last tick, scaled by typical volume. **Temporary impact decays**: a transient
  order-flow component is added each tick and mean-reverts over the next several ticks,
  so a large trade spikes then partially retraces. This prevents trivial self-pumping
  while still rewarding being early to a fundamentally strong stock.
- `newsJump` — applied when an event fires (see §7).

Floors/guards: price floored at a small positive value; per-tick move clamped to a sane
band to avoid pathological jumps; all randomness seeded for reproducibility.

### 4.3 Properties

- **Short run:** unpredictable — noise + news timing + other teams' order flow.
- **Long run:** pulled toward hidden intrinsic value — research is rewarded.
- **Trade volume → volatility:** order flow directly perturbs price.
- **24/7 full intensity:** no overnight dampening; engine runs continuously.

### 4.4 Resume safety

Intrinsic path `V(t)` and the news schedule are deterministic from the seed. Realized
price `P_i`, the current tick index, and the game clock are persisted every tick to
Firestore. On restart, the service reads game start time, computes the current tick from
wall-clock, loads last persisted prices, and resumes. No game state is lost on redeploy
or crash.

---

## 5. Data model (Firestore)

Public = client-readable. Server-only = `allow read, write: if false` (Admin SDK only).

| Path | Visibility | Contents |
|---|---|---|
| `game/state` | public read | phase (`lobby`/`live`/`ended`), startAt, endAt, currentTick, serverTime |
| `companies/{id}` | public read | name, ticker, sector, emoji/logo, description, **currentPrice**, prevClose, dayChange, marketCap, sharesOutstanding |
| `companies/{id}/fundamentals/data` | public read | full research profile (§6) |
| `companies/{id}/priceHistory/{tick}` | public read | **past + present only**: tick, timestamp, price, volume |
| `_schedule/{id}` | **server-only** | hidden archetype, intrinsic path params, scheduled news + timings (the "future") |
| `teams/{id}` | team + admin read | name, cashBalance (Ð), totalValue, rank |
| `teams/{id}/holdings/{companyId}` | team + admin read | shares, avgCost |
| `orders/{id}` | server-written; team reads own | teamId, companyId, side, qty, status, requestedAt |
| `trades/{id}` | server-written; team reads own | filled order: price, qty, fee, executedAt, resulting balances |
| `news/{id}` | public read (after fire) | headline, body, companyId(s), impact tag, firedAt |
| `leaderboard/current` | public read | ranked entries: teamId, name, totalValue, rank (no private holdings) |
| `logs/{id}` | **server-only** | append-only audit: actor, action, payload, ip, timestamp |

All client-visible writes happen **only** through the authority service. Security rules
deny client writes to every collection above.

---

## 6. Company fundamentals & research tools

Each company exposes a **real-company-format** research profile (`fundamentals/data`):

### Valuation & size
market cap, shares outstanding, float, current price, 52-week high/low, P/E, forward P/E,
P/S, P/B, EV/EBITDA, dividend yield, payout ratio.

### Financial statements (with a few periods of history)
- **Income statement:** revenue, cost of revenue, gross profit, operating income, net
  income, EPS, gross/operating/net margins, EBITDA.
- **Balance sheet:** cash, total assets, total debt, total liabilities, equity, current
  ratio, debt-to-equity.
- **Cash flow:** operating cash flow, capex, free cash flow.
- **Returns:** ROE, ROA.

### Qualitative research
- Business overview & business model.
- **Management team:** CEO/CFO names, bios, tenure, track record (pirate-flavored).
- **Industry analysis:** sector, TAM, industry growth rate, competitive position,
  Porter-style notes.
- **Marketing strategy** summary.
- Risk factors; recent developments; **analyst rating + price target**.

These values are generated to be internally consistent (e.g., margins ↔ net income ↔
EPS ↔ P/E ↔ market cap) and to **correlate with the hidden archetype**, so research is a
real edge without revealing the path. Per the user's request, at build time we will
**web-research** the structure of real equity-research reports and typical metric ranges
to make the fabricated data authentic. Data generation is deterministic from the seed.

---

## 7. News events

- **Scheduled events:** generated at game creation with hidden timings, stored in
  `_schedule`. Types: lucrative merger, scandal, storm/fleet loss, treasure discovery,
  regulatory crackdown, earnings beat/miss, management change, etc. When a scheduled
  tick is reached, the engine applies `newsJump` to the company, posts the headline to
  the public `news` feed, and writes a log entry. **Never visible before firing.**
- **Host-triggered events:** the admin can fire a custom event live (choose company,
  impact magnitude, headline) from the dashboard. Applied identically.
- Events may also raise a company's `σ_i` temporarily (a volatility spike).

---

## 8. Trading & live portfolios

- **Order types:** market buy / market sell only (v1).
- **Flow:** client calls authority `POST /orders` with Firebase ID token → server
  validates (auth, game live, sufficient cash/shares, rate limit) → fills at current
  price (+ small fee/spread, configurable) → writes `trades`, updates `teams` cash +
  `holdings`, contributes to `netOrderFlow` for the next tick → logs.
- **Portfolio:** themed cash + holdings valued live. Live P&L, positions, average cost,
  and trade history stream to the client via Firestore listeners.
- **Leaderboard:** teams ranked by total fleet value (cash + holdings), recomputed each
  tick and written to a public `leaderboard/current` doc (ranked entries: teamId, name,
  totalValue, rank) so all clients can subscribe without reading other teams' private docs.

---

## 9. Security model

- **Server authority:** every real mutation goes through the authority service using the
  Admin SDK. Clients cannot write prices, cash, holdings, trades, or news.
- **Firestore Security Rules:**
  - Public read: `game`, `companies`, `companies/*/fundamentals`, `companies/*/priceHistory`, `news`.
  - Team-scoped read: `teams/{id}` and subcollections only if `request.auth.uid` belongs
    to that team (enforced via custom claim) or is admin.
  - Deny-all to clients: `_schedule`, `logs`.
  - All client writes denied everywhere.
- **Auth:** Firebase Auth email/password. Each team logs in with **team name + password**
  (frontend maps team name → a credential). A custom claim binds the UID to `teamId` +
  `role` (`team` | `admin`). The authority service verifies the ID token + claim on every
  write.
- **Hidden-future guarantee:** the future exists only in `_schedule` (deny-all) and the
  service's memory. It is never serialized into any client-readable doc, and
  `priceHistory` only ever contains past + present ticks.
- **Hardening:** per-team rate limiting on orders, input validation (zod) on all
  endpoints, append-only audit log, Firebase-managed password hashing, CORS locked to the
  hosting origin.

---

## 10. Admin / host dashboard

Admin-only (role claim). Capabilities:
- Create/seed teams with names + passwords (server creates Auth users + claims + docs).
- Configure game (currency name/symbol, starting capital, length, tick interval, company
  roster) before start.
- Start / pause / resume / end the game.
- Live view of all portfolios + leaderboard.
- Fire custom news events.
- Inspect the full audit log.

---

## 11. Frontend (pirate-themed)

Pages: **Login** → **Trading terminal** (live tickers, price charts, buy/sell tickets) →
**Research center** (fundamentals + research reports per company) → **Portfolio** (live
positions, P&L, history) → **News feed** → **Leaderboard** → **Admin dashboard** (role-
gated). Pirate aesthetic throughout (parchment/ink, nautical UI). The `frontend-design`
skill will be used for polish at build time.

---

## 12. Logging

Every meaningful action — login, order, fill, news fire, admin action, game phase change,
engine tick checkpoints — appends to the server-only `logs` collection with actor,
action, payload, source, and timestamp. Logs are readable only via the Admin SDK /
admin dashboard.

---

## 13. Game lifecycle

`lobby` (teams seeded, market frozen at IPO prices) → host starts → `live` (48h continuous
engine + trading) → auto-ends at `endAt` (or host ends early) → `ended` (trading frozen,
final standings + full reveal of intrinsic paths/archetypes for post-game learning).

---

## 14. Setup / deployment dependencies (user-provided)

- A **Firebase project** on the **Blaze (pay-as-you-go)** plan — required for the always-on
  authority service + adequate Firestore usage. Real cost for a 48h, ~12-team game is on
  the order of cents, but the plan must be enabled.
- The user creates the project and provides the config keys + a service-account key; all
  code, rules, and deploy config are authored in-repo. Click-by-click setup steps will be
  included with the implementation.

---

## 15. Testing strategy

- **Unit:** price-engine math (mean-reversion, impact decay, news jumps, determinism from
  seed, resume-from-tick), fundamentals generator (internal consistency), order
  validation.
- **Rules:** Firestore Security Rules tested against the emulator (clients can't read
  `_schedule`/`logs`, can't write real data, can't read other teams).
- **Integration:** end-to-end order → fill → balance/holdings/leaderboard update against
  the emulator.
- **Manual:** scripted multi-team smoke run over a compressed clock.

---

## 16. Open items to confirm at build time

- Final currency name/symbol + starting capital (defaults: Doubloons `Ð`, 1,000,000).
- Final company roster (25 names + sector spread).
- Deploy target for the authority service (Cloud Run vs. Render) — chosen during setup.
- Exact engine parameter tuning (`κ`, `σ`, `λ`, impact decay) — calibrated during build
  via simulation so a 48h run feels right.
