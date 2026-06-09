# 🏴‍☠️ RUNBOOK.md — Running the Live Game (Host / "Captain" Guide)

This is your operator's manual for **running** a live DECA Pirate Stock Game. It assumes
deployment is already done (see `docs/DEPLOY.md`) — the web app is live, the engine is
running, and the market has been seeded into the **lobby**.

You are the **Captain** (the admin). Everything below is done from the **Admin dashboard**
in the live web app, signed in as the Captain.

---

## The game at a glance

- Teams start with **1,000,000 Ð** (Doubloons, symbol **Ð**) each.
- The market has **25 pirate companies**. Prices move every **30 seconds** (a "tick").
- A full game runs **48 hours** (~5,760 ticks), but you can **end it early** any time.
- Prices are pulled gently toward each company's **hidden true value** over time (so
  **research pays off**), but news, randomness, and other teams' buying/selling dominate
  the short run (so **prices are unpredictable** moment to moment).
- The game has three phases: **`lobby`** (frozen at IPO prices) → **`live`** (trading +
  engine running) → **`ended`** (frozen, final standings + the big reveal).

You never edit the database by hand. You operate entirely through the Admin dashboard,
which calls the authority service for you.

---

## 1. Pre-game checklist

Run through this **before** you announce the game to players.

- [ ] **Engine is alive.** Open `https://<your-engine-url>/health` — it should respond
      healthy. (Cloud Run / Render service is running with **min-instances = 1**.)
- [ ] **Web app loads.** Open the Hosting URL (e.g. `https://decastockenvision.web.app`) —
      you see the pirate login screen.
- [ ] **You can log in as Captain.** Sign in with **`admin@deca-pirates.game`** and your
      admin password (the `ADMIN_PASSWORD` you set at seed time; default `captain`). You
      land on the **Admin dashboard**.
- [ ] **The market is seeded and in `lobby`.** The Admin dashboard shows the game phase as
      **lobby** and lists 25 companies at their IPO prices.
- [ ] **Seed matches.** The `GAME_SEED` on the deployed engine is the **same** value you
      used when running `npm run seed`. (If they differ, the prices/news won't match the
      world you seeded — re-deploy the engine with the correct seed.)
- [ ] **CORS is correct.** The engine's `CORS_ORIGIN` equals the exact Hosting URL players
      will use. (If trades fail with a CORS/blocked error, this is why.)
- [ ] **Create all teams** (see Section 2) and **write down every team name + password**.
- [ ] **Do a smoke test:** log in as one test team, buy 1 share of any company, confirm it
      appears in that team's Portfolio and the cash dropped. Then (optionally) delete/ignore
      that test trade — it's harmless, but start the *real* game fresh if you traded a lot.
- [ ] **Decide your end time.** The game auto-ends 48h after you start it, but know whether
      you'll let it run full length or end early.

> **Golden rule:** **Create teams and verify everything while still in the `lobby` phase.**
> Once you press **Start**, the 48-hour clock and the price engine begin.

---

## 2. Logging in as Captain and creating teams

### Log in
1. Open the Hosting URL.
2. On the login screen, sign in as the Captain. The Captain logs in with the email
   **`admin@deca-pirates.game`** and the admin password. (Teams log in with their **team
   name**, not an email — see below.)
3. You're taken to the **Admin dashboard** (role-gated; only the Captain sees it).

### Create a team
For each team, in the Admin dashboard's **Teams** section:
1. Enter a **team name** (e.g. `The Black Pearl`) and a **password**.
2. Submit. The server creates a Firebase Auth login, attaches the `team` role + that
   team's ID as a custom claim, and creates the team's wallet with the starting
   **1,000,000 Ð**.
3. **Record the name and password** somewhere safe — you'll hand these to the players.

**How team login works (tell your players):** a team logs in with its **team name** and
password — *not* an email. Behind the scenes the app converts the team name into an email
of the form `<slugified-team-name>@deca-pirates.game`, so:
- Team names are effectively **case-insensitive** and spaces/punctuation are normalized.
  `The Black Pearl`, `the black pearl`, and `The  Black  Pearl` all map to the same login.
- To avoid confusion, **make every team name clearly distinct** (don't create both
  `Krakens` and `the krakens`).

Repeat for all 12+ teams. Do this **before** starting the game.

---

## 3. Starting the game

When all teams are created and your checklist is green:

1. In the Admin dashboard's **Game control** section, press **Start**.
2. This flips the phase from **`lobby`** to **`live`**, stamps the start time, sets the end
   time to **48 hours later**, and the engine begins ticking every 30 seconds.
3. Confirm it took: the **Countdown** timer starts running, the **ticker strip** begins
   moving, and price charts start drawing new points.

Tell the players: **trading is open.** They log in (team name + password), research
companies, and place market **buy** / **sell** orders. Everything they see — prices,
portfolios, news, leaderboard — updates live on its own.

---

## 4. Firing custom news events

Beyond the pre-scheduled (hidden) news that fires automatically, **you** can drop a custom
news bombshell at any time during the live game — great for keeping energy up or reacting
to the room.

In the Admin dashboard's **Fire news** section:
1. **Choose the company (or companies)** the news hits.
2. **Pick an impact type:** `merger`, `scandal`, `storm`, `discovery`, `regulatory`,
   `earnings`, `management`, or `macro`.
3. **Set the magnitude** — a signed fractional jump applied to the price. **Positive =
   price jumps up, negative = price drops.** For example `+0.10` is roughly a +10% pop;
   `-0.15` is roughly a -15% plunge. Start modest (`±0.05` to `±0.15`); large magnitudes
   are dramatic.
4. **Write a headline and body** in pirate flavor (e.g. *"Kraken Shipping seizes Spanish
   treasure fleet — shares surge!"*).
5. Fire it.

What happens: the engine applies the jump to the chosen company's price on the next tick,
posts your headline to the **public News feed** for everyone, and records it in the audit
log. **News cannot be un-fired** — it's a real market event, so double-check the company,
the sign of the magnitude, and the headline before you send.

> Tip: announce nothing in advance. Surprise is the point. Let the News feed do the
> talking, and watch the leaderboard scramble.

---

## 5. Monitoring the game

From the Admin dashboard and the normal pages, keep an eye on:

- **Leaderboard** — teams ranked by **total fleet value** (cash + holdings, marked to
  market). Recomputed every tick. This is your scoreboard; project it on a big screen.
- **Portfolios** — the Admin view lets you see all teams' positions, cash, and P&L. Use it
  to spot a team that's stuck, has fat-fingered a huge order, or is dominating.
- **Ticker strip / price charts** — confirm prices are actually moving (proof the engine is
  ticking). If everything is flat for more than a minute, see Troubleshooting.
- **News feed** — shows both your custom events and the auto-firing scheduled events, with
  timestamps.
- **Countdown** — time remaining until the 48h auto-end.

### Reading the audit log

Every meaningful action — logins, orders, fills, news fires, admin actions, phase changes —
is recorded in an **append-only audit log**. This log is **server-only**: players can never
read it, and it is **not** exposed to the web client directly.

To read it, the Captain calls the admin endpoint (with a Captain ID token):

```
GET <your-engine-url>/admin/logs   ->   { "logs": [ ... ] }
```

The Admin dashboard's **Audit** view does this for you and renders the entries. Use it to
investigate disputes ("we placed that order!"), confirm a news event fired, or review the
sequence of events after the game.

---

## 6. Pausing and resuming

If you need to halt the action — a break, a problem in the room, a technical issue:

1. **Pause:** Admin dashboard → **Pause**. The engine stops ticking and trading is halted.
   Prices freeze in place. Nothing is lost.
2. **Resume:** Admin dashboard → **Resume**. Ticking and trading restart from where they
   left off.

The engine is **resume-safe by design**: prices, the current tick, and the clock are saved
every tick. Even a server **crash or redeploy** isn't fatal — on restart the engine reads
the start time, recomputes the correct tick from the wall-clock, reloads the last saved
prices, and continues. So a brief engine restart looks like a momentary pause, not a lost
game.

> Note: pausing does **not** add time to the 48h window unless your build is configured to;
> if you pause for a long stretch, plan to **end early** at an appropriate score rather than
> assuming the clock waits.

---

## 7. Ending the game + the post-game reveal

The game ends one of two ways:

- **Automatically** at the 48-hour mark (`endAt`), or
- **Early** — Admin dashboard → **End** whenever you choose (e.g., to fit your event
  schedule).

When the game ends, the phase becomes **`ended`**:
- **Trading freezes** — no more orders are accepted.
- **Final standings lock in** — the leaderboard shows the final ranking by total fleet
  value.
- **The big reveal** — because the game is over, the hidden truth can finally be shown: each
  company's secret **fate archetype** (Compounder, Turnaround, Steady, Value trap, Decliner)
  and how its **true intrinsic value** moved over the 48 hours. This is the teaching moment:
  teams can compare the price they paid against what the company was "really" worth, and see
  whether their **research** correctly read the fundamentals.

Run a wrap-up: crown the winning crew, then walk through a few companies in the reveal —
"the optically-cheap one was a **value trap**; the boring dividend payer was a **steady
compounder**" — so players connect the research signals to the outcomes.

---

## 8. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| **Prices aren't moving / charts flat** | Engine isn't ticking (crashed, asleep, or paused). | Check `https://<engine-url>/health`. Make sure the game is **live**, not paused. On Render, confirm you're **not** on the free tier (it sleeps). On Cloud Run, confirm **min-instances = 1**. Restart the service if needed — it resumes safely. |
| **Players can't place trades; "blocked"/CORS/network error in the console** | Engine `CORS_ORIGIN` doesn't match the Hosting URL, or `VITE_API_BASE` is wrong/empty. | Make `CORS_ORIGIN` exactly equal the URL players use (no trailing slash) and redeploy the engine. Confirm `web/.env`'s `VITE_API_BASE` points at the live engine URL, rebuild, and redeploy hosting. |
| **A player can't log in** | Team not created, wrong password, or a near-duplicate team name. | In the Admin **Teams** view, confirm the team exists. Re-create or reset the team if needed. Remind them: log in with the **team name** (not an email) + password; names are case-insensitive. |
| **You can't see the Admin dashboard** | Not signed in as Captain. | Log in with **`admin@deca-pirates.game`** and the `ADMIN_PASSWORD`. The dashboard is role-gated; team logins don't see it. |
| **"Insufficient funds" / "not enough shares" on a trade** | Working as intended — long-only, no shorting, no margin. | Team can only spend cash it has and sell shares it holds. Not a bug. |
| **A trade rejected as too frequent / rate-limited** | Per-team order rate limit (anti-spam). | Have the team wait a moment and retry. This protects the engine from a single team spamming orders. |
| **News won't fire / nothing happens** | Game not live, or magnitude was effectively zero. | News only fires while the game is **live**. Use a non-trivial magnitude (e.g. `±0.10`). Check the News feed and the audit log to confirm it landed. |
| **You fired the wrong news** | News is a real, permanent market event. | It can't be un-fired. If needed, fire a counter-event (opposite sign) to partially offset, and clarify in a follow-up headline. |
| **Leaderboard/portfolio looks stale** | A momentary listener hiccup, or the engine paused between recomputes. | The leaderboard refreshes each tick. Confirm the engine is ticking; a browser refresh re-establishes the live listener. |
| **You re-ran the seed by accident mid-game** | The world was regenerated; live prices/clock may be reset. | **Don't re-seed during a game.** If it happened, the cleanest path is to restart the round: re-seed once, re-create teams, and **Start** fresh. |

If something looks truly wrong, the **audit log** (`GET /admin/logs`) is your source of
truth for exactly what happened and when.

---

## Quick operator cheat-sheet

```
Captain login:   admin@deca-pirates.game  +  ADMIN_PASSWORD (default: captain)
Team login:      team name  +  password   (no email; name is case-insensitive)
Currency:        Doubloons (Ð)            Starting capital: 1,000,000 Ð / team
Tick:            every 30 seconds         Game length: 48h (or End early)
Phases:          lobby -> live -> ended

Pre-game:   create ALL teams, smoke-test, verify engine /health  (while in lobby)
Start:      Admin -> Start                (begins clock + engine)
News:       Admin -> Fire news            (pick company, impact, +/- magnitude, headline)
Monitor:    Leaderboard + Portfolios + News feed + Countdown
Audit:      Admin -> Audit  (GET /admin/logs)
Pause/Resume: Admin -> Pause / Resume     (resume-safe; nothing lost)
End:        Admin -> End                  (freezes trading, reveals archetypes + true value)
```
