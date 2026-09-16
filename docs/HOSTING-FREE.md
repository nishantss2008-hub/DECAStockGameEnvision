# Hosting Buccaneer Exchange for $0

> **Superseded — kept as background research.** Follow
> **[DEPLOY-EASY.md](DEPLOY-EASY.md)** instead. This document was written when a
> game was expected to run continuously for 48 hours, and it recommends Oracle
> Cloud on that basis. A game is now **30 minutes at most**, which changes the
> answer completely: the sleeping and wiping behaviour ruled out below is
> survivable inside a half-hour session, and Render's free tier was chosen for
> being far easier to set up than an Oracle VM. The provider facts here were
> accurate on 2026-09-15; the conclusions drawn from them no longer apply.

**Written 2026-09-15. Every number below was checked against the provider's own page on that date — links are at the end of each section.**

This document answers one question: *where do we run the game server, for free, so that a 48-hour event never goes down and never loses data?*

It is written for someone who is comfortable copying and pasting commands but does not administer servers for a living. Where something is genuinely risky or annoying, it says so.

---

## The short version

**Run the server on a free Oracle Cloud virtual machine, keep the data in a SQLite file on that machine's disk, and continuously copy that file to Backblaze B2 with a tool called Litestream.**

Total cost: **$0/month**, permanently, not a trial.

The backup plan, if Oracle will not give you a machine or takes it away, is **a spare laptop at school running the same code behind a Cloudflare Tunnel**.

If free ever becomes more trouble than it is worth, **a $6/month DigitalOcean droplet** is the identical setup with none of the anxiety, and you can move to it in about twenty minutes.

---

## 1. The ranked recommendation

### Why this was a hard question

Between 2024 and 2026, almost every "free hosting" service that a project like this would have used in 2022 either shut down or removed its free tier. Heroku, Glitch, Fly.io, Railway and Koyeb are all gone as free options. What is left splits into two groups:

- **Services that are free but go to sleep** (Render, Neon, Koyeb) — they shut your program off when nobody is using it.
- **Services that are free and stay awake** — as of today there is essentially one, plus your own hardware.

Your game has an unusual requirement that makes this matter. The price engine **ticks every 5–30 seconds for 1 to 48 hours straight**. A host that sleeps after 15 minutes of quiet will kill the engine mid-game. Your engine is unusually well built for this — it recomputes the current tick from the wall clock on boot and replays what it missed — but "the data survives and it catches up" is a safety net, not a plan.

### First choice: Oracle Cloud "Always Free" virtual machine

A real Linux computer in a data centre, that Oracle gives you for free, forever, with a real hard disk. Your server runs on it exactly the way it runs on your laptop. Nothing sleeps, nothing gets wiped, nothing needs rewriting.

**The exact free allowance, from Oracle's own page:**

| Resource | Always Free allowance | What you actually need |
|---|---|---|
| Ampere A1 compute | **1,500 OCPU-hours + 9,000 GB-hours per month** (= 2 CPUs and 12 GB RAM running 24/7) | ~1 CPU, under 300 MB RAM |
| Alternative AMD machines | **2 × VM.Standard.E2.1.Micro**, 1 GB RAM each | fallback if A1 is unavailable |
| Disk | **200 GB** total boot + block storage, plus 5 volume backups | under 200 MB |
| Outbound data | **10 TB per month** | ~0.5–3 GB per 48-hour event |
| Cost | **$0**, no expiry | — |

Source: [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) (fetched 2026-09-15).

Notice the margins. You need about 2% of the RAM, 0.1% of the disk, and roughly one three-thousandth of the bandwidth. This is not a tier you will grow out of during a school event.

**The credit card question, answered plainly.** Oracle asks for a credit card when you sign up, as an identity check. Oracle's own free tier page says:

> "For security purposes, most users need a mobile phone number and a credit card to create an account. **Your credit card will not be charged unless you upgrade your account.**"

And on whether the free part expires:

> "After your trial ends, your account remains active. There is no interruption to the availability of the Always Free Resources you have provisioned."

Source: [Oracle Cloud Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm) (fetched 2026-09-15).

This is the genuinely-safe version of "card on file." An account that has not been explicitly upgraded to Pay As You Go **cannot** run up a bill — if you somehow exceeded a limit, the service stops rather than charging you. That is the opposite of how Google Cloud and AWS behave, and it is the main reason Oracle wins here. **Do not click "Upgrade to Pay As You Go"** unless you have decided to start paying.

**The three real catches**, none of them fatal, all of them worth knowing before you start:

1. **Oracle may take the machine back if it sits idle.** This is the one that genuinely applies to you, because a DECA game runs a few times a semester and the server sits doing nothing in between. Oracle's policy: an Always Free instance may be reclaimed if, over a **7-day period**, CPU use at the 95th percentile is **under 20%**, network use is **under 20%**, and (on A1 machines) memory use is **under 20%**. All three must be true. Section 5 tells you how to avoid this. It is why the Litestream backup in Section 3 is not optional.

2. **Oracle cut the free allowance in 2026 without announcing it.** The A1 allowance is half what it was — it used to be 3,000 OCPU-hours / 18,000 GB-hours. The 1,500 / 9,000 figures above are what Oracle's page says today and are still about 40× more than you need, but assume it could shrink again.

3. **You may not be able to get an A1 machine immediately.** "Out of capacity" errors are common in popular regions. Two workarounds: pick a less busy home region when you sign up (you **cannot** change this later), or just use the two AMD E2.1.Micro machines instead — they are almost always available and 1 GB of RAM is plenty for a Node process that uses under 300 MB.

### Backup choice: a school laptop behind a Cloudflare Tunnel

Run the exact same code on a spare laptop or desktop at school. A small free program called `cloudflared` makes an **outbound** connection to Cloudflare and gives you a public web address that points at that machine. Because the connection goes outward, you do not have to open any firewall ports or ask IT to forward anything — which is usually the thing that kills self-hosting at a school.

**Why it is the backup and not the first choice:** the failure modes are physical rather than contractual. Someone closes the lid. Windows or macOS installs an update and reboots at 3am, mid-game. The Wi-Fi drops. A custodian unplugs it. Oracle's machine has none of those problems.

**Why it is a genuinely good backup:** no capacity queue, no idle-reclamation policy, no vendor that can change the terms on you, and bandwidth through a Cloudflare Tunnel is not metered or billed.

**One correction to be aware of:** it is often claimed this path needs no payment details anywhere. Cloudflare's own setup documentation says otherwise for the Zero Trust dashboard:

> "Complete your onboarding by selecting a subscription plan and entering your payment details. If you chose the **Zero Trust Free plan**, this step is still needed but you will not be charged."

Source: [Cloudflare One setup](https://developers.cloudflare.com/cloudflare-one/setup/) (fetched 2026-09-15). You are not charged, but plan for the prompt. (Creating a tunnel from the command line may sidestep the dashboard onboarding entirely — I could not confirm that from Cloudflare's primary docs, so do not count on it.)

### What was rejected, and why

Short version so nobody re-opens these:

| Option | Why not |
|---|---|
| **Render free** | Free web services **cannot attach a persistent disk** and the filesystem is wiped on every restart, redeploy or sleep. Sleeps after 15 min idle and takes ~1 minute to wake — over your 30s budget. Free Postgres **expires 30 days after creation**. |
| **Google Cloud e2-micro / Cloud Run** | Only **1 GB/month** of outbound data in North America. One 48-hour event uses 0.5–3 GB. Overage bills you rather than stopping. Cloud Run's disk is also wiped on restart. |
| **Fly.io, Railway, Koyeb** | No free tier left in 2026. Fly's trial is "2 hours of machine runtime or 7 days, whichever comes first" — less than one game. |
| **Azure App Service F1** | **60 CPU-minutes per day.** A continuously ticking engine exhausts that in under an hour. |
| **AWS Free Tier** | Restructured in 2025 into credits that **expire after 6 months**. Breaks before next season. |
| **Cloudflare Workers + Durable Objects** | Actually free and genuinely durable, but requires deleting Fastify and rewriting the tick loop and SSE from scratch — weeks of work versus hours. Also capped at **100,000 database row-writes/day** on free; you would need ~259,000. |
| **Cloudflare D1** | Same 100,000 rows/day cap, and it counts index updates as extra writes. When you hit it, queries stop — mid-game. |

---

## 2. Does the server actually stay awake for 48 hours?

**On Oracle: yes. Genuinely, literally awake.** There is no sleep timer, no scale-to-zero, no cold start, and no wake-up latency, because it is an ordinary computer that is switched on. Your `setInterval` tick loop in `server/src/engine/loop.ts` runs for 48 hours the same way it runs for 48 seconds on your laptop. SSE connections stay open. Nothing about the engine needs to change.

**What students would notice: nothing.** That is the entire point of this recommendation. Prices update on schedule, the leaderboard moves, orders go through.

The only interruptions possible during a game are:
- **You deploy new code mid-game.** The server restarts, SSE connections drop, phones reconnect automatically within a few seconds, and the engine recomputes the correct tick from the clock. Students see the live prices freeze for a moment and then jump to correct. **Don't deploy mid-game anyway.**
- **The machine reboots** (kernel update, Oracle maintenance). Same as above, roughly 30–60 seconds, and the `systemd` service in Section 4 brings everything back automatically without you touching it.

**Compare that to the sleeping alternatives**, so the difference is concrete. On Render's free tier, after 15 quiet minutes the server is switched off and the disk is erased. The next student to open the app waits about a minute, and the game state is gone. Between rounds of trading — exactly when a lull happens — that is a catastrophic failure, not an inconvenience. This is why "it sleeps and wakes on demand" was not acceptable here despite your restart-safe engine.

**A note on the idle policy.** Oracle's reclamation rule only applies to machines that are quiet for **seven consecutive days**. It cannot trigger during a game. It is a between-events problem, handled in Section 5.

---

## 3. The data: what to use and what survives what

### The choice

**Use SQLite — a single file on the server's disk — replicated continuously to Backblaze B2 by Litestream.**

Three options were on the table:

| Approach | Verdict |
|---|---|
| **Managed Postgres** (Neon, Supabase, Aiven) | Works, but every free tier is small (0.5–1 GB) and each one sleeps or pauses between events. Supabase pauses free projects after ~7 days and resuming is a **manual dashboard click** that takes minutes — not a 30-second wake. Adds a network round-trip to every one of your ~90 writes per tick. |
| **SQLite on the server's disk, alone** | Fast and free, but the file only exists in one place. If Oracle reclaims the machine, the game history is gone. |
| **SQLite + Litestream replication** ✅ | Same speed, same simplicity, plus a continuously updated copy in cloud storage you can restore from in seconds. |

### Why SQLite is right for this specific workload

Your engine writes about **90 small rows per tick**. At a 30-second tick that is 259,200 writes per day, or about **518,000 writes across a full 48-hour game**. That number is what disqualified nearly every free managed database:

- Cloudflare D1 free: 100,000 writes/day — you need 2.5× that, and it **stops answering queries** when you hit the cap.
- Prisma Postgres free: 200,000 operations/**month** — one game is 2.5× the monthly allowance.
- Koyeb free Postgres: 5 compute-hours/**month** — one game is ~10× that.

SQLite has no write quota at all, because there is no service in the middle metering you. A write is a function call into a file on disk, measured in microseconds.

**One thing you must do in code:** wrap each tick's ~90 writes in a **single transaction** (`BEGIN` … `COMMIT`, or `better-sqlite3`'s `db.transaction(...)`). This turns 518,000 individual disk operations into about 5,800 commits across a whole game. It is faster, safer, and it is the single change that keeps this comfortably inside every limit.

Expect roughly **50–80 MB of data per 48-hour game**. Against 200 GB of free Oracle disk, you could store several thousand games. Against Backblaze's 10 GB free tier, over a hundred. You will never need to prune, though a rollup job (keep per-tick data for the live game, one-minute candles for finished ones) is nice housekeeping eventually.

### What Litestream does, in plain English

Litestream watches your SQLite file and, every few seconds, uploads whatever changed to cloud storage. If the server is destroyed, you run one command on a new machine and get the database back as it was seconds before the loss.

**Backblaze B2 is the storage target** because it has the cleanest free terms of any option:

| | |
|---|---|
| Free storage | **10 GB**, always free |
| Credit card to sign up | **No** — the signup form says "No credit card required" |
| API calls (Class A, B, C) | **Free** for pay-as-you-go accounts |
| Download/egress | Free up to **3× your average monthly stored data**, then $0.01/GB |
| Beyond 10 GB | $6.95/TB/month |

Sources: [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) and [Backblaze B2](https://www.backblaze.com/cloud-storage) (both fetched 2026-09-15).

Cloudflare R2 is technically identical (10 GB free, no egress charges) but Cloudflare requires you to complete a checkout flow and put a card on the account before you can use R2 at all. B2 does not. That is the whole reason B2 wins.

**Set `sync-interval` to a few seconds, not the default.** Litestream's default is `1s`, which means roughly 86,000 uploads a day. Those are free on B2, but there is no reason to generate that much churn — `10s` is plenty here and means your worst-case data loss is ten seconds of ticks, which your engine can recompute deterministically anyway.

Source: [Litestream configuration reference](https://litestream.io/reference/config/) (fetched 2026-09-15).

**Avoid LiteFS** (Litestream's sibling project) — the managed service was shut down in October 2024 and Fly's own docs now warn they cannot support it.

### What happens to your data when…

| Event | What happens |
|---|---|
| **You redeploy new code** | Nothing. The SQLite file lives at `/var/lib/buccaneer/game.db`, outside the code directory. `git pull` and restart don't touch it. |
| **The server reboots** | Nothing. The file is on a real disk. `systemd` restarts both the server and Litestream automatically. |
| **The process crashes** | Nothing lost. SQLite in WAL mode is crash-safe; the engine replays any missed ticks from the wall clock on boot. |
| **Oracle reclaims the machine** | This is the real risk. The disk goes away. **This is what Litestream is for**: create a new machine, run `litestream restore`, and you are back to within ten seconds of the loss. Without Litestream you would lose everything. |
| **Free tier shrinks or changes** | Oracle cannot bill you without an explicit upgrade — worst case the machine stops. Litestream means the data is already elsewhere, so you restore onto a laptop or a $6 droplet. |
| **You stop using it for a year** | The machine may be reclaimed (7-day idle rule). The B2 copy persists — Backblaze has no minimum storage duration fee. |

The through-line: **the SQLite file is where the game runs, and B2 is where the game is safe.** Never rely on just one.

---

## 4. Deploy in 10 steps

This assumes Ubuntu 22.04 or 24.04 on the Oracle machine. Budget about 90 minutes the first time, mostly waiting.

### Step 1 — Create the Oracle Cloud account

Go to <https://signup.oraclecloud.com>. You will need a phone number and a credit card for identity verification (see Section 1 — you will not be charged).

**Choose your home region carefully — it cannot be changed later.** If you are in the US, a less-busy region like `us-sanjose-1` or `us-chicago-1` often has A1 capacity when `us-ashburn-1` does not.

### Step 2 — Create the virtual machine

In the Oracle console: **Compute → Instances → Create instance**.

- **Image:** Canonical Ubuntu 24.04
- **Shape:** click *Change shape* → *Ampere* → `VM.Standard.A1.Flex` → set **1 OCPU and 6 GB memory** (half your allowance, leaving room to make a second machine)
- **SSH keys:** choose *Generate a key pair for me* and **download both keys** — you cannot get them again
- Leave networking at the defaults (it creates a virtual network for you)

If you get **"Out of capacity,"** either retry periodically over a day or two, or change the shape to `VM.Standard.E2.1.Micro`, which is almost always available and sufficient.

Note the machine's **public IP address** when it finishes.

### Step 3 — Open the firewall (both of them)

Oracle blocks traffic in two separate places and forgetting the second one is the single most common way this goes wrong.

**3a. The cloud firewall.** In the console: **Networking → Virtual Cloud Networks →** your VCN **→ Security Lists →** Default **→ Add Ingress Rules**:
- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `80`
- Repeat for port `443`

**3b. The machine's own firewall.** SSH in first:

```bash
ssh -i /path/to/your-private-key ubuntu@YOUR_PUBLIC_IP
```

Then:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Step 4 — Install Node 20 and the basics

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
node --version   # expect v20.x
```

`build-essential` is needed because `better-sqlite3` compiles native code during install.

### Step 5 — Get the code onto the machine

```bash
sudo mkdir -p /opt/buccaneer /var/lib/buccaneer
sudo chown -R ubuntu:ubuntu /opt/buccaneer /var/lib/buccaneer
cd /opt/buccaneer
git clone YOUR_REPO_URL .
npm ci
```

Install at the repository root, not in `server/` — this is an npm workspace (`shared`, `server`, `web`).

`/var/lib/buccaneer` is deliberately **outside** the code directory so that redeploys can never touch the database.

### Step 6 — Set the environment variables

The server reads four variables (from `server/src/config.ts`):

```bash
sudo tee /etc/buccaneer.env > /dev/null <<'EOF'
PORT=8081
CORS_ORIGIN=https://YOUR_DOMAIN
ADMIN_PASSWORD=pick-a-long-random-host-password
GAME_SEED=
DATABASE_PATH=/var/lib/buccaneer/game.db
EOF
sudo chmod 600 /etc/buccaneer.env
```

| Variable | What it does |
|---|---|
| `PORT` | Port the server listens on. Defaults to 8081. |
| `CORS_ORIGIN` | The public address students use. Defaults to `*`; set it properly once you have a domain. |
| `ADMIN_PASSWORD` | The host login password, applied at every start. Make it long. |
| `GAME_SEED` | **Leave empty.** There is intentionally no fallback — the seed script generates a high-entropy seed and stores it server-side. Anyone who knew the seed could predict every future price. |
| `DATABASE_PATH` | Where the SQLite file lives. (Add this to `config.ts` as part of the Firebase removal.) |

### Step 7 — Run the server as a service that restarts itself

```bash
sudo tee /etc/systemd/system/buccaneer.service > /dev/null <<'EOF'
[Unit]
Description=Buccaneer Exchange authority server
After=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/buccaneer
EnvironmentFile=/etc/buccaneer.env
ExecStart=/usr/bin/npm run start -w @deca/server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now buccaneer
sudo systemctl status buccaneer
```

`Restart=always` means a crash or a reboot brings it back without you. **Run exactly one instance** — the trading halt, the per-crew order queue and the pending-order flow all live in this single process (see the comment at the top of `server/src/index.ts`).

### Step 8 — Put HTTPS in front of it

Phones need HTTPS or the PWA will not install and service workers will not run. Caddy does certificates automatically.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
YOUR_DOMAIN {
    encode zstd gzip
    reverse_proxy localhost:8081
}
EOF
sudo systemctl restart caddy
```

**No domain?** You can use `sslip.io`, which turns any IP into a hostname for free: if your IP is `140.238.1.2`, use `140.238.1.2.sslip.io` as `YOUR_DOMAIN` and Caddy will get a real certificate for it. Test this before the event — it depends on Let's Encrypt being willing to issue, which is usually fine but is not under your control. A real domain (~$10/year) is the sturdier choice if anyone will budget it.

**Important for SSE:** do not add a response buffering directive to Caddy. `reverse_proxy` streams by default, which is what SSE needs. If live prices arrive in bursts instead of smoothly, buffering is the first thing to check.

### Step 9 — Turn on Litestream backups

Create a Backblaze account at <https://www.backblaze.com/sign-up/cloud-storage> (no card needed), make a **private bucket**, then create an **Application Key** scoped to it. Save the `keyID` and `applicationKey` — the secret is shown once.

```bash
curl -sLO https://github.com/benbjohnson/litestream/releases/latest/download/litestream-linux-arm64.deb
sudo dpkg -i litestream-linux-arm64.deb
```

(Use `litestream-linux-amd64.deb` if you ended up on an AMD E2.1.Micro machine.)

```bash
sudo tee /etc/litestream.yml > /dev/null <<'EOF'
access-key-id: YOUR_B2_KEY_ID
secret-access-key: YOUR_B2_APPLICATION_KEY

dbs:
  - path: /var/lib/buccaneer/game.db
    replica:
      type: s3
      bucket: YOUR_BUCKET_NAME
      path: game
      endpoint: s3.us-west-000.backblazeb2.com
      sync-interval: 10s
EOF
sudo chmod 600 /etc/litestream.yml
sudo systemctl enable --now litestream
```

Match the `endpoint` region to the one shown on your bucket's detail page in Backblaze. Litestream v0.5+ detects B2 endpoints and sets `force-path-style` automatically.

Source: [Litestream Backblaze B2 guide](https://litestream.io/guides/backblaze/) (fetched 2026-09-15).

### Step 10 — Verify it actually works

Run all five. Do not skip the restore test — an untested backup is not a backup.

```bash
# 1. The server is healthy and the engine is ticking
curl https://YOUR_DOMAIN/health
#    Run it twice, 30s apart — the tick number must increase.

# 2. The PWA loads over HTTPS on an actual phone, not just your laptop.

# 3. Live updates stream (should print events continuously, not all at once)
curl -N https://YOUR_DOMAIN/api/stream

# 4. Litestream is replicating
sudo litestream generations /var/lib/buccaneer/game.db
sudo journalctl -u litestream -n 30 --no-pager

# 5. THE RESTORE TEST — prove the backup is real
sudo litestream restore -o /tmp/test-restore.db /var/lib/buccaneer/game.db
sqlite3 /tmp/test-restore.db "select count(*) from ticks;"   # adjust table name
rm /tmp/test-restore.db
```

Then reboot the whole machine (`sudo reboot`), wait two minutes, and run check 1 again. If the tick number is climbing after an unannounced reboot, the setup is sound.

---

## 5. The week of the event

### Seven days before — wake the machine up

This is the step people forget. If the server has been idle for weeks, it is sitting in exactly the profile Oracle reclaims: under 20% CPU, network and memory over a 7-day window.

**Log in and confirm the machine still exists**, right now, a week ahead — not the night before. If it was reclaimed, you have time to rebuild (Steps 2–9 take about an hour) and `litestream restore` brings the history back.

Then keep it busy. The simplest reliable approach is a cron job that touches the health endpoint and does a little work:

```bash
sudo tee /etc/cron.d/buccaneer-keepwarm > /dev/null <<'EOF'
*/5 * * * * ubuntu curl -s localhost:8081/health > /dev/null 2>&1
EOF
```

Be honest about what this does and does not do: it generates **network** activity but very little **CPU** activity. Oracle's rule requires all three metrics to be low, so network activity alone is enough to fall outside it — but the safest approach for a machine you care about is simply **leaving the game engine ticking between events** in an idle/demo game. That produces steady CPU, memory and network use, costs nothing, and removes the question entirely.

### Three days before — full dress rehearsal

Run an actual short game end to end, on the real URL, from real phones:

1. Seed a fresh game and start it.
2. Have 3–5 people log in as crews on **phones, on the school Wi-Fi** — not laptops on your home network. Phone browsers, school network conditions, and captive portals are where surprises live.
3. Place orders, confirm prices move and the leaderboard updates.
4. **Deliberately break it:** `sudo systemctl restart buccaneer`. Confirm phones reconnect on their own and the engine catches up to the right tick.
5. **Deliberately break it harder:** `sudo reboot`. Confirm everything comes back with no human intervention.
6. Check `sudo litestream generations /var/lib/buccaneer/game.db` and confirm recent replication.
7. Reset the game state so you start the real event clean.

Write down the host password somewhere you will have it on event day.

### Day before — freeze and prepare

- **Stop deploying.** Whatever is running now is what runs at the event.
- `sudo apt update && sudo apt upgrade -y && sudo reboot` — take the update *now*, deliberately, rather than having it surprise you mid-game.
- Verify the health endpoint after the reboot.
- Take a manual snapshot in the Oracle console (**Compute → Instances →** your instance **→ Boot volume → Create manual backup**). You have 5 free backups.
- Confirm the B2 bucket has recent data.

### During the game

- Leave an SSH session open on a laptop with `sudo journalctl -u buccaneer -f` running so you can see problems as they happen.
- **Do not deploy code.** Not for a typo, not for a small fix.
- If something looks stuck, `sudo systemctl restart buccaneer` is safe and takes a few seconds — the engine recomputes the correct tick.

### If the free tier misbehaves — rollback

**Have this ready before the event, not during it.** Put the same code on a spare laptop and confirm it runs locally. Then:

| Problem | Response |
|---|---|
| **Server is slow or unresponsive** | `sudo systemctl restart buccaneer`. Engine catches up automatically. |
| **Machine is gone / unreachable** | Start the laptop copy. Restore data with `litestream restore -o ./game.db s3://YOUR_BUCKET/game`. Point students at the laptop via Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:8081` gives a public URL in seconds). |
| **Oracle account locked or suspended** | Same as above. This is why the backup plan exists. |
| **Total infrastructure failure** | Run the server on a laptop and have students connect over the school Wi-Fi to its local IP address. Ugly, HTTPS-less, works. |

The recovery plan in every case is the same shape: **the data is in B2, so any computer can become the server.** Practise the `litestream restore` command once, on your own laptop, before the event. It takes five minutes and it is the difference between a hiccup and a cancelled event.

---

## 6. The paid fallback, if free proves flaky

If Oracle's capacity problems or the idle-reclamation policy become genuinely annoying, the escape is cheap and fast.

**Recommended: DigitalOcean Basic Droplet — $6/month.**

| Price | RAM | vCPU | SSD | Transfer |
|---|---|---|---|---|
| $4/mo | 512 MiB | 1 | 10 GiB | 500 GiB |
| **$6/mo** | **1 GiB** | **1** | **25 GiB** | **1,000 GiB** |
| $12/mo | 2 GiB | 1 | 50 GiB | 2,000 GiB |

Source: [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets) (fetched 2026-09-15).

Take the **$6 tier**, not the $4 one — 512 MB is tight once `better-sqlite3` is compiling and Node is running, and the extra dollar removes a whole category of problem.

**Cheaper alternative: Fly.io, about $3.50/month** — a `shared-cpu-1x` machine with 512 MB is $3.32/month plus $0.15/GB/month for a persistent volume. Source: [Fly.io pricing](https://fly.io/docs/about/pricing/) (fetched 2026-09-15). Note Fly requires a credit card on file for all organisations and has no free allowance in 2026.

### Why switching is easy

This is the quiet advantage of the recommended stack: **nothing about it is Oracle-specific.** It is Ubuntu, Node, SQLite, systemd and Caddy — all of which exist identically on any Linux server anywhere.

To move:

1. Create the droplet (Ubuntu 24.04, $6 tier).
2. Repeat **Steps 4 through 9** exactly as written. The only change is skipping Step 3b — DigitalOcean does not have Oracle's second firewall.
3. Restore the data: `litestream restore -o /var/lib/buccaneer/game.db s3://YOUR_BUCKET/game`
4. Point your domain's DNS at the new IP address.

Realistically twenty minutes, and the Litestream restore means you lose nothing. Keep the Oracle machine running until the new one is verified.

**What $6/month actually buys you:** not performance — the free Oracle machine is considerably more powerful. It buys the removal of the two things that can go wrong: no capacity queue, and no policy that can take the machine away for being idle. For an event that cannot be re-run, that is a reasonable trade, and it is roughly the price of two coffees.

---

## Sources

All fetched **2026-09-15**:

- [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) — A1 allowance, 200 GB storage, 10 TB egress, idle reclamation thresholds
- [Oracle Cloud Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm) — credit card policy, Always Free persistence after trial
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) — 10 GB free, API class pricing, egress terms
- [Backblaze B2](https://www.backblaze.com/cloud-storage) — "No credit card required"
- [Litestream configuration reference](https://litestream.io/reference/config/) — YAML format, `sync-interval` default of 1s
- [Litestream Backblaze B2 guide](https://litestream.io/guides/backblaze/) — B2 endpoint configuration
- [Cloudflare One setup](https://developers.cloudflare.com/cloudflare-one/setup/) — payment details required even on Zero Trust Free
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — outbound-only connection model
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets) — $4/$6/$12 tiers
- [Fly.io pricing](https://fly.io/docs/about/pricing/) — machine and volume pricing, credit card requirement
- [Neon plans](https://neon.com/docs/introduction/plans) — free tier limits, 5-minute scale-to-zero

**Unverified, flagged honestly:** whether the `cloudflared` command-line path avoids the Zero Trust payment-details prompt; whether `sslip.io` reliably obtains Let's Encrypt certificates for your specific IP (test it); Oracle's A1 capacity availability in any given region on any given day.
