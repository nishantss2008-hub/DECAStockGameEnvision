# Quickstart

This guide is for a **student developer**. It gets Buccaneer Exchange running on your computer.
If you are the host running a live game, read [RUNBOOK.md](RUNBOOK.md) instead.

Pick one path:

| Path | Use it when | Cloud account needed? | Time |
|---|---|---|---|
| **A. Local emulators** | You want to try the game, develop or run tests | No | About 15 minutes |
| **B. Real Firebase project, run on your laptop** | You want real data, a phone test, or a rehearsal before deploying | Yes. The free Spark plan stops at 20,000 writes and 50,000 reads a day. That is about 20 minutes of a running 1-hour game, so use Blaze for a full rehearsal | About 30 minutes |
| **C. Deploy for a live event** | Students will play from their own phones | Yes (Blaze plan) | See [DEPLOY.md](DEPLOY.md) |

Commands below run from the **repo root** (the folder with the top-level `package.json`), unless a
step says otherwise. Lines starting with `#` are comments; you don't type them.

---

## Path A: local emulator stack

The Firebase emulators are a fake Firestore and a fake Auth that run on your computer. Nothing
touches a real project, and nothing costs money.

### A1. Install the requirements

1. **Node.js 20 or newer.** Check with:
   ```bash
   node --version
   ```
   It should print `v20` or higher. If not, install the LTS version from <https://nodejs.org>.

2. **Java 21.** The Firebase emulators run on Java, and the Firebase CLI in this repo
   (firebase-tools 15) needs Java 21 or newer. Check with:
   ```bash
   java -version
   ```
   If it doesn't print version 21 or higher, install it:
   - **macOS with Homebrew:**
     ```bash
     brew install openjdk@21
     # Homebrew does not put this Java on your PATH. Add these two lines to ~/.zshrc, then open a new terminal:
     export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
     export PATH="$JAVA_HOME/bin:$PATH"
     ```
   - **Windows, macOS or Linux without Homebrew:** download **Temurin 21 (LTS)** from
     <https://adoptium.net>. On Windows, tick **Set JAVA_HOME** in the installer.
   - Run `java -version` again in a **new** terminal to confirm.

3. **Windows only:** `dev:local` is a bash script that uses Linux-style process control. Run it
   inside **WSL** (Windows Subsystem for Linux), not from Command Prompt or PowerShell. Install
   Node and Java inside WSL too.

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

1. checks that Java is installed, `npm install` has run, and ports 8080, 9099, 8081 and 5173 are
   free (it stops with a plain message if not),
2. rebuilds the shared package if its source changed,
3. starts the Firestore and Auth emulators for a local project called `demo-deca`,
4. creates a fresh market in the lobby (`npm run seed`),
5. starts the server (price engine and trade API) on port 8081,
6. starts the web app on port 5173, pointed at the emulators,
7. prints the web address, the host login and the health address when everything is ready.

Leave this terminal open. Press **Ctrl+C** to stop everything, emulators included. If Java 21 isn't
on your PATH, set `JAVA_HOME` to it first. To get the same market every run, set `GAME_SEED`
(for example `GAME_SEED=practice npm run dev:local`). The Firebase Emulator UI at
<http://127.0.0.1:4000> lets you look inside the fake database.

**Safety:** when either emulator variable is set, the server never loads a service account, so a
local run can't reach the real project (`server/src/firebase.ts`, tested in
`server/test/firebaseGuard.test.ts`).

### A4. Sign in and try a game

1. Open <http://localhost:5173>.
2. Sign in as the host:
   - **Crew name:** `admin`
   - **Password:** the value of `ADMIN_PASSWORD`, or `captain` if you didn't set one.

   `captain` is a **development-only** default for the emulators. Never use it on a real project.
   To pick your own local password:
   ```bash
   ADMIN_PASSWORD='pick-something' npm run dev:local
   ```
3. In the host console, set **Game length** to **1 hour** so prices update every 5 seconds.
4. Add two crews, for example `Test Crew` / `test1234` and `Second Crew` / `test5678`.
   Passwords need at least 4 characters.
5. Press **Start game**.
6. Open a **private window** (so you stay signed in as host in the first one), sign in as
   `Test Crew`, find a company in **Markets**, and buy 10 shares.
7. Back in the host console, try **Pause trading**, **Resume trading**, a small **Fire news…**, then
   **End game…** (type `END`).
8. In the crew window, open **Standings › See final results** to see the reveal.

<!-- VERIFY: the sign-in, host console and crew screen names follow MOBILE.md §6–§7 and COPY.md §11; those web screens are still being built (plan Tasks 8–13). -->

Emulator data lives only while the emulators run. Stopping `dev:local` throws the game away.

### A5. Phones and Home Screen install

The local stack works only in a browser **on this computer**. The web app connects to the emulators
at `127.0.0.1`, which on a phone means the phone itself. To try the game on a phone, use Path B
(section B6) or a deployed site.

Installing the app on a Home Screen also needs a deployed **HTTPS** site. See [DEPLOY.md](DEPLOY.md)
section 7.
<!-- VERIFY: the install setup (manifest, icons, service worker, update prompt) is still being built: web/vite.config.ts does not register vite-plugin-pwa yet and web/index.html has no manifest link yet (MOBILE.md §9.2–9.5). -->

### A6. Run the tests

```bash
npm test                          # server unit tests + price-model calibration
npm test -w @deca/web             # web unit tests
npm run typecheck -w @deca/server
npm run typecheck -w @deca/web
npm run test:integration          # starts the emulators, runs the integration and rules tests, stops them
```

`test:integration` needs Java 21, like `dev:local`.

---

## Path B: a real Firebase project, run on your laptop

Use this to rehearse with real Firestore data before you deploy. The server and web app still run
on your computer.

The repo is set up for the Firebase project `decastockenvision` (see `.firebaserc`). If you are not
an owner of that project, create your own and use its ID wherever this guide says `YOUR-PROJECT`.

### B1. Console steps (in your browser)

1. **Create or open the project** at <https://console.firebase.google.com>.
   Google Analytics is not needed.
2. **Turn on Authentication.** Open **Build › Authentication** and click **Get started**. You
   don't need to enable any sign-in provider: the server signs crews in with custom tokens, not
   email and password.
3. **Create the Firestore database.** Open **Build › Firestore Database › Create database**.
   - Choose the **Standard** edition.
   - Pick a location. **`us-central1` (Iowa)** costs half as much per operation as the `nam5`
     multi-region. You can't change the location later.
   - Start in **production mode**. The repo's rules replace the defaults in step B3.
4. **Download a service-account key.** Click the **gear › Project settings › Service accounts**,
   then **Generate new private key**. Save the file as:
   ```
   server/service-account.json
   ```
   This file is the server's master key. Anyone who has it can read and write the whole
   database. It is git-ignored. **Never commit it, email it, paste it in chat, or put it in `web/`.**
5. **Register the web app.** In **Project settings › General › Your apps**, click the web icon
   (`</>`), give it a name, and skip Hosting for now. Firebase shows a config block.

### B2. Point the code at your project

1. Create `web/.env` (git-ignored) with the values from the config block:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=YOUR-PROJECT.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=YOUR-PROJECT
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_API_BASE=http://localhost:8081
   ```
   These web values are **public by design**. Security comes from the Firestore rules and the
   server, not from hiding them.
2. **Only if your project is not `decastockenvision`:**
   ```bash
   npx firebase use --add          # pick YOUR-PROJECT, give it the alias "default"
   export GCLOUD_PROJECT=YOUR-PROJECT
   ```
   The server falls back to `decastockenvision` when `GCLOUD_PROJECT` is empty
   (`server/src/firebase.ts`), so set it in every terminal that runs `npm run seed` or the server.
3. Make sure no emulator variable is left over from Path A. Both lines must print nothing:
   ```bash
   echo $FIRESTORE_EMULATOR_HOST
   echo $FIREBASE_AUTH_EMULATOR_HOST
   ```
   If either prints a value, run `unset FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST`.

### B3. Deploy the security rules

```bash
npx firebase login        # one time; opens a browser
npm run deploy:rules      # uploads firestore.rules and firestore.indexes.json
```

### B4. Create the market

```bash
npm install
npm run build:shared
npm run seed
```

The first time, `npm run seed` prints something like:

```
Seeded 25 companies. The game is in the lobby.
   Admin/host login:  name "admin"
   Admin password:    <shown here>   (generated — save this!)
   Game seed:         <shown here>   (generated — stored server-only)
```

- **Save the admin password** somewhere safe (a password manager). It is printed only once.
- **Don't share, paste or screenshot this output.** It also shows the game seed, and anyone who
  knows the seed can predict every price.
- To choose the password yourself, set it on the same line (the server does **not** read
  `.env` files, so variables go in the shell):
  ```bash
  ADMIN_PASSWORD='a-long-password-only-you-know' npm run seed
  ```
- Leave `GAME_SEED` unset. The seed command then picks a random seed and stores it in a
  server-only document.
- Running `npm run seed` again makes a **new market**. It keeps existing crews (their cash goes
  back to the starting amount), keeps the admin password unless you pass `ADMIN_PASSWORD`, and
  keeps the game settings. Never run it during a live game. If the server is already running,
  restart it afterwards so it loads the new market.

The seed reads `server/service-account.json` automatically, because npm runs the script inside
the `server/` folder.

### B5. Run the server and the web app

Use two terminals (remember `GCLOUD_PROJECT` if you set it in B2).

```bash
# Terminal 1: the server (price engine + trade API) on http://localhost:8081
npm run dev:server
```

```bash
# Terminal 2: the web app on http://localhost:5173
npm run dev:web
```

Open <http://localhost:5173> and sign in with the crew name **`admin`** and the password from B4.
The host login name is `admin`, not an email address.

Check the server is alive: open <http://localhost:8081/health>. You should see JSON with
`"ok":true` and `"phase":"lobby"`.

### B6. Try it on a phone on the same Wi-Fi

With a real project, a phone only needs to reach your laptop's server and web app.

1. Find your laptop's Wi-Fi address, for example `192.168.1.23`. On macOS open **System Settings ›
   Wi-Fi › Details**. On Windows run `ipconfig`.
2. Terminal 1: `npm run dev:server`. The server already listens on every network address.
3. Terminal 2 (use your own address):
   ```bash
   VITE_API_BASE=http://192.168.1.23:8081 npm run dev -w @deca/web -- --host
   ```
   `--host` makes the web app reachable from other devices. The `VITE_API_BASE` on this line
   overrides the one in `web/.env`.
4. On the phone, join the same Wi-Fi and open `http://192.168.1.23:5173`.
5. If your computer asks whether Node may accept incoming connections, click **Allow**. School or
   guest Wi-Fi often blocks device-to-device traffic; a home network or a phone hotspot works better.

If you set `CORS_ORIGIN` in the server terminal, add `http://192.168.1.23:5173` to it.

### B7. Starting over

- **New market, keep crews:** use **New game** in the host console, or run `npm run seed` and
  then restart the server.
- **Wipe crews and market:** stop the server, run `npm run reset`, then `npm run seed`, then
  start the server again. `reset` keeps the admin login, the settings and the audit log.

---

## Path C: deploy for a live event

Follow [DEPLOY.md](DEPLOY.md). It covers the Blaze plan, Cloud Run, rules, Hosting, HTTPS and cost.

---

## Environment variables

The server reads only real environment variables (it does not load `.env` files). Vite reads
`web/.env` and, when building, `web/.env.production`.

| Variable | Where | Secret? | What it does |
|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | server | **Yes** | The service-account JSON as one line. Used in the cloud. Locally, `server/service-account.json` is simpler |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | server | Path only | A path to a service-account file, if it isn't `server/service-account.json`. Relative paths start from `server/` |
| `GOOGLE_APPLICATION_CREDENTIALS` | server | Path only | Google's default credentials. Used only when none of the service-account options above is found |
| `GCLOUD_PROJECT` | server | No | The Firebase project ID. Defaults to `decastockenvision` (or `demo-deca` in emulator mode) |
| `ADMIN_PASSWORD` | `npm run seed`, `dev:local` | **Yes** | Sets the host password. If unset, the first seed generates one (`dev:local` uses `captain`). The running server does not read it |
| `GAME_SEED` | `npm run seed`, `dev:local` | **Yes** | Fixes the market seed. Leave unset for a random seed. The server uses it only if the stored seed is missing |
| `CORS_ORIGIN` | server | No | Web address(es) allowed to call the server, comma-separated. Defaults to any origin |
| `PORT` | server | No | Server port. Default `8081` |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | server | No | Send the server to the emulators. Either one turns on emulator mode |
| `VITE_FIREBASE_*` | web | No (public) | The Firebase web config from the console |
| `VITE_API_BASE` | web | No | The server's address, for example `http://localhost:8081` |
| `VITE_USE_EMULATORS` | web | No | `1` connects the dev web app to the local emulators. Ignored in production builds |

## Security checklist

- `server/service-account.json`, `ADMIN_PASSWORD`, `GAME_SEED` and the output of `npm run seed`
  are secrets. Keep them out of git, chat, screenshots and the `web/` folder.
- If a key file leaks, delete that key in **Google Cloud Console › IAM & Admin › Service accounts ›
  Keys** and generate a new one.
- The `VITE_FIREBASE_*` values are public and safe to ship in the web app.
