# Host Runbook: running a live Buccaneer Exchange game

This guide is for the **host**: a DECA advisor or a student leader. You don't need to know how
the code works. A student developer should already have put the game online by following
[DEPLOY.md](DEPLOY.md) and given you three things:

1. **The game address**, for example `https://your-project.web.app`.
2. **The host password.** The host signs in with the crew name **`admin`**.
3. **The health page address**, for example `https://deca-engine-abc123-uc.a.run.app/health`.
   It tells you whether the game's server is running (section 2.2).

Keep the host password private. Anyone with it can end the game or remove crews.

<!-- VERIFY: screen and button names in this guide follow docs/design/MOBILE.md §6.6, §7.17–§7.18 and COPY.md §11–§12. The server features behind them exist (server/src/routes/admin.ts), but the new host console screens are still being built, so check each label against the finished app before the event. -->

---

## The game in one minute

- Each **crew** (a team of students) starts with the same **starting cash** in doubloons (Ð).
- There are **25 made-up companies**. Their prices update on their own every 5 to 30 seconds.
  Each update is a **tick**, and every game has **8 sessions**.
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
| **Crews** | Add crews. Reset a password. Turn trading off or on. Remove a crew |
| **Market** | Host-only list with hidden health scores. **Never project this screen** |
| **News** | See scheduled and fired news. Fire your own news |
| **Tape** | Every trade as it happens |

On a laptop or tablet the same pages appear in a sidebar.

---

## 1. Before the event

Start at least **three days before** so you have time for a test run.

### 1.1 Create the market

Your developer creates the first market when they deploy. To check it:

1. Open the game address and sign in with crew name **`admin`** and the host password.
2. Open **Control**. The status should say **In the lobby**.
3. Open **Market**. You should see 25 companies.

If Control shows a game that is running or has ended, and it isn't a real game, clear it: end it
first if it is still running (section 3.1), then make a fresh market with **New game** (section 4).

### 1.2 Choose the settings

Settings can only change **in the lobby**. Once you press Start they lock with the note:
*"Locked while the game is running. You can change settings only in the lobby."*

Open **Control › Edit settings**.

| Setting | What it means (as shown in the app) | Choices and default | Advice |
|---|---|---|---|
| **Game length** | "How long trading lasts. Every game has 8 sessions, and prices update every 5 to 30 seconds depending on length." | 1, 2, 4, 8, 12, 24 or 48 hours. Default 48 hours | Match your event. See the table below |
| **Starting cash** | "The cash each crew gets at the start. New crews and new games use this amount." | Ð1,000 to Ð1,000,000,000. Default Ð1,000,000 | Keep the default. Round numbers make returns easy to read |
| **Trading fee** | "Charged on every buy and sell as a percent of the order value. The default is 0.10%." Entered in basis points: 10 basis points equals 0.10%. | 0 to 200 basis points (0% to 2%). Default 10 | Keep 10. A higher fee punishes trading back and forth |
| **Research edge** | "How much company health affects prices over the whole game." **Low:** "More luck. Company health matters less." **Normal:** "Balanced. Health and luck both matter." **High:** "Research pays more. Company health matters more." "On every setting, news and luck still move prices." | Low, Normal, High. Default Normal | Normal for most groups. High for first-time players, so good research shows up clearly |
| **Position limit** | "Caps how much of a crew's account can go into one company, so one all-in bet can't decide the standings." | Off, 50%, 35%, 25%. Default 50% | 50% or 35%. "Off" lets a crew bet everything on one company |
| **Currency** | "The money name and symbol shown everywhere in the game." | Name up to 40 characters, symbol up to 8. Default Doubloons, Ð | Optional |

**Game length and price updates:**

| Game length | Prices update every | Total ticks | Each session lasts |
|---|---|---|---|
| 1 hour | 5 seconds | 720 | 7.5 minutes |
| 2 hours | 10 seconds | 720 | 15 minutes |
| 4 hours | 20 seconds | 720 | 30 minutes |
| 8 hours | 30 seconds | 960 | 1 hour |
| 12 hours | 30 seconds | 1,440 | 1.5 hours |
| 24 hours | 30 seconds | 2,880 | 3 hours |
| 48 hours | 30 seconds | 5,760 | 6 hours |

Every length stands for about one business year, so a 1-hour game is not "calmer" than a 48-hour
one. For multi-day games the clock runs overnight unless you pause.

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
- Keep your own list somewhere private. You can reset a password at any time (section 2.5).

### 1.5 Do a test run (2 or 3 days before)

There is one game at a time, so do the test **before** you add the real crews.

1. In **Control › Edit settings**, set **Game length** to **1 hour**.
2. In **Crews**, add `Test Crew` with a simple password.
3. Press **Start game**.
4. On a phone, open the game address, add it to the Home Screen (section 1.6) and sign in as
   `Test Crew`.
5. Buy a few shares of any company. Check they appear under **Portfolio**.
6. Back in **Control**, check the heartbeat says **Engine healthy** (section 2.2).
7. Try **Pause trading**, then **Resume trading**.
8. Fire one small news item (section 2.4) and watch it appear in the crew's **News** tab.
9. Press **End game…**, type `END`, and confirm.
10. On the phone, open **Standings › See final results** and page through the reveal.
11. In **Control**, choose **New game…**, turn **Keep crews and passwords** **off**, type
    `NEW GAME`, and confirm. The test crew is deleted and the game returns to the lobby.
12. Now set the real settings (1.2) and add the real crews (1.3).

### 1.6 Help students install the app

Ask students to install the game on their phones before the event:

- **iPhone (Safari):** open the game address, tap **Share**, then **Add to Home Screen**, then
  **Add**. Open the new icon and sign in. (A Home Screen app keeps its own sign-in, so students
  sign in once more inside it.)
- **Android (Chrome):** tap **⋮**, then **Add to Home screen** or **Install app**.
- **Chromebook:** click the install icon at the right end of the address bar. School IT can also
  install it for everyone.

<!-- VERIFY: the install experience needs the PWA setup from MOBILE.md §9 (manifest, icons, service worker), which is not in web/ yet. -->

### 1.7 Day-of checklist

- [ ] Signed in as host. **Control** says **In the lobby**.
- [ ] Heartbeat says **Engine idle** (normal before the start), and the health page address
      loads (2.2).
- [ ] Settings are right. They lock at Start.
- [ ] Every crew is added, and every crew has its card.
- [ ] The school network allows the game address. If pages won't load, ask IT to allow your
      game address, your server address (ends in `run.app`), `firestore.googleapis.com`,
      `identitytoolkit.googleapis.com` and `securetoken.googleapis.com`.
- [ ] The projector shows **Standings** or **News**, never **Market**, the **Scheduled** news list,
      **Tape** or **Audit**.
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

<!-- VERIFY: planned thresholds (plan Task 13 adminFormat.heartbeat): healthy within 2 update intervals of the last tick, slow within 6, otherwise not responding. -->

**The health page.** For a second opinion, open the health page address from your developer in
any browser. You'll see one line of text like this:

```
{"ok":true,"phase":"live","tick":1284,"totalTicks":5760,"serverTime":1789412550000,"lastTickAt":1789412547000,"ticksBehind":0}
```

You only need three parts of it:

- `"ok":true` means the server answered. **If the page doesn't load at all, the server is down.**
  Call your developer.
- `"phase"` is `lobby` (in the lobby), `live` (market open), `paused` or `ended`.
- `"ticksBehind"` should be **0 or 1** while the market is open. Reload the page a few times. If
  the number keeps growing, the engine has stopped moving prices.

Nothing is lost if the engine restarts. Prices are saved at every update, and when the engine comes
back it catches up on the updates it missed.

### 2.3 Pausing

Use a pause for a fire drill, lunch, a room problem or a technical issue.

1. **Control › Pause trading.** Orders are refused with *"The host has paused trading."* Prices
   stop moving and **the clock stops**. The end time moves later by the length of the pause.
   Students can still read companies and their account.
2. **Control › Resume trading.** Orders open again, and the clock continues from where it stopped.

For a multi-day game, pausing overnight pushes the end into the next day by the same amount.

### 2.4 Firing news responsibly

The game already fires its own news on a hidden schedule. Each company gets a few stories, about
2 on average in a 1-hour game and about 10 in a 48-hour game, plus 1 or 2 stories for the whole
market. You can add your own.

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

### 2.5 A student is locked out

Work down this list:

1. **Check the crew name.** Capitals don't matter, and a space or a hyphen between words counts the
   same. Letters, numbers and missing spaces do matter: `Salt Wind` works, `SaltWind` doesn't.
2. **Check the password.** Capital letters in a password **do** matter.
3. **iPhone Home Screen app?** It needs its own sign-in, even if Safari is already signed in.
4. **Message "Your crew can sign in, but trading is turned off"?** You turned trading off for
   that crew (2.6). Turn it back on.
5. **Still stuck? Reset the password:** **Crews ›** the crew **› Reset password…**, type a new
   password (at least 4 characters) and save. Tell only that crew.
6. **Crew missing from the Crews list?** It was never added, or it was removed. Add it again.
   A re-added crew starts over with the starting cash.

Resetting a password **does not sign anyone out**. Phones already signed in stay signed in. If
another crew learned a password, reset it, turn trading off for that crew while you sort it out,
and ask everyone using the wrong crew to sign out (**Account › Sign out**).

### 2.6 Turning trading off for one crew

Use this for a rules problem or a shared password.

1. **Crews ›** the crew **›** switch **Trading allowed** off.
2. That crew's orders are refused with *"Trading turned off for your crew."* They can still read
   companies and see their account. Their shares keep moving with prices and still count in the
   standings.
3. Switch it back on at any time.

### 2.7 Removing a crew

**Crews ›** the crew **› Remove crew…**, then confirm. This deletes the crew's sign-in, holdings,
history, trades and standings row. **It can't be undone.** Only use it for a crew created by
mistake.

### 2.8 Projector tips

- Project from a **laptop browser**, not your phone, and zoom to 125% to 150% so the back row can
  read it.
- Good screens to project: **Standings**, **News** and **Markets**.
- **Never project** the host **Market** tab (it shows hidden health scores and fair values), the
  **Scheduled** news list, **Crews**, **Tape** or **Audit**.
- Keep your host console on a separate device or window from the projected one.
- Before the reveal, open the results on your own screen first so you know what's coming.

<!-- VERIFY: MOBILE.md §6.6 says "Projector view is desktop only", but no projector screen is specified yet, and the host phone tabs (Control, Crews, Market, News, Tape) have no Standings or News feed. Confirm which signed-in screen the host projects once the host console (plan Task 13) is built. -->

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

<!-- VERIFY: results screens follow MOBILE.md §7.13 and COPY.md §10; the web screens are still being built (plan Task 12). The server stores each company's score as a rank-based number (about −1.7 to +1.7, `reveal.quality`); the 0-to-100 health score in 3.3 is the planned display scale from COPY.md §10. -->

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

**What changes:** the same 25 company names get **new financial numbers and new news**. All trades,
holdings, history, standings and news are cleared. Tell students their old research doesn't carry
over.

**What stays:** crew names and passwords, the host password, and your settings.

Turning **Keep crews and passwords** **off** instead deletes every crew and its sign-in:
*"You will need to add crews again."*

---

## 5. Troubleshooting

| What you see | Likely cause | What to do |
|---|---|---|
| Heartbeat says **Engine not responding**, `ticksBehind` keeps growing, or the health page won't load | The server stopped or went to sleep | Wait one minute. If it doesn't recover, call your developer and point them to the troubleshooting table in [DEPLOY.md](DEPLOY.md). No data is lost; the engine catches up when it comes back |
| Prices aren't moving | The game is paused, in the lobby or ended; or the engine stopped | Check the status line in **Control**. If it says Market open, check the heartbeat |
| The site won't load for anyone | Network filter, or the site isn't deployed | Try on mobile data. If that works, ask IT to allow the addresses in 1.7 |
| One student can't sign in | Name spelling, password capitals, or a Home Screen app on iPhone | Section 2.5 |
| "Trading turned off for your crew" | You switched trading off | **Crews ›** crew **›** Trading allowed on |
| "Trading paused" | The game is paused | **Control › Resume trading** |
| "Market not open yet" | Still in the lobby | **Control › Start game** |
| "Price moved" | The price moved more than 2% between preview and placing | Normal. The student reviews the new estimate and places the order again |
| "Over the position limit" | The buy would put too much of the account in one company | Normal. The ticket shows the most they can buy |
| "Too many shares for one price update" | A crew can trade at most a set number of shares of one company per update | Normal. Place the rest after the next update |
| "Not enough cash" / "Not enough shares" | Crews can't borrow cash or sell shares they don't own | Normal. Buy fewer, or sell only shares you own |
| "Rate limit exceeded" after very rapid tapping, or when a whole room signs in at once | Too many requests in one minute. Each signed-in device can send 240 a minute, and sign-in attempts can all share one limit of 240 a minute | Wait a minute, then try again |
| You can't change settings | Settings lock after Start | Change them in the lobby of the next game |
| Charts or the market index are empty | The database's access rules are missing or out of date | Ask your developer to deploy the database rules again (DEPLOY.md section 3) |
| You fired the wrong news | News can't be undone | Don't fire a "correction" that doubles the chaos. Explain it at the debrief: it counted as luck |
| Health scores were shown on the projector | Host **Market** tab projected | Switch screens. Scores are hidden from crews in their own app until the end |
| A student's app looks out of date | An old version is cached | Close and reopen the app. On an installed app, use **Account › Reload app** |
| You ended the game by mistake | Ending can't be undone | Start a **New game** with crews kept and replay |
| "A new game is being prepared" | A new game is still being built | Wait a moment and try again |

<!-- VERIFY: "Account › Reload app" and the error wording come from MOBILE.md §7.15 and COPY.md §9 and §12; check them against the finished app. -->

---

## Cheat sheet

```
Host sign-in:   crew name "admin" + host password
Crew sign-in:   crew name + password (name ignores capitals, not missing spaces; password is exact)
Phases:         In the lobby -> Market open -> (Trading paused) -> Game ended

Before:   Control > Edit settings (lobby only) - Crews > Add crew - test run - share cards
Start:    Control > Start game
Health:   Control heartbeat, or <server address>/health  (ticksBehind 0 or 1 is healthy)
Pause:    Control > Pause trading   (clock stops; end time moves later)
News:     News > Fire news...       (small, fair, fictional; fires at the next update; can't undo)
Locked out: check spelling > Crews > crew > Reset password...
One crew: Crews > crew > Trading allowed (off/on)
End:      Control > End game...  type END
Reveal:   Standings > See final results (5 pages)
Again:    Control > New game...  Keep crews ON  type NEW GAME
Never project: Market, Scheduled news, Crews, Tape, Audit
```
