# Deploy Buccaneer Exchange for a live event

This guide is for a **student developer**. It takes the repo from "runs on my laptop" to "students
play from their phones." Plan about an hour the first time. Follow the steps in order.

When you're done, hand the host three things: the **game address**, the **host password** and the
**health page address** (your server address with `/health` on the end). The host then follows
[RUNBOOK.md](RUNBOOK.md).

---

## 0. The big picture

| Part | What it does | Where it runs |
|---|---|---|
| **Web app** | The iPhone-style app students and the host use | Firebase Hosting (HTTPS) |
| **Server ("engine")** | Moves prices every tick, fills orders, runs the host API. The only thing allowed to write game data | Google Cloud Run, one always-on instance |
| **Firestore + Auth** | Stores the game and pushes live updates to phones. Auth turns the server's sign-in tokens into sessions | Firebase |

Order of work: Blaze plan → security rules → market → server → web app → check.

---

## 1. Before you start

1. **Finish Path B in [QUICKSTART.md](QUICKSTART.md).** You should have:
   - a Firebase project with Authentication started and a Firestore database created,
   - `server/service-account.json` downloaded (and git-ignored),
   - `web/.env` filled in, and a successful `npm run seed`.
2. **Node.js 20 or newer:** `node --version`.
3. **Firebase CLI:** it's already in the repo. Use `npx firebase …`, and sign in once with
   `npx firebase login`.
4. **Google Cloud CLI (`gcloud`):** install from <https://cloud.google.com/sdk/docs/install>.

In the commands below, replace `YOUR-PROJECT` with your Firebase project ID (for example
`decastockenvision`).

---

## 2. Turn on the Blaze plan

Cloud Run and Secret Manager need a billing account. A class game costs cents to a few dollars
(section 8).

1. Open <https://console.firebase.google.com> and your project.
2. Click **Upgrade** next to the plan name (bottom left) and choose **Blaze (pay as you go)**.
3. Pick or create a billing account.
4. **Set a budget alert.** In Google Cloud Console, open **Billing › Budgets & alerts › Create
   budget**, set **$10**, and keep the email alerts. A budget only warns you; it doesn't stop
   spending.

---

## 3. Deploy the Firestore security rules

The rules let phones **read** public and own-crew data only. Nobody but the server can write.

```bash
npx firebase use YOUR-PROJECT
npm run deploy:rules            # firestore.rules + firestore.indexes.json
```

You should see **Deploy complete!**

---

## 4. Create the market in the real project

Run this from your laptop. It uses `server/service-account.json`.

```bash
npm install
npm run build:shared
ADMIN_PASSWORD='a-long-host-password' GCLOUD_PROJECT=YOUR-PROJECT npm run seed
```

- It prints `Seeded 25 companies. The game is in the lobby.` and the host login name `admin`.
- If you leave out `ADMIN_PASSWORD` on the very first seed, it generates one and prints it once.
- **Leave `GAME_SEED` unset.** The seed is then random and stored only on the server.
- Make sure `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are **not** set in this
  terminal, or the seed goes to the emulator instead.
- The output shows the game seed (and a generated password, if any). Don't share or screenshot it.

If you already ran the seed in QUICKSTART Path B, you can skip this step.

---

## 5. Deploy the server to Cloud Run

### 5.1 Set up gcloud

```bash
gcloud auth login
gcloud config set project YOUR-PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
```

Use the **same region as your Firestore database**. This guide uses `us-central1`.

### 5.2 Keep the key file out of the upload

`gcloud run deploy --source .` uploads your folder to Google Cloud Build. Create a file named
`.gcloudignore` in the repo root so the key file, `.env` files and `node_modules` never go up:

```
#!include:.gitignore
.git
node_modules/
**/node_modules/
web/dist/
docs/
*.png
.playwright-mcp/
```

Then check that no secret would be uploaded. This must print **nothing** (`.env.example` is filtered
out because it holds only placeholders and public web settings):

```bash
gcloud meta list-files-for-upload | grep -iE "service-account|\.env" | grep -v "\.env\.example$"
```

### 5.3 Store the secrets in Secret Manager

Secrets stay out of your shell history and out of the Cloud Run settings page.

```bash
# The service-account key, straight from the file (no need to squash it onto one line):
gcloud secrets create firebase-service-account --data-file=server/service-account.json

# The host password. Typing it here puts it in your shell history, so you can create it in
# Cloud Console › Security › Secret Manager instead.
printf '%s' 'a-long-host-password' | gcloud secrets create admin-password --data-file=-
```

Let Cloud Run read them. Cloud Run runs as the default compute service account unless you choose
another:

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR-PROJECT --format='value(projectNumber)')
for s in firebase-service-account admin-password; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 5.4 Deploy

Run from the repo root:

```bash
gcloud run deploy deca-engine \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 1 \
  --no-cpu-throttling \
  --cpu 1 \
  --memory 1Gi \
  --set-secrets "FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest,ADMIN_PASSWORD=admin-password:latest" \
  --set-env-vars "GCLOUD_PROJECT=YOUR-PROJECT,CORS_ORIGIN=https://YOUR-PROJECT.web.app"
```

What each part does:

| Flag | Why |
|---|---|
| `--source .` | Builds a container from the repo with Google's Node.js buildpack |
| `--allow-unauthenticated` | Phones must reach the server. The server checks its own sign-in tokens on every order and host action |
| `--min-instances 1` | Keeps one server running so prices keep updating |
| `--max-instances 1` | **Exactly one engine.** Two instances would each run the tick loop and keep separate in-memory order books |
| `--no-cpu-throttling` | "CPU always allocated." The tick timer runs between requests; without this, Cloud Run limits the CPU when no request is active and price updates stall |
| `--set-secrets` | Exposes the two secrets as environment variables. The server applies `ADMIN_PASSWORD` to the host login each time it starts |

**How the build knows what to do.** The repo's root `package.json` has the two scripts Google's
Node.js buildpack looks for, so no build settings are needed:

| Script | Runs | When |
|---|---|---|
| `gcp-build` | `npm run build:shared` | During the build. It compiles only the shared contracts; the web app is not built into the server image |
| `start` | `npm run start -w @deca/server` (`tsx src/index.ts`) | When the container starts |

The server starts from its production dependencies (`tsx`, Fastify, the Firebase Admin SDK) and its
own `server/src` files only. Tests, dev tools and `service-account.json` are not needed
(`server/test/deployScripts.test.ts` checks this).

When it finishes, gcloud prints a **Service URL** like `https://deca-engine-abc123-uc.a.run.app`.
Copy it.

### 5.5 Check the server

Open `https://<service-url>/health` in a browser. You should see JSON like:

```json
{"ok":true,"phase":"lobby","tick":0,"totalTicks":5760,"serverTime":1789412550000,"lastTickAt":null,"ticksBehind":0}
```

(`totalTicks` is 5760 for the default 48-hour game and changes with the game length.)

If you get an error, see Troubleshooting (section 10).

### 5.6 Server environment variables

| Variable | Set it? | Secret? | What it does |
|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **Yes** (from Secret Manager) | **Yes** | The service-account JSON. The server uses it to write data and sign crews' sign-in tokens |
| `ADMIN_PASSWORD` | Recommended (from Secret Manager) | **Yes** | The host password. At every start the server saves its hash to the host login and logs only `host password set from ADMIN_PASSWORD`, never the value. It is also one safe place to look the password up. See section 9.1 to change it |
| `CORS_ORIGIN` | **Yes** | No | The exact web address(es) allowed to call the server, comma-separated, no trailing slash. If unset, any site may call it |
| `GCLOUD_PROJECT` | **Yes** | No | Your project ID. The server defaults to `decastockenvision` when it's empty |
| `PORT` | No | No | Cloud Run sets it (8080) and the server listens on it |
| `GAME_SEED` | **No** | Yes | Only a fallback. The engine reads the seed stored by `npm run seed` or **New game** |

---

## 6. Deploy the web app to Firebase Hosting

### 6.1 Production settings

Create `web/.env.production` (git-ignored; Vite uses it for `vite build`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=YOUR-PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR-PROJECT
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_BASE=https://deca-engine-abc123-uc.a.run.app
```

- Copy the `VITE_FIREBASE_*` values from **Project settings › General › Your apps**. They are
  public by design.
- `VITE_API_BASE` is the Service URL from step 5.4, with **no trailing slash**.
- Vite also reads `web/.env`. Any value you leave out here falls back to `web/.env`, which may
  point at `localhost`, so fill in every line.
- Don't set `VITE_USE_EMULATORS`. Production builds ignore it anyway.

### 6.2 Build and deploy

```bash
npm run build:shared
npm run deploy:hosting          # builds web/ into web/dist, then deploys it to Hosting
```

The CLI prints your **Hosting URL**, for example `https://YOUR-PROJECT.web.app`. The same site is
also at `https://YOUR-PROJECT.firebaseapp.com`.

(`npm run deploy` does `build:shared`, the rules and Hosting in one go.)

### 6.3 Allow both web addresses

Students may open either Hosting address. Allow both. The values contain a comma, so use gcloud's
alternate delimiter `^|^`:

```bash
gcloud run services update deca-engine --region us-central1 \
  --update-env-vars "^|^CORS_ORIGIN=https://YOUR-PROJECT.web.app,https://YOUR-PROJECT.firebaseapp.com"
```

If you add a custom domain later, add it to this list too.

### 6.4 Final check

1. Open the Hosting URL on your phone using **mobile data** (not school Wi-Fi) and sign in with
   crew name `admin` and the host password.
2. Add a test crew, sign in as it on a second device, and confirm the Markets list loads.
3. Remove the test crew, or follow the host's test run in [RUNBOOK.md](RUNBOOK.md) section 1.5.
4. Give the host the game address, the host password and the health page address.

---

## 7. PWA and HTTPS notes

- **HTTPS is automatic.** Firebase Hosting serves `*.web.app`, `*.firebaseapp.com` and custom
  domains over HTTPS. The service worker and a full Home Screen install need HTTPS.
- **Installing:** iPhone Safari **Share › Add to Home Screen**; Android Chrome **⋮ › Install app**;
  Chromebook uses the install icon in the address bar. School IT can force-install the app on
  managed Chromebooks (**Google Admin › Apps & extensions › Add by URL**).
- **iPhone Home Screen apps keep their own storage,** so students sign in once more inside the
  installed app.
- **Updates:** the service worker waits for the student. After a web deploy, open apps show an
  "Update ready · Reload" prompt between screens and never reload in the middle of a trade.
  Deploy web changes **before** the event, not during it.
- **No offline trading.** The service worker caches only the app shell. Firestore, sign-in and the
  server API always go to the network, and orders are never queued offline.
- **Cache headers:** `firebase.json` should send `Cache-Control: no-cache` for `/index.html`,
  `/sw.js` and `/manifest.webmanifest`, and `public, max-age=31536000, immutable` for
  `/assets/**`, so phones pick up new versions (MOBILE.md §9.5).
- **School Wi-Fi:** if live updates stall behind a filter, the web app can force Firestore long
  polling (MOBILE.md §9.5).

<!-- VERIFY: none of the PWA pieces exist yet: web/vite.config.ts does not register vite-plugin-pwa, web/index.html has no manifest, firebase.json has no headers block, and web/src/firebase.ts has no long-polling option. This section describes MOBILE.md §9. -->

---

## 8. Cost estimate

Prices checked on **2026-09-14**. They change, so recheck the linked pages.

### 8.1 Price list used

| Service | Price | Free allowance | Source |
|---|---|---|---|
| Firestore Standard, `us-central1` | $0.03 per 100,000 reads · $0.09 per 100,000 writes · $0.01 per 100,000 deletes | 50,000 reads, 20,000 writes, 20,000 deletes per day; 1 GiB stored | [Firestore pricing](https://cloud.google.com/firestore/pricing) |
| Firestore Standard, `nam5` multi-region | $0.06 per 100,000 reads · $0.18 per 100,000 writes · $0.02 per 100,000 deletes | same | [Firestore billing example](https://firebase.google.com/docs/firestore/billing-example) |
| Firestore listeners | "charged for a read each time a document in the result set is added or updated" | — | [Understand Cloud Firestore billing](https://firebase.google.com/docs/firestore/pricing) |
| Cloud Run, instance-based billing, `us-central1` | $0.000018 per vCPU-second · $0.000002 per GiB-second | 240,000 vCPU-seconds and 450,000 GiB-seconds per month | [Cloud Run pricing](https://cloud.google.com/run/pricing) |
| Firebase Hosting | $0.026 per GB stored · $0.15 per GB transferred beyond the free amount | 10 GB stored; 360 MB transferred per day | [Firebase pricing](https://firebase.google.com/pricing) |
| Firebase Authentication | Google Cloud pricing beyond the free amount | 50,000 monthly active users | [Firebase pricing](https://firebase.google.com/pricing) |

### 8.2 Firestore writes

Each tick the server writes **55 + 3 × crews** documents:

| What | Documents per tick |
|---|---|
| Company snapshots | 25 |
| Company price-history chunks | 25 |
| Market summary and its history chunk | 2 |
| Game state and engine state | 2 |
| Standings | 1 |
| Per crew: account value, value-history chunk, research-grade stats | 3 × crews |

With **12 crews** that is **91 writes per tick**.

The server also updates the game clock document every 5 seconds while the market is open. In games
longer than 1 hour that adds writes between ticks: 1 per tick at 2 hours, 3 at 4 hours, and 5 at
8 hours or more.

| Game length | Ticks | Writes (12 crews) | `us-central1` | `nam5` |
|---|---|---|---|---|
| 1 hour | 720 | 720 × 91 ≈ 65,500 | ≈ $0.06 (≈ $0.04 after the daily free writes) | ≈ $0.12 (≈ $0.08) |
| 8 hours | 960 | 960 × 96 ≈ 92,000 | ≈ $0.08 (≈ $0.06) | ≈ $0.17 (≈ $0.13) |
| 48 hours | 5,760 | 5,760 × 96 ≈ 553,000 | ≈ $0.50 (≈ $0.46 after two days of free writes) | ≈ $1.00 (≈ $0.92) |

Orders add about 5 writes each (crew, holding, trade, order, audit log). Even 2,000 orders is only
10,000 writes, under a cent.

### 8.3 Firestore reads (rough)

Reads depend on how many phones have the app open. Each open app receives about 25 company updates
per tick plus a few other documents (game state, market summary, standings, its own crew and chart
chunks). Call it **about 35 reads per tick per open app**, or about 40 in games of 8 hours or more,
where the game clock document also changes between ticks.

| Scenario | Reads | `us-central1` | `nam5` |
|---|---|---|---|
| 1-hour class game, 40 phones open the whole time | 40 × 35 × 720 ≈ 1.0 million | ≈ $0.30 | ≈ $0.60 |
| 48-hour game, 8 phones open on average | 8 × 40 × 5,760 ≈ 1.8 million | ≈ $0.55 | ≈ $1.11 |

<!-- VERIFY: "35 reads per tick per open app" is an estimate; the web hooks and screens that decide listener counts are still being built. -->

### 8.4 Cloud Run

One instance with 1 vCPU and 1 GiB, CPU always allocated, costs about **$0.072 per hour**
(3,600 × $0.000018 + 3,600 × $0.000002), or **$1.73 per day**, before the free allowance.

| Scenario | Cost |
|---|---|
| A 48-hour game (plus a few hours of lobby) | ≈ $3.50 to $4 before the free allowance. The monthly free allowance (about 66 hours of 1 vCPU) usually covers it |
| Left running for 30 days by mistake | ≈ $47 |

Cloud Build and Artifact Registry build and store the server's container. They bill separately,
so check **Billing › Reports** after your first deploy; for one small app they are usually a few
cents.

Storage stays far below 1 GiB, and Hosting and Auth stay inside their free allowances for a
class-sized game.

### 8.5 Bottom line

- **1-hour class game:** well under **$1** in total.
- **48-hour game:** roughly **$1 to $6**, depending on the region, how many phones stay open, and
  whether the Cloud Run free allowance is still unused this month.
- The biggest risk is **forgetting to scale the server down** afterwards (section 9).

---

## 9. Game day and after

**Before the game.** Each day the server runs with `--min-instances 1` counts against the free
allowance and then costs about $1.73. If you deploy a week early, you can deploy with
`--min-instances 0` and switch to 1 on game day, **before the host presses Start game**. The lobby
still works with 0 (the server wakes up when someone signs in, which can take several seconds):

```bash
gcloud run services update deca-engine --region us-central1 --min-instances 1
```

**During the game.** Don't redeploy the server. A new revision can briefly run next to the old
one, which means two engines. If you must deploy a fix: have the host **Pause trading**, deploy,
check `/health`, then have the host **Resume trading**.

### 9.1 Changing or recovering the host password

You don't need a new market. The market, crews and a running game are not touched, and the new
password works at the next sign-in. Hosts already signed in are signed out within an hour.

- **With the `admin-password` secret (section 5.3):** add a new version of the secret, then make the
  server restart so it applies it. Do this between games, or while the game is paused:
  ```bash
  printf '%s' 'the-new-host-password' | gcloud secrets versions add admin-password --data-file=-
  gcloud run services update deca-engine --region us-central1 --update-env-vars "HOST_PASSWORD_UPDATED=$(date +%s)"
  ```
  That variable does nothing itself: changing it makes Cloud Run start a new copy of the server,
  which reads the latest secret. A new copy briefly runs next to the old one (section 9), so pause
  first if a game is running. Check `/health` afterwards.
- **Without the secret:** from your laptop (it uses `server/service-account.json`):
  ```bash
  GCLOUD_PROJECT=YOUR-PROJECT npm run set-host-password      # asks for the new password twice
  ```
  If the server does have `ADMIN_PASSWORD` set, update the secret as well, or the next restart puts
  the old password back.

**After the game** (once the reveal is done):

```bash
# Stop paying for the always-on instance:
gcloud run services update deca-engine --region us-central1 --min-instances 0
# …or remove the server completely:
gcloud run services delete deca-engine --region us-central1
```

- The game data stays in Firestore. It is small and within the free storage.
- If you no longer need the laptop copy of the key, delete `server/service-account.json` and delete
  that key in **Google Cloud Console › IAM & Admin › Service accounts › Keys**. The Secret Manager
  copy keeps working if you keep the server.

---

## 10. Troubleshooting

Server logs are in **Google Cloud Console › Cloud Run › deca-engine › Logs**.

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails in the web app, or with `Missing script: "build"` | The buildpack ran the root `build` script instead of `gcp-build` | Check that the root `package.json` still has `"gcp-build": "npm run build:shared"`. As a fallback, add `--set-build-env-vars "GOOGLE_NODE_RUN_SCRIPTS=build:shared"` |
| Container starts, then exits; logs mention `index.js`, `npm start` or `Cannot find module '@deca/shared'` | No root `start` script, or the shared package wasn't built | Check the root `package.json` has `"start": "npm run start -w @deca/server"` and `gcp-build` (above) |
| Logs show `Fatal:` with a credentials or permission error | Secret not readable, or the wrong project | Check the secret IAM binding (5.3) and that `GCLOUD_PROJECT` is your project ID |
| `/health` works but `ticksBehind` keeps growing during a live game | CPU throttled or the instance scaled to zero | Redeploy with `--no-cpu-throttling` and `--min-instances 1` |
| Browser console shows a CORS error; sign-in or orders fail | `CORS_ORIGIN` doesn't match the address students use | Set both Hosting addresses exactly, no trailing slash (6.3) |
| Web app is blank or shows a Firebase `invalid-api-key` error | `VITE_FIREBASE_*` values missing at build time | Fill `web/.env.production`, run `npm run deploy:hosting` again |
| Sign-in or orders fail with a network error, but `/health` works | `VITE_API_BASE` is wrong, or the web app was built before you set it | Fix it in `web/.env.production` and redeploy Hosting |
| Charts, the market index or value history are empty | Rules not deployed, or old rules | `npm run deploy:rules` (section 3) |
| **Start game** fails with "There is no market yet" | The market was never created | Use **New game** in the host console. If you run `npm run seed` instead, restart the server afterwards (run the 5.4 deploy command again) so it loads the new market |
| Log warning `_schedule/_meta has no seed` | The market was created by an old version | Use **New game** in the host console |
| Host password lost | — | Set a new one without a new market (section 9.1). Never run `npm run seed` for this: it makes a new market |
| Log line `host password set from ADMIN_PASSWORD` at every start | Normal: the server applies the `admin-password` secret when it starts | Nothing. The value itself is never logged |
| Orders fail at random, the trading halt doesn't hold, or prices jump between two sets of values | More than one server instance is running (the order queue and pending order flow live inside one server) | Keep `--max-instances 1`, and don't deploy during a game (section 9) |
| Costs higher than expected | The instance was left at min 1, or many phones stayed open | Section 9; check **Billing › Reports** |

For running the game itself, see [RUNBOOK.md](RUNBOOK.md). For local development, see
[QUICKSTART.md](QUICKSTART.md).
