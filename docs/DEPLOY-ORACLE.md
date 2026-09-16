# Putting Buccaneer Exchange on the internet, for free

**For the advisor or student host who is going to run the game. You do not need to know Linux. Every command on this page is meant to be copied and pasted exactly.**

Written 2026-09-15. Every provider detail was checked against that provider's own page on that date; links are at the bottom.

---

## What you are about to build

A small computer in an Oracle data centre, switched on permanently, running the game at an address like `https://decastock.duckdns.org`. Students open that address on their phones. The game data lives in a single file on that computer, and a copy of that file is continuously mirrored to Backblaze so that losing the computer does not mean losing the game.

**Cost: $0/month, permanently.** Not a trial. The reasoning behind every one of those choices is in [HOSTING-FREE.md](HOSTING-FREE.md); this page is just the doing.

**Time: about 90 minutes the first time**, most of it waiting for things to install. Roughly:

| | |
|---|---|
| Oracle account | 20 min (identity verification is the slow part) |
| Create the machine | 10 min |
| Open the firewall | 5 min |
| DuckDNS name | 5 min |
| Backblaze bucket | 10 min |
| Run the installer | 20 min |
| Check it works | 15 min |

**Do this at least a week before your event, not the night before.** If Oracle has no capacity in your region you may have to wait a day and try again, and that is only a problem if you have no days left.

**You will need:** an email address, a phone number, a credit or debit card (for identity only — see below), and a laptop with a terminal. macOS and Linux have one built in; on Windows use PowerShell or install Windows Terminal.

---

## Step 1 · Create the Oracle Cloud account

Go to <https://signup.oraclecloud.com> and sign up.

**About the credit card.** Oracle asks for one. It is an identity check, not a payment. Oracle's own free tier page says:

> "For security purposes, most users need a mobile phone number and a credit card to create an account. **Your credit card will not be charged unless you upgrade your account.**"

and, on what happens when the 30-day trial credits expire:

> "After your trial ends, your account remains active. There is no interruption to the availability of the Always Free Resources you have provisioned."

An account that has not been explicitly upgraded to Pay As You Go **cannot** run up a bill. If you somehow exceeded a limit, the service stops instead of charging you. This is the opposite of how AWS and Google Cloud behave and it is the main reason this guide uses Oracle.

> **Do not ever click "Upgrade to Pay As You Go."** Oracle will offer. Decline. Upgrading is the only way this becomes something you get billed for.

**Choosing your home region is the one irreversible decision on this page.** You cannot change it afterwards. Popular regions run out of the free Arm machines. If you are in the US, `us-sanjose-1` or `us-chicago-1` usually has capacity when `us-ashburn-1` and `us-phoenix-1` do not.

**Expected result:** an email saying your account is ready, and you can sign in to <https://cloud.oracle.com> and see the console dashboard. This can take anywhere from two minutes to an hour.

---

## Step 2 · Create the virtual machine

In the console, open the hamburger menu → **Compute** → **Instances** → **Create instance**.

Set these, and leave everything else alone:

| Field | What to choose |
|---|---|
| Name | `buccaneer` |
| Image | **Canonical Ubuntu 24.04** (click *Change image* if it shows something else) |
| Shape | *Change shape* → **Ampere** → `VM.Standard.A1.Flex` → **1 OCPU**, **6 GB memory** |
| Networking | leave the defaults — it creates a virtual network for you |
| SSH keys | **Generate a key pair for me**, then **download both files** |

**About the shape.** Your Always Free allowance for Arm machines is 1,500 OCPU-hours and 9,000 GB-hours per month, which is 2 OCPUs and 12 GB running continuously. Asking for 1 OCPU and 6 GB uses half of it and leaves room to build a second machine later if you ever want one. The game server needs about 1 CPU and under 300 MB of memory, so this is roughly twenty times more than necessary.

**About the SSH keys.** You get one chance to download them. Put them somewhere you will find them again, and remember the path to the **private** key (the file without `.pub`). On macOS and Linux, move it somewhere sensible and lock it down, or SSH will refuse to use it:

```bash
mkdir -p ~/.ssh
mv ~/Downloads/ssh-key-*.key ~/.ssh/buccaneer.key
chmod 600 ~/.ssh/buccaneer.key
```

### If you get "Out of capacity"

This is common and it is not your fault — it means Oracle has no free Arm machines in your region right now. In red text it looks like:

```
Out of host capacity.
```

Three things to try, in order:

1. **Try a different availability domain.** If your region has AD-1, AD-2 and AD-3 in the dropdown, try each.
2. **Try again later.** Capacity frees up constantly. Try every few hours for a day. Do not build a script to hammer it; Oracle throttles that.
3. **Use the AMD machine instead.** Change the shape to `VM.Standard.E2.1.Micro`. It is almost always available. It has 1 GB of memory instead of 6, which is enough — the installer notices and adds a swap file so the web build does not run out of memory. You are allowed two of these.

**Expected result:** after a minute or two the instance page shows a green **RUNNING** badge and a **Public IP address** like `140.238.15.72`. Write that number down.

**Check you can get in.** In your terminal, replace the IP with yours:

```bash
ssh -i ~/.ssh/buccaneer.key ubuntu@140.238.15.72
```

The first time it asks:

```
The authenticity of host '140.238.15.72' can't be established.
ED25519 key fingerprint is SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Type `yes` and press Enter. You should land on:

```
Welcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-1032-oracle aarch64)
...
ubuntu@buccaneer:~$
```

That `ubuntu@buccaneer:~$` prompt means you are on the machine. Type `exit` to leave for now.

---

## Step 3 · Open ports 80 and 443 in the Oracle firewall

**There are two firewalls, and forgetting this one is the single most common way this whole process goes wrong.** The machine's own firewall is handled by the installer in step 6. This one is in the Oracle console and no script can reach it.

By default Oracle's network allows only SSH (port 22) and ICMP in. Web traffic on 80 and 443 is blocked, so your site will be unreachable even when everything on the machine is perfect.

1. In the console: **Networking** → **Virtual cloud networks** → click your VCN (probably `vcn-`*something*).
2. Click **Security Lists** in the left panel, then the **Default Security List**.
3. Click **Add Ingress Rules**. Add one rule:
   - Stateless: **unchecked**
   - Source Type: **CIDR**
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: **TCP**
   - Destination Port Range: `80`
4. Click **+ Another Ingress Rule** and repeat with Destination Port Range `443`.
5. Click **Add Ingress Rules**.

**Expected result:** the ingress rules table now lists five rules — the two you added plus the original SSH and two ICMP rules:

```
Stateless   Source        IP Protocol   Source Port Range   Destination Port Range
No          0.0.0.0/0     TCP           All                 22
No          0.0.0.0/0     ICMP                              Type 3, Code 4
No          10.0.0.0/16   ICMP                              Type 3
No          0.0.0.0/0     TCP           All                 80
No          0.0.0.0/0     TCP           All                 443
```

If your list looks different from this, you are probably editing the wrong VCN or the wrong security list. Go back to the instance page, click the subnet link under "Primary VNIC", and follow the security list link from there — that is guaranteed to be the right one.

---

## Step 4 · Get a free web address from DuckDNS

Browsers will not install the app to a phone's home screen over plain `http://`, and you need a hostname (not a bare IP) to get a free HTTPS certificate. DuckDNS gives you both, free, in about two minutes, with no credit card.

1. Go to <https://www.duckdns.org> and sign in with Google, GitHub, Twitter or Reddit.
2. At the top of the page is your **token** — a long string like `a7c4d0ad-114e-40ef-ba1d-d217904a50f2`. Copy it somewhere. It is a password; treat it like one.
3. In the **add domain** box type a name — `decastock`, say — and click **add domain**.
4. In the **current ip** box next to it, paste your machine's public IP and click **update ip**.

**Expected result:** the row shows your subdomain, your IP, and a green tick. Your address is now `decastock.duckdns.org`, and this works:

```bash
$ ping -c 1 decastock.duckdns.org
PING decastock.duckdns.org (140.238.15.72): 56 data bytes
64 bytes from 140.238.15.72: icmp_seq=0 ttl=52 time=31.2 ms
```

The IP in the response must match your machine's. If `ping` says "cannot resolve", wait two minutes and try again — DNS takes a moment to propagate.

You will not have to keep doing this by hand; the installer sets up a timer that re-points the name at the machine every five minutes, which matters because Oracle can change your IP if the machine is ever stopped and started.

---

## Step 5 · Create the backup bucket at Backblaze

This is the step people skip, and it is the one that saves you. Oracle is allowed to take an idle free machine back (see "Between events" below). When that happens the disk goes with it. Fifteen minutes here means you can rebuild and be back to within ten seconds of where you were.

Backblaze gives 10 GB free, permanently, **with no credit card required at signup**. One 48-hour game is about 50–80 MB.

1. Sign up at <https://www.backblaze.com/sign-up/cloud-storage>.
2. In the left menu click **Buckets** → **Create a Bucket**:
   - Bucket Unique Name: something nobody else has taken, e.g. `buccaneer-backup-crestview`
   - Files in Bucket are: **Private**
   - Default Encryption: **Disable** (Litestream is talking to it directly)
   - Object Lock: **Disable**
3. Click **Create a Bucket**.
4. On the bucket's row, note the **Endpoint**. It looks like `s3.us-west-004.backblazeb2.com`. **Yours may have a different number.** Copy it exactly.
5. In the left menu click **Application Keys** → **Add a New Application Key**:
   - Name of Key: `buccaneer-litestream`
   - Allow access to Bucket(s): **select the bucket you just made**, not "All"
   - Type of Access: **Read and Write**
   - Leave the rest blank
6. Click **Create New Key**.

**Expected result:** a yellow box appears showing `keyID` and `applicationKey`:

```
keyID:           004a1b2c3d4e5f60000000001
applicationKey:  K004xxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Copy both right now.** Backblaze shows the `applicationKey` exactly once. If you navigate away you have to delete the key and make a new one.

You now have five things written down. Keep them together until step 6:

- the machine's public IP
- the path to your SSH private key
- your DuckDNS subdomain and token
- your B2 bucket name and endpoint
- your B2 keyID and applicationKey

---

## Step 6 · Run the installer

Three commands. Connect to the machine:

```bash
ssh -i ~/.ssh/buccaneer.key ubuntu@140.238.15.72
```

Download the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/nishantss2008-hub/DECAStockGameEnvision/main/deploy/setup-oracle.sh -o setup-oracle.sh
```

Run it:

```bash
bash setup-oracle.sh
```

#### If your repository is private

The `curl` above will fail with `404 Not Found`, because GitHub does not serve private files to a machine that has not signed in. You have two choices.

**The easy one — send the file from your laptop.** Open a *second* terminal window on your laptop (leave the SSH one alone), and run this there, with your own IP:

```bash
cd ~/path/to/DECAStockGameEnvision
scp -i ~/.ssh/buccaneer.key deploy/setup-oracle.sh ubuntu@140.238.15.72:~/
```

Then back in the SSH window, give the machine a key so it can fetch the code itself. Copy all four lines at once:

```bash
ssh-keygen -t ed25519 -C buccaneer-vm -f ~/.ssh/id_ed25519 -N ''
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
cat ~/.ssh/id_ed25519.pub
```

The last line prints something starting `ssh-ed25519 AAAA…`. Copy that whole line. On github.com open your repository → **Settings** → **Deploy keys** → **Add deploy key**, paste it in, give it the title `buccaneer-vm`, leave **Allow write access** unchecked, and save. Now run the installer like this instead:

```bash
REPO_URL=git@github.com:nishantss2008-hub/DECAStockGameEnvision.git bash setup-oracle.sh
```

**The other one — make the repository public.** Nothing in it is secret; every password and key on this page lives on the server, not in the code.

#### What it asks

It asks a short list of questions — your DuckDNS name and token, the host password twice, and the four Backblaze details. Nothing you type as a password is shown on screen; that is deliberate, not a broken keyboard.

The host password is the one it will refuse: **it must be at least 12 characters.** That password can start and end the game, reset every crew's password and hand out money, and the server will answer hundreds of guesses a minute, so a short one really is guessable. Four unrelated words is the easiest thing to type and to remember — `anchor-gale-tin-mast`.

```
  ============================================================
    Buccaneer Exchange  ·  Oracle Cloud Always Free installer
  ============================================================


[ 1] Checking this machine
     ok   Ubuntu 24.04 (Noble) — the tested version
     ok   Architecture aarch64 (Ampere A1)
     ---- RAM: 5928 MB · running as: ubuntu

[ 2] Collecting the things only you know
     DuckDNS subdomain (just the label, e.g. decastock): decastock
     ok   Site will be https://decastock.duckdns.org
     DuckDNS token (from duckdns.org, not shown as you type):
     ok   DuckDNS token captured
     Host password — the teacher's sign-in, 12 characters or more:
     Host password again:
     ok   Host password captured (never printed, never logged)
     Backblaze B2 bucket name (Enter to skip backups for now): buccaneer-backup-crestview
     ok   B2 endpoint s3.us-west-004.backblazeb2.com
     B2 application keyID: 004a1b2c3d4e5f60000000001
     B2 applicationKey (shown only once by Backblaze):
     ok   B2 credentials captured
```

Then it works for fifteen or twenty minutes without asking anything else:

```
[ 3] Installing system packages
     ok   base packages installed

[ 4] Making sure the build has enough memory
     skip 5928 MB of RAM is plenty — no swap needed

[ 5] Installing Node.js 22
     ---- Adding the NodeSource repository for Node 22.x
     ok   Node v22.22.0, npm 10.9.4

[ 6] Creating /opt/buccaneer and /var/lib/buccaneer
     ok   /opt/buccaneer (code) and /var/lib/buccaneer (game.db) owned by ubuntu

[ 7] Fetching the code
     ok   at commit 38bc56f on main

[ 8] Installing dependencies and building
     ---- npm ci (this is the slow one — 2 to 5 minutes)
     ok   better-sqlite3 loads (the database engine works on this machine)
     ---- building @deca/shared
     ---- building @deca/web
     ok   web app built into /opt/buccaneer/web/dist

[ 9] Writing /etc/buccaneer.env
     ---- generated a new 48-byte SESSION_SECRET
     ok   /etc/buccaneer.env written (mode 600, root only)

[10] Installing the buccaneer.service unit
     ok   buccaneer.service installed (Restart=always, starts at boot)

[11] Creating the market
     Seeded 25 companies. The game is in the lobby.
        ────────────────────────────────────────────────
        Database:          /var/lib/buccaneer/game.db
        Admin/host login:  name "admin"
        Admin password:    (from ADMIN_PASSWORD)
        ────────────────────────────────────────────────
     ok   market created — the game is in the lobby, waiting for you to start it

[12] Opening ports 80 and 443 on the machine itself
     ok   iptables: tcp/80 allowed
     ok   iptables: tcp/443 allowed
     ok   rules saved to /etc/iptables/rules.v4 — they survive a reboot
     skip ufw is not active — leaving it that way (Oracle: enabling UFW on Ubuntu images can prevent the VM from booting)

[13] Pointing decastock.duckdns.org at this machine
     ---- running the first DuckDNS update now — Caddy cannot get a certificate until this succeeds
     ok   DuckDNS accepted the update for decastock.duckdns.org
     ok   decastock.duckdns.org resolves to 140.238.15.72 — this machine

[14] Installing Caddy (automatic HTTPS)
     ok   Caddy installed from the official repository
     ok   Caddyfile written for decastock.duckdns.org -> 127.0.0.1:8081

[15] Installing Litestream (continuous backup to Backblaze B2)
     ok   Litestream v0.5.17 installed (its systemd unit comes with the package)
     ok   /etc/litestream.yml written · replicating to b2://buccaneer-backup-crestview/buccaneer/game.db

[16] Starting everything
     ---- waiting for the game server to answer on 127.0.0.1:8081
     ok   game server healthy: {"ok":true,"phase":"lobby","tick":0,...}
     ok   caddy is running
     ok   litestream is running
     ---- waiting for the HTTPS certificate (Let's Encrypt usually takes 10-40 seconds)
     ok   https://decastock.duckdns.org is live over HTTPS
```

and finishes with a summary:

```
  ============================================================
    Done.
  ============================================================

    Game address (give this to students)
        https://decastock.duckdns.org

    Host console (the teacher's screen)
        Go to https://decastock.duckdns.org/login
        Crew name:  admin
        Password:   the one you typed above — not printed here on purpose
        Signing in as admin lands you on the control screen. Bookmark
        https://decastock.duckdns.org/login, not the screen you end up on.

    The game is seeded and sitting in the lobby. Open the host console and
    press Start when you are ready; nothing ticks until you do.
    ...
```

### Signing in as the host

Go to **`https://YOUR-NAME.duckdns.org/login`** and sign in with the crew name `admin` and the password you chose. That drops you on the control screen at `/admin`, where you start, pause and end the game.

**Bookmark `/login`, not `/admin`.** The sign-in page is the one address that always works no matter who is signed in on that phone or laptop. (The installer configures Caddy so that reloading or bookmarking `/admin` works too — without that rule the game server answers a plain browser request for `/admin` with `{"error":"not_found"}`, because it reserves `/admin` for the app's own data calls. If you ever see that raw JSON on the host screen, see the troubleshooting table below.)

### About the firewall line in step 12

Oracle's documentation says, in plain terms, **do not use UFW on an Ubuntu image** — it can strip out rules the machine needs to reach its own disk, and then the machine will not boot. So the installer opens the ports with `iptables` instead, inserting the new rules above the existing REJECT rather than clearing the chain. If you had already turned UFW on yourself, it notices and adds the ports there too, because in that case UFW is the one in charge.

You do not have to do anything about this. It is explained because "the script mentioned UFW and skipped it" looks like a problem and is not.

---

## Step 7 · Check it actually works

Do all eight. Numbers 7 and 8 are the ones people skip and the ones that matter.

**1 · The site loads and the engine is ticking.** On your own laptop, not on the server:

```bash
$ curl -s https://decastock.duckdns.org/health
{"ok":true,"phase":"lobby","tick":0,"totalTicks":360,"serverTime":1789520866948,"lastTickAt":null,"ticksBehind":0,"connections":0}
```

`"ok":true` is what you are looking for. Once you have started a game, run it twice thirty seconds apart — `tick` must be a bigger number the second time.

**2 · It loads on a real phone.** Not your laptop. Open `https://decastock.duckdns.org` on a phone, on the school Wi-Fi if you can. Check there is a padlock in the address bar and that the browser offers to add it to the home screen. Phone browsers, school networks and captive portals are where the surprises live.

**3 · The live price stream is reachable and guarded.** The stream is what makes prices move on a phone without anyone refreshing. It requires a signed-in crew, so from the command line the *correct* answer is a refusal:

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' https://decastock.duckdns.org/api/stream
401
```

`401` is the result you want. It proves two things at once: Caddy is passing requests through to the game server, and the stream is not open to the world. `000` or a timeout means the request never arrived — go back to **Step 3**, the Oracle firewall. `404` means the game server is running but the build is stale.

The real test of streaming is visual, and you do it in check 2: sign in on a phone, start a game from the host console, and watch the prices change on their own. If they only move when you pull to refresh, the stream is not getting through — see "Live prices arrive in bursts" in the troubleshooting table.

**4 · The host console survives a page reload.** Sign in at `https://decastock.duckdns.org/login` as `admin`, wait for the control screen, then **press reload**. You should get the control screen back. From the command line the same check looks like this — run it on your laptop, with your own address:

```bash
$ curl -s -H 'Accept: text/html' https://decastock.duckdns.org/admin | head -1
<!doctype html>
```

`<!doctype html>` is right. If you get `{"error":"not_found"}` instead, the Caddy rule that makes this work is missing — re-run `setup-oracle.sh`, which is safe to run again.

**5 · Nothing but 80 and 443 is exposed.** The game server itself listens on port 8081, and it should be reachable only from inside the machine. From your laptop, with your machine's IP:

```bash
$ curl -s --max-time 8 -o /dev/null -w '%{http_code}\n' http://140.238.15.72:8081/health
000
```

`000` — a refused or timed-out connection — is the answer you want, and so is `curl: (28) Operation timed out`. If it prints `200`, then something has opened 8081 to the internet: check the Oracle ingress rules from step 3 and remove any rule that is not 22, 80 or 443.

**6 · The backup is running.** On the server. Copy the whole line, including the part before the semicolon:

```bash
$ sudo sh -c '. /etc/litestream.env; litestream ltx /var/lib/buccaneer/game.db'
level min_txid max_txid    size  created
0            1        1    4096  2026-09-15T18:22:31Z
0            2        9   12288  2026-09-15T18:22:41Z
```

Any rows at all means data is reaching Backblaze. An empty list right after installing is fine — nothing has been written yet. If it is still empty after you have started a game, check `sudo journalctl -u litestream -n 30 --no-pager`.

Two notes on that command, because it looks odd:

- `. /etc/litestream.env;` loads your Backblaze key. The background service gets it automatically; running the command by hand has to load it, and without it you get an authentication error that looks like the backup is broken when it is not.
- `ltx` lists the transaction-log files Litestream has uploaded. In Litestream 0.4 this command was called `generations`; if you find that older name in a note somewhere, `ltx` is what replaced it.

**If you chose to skip Backblaze,** checks 6 and 7 do not apply — `litestream` is not installed and `restore.sh` will tell you so in plain words. The game works exactly the same; what you have given up is the ability to get your history back if Oracle reclaims the machine. You can add backups later by re-running the installer with the bucket set — **do this between games, not during one**, because the installer stops the server for a few minutes while it rebuilds:

```bash
B2_BUCKET=your-bucket B2_ENDPOINT=s3.us-west-004.backblazeb2.com \
  bash /opt/buccaneer/deploy/setup-oracle.sh
```

It will not touch the game already on the machine — it skips the "Creating the market" step whenever a database is already there.

**7 · The restore test. Do not skip this.** An untested backup is not a backup; it is a hope.

```bash
$ bash /opt/buccaneer/deploy/restore.sh --test

==> What is in the backup
    level min_txid max_txid    size  created
    0            1        9   12288  2026-09-15T18:22:41Z

==> Test restore to a scratch file (nothing on this machine changes)
    ok   restored 92K to /tmp/tmp.aBc123/test.db

==> Checking the restored file is a real, readable database
    ok   PRAGMA integrity_check: ok
    tables and row counts:
      companies                25
      crews                     0
      ticks                     0

  The backup is real and restorable. Nothing was changed.
```

Twenty-five companies is what a fresh market has. If `companies` is `0`, you are looking at a backup of an empty database — start a game, wait a minute, and run the test again.

**8 · Survive a reboot.** The last one. Restart the whole machine and confirm it comes back on its own, because at some point Oracle will reboot it for you without asking:

```bash
sudo reboot
```

Your SSH session drops. Wait two minutes, then from your laptop:

```bash
$ curl -s https://decastock.duckdns.org/health
{"ok":true,"phase":"lobby",...}
```

If that answers after an unannounced reboot, with nobody logging in to start anything, the setup is sound.

---

## Making the crews and the handout

When you know how many teams you have, one command creates them all and produces a printable sheet:

```bash
node /opt/buccaneer/deploy/crew-sheet.mjs --url https://decastock.duckdns.org --count 12
```

It asks for the host password, creates twelve crews with names from a built-in list, and writes `crew-sheet.html`.

```
  Finding the server at https://decastock.duckdns.org ... found.
  Host password (not shown as you type):
  Signing in as the host ... signed in.
  Black Pearl          created
  Storm Crow           created
  ... (10 more)

  12 crews on the server.

  Handout: /home/ubuntu/crew-sheet.html
           Page 1 is the projector / wall sheet. The rest are cards to cut up.
           Open it in a browser and print at 100% scale, no "fit to page".
```

Use your own team names instead:

```bash
node /opt/buccaneer/deploy/crew-sheet.mjs --url https://decastock.duckdns.org \
  --names-list "Period 3 Alpha,Period 3 Bravo,Period 4 Alpha"
```

Copy the sheet to your laptop to print it (run this **on your laptop**, not on the server):

```bash
scp -i ~/.ssh/buccaneer.key ubuntu@140.238.15.72:crew-sheet.html .
```

Open it in a browser and print. **Page 1** is a full-page QR code and address to project on the board or tape by the door. **Pages 2 onward** are six cards per page, each with one crew's name, its password and a QR code — cut along the dashed lines and hand them out.

The passwords look like `keda-cama-78`: pronounceable, readable across a room, and with every confusable character removed. There is no `l` or `1`, no `O` or `0`, no `S` or `5`, so nobody can mistype one of those.

That HTML file contains every password in plain text. It is written into your home directory, readable only by you, and the passwords are deliberately never printed to the screen so they do not end up in your terminal scrollback. Delete it once the cards are handed out:

```bash
rm ~/crew-sheet.html
```

**Check the cards before you print thirty of them.** Open the file, hold a phone camera over one of the small QR codes, and confirm it offers to open your address. Then sign in on that phone with the crew name and password from that same card. Two minutes here beats finding out in front of a class.

---

## Deploying new code

Whenever you have pushed changes to `main`, on the server:

```bash
bash /opt/buccaneer/deploy/update.sh
```

**No `sudo`.** Run it as the ordinary `ubuntu` user; the script uses `sudo` itself for the two commands that need it, and it stops with an explanation if you put `sudo` in front, because that would leave the rebuilt files owned by root and the game server unable to read them.

It refuses to run if anyone has hand-edited files on the server, pulls `main`, rebuilds, restarts, shows the last twenty log lines, and checks `/health` locally and over HTTPS. It never touches the database or your settings, so crews and their passwords survive.

```
==> Pulling the latest main
    ok   38bc56f -> 4a91c02
    4a91c02 fix(web): keep the ticker legible on small phones

==> Installing dependencies (npm ci at the workspace root)
    ok   dependencies installed
    ok   database engine loads

==> Building shared + web
    ok   web/dist rebuilt (47 files)

==> Restarting buccaneer.service
    ok   restart requested

==> Waiting for /health

==> Last 20 log lines
    ... journal output ...

    ok   /health returns ok
    {"ok":true,"phase":"lobby","tick":0,...}
    phase=lobby tick=0/240 ticksBehind=0

==> Checking the public address
    ok   https://decastock.duckdns.org/health responds over HTTPS

  Deployed 4a91c02.
```

**Do not deploy during a game.** The restart drops every live price connection for a few seconds. Phones reconnect on their own and the engine recomputes the tick it should be on, so nothing breaks — but there is no reason to make students watch it happen.

To go back to the previous version, the script prints the exact command.

---

## Restoring the database

> **If you are rebuilding a machine Oracle reclaimed, read this before anything else.** The installer seeds a brand-new, empty market on a machine that has no database yet — that is the right thing on a first install and the wrong thing on a rebuild. Do not start a game on it. Run the restore below first; it replaces that empty game with the real one from Backblaze, and the installer prints a reminder to do exactly this.

If the machine was reclaimed and rebuilt, or the database is damaged:

```bash
bash /opt/buccaneer/deploy/restore.sh
```

It shows you what it is about to replace, then makes you type the word `restore` — nothing happens until you do. It stops the game server, keeps your current database as a dated `.bak` next to it, downloads the backup, checks it, and starts everything again.

```
==> Read this before you say yes

    Database on this machine : /var/lib/buccaneer/game.db
                               2.1M, last written 2026-09-15 18:44:02 UTC
    Replacing it with        : the newest copy in Backblaze B2
    ...
    Every trade made after the backup's last update is gone.

    Type exactly  restore  to continue: restore
```

If the download fails, it puts your original file back exactly as it was and restarts the service. You cannot end up with nothing.

---

## Between events

This is the part that is specific to a school. A DECA game runs a few times a semester and the machine sits doing nothing in between, which is exactly the profile Oracle reclaims.

**The rule:** Oracle may reclaim an Always Free instance if, over a **7-day** period, all three of these are true — CPU use at the 95th percentile under 20%, network use under 20%, and (on Arm machines) memory use under 20%. All three. It cannot happen during a game.

**What to do about it:**

- **A week before your event, sign in to the Oracle console and confirm the machine is still there.** A week, not the night before. If it is gone, steps 2 through 6 take about an hour and `restore.sh` brings the history back.
- **The reliable fix is to leave a game ticking.** Seed a low-stakes demo game and leave the engine running between events. That produces steady CPU, memory and network use, costs nothing, and takes the question off the table entirely.
- A cron job that pings `/health` generates network traffic but almost no CPU. Since Oracle requires all three metrics to be low, that alone is technically enough — but leaving the engine running is the version you do not have to think about.

**Three days before, do a dress rehearsal.** Run a short game end to end on the real URL with three to five people on real phones on the school Wi-Fi. Place orders. Then deliberately break it: `sudo systemctl restart buccaneer`, and confirm the phones reconnect by themselves. Then break it harder: `sudo reboot`, and confirm everything comes back with nobody touching it. Then reset the game so you start the real event clean.

---

## When something is wrong

| What you see | What it almost always is | What to do |
|---|---|---|
| Site does not load at all; `curl` hangs then times out | Step 3 was missed or done on the wrong VCN | Re-check ingress rules for TCP 80 and 443 with source `0.0.0.0/0` on the security list attached to your instance's subnet. This is the number-one cause. |
| Site does not load, but ingress rules look right | The machine's own firewall | On the server: `sudo iptables -L INPUT -n --line-numbers`. You should see ACCEPT lines for 80 and 443 **above** the REJECT line. If not, re-run `setup-oracle.sh` — it is safe to run again. |
| Browser says "not secure" / certificate error | Caddy could not get a certificate | `sudo journalctl -u caddy -n 50 --no-pager`. Usually one of: port 80 still blocked (Let's Encrypt needs it), DNS not pointing at this machine (`ping decastock.duckdns.org` and compare), or you hit Let's Encrypt's rate limit by retrying too fast — that one clears itself in an hour. |
| The host screen shows `{"error":"not_found"}` as raw text | The browser asked the game server for `/admin` directly, and it reserves that path for the app's own data calls | Go to `https://YOUR-NAME.duckdns.org/login` instead. To make reloading `/admin` work permanently, re-run `bash /opt/buccaneer/deploy/setup-oracle.sh` — it installs the Caddy rule that handles it. Then check with: `curl -s -H 'Accept: text/html' https://YOUR-NAME.duckdns.org/admin \| head -c 20` (HTML, not JSON). |
| `caddy.service` will not start; the log says `permission denied` on `/var/log/caddy/access.log` | The log file ended up owned by root, so the `caddy` user cannot write it | `sudo chown -R caddy:caddy /var/log/caddy && sudo systemctl restart caddy` |
| `npm ci` ends in a wall of `node-gyp` / compiler errors mentioning `better_sqlite3` | The database engine has no prebuilt binary for this Node version and had to compile | `sudo apt-get install -y build-essential python3`, then `cd /opt/buccaneer && npm rebuild better-sqlite3 --build-from-source`. On a 1 GB machine also check `swapon --show` prints a line; if it does not, re-run `setup-oracle.sh`. |
| Installer stops with "This machine is running Node 24, but the installer asked for Node 22" | Node was already installed from somewhere else, and apt will not swap majors on its own | Take the one that is there — `NODE_MAJOR=24 bash setup-oracle.sh` — or force the switch with `sudo apt-get install -y --allow-downgrades nodejs` and run the installer again. |
| Installer stops on "contains a character this installer will not write to a settings file" | A stray space, quote or newline came along when you pasted a token or key | Copy the value again — click into the field and select just the characters, no trailing space — and re-run. |
| `ping decastock.duckdns.org` returns the wrong IP | The DuckDNS record is stale, usually after the VM was stopped and started | `sudo systemctl start duckdns-update.service`, then `sudo journalctl -u duckdns-update -n 5`. It should say `updated OK`. Then `sudo systemctl restart caddy`. |
| `buccaneer.service` will not start | Almost always a build or config problem, and the log says which | `sudo journalctl -u buccaneer -n 50 --no-pager`. `Cannot find module` means the build did not finish — re-run `update.sh`. `EADDRINUSE` means something else holds port 8081 — `sudo ss -lptn 'sport = :8081'`. |
| Service starts then immediately restarts, over and over | Bad value in `/etc/buccaneer.env`, or the database file is not writable | `sudo journalctl -u buccaneer -n 50 --no-pager`. Check `ls -l /var/lib/buccaneer/` — `game.db` must be owned by `ubuntu`, not `root`. Fix with `sudo chown ubuntu:ubuntu /var/lib/buccaneer/game.db`. |
| Live prices arrive in bursts instead of smoothly | Something between the phone and the server is buffering the event stream | Do not add a buffering directive to the Caddyfile. The game server marks the stream `no-transform` and `X-Accel-Buffering: no`, and Caddy passes it straight through; the installed Caddyfile is already correct. Check whether school Wi-Fi has a filtering proxy in the way — try one phone on cellular data to tell the two apart. |
| `update.sh` says "Do not run this with sudo" | It was run as root, which would leave every rebuilt file owned by root and the game server unable to read them | Run it as the ordinary user, exactly as printed: `bash /opt/buccaneer/deploy/update.sh` with no `sudo` in front. |
| `npm ci` killed, or the build stops with no error | Out of memory, on a 1 GB E2.1.Micro | Check `free -h`. The installer adds a 2 GB swap file when RAM is under 2 GB; if `swapon --show` prints nothing, re-run `setup-oracle.sh`. |
| Disk full (`No space left on device`) | Logs, or old npm caches | `df -h` then `sudo du -sh /var/log/* \| sort -h \| tail`. Trim the journal with `sudo journalctl --vacuum-size=200M`. The game database itself is about 50–80 MB per 48-hour event against 200 GB free, so it is almost never the cause. |
| Litestream not running / no backup rows | Wrong endpoint, wrong key, or the key is not scoped to the bucket | `sudo journalctl -u litestream -n 40 --no-pager`. `403` means the application key cannot write to that bucket — make a new key scoped to it. Check the endpoint on the bucket's page: the region number varies. |
| The instance is gone from the console | Oracle reclaimed it under the idle rule | Redo steps 2 through 6 on a new machine, then `bash /opt/buccaneer/deploy/restore.sh`. This is the situation the Backblaze step exists for. Read "Between events" above so it does not happen twice. |
| Oracle emails about your "trial ending" | Normal, and not a problem | Your 30 days of trial credits expired. Always Free resources keep running. **Do not click "Upgrade to Pay As You Go."** |

### Commands worth knowing

```bash
sudo systemctl status buccaneer          # is it running?
sudo journalctl -u buccaneer -f          # watch the game server live (Ctrl-C to stop)
sudo journalctl -u caddy -n 50 --no-pager     # HTTPS and certificates
sudo journalctl -u litestream -n 30 --no-pager # backups
sudo systemctl restart buccaneer         # restart the game server
curl -s https://YOUR-NAME.duckdns.org/health  # is the engine ticking?
df -h && free -h                         # disk and memory
```

Three more that answer "is this machine set up the way it should be":

```bash
# Will everything come back after a reboot? All four must say "enabled".
systemctl is-enabled buccaneer caddy litestream duckdns-update.timer

# Are ports 80 and 443 accepted ABOVE the REJECT line?
sudo iptables -L INPUT -n --line-numbers

# Who can read the secrets? Both must be -rw------- and owned by root.
sudo ls -l /etc/buccaneer.env /etc/litestream.env /etc/duckdns.env
```

### Where everything lives

| | |
|---|---|
| Code | `/opt/buccaneer` |
| Database | `/var/lib/buccaneer/game.db` — the only file that matters |
| Server settings and secrets | `/etc/buccaneer.env` (root, mode 600) |
| HTTPS config | `/etc/caddy/Caddyfile` |
| Backup config | `/etc/litestream.yml`, keys in `/etc/litestream.env` |
| DuckDNS token | `/etc/duckdns.env` |

The database is deliberately outside the code directory, so deploying new code can never touch it.

### What is exposed, and what is not

Worth knowing if a network administrator at your school asks.

| | |
|---|---|
| Reachable from the internet | Only TCP 22 (SSH, key-only), 80 and 443 |
| Port 80 | Nothing but an automatic redirect to HTTPS, and Let's Encrypt's certificate check. No part of the game is ever served over plain `http://`. |
| Port 443 | The game, over HTTPS with a real Let's Encrypt certificate that Caddy renews on its own |
| Port 8081 | The game server itself. It is blocked by the machine's own firewall *and* by the Oracle security list — two independent layers. Check 5 above is how you confirm it. |
| Passwords | Crew and host passwords are stored as scrypt hashes, never in plain text. The three files that do hold secrets — `/etc/buccaneer.env`, `/etc/litestream.env`, `/etc/duckdns.env` — are mode 600 and owned by root, so no ordinary account on the machine can read them. |
| Backblaze | The application key is scoped to your one bucket, so even if it leaked it could not touch anything else in your Backblaze account. That is what step 5 meant by choosing the bucket instead of "All". |
| The game seed | Generated on the server and never printed or sent to a browser. Anyone holding it could predict every future price, which is why the installer filters it out of its own output. |

---

## Sources

All checked 2026-09-15.

- Oracle Always Free resources, shapes, storage and the idle-reclamation rule — <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
- Oracle Free Tier: the credit card is for identity; Always Free continues after the trial — <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm>
- Oracle: do not use UFW on Ubuntu images; essential firewall rules — <https://docs.oracle.com/en-us/iaas/Content/Compute/References/bestpracticescompute.htm#firewall>
- Oracle known issue, "Ubuntu instance fails to reboot after enabling UFW" — <https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm>
- Default VCN security list opens only 22 and ICMP — <https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm>
- NodeSource apt setup script for Node 22 and 24. It configures a distribution-independent repository (`Suites: nodistro`), so Ubuntu 24.04 is covered, and it accepts only `amd64` and `arm64` — both of the shapes on this page — <https://deb.nodesource.com/setup_22.x>, <https://github.com/nodesource/distributions>
- Caddy official apt repository, verbatim commands — <https://caddyserver.com/docs/install>
- Caddy and Server-Sent Events: responses are flushed immediately when `Content-Type: text/event-stream` or the length is unknown — <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>. Caddy's compression module writes SSE headers straight away and flushes the compressor on every flush, and it skips compression entirely for a response marked `no-transform`, which is how the game server marks the stream — <https://github.com/caddyserver/caddy/blob/master/modules/caddyhttp/encode/encode.go>
- DuckDNS update URL, `OK`/`KO` replies, and leaving `ip=` empty so the server uses the request's own address — <https://www.duckdns.org/install.jsp>
- Litestream v0.5 configuration: `replica:` singular (one replica per database), the S3 keys used here, and `${VAR}` expansion from the environment — <https://litestream.io/reference/config/>
- Litestream on Backblaze B2, including "select the bucket you created above" when making the application key — <https://litestream.io/guides/backblaze/>
- Litestream `restore` (takes a `DB_PATH` from the config, `-o` for an alternative output) and `ltx` (lists the uploaded transaction-log files) — <https://litestream.io/reference/restore/>, <https://litestream.io/reference/ltx/>
- Litestream releases: current version v0.5.17, packages named `litestream-0.5.17-linux-arm64.deb` and `-x86_64.deb` — <https://github.com/benbjohnson/litestream/releases>
- Backblaze B2 pricing, 10 GB free, no card at signup — <https://www.backblaze.com/cloud-storage/pricing>

The reasoning behind choosing this stack over the alternatives, and what was rejected and why, is in [HOSTING-FREE.md](HOSTING-FREE.md).

> **A note on that document.** Read it for the *reasoning*; run the commands from *this* page. A few of its command examples were written against Litestream 0.4 and an earlier version of the server, so they no longer match what is on your machine: it uses `litestream generations` (now `litestream ltx`), the environment variable `DATABASE_PATH` (now `DB_FILE`), and it says Node 20 where the installer now uses Node 22. None of that changes its conclusions.
