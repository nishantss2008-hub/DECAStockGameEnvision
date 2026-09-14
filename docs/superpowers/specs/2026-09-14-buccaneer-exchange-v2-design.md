# Buccaneer Exchange v2 — Weighted-Random Market, Full Functionality & Black Pearl Redesign

**Date:** 2026-09-14
**Status:** Approved (user chose all recommended options; build immediately)
**Supersedes (in part):** `2026-06-09-deca-pirate-stock-game-design.md` §4 (price engine), §10–11 (admin, frontend)
**Design reference:** `docs/design/BRIEF.md`, `docs/design/canvas/*.dc.html`, canvas artifact
https://claude.ai/artifact/Ctxnm3ZVBzTrVc1X6sciLd
**Research provenance:** `docs/research-findings.md` (§ v2 appended by this work)

---

## 1. Goals

1. **Weighted-random simulation.** Prices are random, but each company's odds are tilted by
   how good the stock is. "Good" is a quality score computed from the company's own published
   fundamentals. Research pays off on average and is never a guarantee.
2. **Standard, simple math.** Use textbook models rather than invented ones:
   - Sharpe single-index market factor
   - GBM fair value
   - Kou/Merton jump-diffusion for news
   - GARCH(1,1) volatility clustering
   - exact Ornstein–Uhlenbeck mispricing
   - square-root-law market impact
   - AQR Quality-Minus-Junk style quality score

   The whole per-tick step stays around 60 lines.
3. **Fully functional game:**
   - configurable game length
   - a working starting-capital setting
   - one-click new game from the host console
   - crew management (reset password, disable trading, remove)
   - portfolio value history and a market index
   - activity and balances pages
   - order preview with price protection and idempotency
   - end-of-game market reveal
4. **Full UI redesign** in the chosen **Black Pearl** direction: brokerage-dashboard layout
   (Summary / Positions / Activity / Trade / Markets / Research / Dispatches / Standings / Host
   console) with an original pirate skin.

### Non-goals (YAGNI)
Limit/stop orders, shorting, options, multi-game tenancy, native apps, and a dark-mode toggle.
The Black Pearl design is one fixed theme; the colour-blind "Spyglass" palette is deferred.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Visual base | Black Pearl: near-black hull chrome, tarnished gold, sea-glass accent, fog-grey parchment data panels |
| Quality visibility | Hidden during play; revealed on the Final Reckoning screen |
| Design workflow | Claude Design canvas mockups first (connector auth failed → built-in canvas skill) |
| Review gate | Spec + plan written and committed, build starts immediately |
| Orchestration | Ultracode: multi-agent workflows per phase with adversarial review |
| Order fills | Immediate, at `lastPrice × exp(±I/2)` (half-impact slippage) + fee |
| Game length | Host-configurable in lobby: 1h, 2h, 4h, 8h, 12h, 24h, 48h (default 48h) |
| Predictability knob | Host setting `researchEdge`: low / normal / high → quality spread QS 0.20 / 0.30 / 0.40 |

---

## 3. Quality score (shared, pure)

`shared/src/quality.ts` exports `computeQualityScores(inputs: QualityInput[]): QualityResult[]`.
The same function serves seeding, tests and the end-game reveal.

**Normalization:** AQR rank-z across the N companies in the game:
`rz(x_i) = (rank_i − (N+1)/2) / sqrt((N²−1)/12)`. Ranks run ascending (1 = worst), ties take
the average rank, and an undefined value ranks worst.

**Pillars** (each is the rank-z of the sum of its items' rank-z). Here `h0…h3` are the four fiscal
years in `history`, oldest to newest.

| Pillar | Items |
|---|---|
| PROF (profitability) | `grossProfit/totalAssets` · `roe` · `operatingCashFlow/totalAssets` · `(operatingCashFlow−netIncome)/totalAssets` (low accruals) |
| GROW (growth) | revenue CAGR `(h3.rev/h0.rev)^(1/3)−1` · `(h3.ni−h0.ni)/totalAssets` · `industry.growthRate` |
| SAFE (safety) | `−debtToEquity` · `min(currentRatio,3)` · `−sd(EPS growth h1..h3)` · Altman-lite `3.3·EBIT/TA + 0.6·mktCap/TL + 1.0·rev/TA` |
| VAL (value, sector-relative) | `ln(PEref/pe)` (pe≤0 → worst) · `ln(EVref/evToEbitda)` · `ln(PSref/ps)`, with refs from `research.json` sector profiles |

`Q = rz(PROF + GROW + SAFE)`; `s = rz(0.70·Q + 0.30·VAL)` (quality at a reasonable price, AQR's
70/30 mix). Engine input: `q = −1 + 2·(rank(s) − 0.5)/N` ∈ (−1, 1). Grade: quintile of `s`
maps to A/B/C/D/F. Excluded on purpose: analyst rating, management text, 52-week range.

## 4. Fundamentals generator (server, seeded)

`server/src/seed/generateMarket.ts` replaces the archetype round-robin.

1. **Latent quality with guaranteed spread:** `perm = shuffle(0..N−1)`;
   `ql_i = Φ⁻¹((perm_i + U_i)/N)` (Latin-hypercube stratification). Φ⁻¹ uses Acklam's algorithm.
2. **One-factor Gaussian copula per item:** `x_k,i = 0.8·ql_i + 0.6·e_k,i`. Map to fields by
   quantile, `value = lo + (hi−lo)·Φ(x)`, with sector ranges from `research.json`.
3. **Accounting identities must hold:**
   - `grossProfit = revenue − costOfRevenue`
   - `TA = equity + totalLiabilities`
   - `totalDebt = D/E · equity`
   - `OCF = NI − accruals·TA`
   - `FCF = OCF − capex`
   - `EPS = NI/shares`
   - `marketCap = price·shares`
   - `P/E = marketCap/NI` (when NI>0)
   - `EV/EBITDA = (mktCap + debt − cash)/EBITDA`
   - `ROE = NI/equity`, `ROA = NI/TA`
   - `dividendYield = payout·NI/mktCap`

   The worst ~10% of latent quality may post net losses.
4. **History:**
   - Four fiscal years, built backwards.
   - Revenue CAGR comes from the growth latent.
   - Margin drift is `0.01·x_G` per year.
   - EPS-growth noise sd is `0.04 + 0.12·Φ(−x_SAFE)`, so safer companies have steadier earnings.
5. **Price of quality:**
   - Cheapness latent `c = −0.32·ql + 0.95·v`.
   - `pe = PEref·exp(−0.35·c)`, clamped to sector bounds.
   - Loss-makers are valued on P/S.
   - Shares are chosen so the start price lands in Ð12–Ð520.
6. **Analyst view is a noisy hint:** `analystZ = 0.5·s + 0.87·n`; rating by quintile;
   `target = price·(1 + 0.12 + 0.10·analystZ)`.
7. **Beta (public):** `beta = clamp(0.85 + 0.25·Φ(debt/equity latent) + sector cyclicality ±0.15, 0.7, 1.4)`.
8. **Compute `s` and `q`** with §3 from the generated fundamentals; drift uses the MEASURED score.
9. **IP rename:** roster `barbossa / Barbossa Provisions / BRBS` becomes
   `bartholomew / Bartholomew Provisions / BRTH` (film character name removed).

## 5. Price engine (server, seeded, resume-safe)

`server/src/engine/model.ts` is ported from the research prototype (`scratchpad/engine-math/model.ts`).

### 5.1 Time scaling
- `tickIntervalMs = clamp(round(gameLengthMs/720), 5_000, 30_000)`
- `N = floor(gameLengthMs/tickIntervalMs)`, `dt = 1/N`, `hours = gameLengthMs/3.6e6`
- One game = one simulated trading year (252 days), so whole-game volatility, quality spread
  and jump variance are identical for 1h and 48h games.
- `sessionTicks = round(N/8)`: 8 sessions per game, and "Session" change is measured from the
  current session's open.

### 5.2 Parameters (`shared/src/constants.ts` → `MODEL`)
| Param | Value | Model |
|---|---|---|
| `mktDrift`, `mktVol` | 0.06, 0.18 per game | single-index market factor |
| `qualitySpread` QS | 0.20 / 0.30 / 0.40 (researchEdge) | quality alpha |
| `idioVol_i` | `0.30 − 0.05·q ± U(0.04)` | idiosyncratic GBM vol |
| `jumpVarPerGame` | 0.15² | Merton/Kou jump variance |
| `jumpsPerCompany K` | `clamp(round(1.5·√hours), 2, 12)` | Poisson count |
| `jumpUpBias` | `pUp = 0.5 + 0.30·q` | Kou up-probability |
| `maxJump` | 0.25 | truncation |
| GARCH | α_day 0.12, α+β 0.97; per tick `φ=e^(−c·dt)`, `α=min(0.3, a√dt)`, `β=φ−α`, h∈[0.1,10] | GARCH(1,1) |
| mispricing | half-life 5% of game, stationary sd 0.03 | exact OU |
| impact | `Y=1`, `ADV = shares/150`, cap 5%/tick, decay = OU decay | square-root law |
| `maxTickMove` | 0.08 (diffusive dv only) | clamp |

### 5.3 Per tick t (state `{v, m, f, h}` per company, `hM` market; `v` = ln fair value in cents)
```
zM = Prng(seed,'mkt:'+t).gauss();  rM = mktDrift·dt + mktVol·√(hM·dt)·zM;  hM ← garch(hM, zM)
for each company i (Prng(seed,'co:'+id+':'+t) → z, zO in that order):
  alpha_i = QS·q_i − K·(2·pUp_i − 1)·E[min(Exp(s), 0.25)]        // Merton compensator
  dv = clamp(alpha_i·dt + beta_i·rM + idioVol_i·√(h_i·dt)·z, ±0.08)
  v_i += dv + J_i(t)           // scheduled news/macro jumps (+ host news) gap past the clamp
  h_i ← garch(h_i, z);  m_i = m_i·dec + ouSd·zO
  f_i = f_i·dec + sign(Q_i)·min(0.05, Y·sigDay_i·√(|Q_i|/ADV_i))    // Q_i net shares since last tick
  price_i = max(1, round(exp(v_i + m_i + f_i)))
```
`sigDay_i = sqrt(beta_i²·mktVol² + 0.30²)/√252`. The 0.30 is a public constant, so impact
estimates never leak q. Rounded cents are never fed back into state.

### 5.4 News schedule
Generated at **game start** (it depends on N), seeded `('jumps:'+id)`, and stored in
`_schedule/_news`.
- **Company events:** `n ~ Poisson(K)`, tick `1+floor(U·N)`, sign up with `pUp_i`,
  size `min(0.25, −s·ln U)` where `s = √(jumpVar/(2K))`.
- **Headline type by sign and size:**
  - up, small: earnings beat
  - up, medium: management / regulatory win
  - up, large: merger / discovery
  - down, small: earnings miss
  - down, medium: regulatory / management loss
  - down, large: scandal / storm
- **Macro events:** 1–2 per game, `J_m ∈ ±U(0.02,0.08)`, applied as `beta_i·J_m` to all companies.
- **Host news:** `magnitude m` becomes `ln(1+m)`, added to `v` for the chosen companies at the next tick.
- **Public news doc:** carries `sentiment` (bullish/bearish) and `priceAtFire` per company.
  It never carries the magnitude.

### 5.5 Resume safety
- **Persisted state:** `{v, m, f, h}` per company, plus `hM`, `lastTick` and current chunk arrays,
  go to server-only `_engine/state` in the same batch as prices.
- **Restart:** load state and continue.
- **Catch-up:** replays ticks with Q=0.
- **Recovery if the doc is missing:** replay `v, h, m` from tick 0 and set
  `f = ln(price) − v − m`.
- **Pause/resume:** shifts `startAt`/`endAt` (unchanged behaviour).

## 6. Trading

- `executeOrder(teamId, {companyId, side, quantity, clientOrderId, quotedPrice?})`:
  - **Rejects:**
    - not live → `market_closed`
    - trading disabled → `trading_disabled`
    - unknown company
    - quantity must be a positive integer
    - `|price − quotedPrice|/quotedPrice > 2%` → `price_moved`
  - **Idempotency:** `orders/{teamId}_{clientOrderId}` already exists → return its trade.
- **Fill price:** `last·exp(±I(q)/2)` with `I(q) = min(0.05, Y·sigDay·√(q/ADV))`, rounded to cents.
  Fee is `feeBps` (default 10) of notional.
- **Transaction writes:**
  - team `cashBalance`, `realizedPnl`, `feesPaid`, `tradeCount`
  - holding `{shares, avgCost}`
  - `trades/{id}` (+ `tick`, `impactBps`, `realizedPnl`, `clientOrderId`)
  - `orders/{teamId}_{clientOrderId}` with status `filled`

  Rejections write an `orders` doc with status `rejected` and `reason`, best-effort.
- Shared pure `estimateOrder()` computes est. price, impact, value, fee, total, cash after,
  shares after, avg cost after and max affordable. The ticket and the server both use it.

## 7. Data model changes (Firestore)

| Path | Vis. | Contents (new/changed) |
|---|---|---|
| `game/state` | public | + `gameLengthMs, totalTicks, sessionTicks, feeBps, researchEdge, endedAt, marketCreatedAt` |
| `companies/{id}` | public | + `beta, adv, startPrice, sessionOpen, sessionHigh, sessionLow, sessionVolume, voyageHigh, voyageLow, lastTick`; `reveal` after end |
| `companies/{id}/history/{chunk}` | public | `{chunk, startTick, prices[], volumes[]}`, 120 ticks per chunk (replaces per-tick `priceHistory`) |
| `market/summary` | public | composite `{value, open, sessionOpen, change}`, `sectors{}`, `breadth{}`, `lastTick` |
| `market/summary/history/{chunk}` | public | composite values per tick |
| `teams/{id}` | team+admin | + `realizedPnl, feesPaid, tradeCount, tradingDisabled, sessionOpenValue, holdingsCount` |
| `teams/{id}/history/{chunk}` | team+admin | total value per tick |
| `orders/{id}` | own+admin | `{id, teamId, clientOrderId, companyId, side, quantity, status, reason?, tradeId?, createdAt, tick}` |
| `leaderboard/current` | public | entries + `returnPct, sessionChangePct, cashPct, holdings, prevRank, spark[≤40]`; `final` block after end (+ `researchGrade`) |
| `news/{id}` | public | `magnitude` removed; + `sentiment, tick, priceAtFire{}` |
| `_engine/state` | server | engine state (§5.5) |
| `_schedule/{id}` | server | `{quality s, q, grade, pillars, idioVol, beta, adv, startPriceCents}` |
| `_schedule/_news` | server | `{events: [{tick, companyIds, jumps{}, type, sentiment, headline, body}]}` |
| `_teamStats/{id}` | server | quality-exposure accumulator for the research grade |

Security rules add public read for `market/**` and `companies/*/history/*`, team/admin read
for `teams/*/history/*`, and deny for `_engine`, `_teamStats`. Client writes are still denied everywhere.

## 8. Authority API

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | unchanged |
| POST | `/orders` | team | §6 (+ `clientOrderId`, `quotedPrice`) |
| POST | `/admin/settings` | admin | lobby only: `gameLengthMs, startingCapital, feeBps, researchEdge, currencyName, currencySymbol` |
| POST | `/admin/game/:action` | admin | `start` / `pause` / `resume` / `end` |
| POST | `/admin/game/new` | admin | `{keepCrews: boolean}`: new random seed, regenerate market, clear dynamic data, reset crews' cash to starting capital (or delete crews), reload engine; lobby after |
| POST | `/admin/teams` | admin | create (uses configured `startingCapital`) |
| POST | `/admin/teams/:id/password` | admin | reset password |
| POST | `/admin/teams/:id/trading` | admin | `{enabled}` |
| DELETE | `/admin/teams/:id` | admin | remove crew + login + holdings/history/trades |
| GET | `/admin/market` | admin | per company: last, session %, volume, net flow, quality, grade, fair value `exp(v)`, deviation |
| GET | `/admin/news/scheduled` | admin | upcoming/fired schedule |
| POST | `/admin/news` | admin | fire host news |
| GET | `/admin/logs`, `/admin/teams` | admin | unchanged |
| GET | `/health` | public | + `lastTickAt, ticksBehind` |

`npm run seed` / `npm run reset` become thin wrappers over `services/market.ts`
(`createMarket`, `clearDynamicData`), shared with `/admin/game/new`.

## 9. Engine ↔ services contract

Each tick the engine commits one batch:
- company snapshots
- history chunks
- `market/summary` (+ chunk)
- fired news
- `game/state.currentTick`
- `_engine/state`

After the commit, `recomputeLeaderboard` writes:
- team values, `sessionOpenValue` on session boundaries, and team history chunks
- `leaderboard/current` with sparks and `prevRank`
- the `_teamStats` accumulators

`endGame()` writes the `companies/{id}.reveal` values and the final leaderboard with
research grades:
- **reveal:** `{quality, grade, pillars, expectedReturn = QS·q + beta·mktDrift, actualReturn = ln(end/start), luck = actual − expected, label}`
- **label:** Compounder / Unlucky Gem / Lucky Turnaround / Decliner, from the signs of `q` and `luck`
- **research grade:** time-averaged, value-weighted quality of each crew's holdings, as a letter

## 10. Frontend architecture

- **Styles:** `web/src/theme/tokens.css` (BRIEF §2), `base.css` (reset, type, utilities), and a
  co-located `*.css` per component. The runtime `<style>` injection pattern is removed. Fonts
  come from BRIEF §3.
- **Primitives** (`components/ui`):
  - Panel, Eyebrow, Button, Segmented, Pill, Crest, SignedChange (sign+SVG arrow+colour),
    Money/Num
  - DataTable (sortable, sticky header), Tabs, Field/Input/Select
  - Modal + TypedConfirm, Toast, EmptyState, Loader (compass), Icons (24px stroke SVG)
  - Ornaments: CompassRose, WaxSeal, Medallion, RopeRule
- **Charts** (`components/charts`, custom SVG):
  - Sparkline
  - AreaChart (baseline, compare line, crosshair tooltip, range tabs)
  - VolumeBars, RangeBar (52-wk/session position), ScatterChart
  - Treemap (squarified layout via `d3-hierarchy`)
- **Shell:**
  - Header: wordmark, nav, symbol search, market status pill with countdown, cash chip, crew menu
  - IndexStrip: composite, sectors, tick stamp
  - MobileTabBar (<600px: Summary, Markets, Trade, Dispatches, Standings)
  - HostShell with the host nav
  - PhaseBanner: paused / lobby / ended
- **Routes:**

  | Path | Page |
  |---|---|
  | `/login` | Login |
  | `/` | Summary |
  | `/positions` | Positions |
  | `/activity` | Activity & Orders, plus balances panel |
  | `/trade/:ticker?` | Quote + ticket; tabs Snapshot, Financials, Analysts, Dispatches, Crew |
  | `/markets` | Markets |
  | `/research` | Research directory |
  | `/research/:ticker` | Redirect → `/trade/:ticker?tab=financials` |
  | `/news` | Dispatches |
  | `/standings` | Standings |
  | `/results` | Final Reckoning, when ended |
  | `/admin`, `/admin/crews`, `/admin/market`, `/admin/news`, `/admin/tape`, `/admin/audit` | Host console |

- **Trade ticket:** states entry → preview → placing → filled (wax seal) / rejected, with price
  staleness re-check. It is mounted on the quote page and as a global drawer from the header
  Trade button (prefilled symbol and side). Mobile uses a full-screen sheet.
- **Hooks:** listeners for game, companies, company(+fundamentals), history chunks (range),
  portfolio, team history, trades, orders, news, leaderboard and market summary. Also
  `useWatchlist` (localStorage per crew), `useCountdown` and `useSessionRange`.
- Copy follows BRIEF §5. Numbers use tabular figures and a true minus sign. Every signed value
  carries sign + arrow + colour.

## 11. Local run & ops

- **`npm run dev:local`:** Firestore + Auth emulators (JAVA_HOME from `JAVA_HOME` env), seed,
  server and web with `VITE_USE_EMULATORS=1`.
- **`server/src/firebase.ts`:** in emulator mode NEVER loads the service account, which
  protects the real project.
- **Docs:** QUICKSTART, RUNBOOK, DEPLOY and README updated for settings, new game, crews and
  the reveal.

## 12. Testing

- **Unit (vitest, server):**
  - prng, money, and quality score (rank-z range ±1.664 for N=25; ties; undefined worst)
  - generator identities over 50 seeds, grade spread and loss-maker rate
  - GARCH per-tick constraints `α+β<1` and `3α²+2αβ+β²<1` for N∈[120, 5760]
  - OU decay, impact scale examples, jump schedule determinism and count ≈ K
  - resume byte-identical after a JSON round-trip, and fair value unaffected by flow
  - anti-manipulation: buy-then-sell next tick loses on average
  - trading math: slippage, fees, realized P&L, `price_moved`, idempotency
  - clock derivation
- **Calibration (vitest, bounded seeds, targets from research §SANITY):**
  - per-game vol in [0.33, 0.48] for 1h and 48h
  - |ACF1| < 0.03
  - top-quintile beats bottom-quintile in ≥ 85% of 40 seeds and not in all of them
  - Spearman(q, return) mean in [0.35, 0.6]
- **Emulator integration** (`npm run test:integration`, via `firebase emulators:exec`):
  create market → settings → crew → start → order → forced ticks → history/leaderboard/orders
  → pause/resume → end → reveal → new game (keepCrews).
- **Rules:** `@firebase/rules-unit-testing` for public, own-team and server-only paths.
- **Web:** vitest for format/estimate/clock helpers, plus `tsc` and `vite build`.
- **End to end:** Playwright MCP against the emulator stack, covering crew login → trade flow →
  positions/activity → host start/pause/news/new game, at desktop and 390px widths, with
  screenshots compared against the canvas.

## 13. Risks

- **Firestore writes per tick:** about 25 chunk writes, 25 company updates, 4 market/game/engine
  docs, and 2×crews for teams + history. That is roughly 90 writes per tick, well within limits.
  A 48h game is about 520k writes (a few dollars on Blaze); shorter games are proportionally cheaper.
- **Visible tick churn:** chunk docs overwrite arrays of ≤120 numbers, so listeners receive
  small docs.
- **Calibration flakiness:** bounded seed counts with tolerant bands; the heavy Monte Carlo
  stays out of CI.
