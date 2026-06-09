# Quickstart — get the game running on `decastockenvision`

Two paths. **Path A** gets you a fully working game on your real Firebase project in
minutes with no billing. **Path B** is the public 48h cloud deployment (see also
`DEPLOY.md`).

---

## What only YOU can do (3 console steps)

These need your Google login / browser — I can't do them for you:

1. **Enable Email/Password auth** — Firebase Console → *Authentication* → *Get started* →
   *Sign-in method* → enable **Email/Password**.
2. **Create the Firestore database** — Console → *Firestore Database* → *Create database*
   → **Production mode** → pick a location.
3. **Download a service-account key** — Console → *Project Settings* (gear) →
   *Service accounts* → **Generate new private key**. Save the downloaded JSON as:
   ```
   server/service-account.json
   ```
   (It's already git-ignored. This file is the server's admin credential — keep it secret.)

Once those three are done, everything below is automated.

---

## Path A — run it locally (no Blaze needed)

From the repo root:

```bash
npm install                 # already done
npm run build:shared        # compile the shared contract
npm run seed                # builds the hidden market in Firestore; prints the admin password
npm run dev:server          # authority service (price engine + trade API) on :8081
npm run dev:web             # the pirate UI on http://localhost:5173   (separate terminal)
```

- `npm run seed` prints the **admin password** and confirms the lobby is ready.
- Open **http://localhost:5173**, click **Captain**, log in with `admin@deca-pirates.game`
  + that password. Create teams, then **Start** the game.
- Teams log in (Crew tab) with their team name + password from any browser on the same
  machine. For **other devices on your Wi‑Fi**: set `VITE_API_BASE` in `web/.env` to
  `http://<your-LAN-IP>:8081`, run the web app with `npm run dev:web -- --host`, and run
  the server so it's reachable.
- Recommended: push the security rules to your project so reads are locked down:
  ```bash
  npm run firebase:login      # one-time browser login
  npm run deploy:rules        # deploys firestore.rules + indexes
  ```

## Path B — public 48h cloud deployment

1. Enable the **Blaze (pay-as-you-go)** plan (needed for an always-on service). Cost for a
   48h / ~12-team game is cents.
2. Deploy the **authority service** (server/) to **Cloud Run** (min-instances=1) or Render,
   with env: `FIREBASE_SERVICE_ACCOUNT` (the key JSON, single line), `GAME_SEED`,
   `ADMIN_PASSWORD`, `CORS_ORIGIN` (your hosting URL).
3. Set `web/.env` → `VITE_API_BASE=<deployed service URL>`, then:
   ```bash
   npm run deploy:rules        # security rules
   npm run deploy:hosting      # builds web + deploys to Firebase Hosting
   ```
4. `npm run seed` once (locally with the key, or as a one-off job) to populate the market.

See `DEPLOY.md` for the detailed walkthrough and `RUNBOOK.md` for running the live game.

---

### Security notes
- The web Firebase config in `web/.env` is **public and safe** (security is enforced by
  Firestore rules + the server authority, not by hiding it).
- `service-account.json`, `GAME_SEED`, and `ADMIN_PASSWORD` are **secret**. With no
  `GAME_SEED`/`ADMIN_PASSWORD` set, `npm run seed` generates random ones (the seed is
  stored server-only in Firestore; the admin password is printed once — save it).
