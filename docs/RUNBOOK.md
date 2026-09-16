# Host Runbook: running a live Buccaneer Exchange game

This guide is for the **host**: a DECA advisor or a student leader. You don't need to know how
the code works. A student developer should already have put the game online by following
[DEPLOY-EASY.md](DEPLOY-EASY.md) and given you two things:

1. **The game address**, for example `https://buccaneer-exchange.onrender.com`. The app and its
   server are one thing at one address, so the **health page** is that same address with `/health`
   on the end — `https://buccaneer-exchange.onrender.com/health`. It tells you whether the game's
   server is running (section 2.2).
2. **The host password.** The host signs in with the crew name **`admin`**.

Keep the host password private. Anyone with it can end the game or remove crews.

**Read this if you are on Render's free tier.** The service goes to sleep after 15 minutes with no
traffic, and going to sleep **wipes the game** — the market, the crews and anything in progress.
Open the address yourself a minute before you begin, keep a tab open, and create the market and the
crews shortly before you start, not the night before. The full run of show is in
[DEPLOY-EASY.md](DEPLOY-EASY.md).

---

## The game in one minute

- Each **crew** (a team of students) starts with the same **starting cash** in doubloons (Ð).
  The default is **Ð250,000**.
- There are **15 made-up companies**, three in each of five industries. Their prices update on
  their own every **5 seconds**. Each update is a **tick**, and every game has **8 sessions**.
- There are also **three funds** a crew can buy: **FLEET** (an equal slice of all 15 companies),
  **SHIPS** (the three Shipping & Salvage companies) and **ARMS** (the three Naval Arms companies).
  A fund has no financial statements and no news of its own — its price comes entirely from what it
  holds.
- A game lasts **10, 15, 20 or 30 minutes**. You choose which in the lobby.
- Before a crew can place its **first order**, it has to finish a short required tour called
  **Meet the market** (section 2.5). You can mark it finished for any crew.
- The **engine** is the part of the game's server that moves prices and fills orders. You can
  check that it is running (section 2.2).
- Every company has a hidden **health score** built from its financial numbers. Healthier
  companies have better odds over the whole game. News, market swings and luck still move
  prices, so nothing is certain.
- Crews win by having the highest **account value** (cash plus shares) when the game ends.
- The game moves through phases: **In the lobby → Market open → (Trading paused) → Game ended**.
- When the game ends, the **market reveal** shows every company's health score and gives each crew
  a research grade.

### Where things are in the host console

On a phone the host console has five tabs:

| Tab | What you do there |
|---|---|
| **Control** | See the clock and engine health. Start, pause, resume and end the game. Edit settings in the lobby. Start a new game. Open the Audit log |
| **Crews** | Add crews. Reset a password. Turn trading off or on. See who has finished **Meet the market**, and mark it finished. Remove a crew |
| **Market** | Host-only list with hidden health scores. **Never project this screen** |
| **News** | See scheduled and fired news. Fire your own news |
| **Tape** | Every trade as it happens |

On a laptop or tablet the same pages appear in a sidebar.

There is also a sixth page with no tab of its own: the **projector screen** at
`/admin/projector` (section 2.9). It is the scoreboard for the big display, and it is the only host
screen that is safe to put on a wall.

---

## 1. Before the event

Start at least **three days before** so you have time for a test run.

### 1.1 Create the market

Your developer creates the first market when they deploy. To check it:

1. Open the game address and sign in with crew name **`admin`** and the host password.
2. Open **Control**. The status should say **In the lobby**.
3. Open **Market**. You should see 15 companies and 3 funds.

On Render's free tier this check does not keep: the market is gone again after the service sleeps.
Treat it as a rehearsal, and create the real market shortly before the real game. If **Market** is
empty when you look, **Control** says *"No market created yet"* and offers **Start new game**, which
builds a fresh one.

If Control shows a game that is running or has ended, and it isn't a real game, clear it: end it
first if it is still running (section 3.1), then make a fresh market with **New game** (section 4).

### 1.2 Choose the settings

Settings can only change **in the lobby**. Once you press Start they lock with the note:
*"Locked while the game is running. You can change settings only in the lobby."*

Open **Control › Edit settings**.

| Setting | What it means (as shown in the app) | Choices and default | Advice |
|---|---|---|---|
| **Game length** | "How long trading lasts. Every game has 8 sessions, and prices update every 5 seconds." | 10, 15, 20 or 30 minutes. Default 30 minutes | Match your class period. See the table below |
| **Starting cash** | "The cash each crew gets at the start. New crews and new games use this amount." | Ð1,000 to Ð1,000,000,000. Default Ð250,000 | Keep the default. Round numbers make returns easy to read |
| **Trading fee** | "Charged on every buy and sell as a percent of the order value. The default is 0.10%." Entered in basis points: 10 basis points equals 0.10%. | 0 to 200 basis points (0% to 2%). Default 10 | Keep 10. A higher fee punishes trading back and forth |
| **Research edge** | "How much company health affects prices over the whole game." **Low:** "More luck. Company health matters less." **Normal:** "Balanced. Health and luck both matter." **High:** "Research pays more. Company health matters more." "On every setting, news and luck still move prices." | Low, Normal, High. Default Normal | Normal for most groups. High for first-time players, so good research shows up clearly |
| **Position limit** | "Caps how much of a crew's account can go into one company, so one all-in bet can't decide the standings." | Off, 50%, 35%, 25%. Default 50% | 50% or 35%. "Off" lets a crew bet everything on one company. The broad fund **FLEET** is exempt — it already holds all 15 companies, so capping it would punish the safest thing a crew can buy |
| **Currency** | "The money name and symbol shown everywhere in the game." | Name up to 40 characters, symbol up to 8. Default Doubloons, Ð | Optional |

**Game length and price updates:**

| Game length | Prices update every | Total price updates | Each session lasts |
|---|---|---|---|
| 10 minutes | 5 seconds | 120 | about 1¼ minutes |
| 15 minutes | 5 seconds | 180 | about 2 minutes |
| 20 minutes | 5 seconds | 240 | 2½ minutes |
| 30 minutes | 5 seconds | 360 | about 3¾ minutes |

Every length stands for about one business year, so a 10-minute game is not "calmer" than a
30-minute one — it just gets there in fewer, larger steps. Allow about 10 minutes on top of the
game itself for signing in, **Meet the market** and the reveal.

### 1.3 Add crews

1. Open **Crews › Add crew**.
2. Type a **crew name**: up to 60 characters with at least one letter or number.
3. Type a **password**: at least 4 characters. Three random words work well, like
   `harbor-lantern-seven`.
4. Save. The crew gets the starting cash from your settings.

Things to know:

- Crew names ignore capitals, and any space or punctuation between words counts the same.
  `Salt Wind`, `salt wind` and `Salt-Wind` are the **same** crew, so a second one is refused as a
  duplicate. But `SaltWind` (no space) is a **different** crew. Make names clearly different.
- Use plain letters (A to Z) and numbers. Accented letters such as é count as punctuation.
- The name `admin` is reserved for the host.
- If you change **Starting cash** after adding crews, every crew that hasn't traded gets the new
  amount when you press Start.
- You can add a late crew after the start. It gets the starting cash but has less time to trade.

### 1.4 Share crew passwords

- Give each crew **only its own** name and password: a printed card, a sealed envelope or a
  direct message to the captain.
- Don't post passwords in a group chat, on a shared slide or on the projector.
- Keep your own list somewhere private. You can reset a password at any time (section 2.6).

### 1.5 Do a test run (2 or 3 days before)

There is one game at a time, so do the test **before** you add the real crews.

1. In **Control › Edit settings**, set **Game length** to **10 minutes**.
2. In **Crews**, add `Test Crew` with a simple password.
3. Press **Start game**.
4. On a phone, open the game address, add it to the Home Screen (section 1.6) and sign in as
   `Test Crew`.
5. Tap **Buy**. It should send you into **Meet the market** first. Page through it — this is the
   gate your students will meet, so time it yourself.
6. Buy a few shares of any company, and a few of a fund. Check they appear under **Portfolio**.
7. Back in **Control**, check the heartbeat says **Engine healthy** (section 2.2).
8. Try **Pause trading**, then **Resume trading**.
9. Fire one small news item (section 2.4) and watch it appear in the crew's **News** tab.
10. Press **End game…**, type `END`, and confirm.
11. On the phone, open **Standings › See final results** and page through the reveal.
12. In **Control**, choose **New game…**, turn **Keep crews and passwords** **off**, type
    `NEW GAME`, and confirm. The test crew is deleted and the game returns to the lobby.
13. Now set the real settings (1.2) and add the real crews (1.3).

### 1.6 Help students install the app

Ask students to install the game on their phones before the event:

- **iPhone (Safari):** open the game address, tap **Share**, then **Add to Home Screen**, then
  **Add**. Open the new icon and sign in. (A Home Screen app keeps its own sign-in, so students
  sign in once more inside it.)
- **Android (Chrome):** tap **⋮**, then **Add to Home screen** or **Install app**.
- **Chromebook:** click the install icon at the right end of the address bar. School IT can also
  install it for everyone.

A Home Screen install needs the game address to be **HTTPS**, which the deployed address is.

### 1.7 Day-of checklist

- [ ] You opened the game address yourself a minute ago, so the service is awake (see the note at
      the top of this guide).
- [ ] Signed in as host. **Control** says **In the lobby**.
- [ ] Heartbeat says **Engine idle** (normal before the start), and the game address with
      `/health` on the end loads (2.2).
- [ ] Settings are right. They lock at Start.
- [ ] Every crew is added, and every crew has its card.
- [ ] Students have had a chance to finish **Meet the market** (2.5). The **Crews** tab shows who
      has.
- [ ] The school network allows the game address. If pages won't load, ask IT to allow it. There is
      only the one address to allow — the app, the API and the live price stream all come from it.
- [ ] The projector machine is signed in as host and showing `/admin/projector` in full screen
      (2.9) — never **Market**, the **Scheduled** news list, **Crews**, **Tape** or **Audit**.
- [ ] You have your developer's phone number in case the engine stops.

---

## 2. During the game

### 2.1 Start

1. Open **Control** and press **Start game**.
2. Read the confirmation: *"Trading opens for every crew and the clock starts. Settings stay
   locked until you start a new game."* Confirm.
3. The status changes to **Market open**, the countdown starts, and prices begin to move.

Tell students: **"Trading is open."** Their phones update on their own.

### 2.2 Watch the heartbeat and health

**Control** shows a heartbeat line, for example *"Engine healthy · last tick 3s ago · 0 ticks
behind"*.

| Heartbeat | What it means | What to do |
|---|---|---|
| **Engine healthy** | Prices are updating on time | Nothing |
| **Engine running slow** | Updates are late | Wait one minute. The engine catches up by itself |
| **Engine not responding** | No update for a while | Wait one more minute, then call your developer (see Troubleshooting) |
| **Engine idle** | The game is in the lobby, paused or ended | Normal |

**The health page.** For a second opinion, open the game address with **`/health`** on the end in
any browser. You'll see one line of text like this:

```
{"ok":true,"phase":"live","tick":184,"totalTicks":360,"serverTime":1789412550000,"lastTickAt":1789412547000,"ticksBehind":0,"connections":14}
```

You only need three parts of it:

- `"ok":true` means the server answered. **If the page doesn't load at all, the server is down.**
  Call your developer.
- `"phase"` is `lobby` (in the lobby), `live` (market open), `paused` or `ended`.
- `"ticksBehind"` should be **0 or 1** while the market is open. Reload the page a few times. If
  the number keeps growing, the engine has stopped moving prices.

(`"connections"` is how many phones have the live price stream open. It is useful for spotting a
room that has not signed in yet, and nothing to worry about otherwise.)

If the server restarts but its database survives, nothing is lost: prices are saved at every
update, and the engine recomputes the current tick from the clock and catches up on what it missed.
**On Render's free tier the database does not survive a sleep or a restart** — that is the one case
where a restart loses the game, and why you keep a tab open.

### 2.3 Pausing

Use a pause for a fire drill, lunch, a room problem or a technical issue.

1. **Control › Pause trading.** Orders are refused with *"The host has paused trading."* Prices
   stop moving and **the clock stops**. The end time moves later by the length of the pause.
   Students can still read companies and their account.
2. **Control › Resume trading.** Orders open again, and the clock continues from where it stopped.

A pause is also the right move while you sort out anything in the troubleshooting table.

### 2.4 Firing news responsibly

The game already fires its own news on a hidden schedule: **2 stories per company**, at every game
length, plus 1 or 2 stories for the whole market. You can add your own.

**How to fire news:**

1. Open **News › Fire news…**
2. Pick one or more **companies**.
3. Pick the **type**: Earnings, Merger, Discovery, Leadership, Rules, Scandal, Storm or Whole market.
4. Set the **direction and size**, from −50% to +50%. Every company you picked moves by the same
   percent.
5. Write a short **headline** and, if you like, a body.
6. Press **Publish at tick …**. The news fires at the **next price update**.

News can be fired only while the market is open or paused, not in the lobby or after the end. If
paused, it fires at the first update after you resume. Students see the headline, whether it is
good or bad news, and the price just before the news hit. They never see the size you chose.

**News can't be taken back.** It is a permanent price jump.

**Rules of thumb:**

1. **Keep most news small:** 3% to 10% either way. Save 20% or more for a rare big moment.
2. **Be even-handed.** Spread news across many companies and both directions. Never aim at a
   company one crew holds heavily, and never help a favorite crew. Check **Tape** first if unsure.
3. **Avoid big news in the final session.** A late jump decides standings by luck, not research.
4. **Match the type to the direction.** A "scandal" that pushes the price up confuses students,
   and the type chooses the "What this means" explanation they read.
5. **Keep it fictional and school-appropriate.** No real companies, real people, real disasters or
   tragedies.
6. **Don't reveal the schedule.** The **Scheduled** list shows upcoming automatic news. Don't read
   it aloud or project it.
7. **Remember it counts as luck.** Your news is not part of a company's expected return in the
   reveal. That makes a good debrief point.
8. Every news item you fire is recorded in the **Audit** log (**Control › More › Audit**).

### 2.5 "Meet the market": the required intro

Every crew has to finish a short tour called **Meet the market** before it can place its **first**
order. It takes about a minute and covers the 15 companies, the five sectors and the three funds.
Nothing else is locked: a crew that has not finished it can still sign in, read companies, watch
prices and follow the standings.

- A crew that taps **Buy** before finishing is taken into the tour instead of the order ticket. If
  an order does reach the server anyway, it comes back as *"Meet the market first."*
- **To see who has finished:** open **Crews**. On a phone each crew's row carries an **Intro
  pending** tag until it is done; on a laptop the crew table has a **Meet the market** column
  reading **Finished** or **Not finished**. Opening a crew shows the same line.
- **To unblock a crew:** open that crew in **Crews** (**Manage**) and tap **Mark Meet the market
  finished**.
  This is the fix for a phone that died mid-tour, a crew that joined late, a student who was in the
  hallway — anything that would otherwise cost a crew trading time it should have had. Do it
  without hesitating; it takes effect at once.
- Every use offers **Undo**, and the opposite action — **Send this crew through Meet the market
  again** — is always there if you mark the wrong crew.
- Every use is recorded in the **Audit** log (**Control › More › Audit**).
- A crew can re-read the tour any time from the **Learn** tab. Reading it again changes nothing in
  its account.

**Before the event:** the tour is the first minute of every crew's game. If you want all twenty
crews trading at the same moment, have them sign in and finish it *before* you press **Start
game** — it works in the lobby — and check the **Crews** tab before you start.

### 2.6 A student is locked out

Work down this list:

1. **Check the crew name.** Capitals don't matter, and a space or a hyphen between words counts the
   same. Letters, numbers and missing spaces do matter: `Salt Wind` works, `SaltWind` doesn't.
2. **Check the password.** Capital letters in a password **do** matter.
3. **iPhone Home Screen app?** It needs its own sign-in, even if Safari is already signed in.
4. **Message "Your crew can sign in, but trading is turned off"?** You turned trading off for
   that crew (2.7). Turn it back on.
5. **Still stuck? Reset the password:** **Crews ›** the crew **› Reset password…**, type a new
   password (at least 4 characters) and save. Tell only that crew.
6. **Crew missing from the Crews list?** It was never added, or it was removed. Add it again.
   A re-added crew starts over with the starting cash.

Resetting a password **signs that crew out on every device at once** — every phone already signed
in as that crew is dropped on its next action and has to sign in with the new password. So if
another crew learned a password: reset it, tell only the right crew the new one, and turn trading
off for that crew while you sort it out if you need a moment (that takes effect at once too).
Anyone signed in as the wrong crew can also sign out from **Account › Sign out**.

### 2.7 Turning trading off for one crew

Use this for a rules problem or a shared password.

1. **Crews ›** the crew **›** switch **Trading allowed** off.
2. That crew's orders are refused with *"Trading turned off for your crew."* They can still read
   companies and see their account. Their shares keep moving with prices and still count in the
   standings.
3. Switch it back on at any time.

### 2.8 Removing a crew

**Crews ›** the crew **› Remove crew…**, then confirm. This deletes the crew's sign-in, holdings,
history, trades and standings row, and signs the crew out on its devices at once.
**It can't be undone.**
Only use it for a crew created by mistake.

- The standings renumber straight away: the crews below it each move up one place.
- Orders from a phone still showing the removed crew are refused at once with *"Crew account not
  found."*

### 2.9 The projector screen

The host console has a screen built for the wall. It shows the standings, the Pirate Composite, the
clock and the newest headline, in type sized to be read from the back of a classroom.

**How to put it up**

1. Project from a **laptop browser**, not your phone.
2. Sign in as host on the projector machine, the way you always do.
3. Open the game address with **`/admin/projector`** on the end — for example
   `https://your-game-address/admin/projector`.
4. Put the browser in **full screen**: `F11` on Windows or a Chromebook, `Ctrl`+`Cmd`+`F` on a Mac.

That is the whole setup. There is **no second login**, and you no longer need a spare `Projector`
crew — if you made one for an earlier game, remove it (section 2.8) so it stops taking a place in
the standings.

Two things worth knowing:

- **Leave the zoom at 100%.** The screen sizes itself to the display, so zooming in makes it show
  less, not bigger.
- **Nothing on it can be clicked.** That is on purpose — a passing elbow can't take the scoreboard
  off the wall. Keep your own host console on a **separate device or window**; you can't drive the
  game from the projector.

**What the room sees**

- Rank, crew, account value and total return, for as many crews as fit. With a big field the rows
  shrink, and past that the bottom of the board says **"Showing the top N of M crews"**. The crews
  below that line are still playing and still ranked — they are just off the wall.
- The up and down arrows show how far each crew has moved **since the current session began**, so
  they hold still for a whole session and reset when the next one starts.
- Whenever the game is not simply running, the screen says so in large type: **Not started yet**,
  **Trading paused**, **Game ended**. That is the first thing a room asks, so it is the biggest
  thing on the screen.
- When the game ends it names the **winner** and shows the final standings.
- It never shows health scores, grades or fair values — there is nothing on it a crew can't already
  see on its own phone.

**If it says "Live updates stopped"**

A red strip under the title means that browser has lost its connection to the server, so the
numbers on the wall are frozen at the last update. The screen will never hide this from you: a
leaderboard that has stopped but still looks live is worse than one that admits it is stale.

1. Say out loud that the board is paused, so nobody reads a stale rank as a result.
2. Check that machine's wifi. The warning clears **by itself** within a few seconds of
   reconnecting, and the numbers catch up — you don't have to do anything else.
3. If it doesn't clear, reload the page (`F5` / `Cmd`+`R`). You stay signed in.
4. If reloading doesn't help, look at your own host console. If **Control**'s heartbeat is also
   stuck (2.2), the problem is the server, not the projector — see section 5.

**Never project** the host **Market** tab (it shows hidden health scores and fair values), the
**Scheduled** news list, **Crews**, **Tape** or **Audit**. The projector screen is the one host
screen that is safe on a wall.

Before the reveal, open the results on your own screen first so you know what's coming. The market
reveal is a crew screen (**Standings › See final results**, section 3.2); the projector shows the
final standings and the winner, not the reveal walkthrough.

---

## 3. Ending the game

### 3.1 How the game ends

- **On its own** when the clock reaches the end time.
- **Early:** **Control › End game…**, type `END`, and press **End game**. The button stays grey
  until the box says `END`.

What happens next: *"Trading closes for good, holdings are valued at closing prices, and the market
reveal opens. This can't be undone."* Closing prices leave out the last price nudges from orders,
so no crew can push up its final value with orders in the last seconds.

An ended game can't restart. To play again, use **New game** (section 4).

### 3.2 The results walkthrough

The results open by themselves on phones that have the app open when the game ends. Anyone can
reopen them from **Standings › See final results**. The results have five pages:

| Page | What it shows |
|---|---|
| 1. Voyage complete | The top three crews |
| 2. Your crew | Final value, return, rank and the crew's **research grade** |
| 3. Market reveal | Every company's health score, grade, what drove the score, expected vs. actual return, luck, and a result label |
| 4. Luck vs. research | A chart of health score against actual return |
| 5. Final standings | The full ranking |

Page through them yourself before you show the room.

### 3.3 Debrief talking points

**What drove each company?**
- Each health score (0 to 100) comes from four parts of the financial numbers: **profits**,
  **growth**, **safety** (debt and steadiness) and **price** (how expensive the stock was for its
  profits at the start). The "What drove the score" line names the two parts that stood out
  most, good or bad.
- Pick three companies with different labels:
  - **Compounder:** above-average health, and the price did at least as well as expected.
  - **Unlucky gem:** above-average health, but news or chance left the price below what was expected.
  - **Lucky turnaround:** below-average health, but news or chance pushed the price above what was expected.
  - **Decliner:** below-average health, and the price did worse than expected.
- Ask: *"Which numbers in Financials could have warned you?"* Connect it to "Read a company in
  5 questions" in the Learn tab.

**Luck vs. research**
- **Expected return** is what a company's odds pointed to. **Actual return** is what happened.
  **Luck** is the difference: news, market swings and chance.
- Each company also had a **hidden surprise** that no research could see. It is already inside the
  expected return, so it isn't counted as luck.
- On the chart, dots above the dashed line did better than typical for their health score.
- In the game's testing, the healthiest fifth of companies beat the least healthy fifth in about
  **95 of 100** simulated games. But health explained only part of each company's return. Good
  research improves your odds; it doesn't guarantee a win.
- The news **you** fired counts as luck. Ask: *"Did anyone react to news well?"*

**Diversification**
- Crews that spread their money across several healthy companies were less exposed to one
  company's bad luck. The position limit exists for this reason.
- The research grade measures how healthy a crew's holdings were over the whole game. *"Your grade
  does not change your rank. Rank comes only from account value."* Ask: *"Did the crew with the
  best grade win? Why or why not?"*

**Costs**
- Every trade paid a fee, and big orders nudged the price against the crew placing them. Ask
  crews to check **Fees paid** in **Portfolio › Activity › Balances**. Did frequent trading help?

**Closing questions for the room**
1. What would you look at first if you played again?
2. When did you feel most sure about a company? Were you right?
3. How is this like, and unlike, a real stock market?

---

## 4. A second round: New game with crews kept

1. Make sure the current game has **ended** (section 3.1). A new game started mid-game wipes it.
2. Open **Control › New game…**
3. Leave **Keep crews and passwords** **on**. Crews keep their names and passwords, and each one
   starts again with the starting cash.
4. Type `NEW GAME` and press **Start new game**.
5. Wait for *"New game ready. The game is back in the lobby."* If you see *"A new game is being
   prepared"*, wait a moment.
6. Adjust settings if you want (they carry over from the last game), then press **Start game**.

**What changes:** the same 15 company names get **new financial numbers and new news**, and the
three funds are rebuilt on top of them. All trades, holdings, history, standings and news are
cleared. Tell students their old research doesn't carry over.

**What stays:** crew names and passwords, the host password, your settings, and each crew's
**Meet the market** completion — crews that have already met the market do not sit through it
again, and can trade from the first second.

Turning **Keep crews and passwords** **off** instead deletes every crew and its sign-in:
*"You will need to add crews again."*

---

## 5. Troubleshooting

| What you see | Likely cause | What to do |
|---|---|---|
| Heartbeat says **Engine not responding**, `ticksBehind` keeps growing, or the health page won't load | The server stopped, or on Render's free tier it went to sleep | Wait one minute — waking it takes about that long, and the engine catches up on the updates it missed. If it doesn't recover, call your developer and point them to "If something goes wrong" in [DEPLOY-EASY.md](DEPLOY-EASY.md). On the free tier, a sleep also wipes the game; see the note at the top of this guide |
| Prices aren't moving | The game is paused, in the lobby or ended; or the engine stopped | Check the status line in **Control**. If it says Market open, check the heartbeat |
| The site won't load for anyone | Network filter, or the site isn't deployed | Try on mobile data. If that works, ask IT to allow the game address (1.7) |
| One student can't sign in | Name spelling, password capitals, or a Home Screen app on iPhone | Section 2.6 |
| "Meet the market first" — a crew can't place its first order | That crew has not finished the required intro | **Crews ›** the crew **› Mark Meet the market finished**. Do this without hesitating for a dead phone, a late joiner, or anything else outside the crew's control (2.5) |
| A crew's phone died part-way through **Meet the market** and it is losing trading time | The tour is required once, before the first order | Same fix: **Crews ›** the crew **› Mark Meet the market finished**. It takes effect at once, and **Undo** is right there if you pick the wrong crew |
| "Trading turned off for your crew" | You switched trading off | **Crews ›** crew **›** Trading allowed on |
| "Trading paused" | The game is paused | **Control › Resume trading** |
| "Market not open yet" | Still in the lobby | **Control › Start game** |
| "Price moved" | The price moved more than 2% between preview and placing | Normal. The student reviews the new estimate and places the order again |
| "Over the position limit" | The buy would put too much of the account in one company | Normal. The ticket shows the most they can buy |
| "Too many shares for one price update" | A crew can trade at most a set number of shares of one company per update | Normal. Place the rest after the next update |
| "Not enough cash" / "Not enough shares" | Crews can't borrow cash or sell shares they don't own | Normal. Buy fewer, or sell only shares you own |
| "Too many requests from this device" after very rapid tapping, or when a whole room signs in at once | Too many requests in one minute. Each signed-in crew gets 600. Devices that are not signed in yet are counted by network address, so a whole school can share one budget of 600 while everyone is signing in | Wait a few seconds, then try again. Stagger sign-ins if a room of twenty all tap at once |
| You can't change settings | Settings lock after Start | Change them in the lobby of the next game |
| Charts are empty right after the start | There is nothing to draw until a few price updates have happened | Wait 15 to 30 seconds. If they are still empty while the heartbeat says **Engine healthy**, reload the page |
| You fired the wrong news | News can't be undone | Don't fire a "correction" that doubles the chaos. Explain it at the debrief: it counted as luck |
| Health scores were shown on the projector | Host **Market** tab projected | Switch to `/admin/projector` (2.9). Scores are hidden from crews in their own app until the end |
| Projector says **Live updates stopped** | That browser lost its connection | Check its wifi; the warning clears itself on reconnect. Then reload the page (2.9) |
| A student's app looks out of date | An old version is cached | Close and reopen the app. On an installed app, use **Account › Reload app** |
| You ended the game by mistake | Ending can't be undone | Start a **New game** with crews kept and replay |
| "A new game is being prepared" | A new game is still being built | Wait a moment and try again |
| Lost the host password | — | Your developer sets a new one. On a server they can open a terminal on, `npm run set-host-password` changes it at once and leaves the crews, holdings and clock untouched. On Render it means changing the `ADMIN_PASSWORD` variable, which **restarts the service** — and on the free tier a restart wipes the game, so do that between games, never during one ([DEPLOY-EASY.md](DEPLOY-EASY.md)) |
| Orders fail at random, "Trading paused" doesn't stop every order, or prices seem to jump between two sets of numbers | More than one copy of the server is running. The trading pause, each crew's order queue and orders waiting for the next price update all live inside **one** server, and the game's database file has one writer, so the game must run as a **single instance** | Pause trading and call your developer. On Render that means the service must not be scaled past one instance — leave the instance count at 1 and never turn on autoscaling. Never deploy during a game either: a deploy starts a second copy, and on the free tier it wipes the database ([DEPLOY-EASY.md](DEPLOY-EASY.md)) |

---

## Cheat sheet

```
Host sign-in:   crew name "admin" + host password
Crew sign-in:   crew name + password (name ignores capitals, not missing spaces; password is exact)
Phases:         In the lobby -> Market open -> (Trading paused) -> Game ended

Length:   10 / 15 / 20 / 30 minutes (default 30) - prices update every 5 seconds
Market:   15 companies in 5 sectors of 3, plus 3 funds (FLEET, SHIPS, ARMS)

Before:   Control > Edit settings (lobby only) - Crews > Add crew - test run - share cards
Start:    Control > Start game
Health:   Control heartbeat, or <game address>/health  (ticksBehind 0 or 1 is healthy)
Pause:    Control > Pause trading   (clock stops; end time moves later)
News:     News > Fire news...       (small, fair, fictional; fires at the next update; can't undo)
Intro:    Every crew must finish "Meet the market" before its FIRST order
          Who's done: Crews tab.  Unblock: Crews > crew > Mark Meet the market finished
Locked out: check spelling > Crews > crew > Reset password...  (signs that crew out at once)
One crew: Crews > crew > Trading allowed (off/on)
End:      Control > End game...  type END
Reveal:   Standings > See final results (5 pages)
Again:    Control > New game...  Keep crews ON  type NEW GAME
Wall:     <game address>/admin/projector - signed in as host, full screen, zoom 100%
          "Live updates stopped" = that browser lost the connection; it clears itself on reconnect
Never project: Market, Scheduled news, Crews, Tape, Audit
```
