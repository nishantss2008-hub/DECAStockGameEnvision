# 🏴‍☠️ DEPLOY.md — Deploying the DECA Pirate Stock Game

A click-by-click guide to take this repo from "downloaded" to "live on the internet,
ready to run a 48-hour game." **You do not need to be an expert.** Follow the steps in
order, top to bottom. Copy/paste the commands exactly.

Total time: about **45–60 minutes** the first time.

---

## 0. What you're deploying (the 30-second picture)

There are three moving parts:

| Part | What it is | Where it lives |
|---|---|---|
| **Web app** | The pirate trading terminal players use in their browser | Firebase Hosting |
| **Authority service** | The "engine" — runs prices, validates trades, fires news. The only thing allowed to write real data. Must run 24/7. | Cloud Run **or** Render |
| **Firestore + Auth** | The database + login system. Pushes live data to players. | Firebase (managed for you) |

The deploy order below is deliberate: set up Firebase → build the code → deploy the
database rules → seed the market → deploy the engine → deploy the web app.

### What you need before starting

- A Google account.
- This repository downloaded to your computer.
- **Node.js 20 or newer** installed. Check with:
  ```bash
  node --version
  ```
  If it prints `v20.x` or higher, you're good. If not, install it from <https://nodejs.org>.
- The **Firebase CLI** installed and logged in:
  ```bash
  npm install -g firebase-tools
  firebase login
  ```
  This opens a browser window — sign in with the same Google account you'll use for the project.

> **About the project ID:** This repo is pre-wired to a Firebase project named
> **`decastockenvision`** (see `.firebaserc` and `web/.env`). The steps below assume you
> are the owner of that project. If you are creating a brand-new project under a different
> ID, you must (a) update `.firebaserc`, (b) replace all the `VITE_FIREBASE_*` values in
> `web/.env`, and (c) use your new project ID everywhere `decastockenvision` appears below.

---

## 1. Enable the Firebase Blaze (pay-as-you-go) plan

The always-on engine and Firestore usage require the **Blaze** plan. **Don't worry about
cost** — a 48-hour game with ~12 teams costs on the order of a few cents to a dollar. You
are simply required to have a billing account attached.

1. Go to <https://console.firebase.google.com> and open (or create) the project
   **`decastockenvision`**.
2. In the bottom-left corner, find the plan indicator (it will say **"Spark"**). Click
   **Upgrade**.
3. Choose the **Blaze — Pay as you go** plan.
4. Select or create a billing account (you'll enter a credit card). Confirm.
5. *(Optional but recommended)* Click **Set a budget alert** and set something like
   **$5/month** so you're emailed if anything is unexpectedly high.

You should now see **"Blaze"** in the bottom-left corner.

---

## 2. Turn on Email/Password login

Players and the host all log in with a password, so you must enable that sign-in method.

1. In the Firebase Console, open **Build → Authentication** (left sidebar).
2. Click **Get started** (only appears the first time).
3. Go to the **Sign-in method** tab.
4. Click **Email/Password** in the providers list.
5. Toggle the first switch (**Email/Password**) to **Enabled**. Leave "Email link
   (passwordless)" **off**.
6. Click **Save**.

That's it — you do **not** create any users by hand here. The host creates teams later
through the app, and the seed script creates the admin/Captain account for you.

---

## 3. Create a service account key (the engine's master password)

The authority service uses the Firebase **Admin SDK** to read and write data on the
server. It authenticates with a **service-account JSON key**.

1. In the Firebase Console, click the **⚙️ gear icon** (top-left) → **Project settings**.
2. Open the **Service accounts** tab.
3. Make sure **Firebase Admin SDK** is selected, then click **Generate new private key**.
4. Confirm **Generate key**. A `.json` file downloads to your computer. **Treat this file
   like a password** — anyone with it has full write access to your game database. Never
   commit it to git, never paste it in chat, never put it in the `web/` folder.

### Turn the JSON into a single-line environment variable

The server reads the key from an environment variable called **`FIREBASE_SERVICE_ACCOUNT`**,
which must be the **entire JSON on one line**. Run the command for your platform, pointing
it at the file you just downloaded:

**macOS / Linux:**
```bash
# Replace the path with wherever the key downloaded:
cat ~/Downloads/decastockenvision-firebase-adminsdk-XXXXX.json | tr -d '\n' | pbcopy
# (macOS) The single-line JSON is now on your clipboard.
# On Linux without pbcopy, just print it and copy it manually:
cat ~/Downloads/decastockenvision-firebase-adminsdk-XXXXX.json | tr -d '\n' ; echo
```

**Windows (PowerShell):**
```powershell
(Get-Content "$HOME\Downloads\decastockenvision-firebase-adminsdk-XXXXX.json" -Raw) -replace "`r`n","" -replace "`n","" | Set-Clipboard
# The single-line JSON is now on your clipboard.
```

You now have one long line that starts with `{"type":"service_account",...}`. You'll paste
this as the value of `FIREBASE_SERVICE_ACCOUNT` in two places: your **local `.env`** (for
seeding) and your **Cloud Run / Render service** (for the live engine).

### Create your local `.env` for seeding

From the **repo root**, copy the example and fill it in:

```bash
cp .env.example .env
```

Open the new `.env` and set at least these:

```
PORT=8081
CORS_ORIGIN=http://localhost:5173
GAME_SEED=blackbeard-2026
ADMIN_PASSWORD=captain
FIREBASE_SERVICE_ACCOUNT={"type":"service_account", ... the single line you copied ... }
```

> - **`GAME_SEED`** controls the entire hidden future (price paths + news). The same seed
>   always produces the same game. Pick any string; keep it secret from players. **It must
>   be identical in your local `.env` and on the deployed engine** so they generate the
>   same market.
> - **`ADMIN_PASSWORD`** is the password for the Captain (admin) account the seed creates.
>   It defaults to `captain` if you leave it out — **change it** to something only you know.
> - The real `.env` is gitignored, so your secret stays out of git.

---

## 4. Install dependencies

From the **repo root** (the folder with the top-level `package.json`):

```bash
npm install
```

This installs everything for all three workspaces (`shared`, `server`, `web`) at once.
It can take a couple of minutes the first time. Run it from the root — **not** inside a
subfolder.

---

## 5. Build the shared package

The `shared` package holds the data types and constants that the server and web app both
import. Build it once so the other workspaces can use the compiled output:

```bash
npm run build:shared
```

You should see it compile with no errors. (This is the same as
`npm run build -w @deca/shared`.)

---

## 6. Deploy the Firestore security rules + indexes

This pushes the rules that lock the database down (clients can read public + own data,
but can never write real data or see the future) and the query indexes.

```bash
firebase deploy --only firestore
```

This deploys both `firestore.rules` and `firestore.indexes.json` (configured in
`firebase.json`). When it finishes you'll see **"Deploy complete!"**.

> If the CLI ever asks which project to use, choose **decastockenvision** (it's the default
> from `.firebaserc`).

---

## 7. Seed the market

This is the big one. It fills your empty database with the entire game world:

```bash
npm run seed
```

> Under the hood this runs the seed script in the `server` workspace using the
> `FIREBASE_SERVICE_ACCOUNT`, `GAME_SEED`, and `ADMIN_PASSWORD` values from your root `.env`.

**What the seed creates:**

- **25 companies** (`companies/{id}`) — the full pirate roster (Blackbeard Incorporated /
  BBRD, Davy Jones Salvage / DJON, Kraken Shipping / KRKN, Port Royal Banking / PRYL, and
  so on) with starting IPO prices, tickers, sectors, and emoji.
- **Fundamentals** (`companies/{id}/fundamentals/data`) — a full, internally consistent,
  real-company-format research profile for each company (financial statements, valuation
  multiples, management bios, industry analysis, risk factors, analyst rating). Generated
  deterministically from `GAME_SEED`.
- **`game/state`** — set to the **`lobby`** phase: market frozen at IPO prices, clock not
  yet started.
- **`_schedule`** — the **hidden future**: each company's secret fate archetype + intrinsic
  value path, and the pre-scheduled news events with their hidden timings. This collection
  is **server-only** — no player can ever read it.
- **An admin (Captain) account** — a Firebase Auth user **`admin@deca-pirates.game`** with
  the `admin` role claim, and the password from your **`ADMIN_PASSWORD`** env var (default
  **`captain`**). This is how you log in to run the game.

> **Re-running the seed:** Running `npm run seed` again regenerates the world from the seed.
> Do this only **before** a game starts (e.g., you changed the seed and want a fresh
> market). **Never re-seed mid-game** — it would clobber live prices and the clock.

---

## 8. Deploy the authority service (the engine)

The engine must run **continuously** for the whole 48 hours. Pick **one** of the two
options below. **Cloud Run** is the most natural fit for a Firebase project; **Render** is
the simplest if you've never used Google Cloud.

The engine needs these **environment variables** wherever you deploy it:

| Variable | Value |
|---|---|
| `PORT` | `8080` (Cloud Run convention) or whatever the platform assigns — see notes |
| `CORS_ORIGIN` | The URL players use, e.g. `https://decastockenvision.web.app` (no trailing slash) |
| `GAME_SEED` | The **exact same** seed string you used when seeding (`blackbeard-2026` or yours) |
| `FIREBASE_SERVICE_ACCOUNT` | The **single-line** service-account JSON from Step 3 |

> **Why min-instances = 1?** The engine ticks every 30 seconds and must never sleep, or
> the market would freeze. Setting **minimum instances to 1** keeps it always warm. (On
> restart it safely resumes from the wall-clock — no game state is lost — but you still
> want it always running so ticks don't pause.)

### Option A — Google Cloud Run (recommended)

1. Install the Google Cloud CLI (`gcloud`) from
   <https://cloud.google.com/sdk/docs/install> and run:
   ```bash
   gcloud auth login
   gcloud config set project decastockenvision
   ```
2. From the **repo root**, build and deploy the server straight from source. Cloud Run
   will detect Node and build it for you:
   ```bash
   gcloud run deploy deca-engine \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --min-instances 1 \
     --max-instances 1 \
     --port 8080 \
     --set-env-vars "GAME_SEED=blackbeard-2026,CORS_ORIGIN=https://decastockenvision.web.app"
   ```
   - `--allow-unauthenticated` is correct here: the service does its **own** auth (Firebase
     ID tokens), so the HTTP endpoint itself is public but every write still requires a
     valid token.
   - `--max-instances 1` is important: there must be exactly **one** engine running the tick
     loop, never two.
3. **Set the secret service-account key** separately (so it's not in your shell history).
   The single-line JSON has commas, which break `--set-env-vars`, so set it on its own:
   ```bash
   gcloud run services update deca-engine --region us-central1 \
     --update-env-vars "FIREBASE_SERVICE_ACCOUNT=$(cat ~/Downloads/decastockenvision-firebase-adminsdk-XXXXX.json | tr -d '\n')"
   ```
   *(For production-grade secret handling you can instead store it in Secret Manager and use
   `--set-secrets`, but the env var above works fine for a single event.)*
4. When the deploy finishes, `gcloud` prints a **Service URL** like
   `https://deca-engine-xxxxxxxx-uc.a.run.app`. **Copy it** — this is your
   `VITE_API_BASE` for Step 9.
5. Sanity check: open `https://<your-service-url>/health` in a browser. You should get a
   healthy response.

### Option B — Render

1. Push this repo to GitHub (Render deploys from a repo).
2. Go to <https://render.com> → **New → Web Service** → connect your repo.
3. Configure:
   - **Environment:** Node
   - **Build command:** `npm install && npm run build:shared`
   - **Start command:** `npm run start -w @deca/server`
   - **Instance type:** any paid tier that does **not** sleep (the free tier sleeps after
     inactivity — **do not use it**, the market would freeze).
4. Under **Environment**, add the variables:
   - `GAME_SEED` = your seed (same as seeding)
   - `CORS_ORIGIN` = `https://decastockenvision.web.app`
   - `FIREBASE_SERVICE_ACCOUNT` = the single-line JSON (paste it as the value)
   - *(Render sets `PORT` automatically; the server reads it.)*
5. Click **Create Web Service**. When it goes live, copy the public URL
   (`https://deca-engine.onrender.com`) — this is your `VITE_API_BASE` for Step 9.
6. Sanity check `https://<your-render-url>/health`.

---

## 9. Build and deploy the web app

Now point the web app at your live engine and ship it to Firebase Hosting.

1. Edit **`web/.env`** and set `VITE_API_BASE` to the **Service URL from Step 8** (no
   trailing slash):
   ```
   VITE_API_BASE=https://deca-engine-xxxxxxxx-uc.a.run.app
   ```
   Leave all the `VITE_FIREBASE_*` values as they are — **this Firebase web config is
   public and safe to expose.** Security comes from the Firestore rules + the server
   authority, not from hiding these keys.

2. Build the web app (this compiles it into `web/dist`, which is what Hosting serves):
   ```bash
   npm run build -w @deca/web
   ```

3. Deploy it:
   ```bash
   firebase deploy --only hosting
   ```

4. When it finishes, the CLI prints your **Hosting URL**, e.g.
   `https://decastockenvision.web.app`. Open it — you should see the pirate login screen.

> **Make sure the URLs line up.** The `CORS_ORIGIN` you gave the engine (Step 8) must
> **exactly** match this Hosting URL. If you used `decastockenvision.web.app` for CORS but
> Firebase shows `decastockenvision.firebaseapp.com` (both are valid Hosting domains), set
> `CORS_ORIGIN` to whichever one players will actually use, then redeploy the engine.

You're live. Continue to **`docs/RUNBOOK.md`** to actually run the game.

---

## 10. Local development with the Firebase Emulator Suite

For testing without touching the real cloud project (no cost, no real data), use the
local emulators. The repo is already configured for them in `firebase.json` (Auth on
`9099`, Firestore on `8080`, Hosting on `5000`, an emulator UI on `4000`).

1. Start the emulators (from the repo root):
   ```bash
   npm run emulators
   ```
   This is shorthand for `firebase emulators:start`. The **Emulator UI** opens at
   <http://localhost:4000> where you can watch the database live.

2. In a **second terminal**, tell the server to talk to the emulators instead of the cloud.
   Add these two lines to your root `.env` (they're listed, commented out, in
   `.env.example`):
   ```
   FIRESTORE_EMULATOR_HOST=localhost:8080
   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
   ```
   Then seed the **emulated** database and start the engine:
   ```bash
   npm run seed
   npm run dev:server
   ```

3. In a **third terminal**, run the web app in dev mode:
   ```bash
   npm run dev:web
   ```
   It serves at <http://localhost:5173> — which is already the default `CORS_ORIGIN` and
   matches `web/.env`'s `VITE_API_BASE=http://localhost:8081`.

4. Log in as the Captain with `admin@deca-pirates.game` / your `ADMIN_PASSWORD` (default
   `captain`) and create test teams.

> **Remember to remove (or comment out) the two `*_EMULATOR_HOST` lines** before you seed
> or deploy against the real cloud project again — otherwise commands will keep pointing at
> your local emulator.

---

## Quick command reference

```bash
# One-time setup
npm install -g firebase-tools && firebase login
cp .env.example .env            # then fill in FIREBASE_SERVICE_ACCOUNT, GAME_SEED, ADMIN_PASSWORD

# Build & deploy (cloud)
npm install                     # install all workspaces (repo root)
npm run build:shared            # compile shared types
firebase deploy --only firestore   # push rules + indexes
npm run seed                    # create companies, fundamentals, lobby, _schedule, Captain
# ... deploy the engine to Cloud Run / Render (Step 8) ...
# edit web/.env -> VITE_API_BASE = engine URL
npm run build -w @deca/web      # build the web app into web/dist
firebase deploy --only hosting  # publish the web app

# Local development
npm run emulators               # firebase emulators:start
npm run dev:server              # the engine, locally
npm run dev:web                 # the web app, locally (http://localhost:5173)
```
