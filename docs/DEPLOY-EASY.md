# Putting Buccaneer Exchange online — the easy ways

You need one address that twenty phones can open. This guide gives you three ways to get one,
in plain English, with copy-paste commands. Pick one, follow the numbers, done.

No sysadmin knowledge needed. If you tried Oracle Cloud and gave up, start with Option 2.

---

## Which should I pick?

**Start with Option 2 (Render). It is free.** It takes about ten minutes of clicking in a web
browser, and then the game sits on a public address whether or not your laptop is open — which is
the whole point. The catch is that a free service falls asleep when nobody is using it, and forgets
everything when it does, so read the next section and follow the run-of-show. If you want none of
that on the day of a graded event, about $7 buys one month with no sleeping and a real disk; see
"Upgrading for the real event". **Use Option 1 (your laptop) for practice runs, club meetings, or
when you would rather not sign up for anything at all.** It is free and takes about ten minutes
too, but it lives or dies with your laptop — the game ends if the lid closes, the Wi-Fi drops or
the battery goes — and the free tunnel has a documented problem with live price updates that you
must test before you trust it (the script tests it for you and tells you). **Option 3 (Railway) is
for when Render is not an option for you** — blocked at school, or a card it will not take.

| | **1. Your laptop** | **2. Render** ← recommended | **3. Railway** |
|---|---|---|---|
| Cost | Free | Free (about $7/month if you upgrade) | ~$5/month |
| Setup time | ~10 min | ~10 min | ~10 min |
| What you do | Run one command | Click through a web form | Click through a web form |
| Needs a credit card | No | No | Yes — and it must be a real post-paid card, not a prepaid or gift card |
| Stays up on its own | **No** — laptop must stay awake, lid open, on Wi-Fi | Only while it is being used — [asleep after 15 quiet minutes](https://render.com/docs/free), about a minute to wake | Yes |
| Survives a restart | Yes (file on your laptop) | **No** — the files go when it sleeps, restarts or deploys (yes once you upgrade) | Yes (volume) |
| Live prices | **Must be tested** — see the warning in Option 1 | Yes | Yes |
| Good for | Practice, club meetings | **Everything — with the run-of-show below** | When Render is not an option |

---

## What "free" means on Render — read this before game day

`render.yaml` asks for Render's **Free** instance type. It costs nothing and Render does not ask you
for a card to use it. Three of its documented behaviours decide how you run the session, and all
three are on [one page](https://render.com/docs/free):

1. **It goes to sleep.** Render "spins down a Free web service that goes 15 minutes without
   receiving any inbound traffic", and waking it again "takes about one minute". Whoever opens the
   address next waits out that minute.
2. **Sleeping wipes its files.** Free services have an
   [ephemeral filesystem](https://render.com/docs/deploys#ephemeral-filesystem): changes are "lost
   every time the service redeploys, restarts, or spins down". The game is a SQLite file, so a sleep
   takes the market you created, the crew names and passwords you handed out, and a game in progress
   with it. (Free services cannot attach a disk. That is why `render.yaml` has no `disk:` block and
   leaves `DB_FILE` unset: the server keeps its database in `./data/game.db` next to itself, which
   on a free instance is exactly as durable as anywhere else, which is to say not at all.)
3. **Render may restart it whenever it likes.** "Render might restart a Free web service at any
   time." Rare, not something you control, and the effect is the same as (2).

The app only ever holds one game and there is no archive, so nothing is lost *between* sessions —
every game starts fresh either way. What a sleep costs you is the setup you did before it: the
market, the crews, and the sheet you printed. That is the entire reason for the run-of-show below,
which moves that setup to the last fifteen minutes before the session.

One more number, so it does not surprise you: Render grants 750 free instance-hours per workspace
per calendar month. One service that sleeps whenever nobody is on it will not come close.

---

## Option 1 — Run it from your laptop (free, nothing to sign up for)

Your laptop runs the game and Cloudflare gives it a public `https://` address. No account, no credit
card, no domain name. Option 2 is free as well, so the reason to pick this one is that you want no
account anywhere — or that you are only rehearsing and the laptop is already open.

### Step 1. Install the tunnel program (once)

```bash
brew install cloudflared
```

If you do not have Homebrew, the script will print the other install options. On Windows use
`winget install --id Cloudflare.cloudflared`.

<details>
<summary>Expected output</summary>

```
==> Fetching cloudflared
==> Pouring cloudflared--2026...
🍺  /opt/homebrew/Cellar/cloudflared/...: 3 files, 45MB
```
</details>

### Step 2. Start the game

```bash
cd "path/to/DECA Envision Stock Game"
npm install
bash scripts/serve-tunnel.sh
```

It builds the app, creates a market, starts the server, opens the tunnel, and then **checks that
live prices actually get through**. This takes a couple of minutes the first time.

**Expected output** — the part that matters is the box:

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║                                                                  ║
  ║   BUCCANEER EXCHANGE IS LIVE                                     ║
  ║                                                                  ║
  ║   Students open this on their phones:                            ║
  ║                                                                  ║
  ║   https://cold-boat-1234-example.trycloudflare.com               ║
  ║                                                                  ║
  ║   Host console — sign in with:                                   ║
  ║     Crew name:  admin                                            ║
  ║     Password:   anchor-kraken-042  (save this)                   ║
  ║                                                                  ║
  ╚══════════════════════════════════════════════════════════════════╝

  Live price updates: WORKING through the tunnel (checked just now).
```

**Write the password down.** It is generated fresh for each new game and shown only here.

> ### ⚠️ If it says prices will NOT move, stop
>
> Cloudflare's own documentation says free "quick" tunnels
> [do not support Server-Sent Events](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/),
> which is exactly how prices reach the phones. When that bites, the app loads and then sits
> frozen — which looks fine for the first ten seconds and then ruins the game.
>
> The script measures this on every run and tells you which way it went. If it prints the
> **STOP** box, do not run a graded game on that address. Use Option 2 instead — it costs nothing
> either.

### Step 3. Keep the laptop awake

Open a **second** terminal window and paste the `caffeinate` line the script printed:

```bash
caffeinate -dimsu -w 12345
```

It stops by itself when the game stops. Also: keep the lid open, stay on one Wi-Fi network, and
plug in the charger. A sleeping laptop ends the game for everyone.

### Step 4. Make the crews (see "Crew sheets" below), then play

Press `Ctrl+C` in the first window when you are done. Everything stops cleanly and the game is
saved, so running the script again picks up where you left off.

> The address changes every time you restart, so **print the crew sheets after you see the
> address**, not before.

---

## Option 2 — Render (recommended, free)

Render reads `render.yaml` from the repo and sets everything up for you. All of this happens in a
web browser. No terminal, no SSH, no Docker.

It costs nothing — `render.yaml` asks for the Free instance type. Read *What "free" means on Render*
above before the day, and follow the run-of-show at the end of this option.

### Step 1. Push the repo to GitHub

Your repo is already at `github.com/nishantss2008-hub/DECAStockGameEnvision` and it is public, so
Render can read it. Make sure `render.yaml` and `.node-version` are committed and pushed.

### Step 2. Create the Blueprint

1. Sign up at <https://render.com> with your GitHub account.
2. Click **New** → **Blueprint**.
3. Choose the `DECAStockGameEnvision` repo and click **Connect**.
4. Render finds `render.yaml` and shows one service, `buccaneer-exchange`.

### Step 3. Set the one secret it asks for

Render will prompt you for **`ADMIN_PASSWORD`**. This is the host console password. The app sits on
a public address, so make it a real password — not `captain`.

Everything else is already decided in `render.yaml`: the Free instance type, the region, manual-only
deploys, and a `SESSION_SECRET` that Render generates once and keeps. `DB_FILE` is deliberately not
set — the server puts its database in `./data/game.db` and creates the folder itself, which is the
right answer on a free instance, where no path survives a sleep anyway.

### Step 4. Click Apply, then wait

The first build takes roughly 3–6 minutes.

<details>
<summary>Expected output in the Logs tab</summary>

```
==> Cloning from https://github.com/nishantss2008-hub/DECAStockGameEnvision
==> Using Node.js version 24.x (from .node-version)
==> Running build command 'npm ci --include=dev && npm run build:shared && npm run build -w @deca/web'
...
✓ built in 12.4s
==> Build successful 🎉
==> Deploying...
==> Running 'npm run start'
⚓ Authority service listening on :10000 (phase=lobby, tick=0, db=./data/game.db)
==> Your service is live 🎉
```

The line to look for is `⚓ Authority service listening`, with `phase=lobby`. `db=./data/game.db` is
the folder the server makes for itself; on a free instance there is no disk path to check, because
there is no disk.
</details>

Your address appears at the top of the page, like
`https://buccaneer-exchange.onrender.com`. That is what students open, and it never changes.

### Step 5. Check it

Open `https://your-address.onrender.com/health` in a browser. You should see this, plus a few
timing fields:

```json
{"ok":true,"phase":"lobby","tick":0,"totalTicks":360,"connections":0}
```

There is no market yet — creating one is Step 2 of the run-of-show, and it belongs just before the
session, not now. If you want to prove the whole thing works today, sign in as the host (crew name
`admin`, the `ADMIN_PASSWORD` you set), create a game, watch a price move for ten seconds, and then
forget it. It will be gone by game day, and that is fine.

### Run of show — the fifteen minutes before the game

This is the order that makes a free instance behave. Do it shortly before the session, **not the
night before**.

1. **Wake it yourself.** Open the address. If it has been quiet for 15 minutes it is asleep and this
   takes about a minute. Better that minute happens to you than to twenty phones at once.
2. **Create the game.** Sign in as the host (crew name `admin`), open **Control › New game…**, type
   `NEW GAME`, press **Start new game**, and wait for *"New game ready."* That is what builds the
   market. Do it **before** the crews: a new game with **Keep crews and passwords** turned off
   deletes every crew.
3. **Make the crews and print the sheet.** See "Crew sheets" below —
   `node deploy/crew-sheet.mjs --url https://YOUR-ADDRESS --count 12` — then print, cut and hand out.
4. **Keep a tab open until the game ends.** The host console asks the server for updates on a timer
   and every student's page holds a live connection open, so the service never sits 15 minutes
   without traffic while anyone is on it. The gap to worry about is the quiet one between you
   finishing setup and the students arriving; an open tab covers it.

**If it slept anyway** — you will know because the page takes about a minute, and then the market is
empty and the printed cards are refused — redo steps 2 and 3. Creating the game and re-running
`crew-sheet.mjs` is a couple of minutes at the keyboard. Reprinting and re-cutting the cards is the
part that actually costs time, because the wipe took the old passwords with it and the cards in the
students' hands are now dead. Budget about ten minutes for that, or upgrade so it cannot happen.

### Upgrading for the real event

About $7 a month removes all three free-tier behaviours at once: the service stops sleeping, it gets
a real 1 GB disk, and the game survives restarts and deploys. Cancel after the event and you have
paid for one month ([pricing](https://render.com/pricing), [disks](https://render.com/docs/disks) —
the disk is about $0.25/month for 1 GB on top of the machine).

The switch is three edits in `render.yaml`, and all three are already written there as comments:

1. Change `plan: free` to `plan: 0.5c-512mb`.
2. Uncomment the `disk:` block — `game-data`, mounted at `/var/data`, 1 GB.
3. Uncomment the `DB_FILE` variable, value `/var/data/game.db`. It has to point *inside* the mount,
   or the disk holds nothing and you have paid for the same wipe.

Commit, push, then open the service and click **Manual Deploy → Deploy latest commit**.

You can also do it from the dashboard without touching the repo: change the instance type on the
service's **Settings** page and add the disk there, then set `DB_FILE` to `/var/data/game.db`
yourself under **Environment**. Either way the change restarts the service and takes the current
game with it, so upgrade before you set anything up — never during class.

### Two things to know about Render

- **Deploys restart the service, and on free that wipes it.** A deploy replaces the running
  instance, and a free service's files do not survive that
  ([ephemeral filesystem](https://render.com/docs/deploys#ephemeral-filesystem)). `render.yaml`
  therefore turns auto-deploy **off** — pushing to GitHub will *not* touch your running game. When
  you actually want to ship a change, open the service and click **Manual Deploy → Deploy latest
  commit**. Never do that during class. (On the paid path the database lives on the disk and
  survives, but the deploy still swaps instances, so the rule does not change.)
- **One instance, which is what you want.** Free services do not support
  [scaling beyond a single instance](https://render.com/docs/free), and a service with a disk
  [cannot scale to several either](https://render.com/docs/scaling). SQLite wants exactly one
  writer.

---

## Option 3 — Railway (~$5/month, only if Render is not an option)

Same idea as Render, and it is the cheaper way to get a machine that never sleeps and keeps its data
on a volume. It is worth the trouble only when Render itself is out — blocked on your school
network, or a card it refuses — because Railway
[requires a real post-paid credit card](https://docs.railway.com/reference/pricing/plans) of its
own: prepaid and gift cards are refused, which is often the problem with a school card.

1. Sign up at <https://railway.com> and pick the **Hobby** plan ($5/month, includes $5 of usage).
2. **New Project** → **Deploy from GitHub repo** → pick `DECAStockGameEnvision`.
3. Open the service → **Settings** and set:
   - Build command: `npm ci --include=dev && npm run build:shared && npm run build -w @deca/web`
   - Start command: `npm run start`
   - Health check path: `/health`
4. **Variables** tab → add `DB_FILE` = `/data/game.db`, `ADMIN_PASSWORD` = a real password, and
   `SESSION_SECRET` = a long random string of your own.
5. **Volumes** → add a volume mounted at `/data`. This must match `DB_FILE` or the game is wiped on
   every deploy.
6. **Settings** → **Networking** → **Generate Domain** to get your public address.

Railway also has [a short outage when redeploying a service with a volume](https://docs.railway.com/reference/volumes),
so the same rule applies: do not deploy during class.

---

## Crew sheets — making the teams and printing the handout

Do this **after** you have your address, and after you have created the game — a new game with
**Keep crews and passwords** off deletes every crew. One command creates the crews on the server and
writes a printable sheet with each crew's name, password and a QR code that opens the game.

```bash
node deploy/crew-sheet.mjs --url https://YOUR-ADDRESS --count 12
```

It asks for the host password (the `ADMIN_PASSWORD` from whichever option you chose) so it does not
end up in your shell history.

**Expected output:**

```
  12 crews created.

  Handout: /Users/you/crew-sheet.html
           Page 1 is the projector / wall sheet. The rest are cards to cut up.
           Open it in a browser and print at 100% scale, no "fit to page".

  That file contains every password in plain text. It is mode 600.
  Passwords were deliberately not printed here, so they are not in your scrollback.
  Delete the file once the cards are handed out.
```

Open that file in a browser and print it at 100% scale. Cut up the cards, hand one to each crew,
then delete the file.

Useful extras:

- `--dry-run` — generate names, passwords and the sheet without touching the server. Good for
  checking the print layout beforehand.
- `--names-list "Black Pearl,Sea Dog,Queen Anne"` — use your own crew names.
- `--reset-existing` — give a crew that already exists a new password instead of stopping.

---

## Game-day checklist

1. Get it running (Option 1: run the script. Option 2 on free: do the run-of-show — wake it, create
   the game, make the crews. Option 3, or an upgraded Render: it is already running).
2. Open `/health` and confirm `"ok":true`.
3. Sign in as `admin`, open a crew's view on your own phone, and watch one price change.
4. Hand out the crew cards.
5. **Do not deploy, push, or restart anything from now on**, and leave a tab open on the address.
   The game must run as **one instance**: the trading pause and each crew's order queue live inside
   a single server, and the database file has one writer. Never scale the service past one.
6. Let the crews sign in and finish **Meet the market** — a required one-minute tour that gates
   each crew's first order. The host's **Crews** tab shows who has finished, and can mark a crew
   finished if a phone dies ([RUNBOOK.md](RUNBOOK.md) section 2.5).
7. Start the game from the host console and pick a length (10, 15, 20 or 30 minutes).

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| The app loads but prices never move | The live stream is being blocked | On a laptop tunnel this is the known Cloudflare limit — switch to Option 2 |
| The Render address takes about a minute to open | The free service was asleep | Normal. Wait it out — and next time open it yourself before the students do |
| The market is empty and the printed cards are refused | The free service slept, restarted or redeployed, and [took its files with it](https://render.com/docs/deploys#ephemeral-filesystem) | Create the game again, re-run `crew-sheet.mjs`, reprint. To stop it happening, upgrade (above) |
| "Port 8081 is already in use" | A previous run is still going | `PORT=8090 bash scripts/serve-tunnel.sh`, or close the old window |
| `cloudflared is not installed` | The tunnel program is missing | `brew install cloudflared` |
| Render build fails on `better-sqlite3` | Node version is wrong | Confirm `.node-version` (containing `24`) is committed |
| Everyone is logged out after a deploy | `SESSION_SECRET` changed | On Render it is generated once and kept; do not delete it |
| On Railway, or upgraded Render, the game is empty after a restart | `DB_FILE` does not point inside the mounted volume or disk | `/data/game.db` on Railway, `/var/data/game.db` on a Render disk |
| Students see a wrong-password error | Crew sheets are from an older game | Re-run `crew-sheet.mjs` with `--reset-existing` |

---

## Appendix — the other guides

- **[DEPLOY-ORACLE.md](DEPLOY-ORACLE.md)** — Oracle Cloud Always Free. Free forever, the most
  powerful of these options, and unlike Render's free tier it never sleeps and keeps its data — but
  it is a real Linux server you own and maintain: SSH keys, firewall rules, `systemd`, certificates.
  Only worth it if you want to learn that.
- **[HOSTING-FREE.md](HOSTING-FREE.md)** — the full research behind these recommendations. Written
  when a game ran for 48 hours, so its conclusions no longer apply; read it for the reasoning.
- **[RUNBOOK.md](RUNBOOK.md)** — running the live game itself, start to reveal.
