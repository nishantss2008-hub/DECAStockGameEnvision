# Simplify the market, add funds, introduce the stocks — design

**Date:** 2026-09-16
**Supersedes, in part:** `2026-09-14-buccaneer-exchange-v2-design.md` §4 (roster), §7 (company screen), §10b (comprehension)

## Why

Three problems, from the user and from the code:

1. **Too much on screen.** The company screen is 2,440px tall (`MOBILE.md:1284`) and "Key
   stats" alone spans ~1.5 screen-heights: five stats, each a four-line stack (label,
   number, plain-English sentence, sector-average line). ~20 lines of text before the
   news. Students report it as confusing.
2. **Too many companies, and the sectors don't work.** 25 companies in 10 sectors.
   Sector comparison needs 3 companies in a sector (`web/src/lib/compare.ts:207`), so
   only 4 of 10 sectors produce a real sector average today; the other 6 silently fall
   back to "Market average". The comparison feature is half-disabled by its own roster.
3. **Nothing introduces the market.** A student signs in and is handed 25 unknown
   companies. `WelcomeSheet` greets them and the walkthrough teaches the mechanics of
   trading, but nothing says what these companies *are*.

## Decisions (confirmed with the user, 2026-09-16)

- Funds are **tradeable**, not display-only.
- Fund lineup: **one broad fund + two sector funds**.
- Explanations move **behind a tap**; the sector comparison stays visible.
- The intro flow is **required once** before a crew's first order.
- Starting cash is **Ð250,000** (`DEFAULT_STARTING_CAPITAL = 25_000_000`, already landed).

## 1. Market shape: 15 companies, 5 sectors, 3 funds

**18 tickers total: 15 companies + 3 funds.**

Five sectors of exactly three companies each, so every company has a real sector
average and `MIN_SECTOR_COMPANIES = 3` is satisfied everywhere. Keep existing names,
tickers and research text; drop the rest of the roster. `Maps & Instruments` merges
into `Cartography & Navigation`.

| Sector | Companies |
|---|---|
| Shipping & Salvage | KRKN, FDUT, LVTH |
| Treasure Banking | PRYL, KIDD, MRGN |
| Naval Arms | BBRD, MRED, CNBR |
| Provisions & Spice | CJST, BRTH, GLGD |
| Cartography & Navigation | ABON, CMPS, SPYG |

Dropped: DJON, SALT, JLLY, TRTG, SIRN, LMAQ, MLSM, PRRT, CRSD, ASTR. Their sectors
(Tortuga Hospitality, Letters of Marque, Parrot & Livestock, Cursed Relics) go with
them. `SECTORS` in `shared/src/constants.ts` drops from 10 to 5; `research.json`
keeps 5 sector rows.

### Funds

Three funds, each a **basket of companies**, not an independent security:

| Kind | Holds | Purpose |
|---|---|---|
| Broad fund | all 15, market-cap weighted | "own the whole market"; tracks the Pirate Composite |
| Sector fund A | the 3 Shipping & Salvage companies, equal weight | betting on one industry |
| Sector fund B | the 3 Naval Arms companies, equal weight | betting on one industry |

Names and tickers follow `COPY.md`'s voice; tickers are 3–5 characters and must not
collide with a company ticker.

## 2. Fund pricing and trading

A fund is priced entirely by what it holds. It has **no independent volatility, no
idiosyncratic shock, and no news of its own** — that is the whole point, and it is why
a student can *see* that the broad fund swings less than any single company.

```
price_fund(t) = (Σ_i w_i · price_i(t)) / divisor
```

`w_i` are fixed weights set at seed time. `divisor` is chosen at seed so each fund
opens at a round price (Ð100.00), the way a real index divisor works.

**Trading a fund moves its constituents.** Buying Ð10,000 of the broad fund is demand
for Ð10,000 of the underlying companies, so the existing linear transient impact model
(`f = decay·(f + λ·Q)`, λ = Y·sigDay/ADV) applies to each constituent, pro-rata by
`w_i × notional`. This is not decoration: without it, a fund would be a free way to
buy the market with no price impact, and splitting an order between a company and the
fund that holds it would be an arbitrage. The fund's own quoted price is then the
basket, recomputed from the moved constituent prices — no separate impact term.

Consequences that must hold, and must be tested:

- Buying a fund and buying its constituents in the same proportions costs the same,
  within rounding. No arbitrage either direction.
- A fund's realised volatility is **below** the average volatility of its holdings
  (diversification), and the broad fund's is the lowest of the three.
- A fund's ADV is the weighted sum of its constituents' ADV.
- The per-crew 1-ADV interval cap and the 2% price-protection check apply to the
  constituent impact, not to the fund quote.

### Hidden quality

A fund has no hidden `q` of its own. For the end-of-game research score, its quality
is the **weighted average of its constituents' `q`** — so the broad fund is by
construction a market-neutral bet, and a sector fund inherits that sector's tilt.
Buying the broad fund should score as "did not pick", not as a good or bad pick.

### Position limits

The host's per-company position limit applies to funds too, with one exception: the
**broad fund is exempt** (capped at 100%), because "you may not put more than 25% in
the entire market" teaches the wrong lesson. Sector funds are limited normally.

## 3. Company screen — Apple Stocks layout

Target: from 2,440px to roughly one and a half screens, with nothing removed from the
data model. Order, top to bottom:

1. **Header** — name, ticker · sector, price, session change. Unchanged.
2. **Chart** — plot plus range tabs. Unchanged. The summary sentence stays.
3. **Your position** — only when the crew holds it. Moves above the stats.
4. **Key stats** — the change. A **two-column grid** of six cells: label, value, and
   the sector comparison as a small caption underneath (`Sector avg 12.4%`). No
   sentence in the grid. Tapping a cell opens a sheet with the plain-English sentence,
   the comparison, and a link to the glossary term. The sheet is the same content the
   four-line row used to show, so no copy is lost and `ExplainRow` survives as the
   sheet body.
5. **Session range** — the existing range bar, one row.
6. **News about {ticker}** — max 3, each headline + one meaning line.
7. **About** — description + "Read this company in 5 questions".
8. Buy/Sell stays floating.

Analyst view, financials preview and "your activity" move behind the existing
disclosure rows rather than rendering inline.

**A fund's screen** replaces Key stats with **What this fund holds**: the constituent
list with weights and each one's session change, plus one line explaining that its
price is those companies added together.

## 4. Markets screen

Apple Stocks list semantics: one row per instrument — crest, ticker, name, sparkline,
price, change pill. Two sections: **Funds** (3) then **Companies** grouped by sector
(5 groups of 3). The five-way metric segmented control (Basics/Price/Value/Health/
Analysts) leaves the main list and becomes a separate **Compare** screen reached from
the sort menu, where a dense table is appropriate because that is what the screen is
for.

## 5. Fundamentals formatting

Every field in `Fundamentals` is kept. What changes is presentation:

- Key stats: the two-column grid above.
- All stats: grouped grid (Price, Value, Size, Health, Payouts) rather than a flat
  nine-row list, same tap-for-explanation behaviour.
- Statements: unchanged on the Financials screen, which is already behind a tap.

## 6. "Meet the market" intro flow

A required-once, ~90-second flow. **It runs in the lobby**, before the host starts the
clock, so it does not eat a 30-minute game. A crew that signs in after the start must
finish it before their first order; browsing is allowed throughout.

Sequence:

1. **What you're doing** — one card: you have Ð250,000, you buy shares of companies,
   whoever's pile is worth most at the end wins.
2. **What a share is** — one card.
3. **The Pirate Composite** — one card: all 15 companies added together; the number
   that tells you whether the whole market is up or down.
4. **Five sector cards** — one per sector: the sector in a sentence, then its three
   companies, each with its one-line description, ticker and opening price.
5. **What a fund is** — one card, then the three funds with what each holds.
6. **Done** — drops the crew on Markets.

Rules: a visible progress indicator, back navigation, and no quiz. Replayable any time
from Learn. Completion is stored per crew server-side (not just `localStorage`), since
it gates the first order and a student may switch devices.

## 7. What this breaks

`server/test/calibration.test.ts` (`NCO = 25`), `quality.test.ts` (rank-z span for
N=25, `gradeFor(·, 25)`), `market.test.ts`, `generateMarket*.test.ts` correlation
bounds, the literal string "Search 25 companies" in three UI tests, and roughly 20
documentation references. The calibration bands must be **re-derived for N=15 and
re-verified over many seeds**, not merely relaxed until they pass: a smaller roster
raises the variance of the quality-versus-return relationship, and the top-quintile
statistic needs restating for 15 names (top 3 vs bottom 3).

## 8. Out of scope

Short selling, limit orders, options, dividends as cash events, fund creation by
students, and any change to the news engine beyond removing dropped companies.
