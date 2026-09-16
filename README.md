# Buccaneer Exchange

A live stock-market game for a DECA chapter event. Crews of students get a starting chest of
doubloons (Ð) and trade 25 made-up pirate companies from their phones. Prices move on their own
every few seconds. Each company's odds are quietly tilted by how healthy its published financial
numbers are, so careful research tends to pay off over the whole game. News, market swings and
luck still move prices, so nothing is guaranteed. The host runs the game from a console, and when
the game ends a market reveal shows what was really behind every price.

**Design canvas (every screen, iPhone and desktop):**
<https://claude.ai/artifact/Ctxnm3ZVBzTrVc1X6sciLd>

---

## Features

- **Weighted-random market built on textbook models.** A single-index market factor, geometric
  Brownian motion, Kou/Merton news jumps and GARCH(1,1) volatility clustering. A company's hidden
  health score (an AQR "Quality Minus Junk" style score) tilts its odds. Details and sources are in
  [docs/research-findings.md](docs/research-findings.md).
- **Fair and hard to game.** Linear, fading price impact with exact fill prices means splitting an
  order costs the same as one big order, and quick in-and-out trades lose money. Final standings
  use closing prices, which leave out the last price nudges from orders.
- **Beginner explanations.** Every number has a "?" that explains it in plain words and shows the
  sector average. A Learn tab holds the game guide, "Read a company in 5 questions", trading
  basics and a glossary.
  <!-- VERIFY: the explanation logic exists (web/src/lib/glossary.ts, compare.ts, components/ios/InfoTip*), but the Learn tab and the screens that use it are still being built (plan Tasks 9–13b). -->
- **iPhone-style app you can install.** Mobile-first design that follows Apple's interface
  guidelines, with light and dark appearance, Dynamic Type and a Home Screen install.
  <!-- VERIFY: vite-plugin-pwa is a dependency but web/vite.config.ts and web/index.html do not set up the manifest or service worker yet (MOBILE.md §9). -->
- **Host console.** Game settings (length from 1 to 48 hours, starting cash, fee, research edge,
  position limit, currency), crew management (add, reset password, turn trading off, remove),
  a live health heartbeat, pause and resume, host news, a trade tape and an audit log.
  <!-- VERIFY: the server API for all of these exists (server/src/routes/admin.ts); the host console screens in web/ are still being built (plan Task 13, MOBILE.md §7.17–7.18). -->
- **End-of-game reveal.** Each company's health score, grade and what drove it, expected vs.
  actual return, a luck measure, and a research grade for every crew.
  <!-- VERIFY: the server writes the reveal and research grades when the game ends; the 5-page results screen is still being built (plan Task 12, MOBILE.md §7.13). -->
- **Quick new game.** Build a fresh market from the host console and keep or delete the crews.

## Tech stack

| Part | Built with |
|---|---|
| `shared/` | TypeScript 5.5, zod. Pure contracts and math: clock, quality score, order estimate |
| `server/` | Node 24 (see `.node-version`), Fastify 4, better-sqlite3 12. The only trusted writer, and the whole backend: price engine, trading, host API, SQLite store, SSE stream, static hosting |
| `web/` | React 18, Vite 5, react-router-dom 6.30, Base UI 1.8 (sheets and dialogs), lucide-react icons, d3-hierarchy, vite-plugin-pwa |
| Data and hosting | SQLite (WAL) owned by the server, its own HS256 session tokens, one process that also serves the built web app (docs/HOSTING-FREE.md) |
| Tests | vitest 2, Testing Library, simple-statistics (calibration), Playwright |

## Quick start (local, no cloud account)

You need Node 24 — the version `.node-version` pins, and the one better-sqlite3 ships a prebuilt
binary for (on Node 20 it has to compile from source). Nothing else: no cloud account, no Java, no
emulators.
[docs/QUICKSTART.md](docs/QUICKSTART.md) explains how to install it.

```bash
npm install
npm run build:shared
npm run dev:local
```

`dev:local` creates a market in a local SQLite file (`server/data/dev.db`) and runs the server and
the web app (`FRESH=1` starts from an empty database). Open <http://localhost:5173> and sign in with the crew name `admin` and the password
`captain` (a development-only default; set `ADMIN_PASSWORD` to change it). `PORT_OFFSET=100 npm run
dev:local` runs a second stack beside the first, and `LAN=1 npm run dev:local` lets phones on the same
Wi-Fi open it (QUICKSTART A3 and A5).

## Put it online

Twenty phones need one address they can all open. **Start with
[docs/DEPLOY-EASY.md](docs/DEPLOY-EASY.md)** — three ways to get one, in plain English, with
copy-paste steps and no sysadmin knowledge.

| Way | Cost | Setup | Best for |
|---|---|---|---|
| **Your laptop + a tunnel** — `bash scripts/serve-tunnel.sh` | Free | ~10 min, one command | Practice runs and club meetings |
| **Render** — `render.yaml` is already in this repo; point Render at it | Free | ~10 min, all in a browser | **The real DECA event** (see the free-tier run of show) |
| **Railway** | ~$5/month | ~10 min, all in a browser | When Render will not take your card |

The laptop option is free and fast, but the game ends if the lid closes or the Wi-Fi drops, and
Cloudflare's free quick tunnels do not officially support the live price stream — so
`serve-tunnel.sh` tests that on every run and tells you outright whether prices will move. For
anything graded, pay for the month.

Once you have an address, make the teams and print the handout in one command:

```bash
node deploy/crew-sheet.mjs --url https://YOUR-ADDRESS --count 12
```

Running a real Linux server yourself is still an option — see
[docs/DEPLOY-ORACLE.md](docs/DEPLOY-ORACLE.md) — but it is much more work.

## Tests

Run `npm install` and `npm run build:shared` first; the tests import the built shared package.

```bash
npm test                          # server unit tests, including the price-model calibration
npm test -w @deca/web             # web unit tests
npm run typecheck -w @deca/server
npm run typecheck -w @deca/web
npm run test:integration          # whole-game, resume, authorization and SSE tests (temp SQLite file)
```

## Repo map

```
shared/src/        contracts and pure math (types, schemas, constants, clock, quality, estimate)
server/src/
  engine/          price model, news schedule, order flow, engine loop (ticks, reveal)
  services/        market creation, trading, crews, leaderboard
  routes/          /auth/login, /orders, /api/*, /api/admin/*, /health
  seed/            roster, market generator, `npm run seed`, `npm run reset`, `npm run set-host-password`
  store/           the SQLite schema and the only module that touches the database
  realtime/        the SSE hub and the per-crew snapshot filter
  auth/ lib/       session tokens, password hashing, PRNG, money, audit log
server/test/       unit, calibration and engine-loop tests
  integration/     whole-game, resume, authorization and SSE tests (`npm run test:integration`)
scripts/dev-local.sh  the `npm run dev:local` stack (seed, server, web)
web/src/
  components/ios/  iPhone-style components (tab bar, sheets, lists, keypad…)
  components/charts/  chart card, sparkline, scatter, range and allocation bars
  hooks/ lib/      live-stream store, API client, formatting, glossary, sector compare
  theme/           design tokens and base CSS
  pages/           screens
docs/              guides, design system, copy deck, spec and plan
```

## Documentation

| Doc | For | What it covers |
|---|---|---|
| **[DEPLOY-EASY](docs/DEPLOY-EASY.md)** | **Anyone putting it online** | **Start here — three easy ways to get a public address, step by step** |
| [QUICKSTART](docs/QUICKSTART.md) | Student developer | Run it locally, or on a free server |
| [RUNBOOK](docs/RUNBOOK.md) | DECA advisor or student host | Running a live game from start to reveal |
| [DEPLOY](docs/DEPLOY.md) | Student developer | The long version: every provider, backups and costs |
| [DEPLOY-ORACLE](docs/DEPLOY-ORACLE.md) | Student developer | Running your own Linux server on Oracle Always Free |
| [research-findings](docs/research-findings.md) | Anyone curious | The market math, the quality score and the sources |
| [MOBILE.md](docs/design/MOBILE.md) | Designers and developers | Mobile design system, screens and PWA |
| [COPY.md](docs/design/COPY.md) | Designers and developers | Every beginner-facing word in the game |
| [Spec](docs/superpowers/specs/2026-09-14-buccaneer-exchange-v2-design.md) · [Plan](docs/superpowers/plans/2026-09-14-buccaneer-exchange-v2.md) | Developers | v2 design decisions and build plan |

## Security in one paragraph

Clients never touch the database. The server owns the SQLite file and is the only writer; phones
read through filtered endpoints and one SSE stream, holding a session token the server signed. The
hidden future (quality scores, the news schedule, the game seed, engine state) lives in server-only
tables, and health scores reach students only after the game ends. Never commit a `.env` file or
your `DB_FILE`; both are git-ignored. When `npm run seed` generates a game seed or host password,
it prints them once in the terminal, so don't share or screenshot that output.

A market simulation. No real money.
