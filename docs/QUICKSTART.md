# Quickstart

This guide is for a **student developer**. It gets Buccaneer Exchange running on your computer.
If you are the host running a live game, read [RUNBOOK.md](RUNBOOK.md) instead.

**There is no cloud project to create.** The whole game is one Node process: it owns a SQLite
file, signs its own session tokens, streams live prices over SSE and serves the built web app.
No database service, no identity provider, no Java, no emulators, no service-account keys.

Pick one path:

| Path | Use it when | Account needed? | Time |
|---|---|---|---|
| **A. Run it on your computer** | You want to try the game, develop, or run the tests | No | About 10 minutes |
| **B. Let phones reach it** | You want a phone test or a rehearsal before the event | No | About 15 minutes |
| **C. Put it online for a live event** | Students will play from their own phones | No (Render's free tier) | See [DEPLOY-EASY.md](DEPLOY-EASY.md) |

Commands below run from the **repo root** (the folder with the top-level `package.json`), unless a
step says otherwise. Lines starting with `#` are comments; you don't type them.

---

## Path A: run it on your computer

### A1. Install the requirements

**Node.js 24** — the version `.node-version` pins, and the one better-sqlite3 ships a prebuilt
binary for. On Node 20 it has to compile from source, which is slow and needs build tools.

```bash
node --version
```

It should print `v24`. If not, install it from <https://nodejs.org> (or with `nvm install 24`).

That is the whole list. **Windows only:** `dev:local` is a bash script that uses Linux-style
process control. Run it inside **WSL** (Windows Subsystem for Linux), not Command Prompt or
PowerShell, and install Node inside WSL too.

### A2. Install and build

```bash
npm install            # installs shared/, server/ and web/ in one go
npm run build:shared   # compiles the shared contracts the server and web app import
```

### A3. Start everything

```bash
npm run dev:local
```

This one command (`scripts/dev-local.sh`):

1. checks that `npm install` has run and that its two ports are free — 8081 (server) and 5173 (web
   app) — and stops with a plain message if not,
2. rebuilds the shared package if its source changed,
3. creates a fresh market in the lobby in a local SQLite file (`npm run seed`),
4. starts the server — price engine, trade API and the SSE stream — on port 8081,
5. starts the web app on port 5173, pointed at that server,
6. prints the web address, the host login, the health address and the database path when
   everything is ready.

Leave this terminal open. Press **Ctrl+C** to stop everything.

The database is `server/data/dev.db` and it **survives** a restart, so the game you left is the
game you come back to. `FRESH=1 npm run dev:local` deletes it first for a clean market and roster.
To get the same market every run, set `GAME_SEED` (for example `GAME_SEED=practice npm run
dev:local`).

**Two stacks at once.** Set `PORT_OFFSET` to move every port up by that amount. Each stack gets its
own database, so they never share a market:

```bash
npm run dev:local                     # web 5173, server 8081, server/data/dev.db
PORT_OFFSET=100 npm run dev:local     # web 5273, server 8181, server/data/dev-100.db
```

Use offsets 100 apart (100, 200, …). The web app finds its server through `VITE_API_BASE`, which
the script sets.

### A4. Sign in and try a game

1. Open <http://localhost:5173>.
2. Sign in as the host:
   - **Crew name:** `admin`
   - **Password:** the value of `ADMIN_PASSWORD`, or `captain` if you didn't set one.

   `captain` is a **development-only** default. Never use it on a public address. To pick your own:
   ```bash
   ADMIN_PASSWORD='pick-something' npm run dev:local
   ```
3. In the host console, open **Control › Edit settings** and set **Game length** to **10 minutes**
   so a whole game fits in one sitting. Prices update every 5 seconds at every length.
4. Add two crews, for example `Test Crew` / `test1234` and `Second Crew` / `test5678`.
   Passwords need at least 4 characters.
5. Press **Start game**.
6. Open a **private window** (so you stay signed in as host in the first one) and sign in as
   `Test Crew`. Tapping **Buy** sends a crew that has not finished **Meet the market** into that
   flow first — a required-once tour of the 15 companies, the five sectors and the three funds
   (it is also a row in the **Learn** tab). Finish it; until you do, `POST /orders` answers
   *"Meet the market first."*
7. Find a company in **Markets** and buy 10 shares. Try a fund too (FLEET, SHIPS or ARMS).
8. Back in the host console, try **Pause trading**, **Resume trading**, a small **Fire news…**, then
   **End game…** (type `END`).
9. In the crew window, open **Standings › See final results** to page through the reveal.

### A5. Run the tests

```bash
npm test                          # server unit tests + price-model calibration
npm test -w @deca/web             # web unit tests
npm run typecheck -w @deca/server
npm run typecheck -w @deca/web
npm run test:integration          # whole-game, resume, authorization and SSE tests
```

`test:integration` starts nothing and needs no credentials: each file opens its own temporary
SQLite file under the OS temp directory and deletes it afterwards
(`server/vitest.int.config.ts`).

---

## Path B: let phones reach it

### B1. Phones on the same Wi-Fi (`LAN=1`)

```bash
LAN=1 npm run dev:local
```

`LAN=1` makes the local stack reachable from phones on the same Wi-Fi:

- it finds your computer's Wi-Fi address (on macOS, `ipconfig getifaddr en0`, then `en1`; on Linux
  and WSL, `hostname -I`),
- the server and the web app listen on every network address,
- the web app talks to the server through that address, and the server accepts requests from it
  (`CORS_ORIGIN`),
- when everything is ready it prints a banner such as
  `Open http://192.168.1.23:5173 on phones on this Wi-Fi`. If the `qrcode-terminal` package happens
  to be installed, a QR code follows. It is not a dependency of this repo.

On the phone, join the same Wi-Fi and open the address from the banner. `LAN=1` works with
`PORT_OFFSET` too.

- If your computer asks whether `node` may accept incoming connections, click **Allow**.
- School and guest Wi-Fi often block traffic between devices. A home network or a phone hotspot
  works better.
- Anyone on that network can reach the server and try host passwords. Use `LAN=1` only on a
  network you trust, set a real `ADMIN_PASSWORD`, and stop the stack when you're done.
- **Home Screen install needs HTTPS**, which a plain LAN address is not. Use B2 or
  [DEPLOY-EASY.md](DEPLOY-EASY.md) to test that.

### B2. A public HTTPS address from this laptop

```bash
bash scripts/serve-tunnel.sh
```

This builds the web app, starts the server with the game database in `./data`, opens a Cloudflare
quick tunnel and prints a public `https://…` address that students can open from anywhere. It then
tests whether the live price stream actually survives the tunnel and tells you outright whether
prices will move. Requires `cloudflared` (macOS: `brew install cloudflared`); the script tells you
how to get it if it is missing.

Useful variables: `ADMIN_PASSWORD` (generated and printed if unset), `DB_FILE`, `PORT`, `FRESH=1`
to start from a brand-new market, `SKIP_BUILD=1` to reuse `web/dist`.

The game ends if the lid closes or the Wi-Fi drops, so this is for practice runs and club meetings.
For anything graded, use [DEPLOY-EASY.md](DEPLOY-EASY.md).

### B3. Starting over

- **New market, keep crews:** use **New game** in the host console, or stop the server, run
  `npm run seed`, and start it again.
- **Wipe crews and market:** stop the server, run `npm run reset`, then `npm run seed`, then start
  the server again. `reset` keeps the host login, the settings and the audit log.
- **Throw the whole database away:** `FRESH=1 npm run dev:local`, or delete `server/data/dev.db`
  (and its `-wal` and `-shm` files).
- **Forgot the host password:** run `npm run set-host-password` (it asks for the new password
  twice), or `ADMIN_PASSWORD='new-password' npm run set-host-password`. The market, crews and game
  are untouched and the new password works at once, with no restart. If the deployment sets
  `ADMIN_PASSWORD`, update that too or the next restart puts the old one back.

Both `seed` and `reset` act on `DB_FILE` (default `./data/game.db`, which is **not** the
`server/data/dev.db` that `dev:local` uses — set `DB_FILE` to match if you are fixing up a
`dev:local` database).

---

## Path C: put it online for a live event

Follow [DEPLOY-EASY.md](DEPLOY-EASY.md). It covers three ways to get one address twenty phones can
open — a Cloudflare tunnel from your laptop, Render's free tier (`render.yaml` is already in this
repo), or Railway — plus the run of show, the crew sheets and the game-day checklist.

Running your own Linux server is also possible but much more work:
[DEPLOY-ORACLE.md](DEPLOY-ORACLE.md).

---

## Environment variables

The server reads only real environment variables — it does **not** load `.env` files. Vite reads
`web/.env` and, when building, `web/.env.production`. `.env.example` at the repo root lists the
same variables with comments. Every one of them is optional; the defaults run a local game.

| Variable | Where | Secret? | What it does |
|---|---|---|---|
| `DB_FILE` | server, `seed`, `reset`, `set-host-password` | No | The SQLite file the server owns. Default `./data/game.db`; the folder is created on open, and `:memory:` works for a throwaway run |
| `ADMIN_PASSWORD` | server, `seed`, `set-host-password`, `dev:local`, `serve-tunnel.sh` | **Yes** | The host password. The server applies it at every start and logs only `host password set from ADMIN_PASSWORD`. If unset, the first seed generates one and prints it once (`dev:local` uses `captain`) |
| `GAME_SEED` | `seed`, `dev:local` | **Yes** | Fixes the market seed. Leave unset: the seed script generates a high-entropy seed and stores it server-only in `meta.seed`. Anyone who knows it can predict every price |
| `SESSION_SECRET` | server | **Yes** | HS256 signing key for session tokens. Unset = the server generates one on first use and keeps it in `meta.session_secret`, so restarts keep phones signed in. Set it only to share sessions across processes or fresh storage |
| `PORT` | server | No | Server port. Default `8081` |
| `CORS_ORIGIN` | server | No | Browser origin(s) allowed to call the server, comma-separated. Default `*`. Not needed when the server serves the built app from the same origin |
| `WEB_DIR` | server | No | Built web app to serve as static files. Unset = `web/dist` next to the server workspace |
| `RATE_LIMIT_MAX` | server | No | API requests a minute per signed-in session (per IP when signed out). Default `600`. Static files, `/health` and the SSE stream never count |
| `VITE_API_BASE` | web | No | The server's address, for example `http://localhost:8081`. Leave empty when the server serves the built app itself |
| `PORT_OFFSET` | `dev:local` | No | Moves every port of the local stack up by this amount, so stacks run side by side. Default `0` |
| `LAN` | `dev:local` | No | `1` lets phones on the same Wi-Fi open the local stack (B1) |
| `FRESH` | `dev:local`, `serve-tunnel.sh` | No | `1` deletes the database first, for a brand-new market and roster |
| `SKIP_BUILD` | `serve-tunnel.sh` | No | `1` reuses the existing `web/dist` instead of rebuilding |

## Security checklist

- `ADMIN_PASSWORD`, `GAME_SEED`, `SESSION_SECRET` and the output of `npm run seed` are secrets.
  Keep them out of git, chat and screenshots. `npm run seed` prints the generated host password and
  the game seed **once**.
- Never commit a `.env` file or your `DB_FILE`. Both are git-ignored.
- The hidden future — quality scores, the news schedule, the game seed, engine state — lives in
  server-only tables. Clients never touch the database; they read through filtered endpoints and
  one SSE stream, holding a token the server signed.
- On a public address, set a real `ADMIN_PASSWORD`. The host password can end the game, reset every
  crew's password and hand out money, and the server will answer hundreds of guesses a minute.
