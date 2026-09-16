# Buccaneer Exchange — Redesign Brief (Direction B · Black Pearl)

Source of truth for the redesign mockups in `docs/design/canvas/` and for the React
implementation that follows. Chosen by the user on 2026-09-14 from four directions.

## 1. Concept

A professional brokerage dashboard (information architecture of Fidelity-style
Portfolio › Summary / Positions / Activity & Orders / Balances, Trade ticket with
preview, Research snapshot, Markets overview) wearing an original golden-age-of-piracy
skin: a moonlit ghost-ship hull (near-black, faint sea-glass glow), tarnished
poster gold, and fog-grey parchment "ledger" panels where all the numbers live.

**Rule #1 — the theme lives in the frame, never in the figures.**
- Layer 1 HULL (fully themed): global header, wordmark, page titles, login hero,
  ceremonies (market open, order filled seal, game over, podium), empty/loading states.
- Layer 2 RIGGING (light theme): panel headers (eyebrow in Cormorant SC/Cinzel caps
  with a hairline gold rule), tab bars, news badges, company crest roundels.
- Layer 3 LEDGER (no theme): tables, quotes, tickets, statements, chart plot areas,
  inputs. Flat light surfaces, IBM Plex Sans, tabular numerals, 1px neutral rules.

**IP rule:** original design only. Never use the "Pirates of the Caribbean" name, its
logo/title lettering, the EITC mark, the Aztec medallion, film character names
(e.g. "Barbossa", "Jack Sparrow"), likenesses or quotes. Historical/public-domain
motifs are fine (compass rose, Jolly Roger, portolan charts, wax seals, merchant's
marks, Kraken/Davy Jones folklore). No brokerage logos or brand names in the UI.

**Audience rule:** high-school DECA students. No alcohol references anywhere (the roster was renamed on 2026-09-14: Calico Jack Spice Traders, Galleon Goods Co., sector Provisions & Spice), no gore, no
mocking losses.

## 2. Tokens (Black Pearl)

| Token | Hex | Use |
|---|---|---|
| chrome | `#111412` | global header (subtle radial sea-glass glow top-right) |
| chrome-2 | `#1A1F1C` | index strip, primary buttons, selected segments |
| chrome-3 | `#232A26` | inputs on chrome |
| chrome-line | `#34403A` | borders on chrome |
| chrome-edge | `#5FA39A` | 3px rule under header (sea-glass) — or gold rope |
| gold | `#B8954A` | eyebrows on dark, active tab underline, rules |
| gold-bright | `#DDBE72` | wordmark, active nav text on dark |
| gold-dim | `#80683A` | composite/benchmark dashed line, ornaments on light |
| sea-glass | `#5FA39A` | accent (market-open glow, focus ring on dark, info) |
| link (on light) | `#2F6F68` | links, info pills text |
| paper | `#E6E3D9` | page background |
| sheet | `#F8F6F0` | panels / tables |
| sheet-alt | `#EFECE3` | table header, zebra, segmented track |
| rule | `#D9D4C6` | hairlines |
| rule-strong | `#BFB8A6` | control borders, header underline |
| ink | `#161816` | primary text |
| ink-2 | `#454A45` | secondary text |
| ink-3 | `#666B63` | muted text (≥4.5:1 on sheet) |
| on-chrome | `#E4E8E2` | text on chrome |
| on-chrome-2 | `#9FB0A8` | muted text on chrome |
| gain | `#1B7150` (bg `#DFEEE6`) | up, Buy |
| loss | `#A63A2B` (bg `#F3E0DB`) | down, Sell |
| gain-on-chrome | `#7FD3B0` | up on dark strips |
| loss-on-chrome | `#EE9A89` | down on dark strips |
| seal | `#8E1F1A` | wax-seal ornament ONLY (never data) |

Crest roundel fills by sector (text `#F8F6F0`, 2px inner ring `rgba(221,190,114,.85)`). Five sectors,
and only five — the list is `SECTOR_COLORS` in `web/src/lib/sector.ts`:
Shipping & Salvage `#2F6F68` · Treasure Banking `#6F5A2E` · Cartography & Navigation `#4C5B40` ·
Naval Arms `#7A3328` · Provisions & Spice `#7A5A2E`.
A sector fund's crest takes the fill of the sector it tracks; the broad fund (FLEET) tracks no one
sector, so it takes the crew hull `#232A26`.

## 3. Type

- Wordmark only: **Cinzel Decorative 700** (never wraps: `white-space:nowrap`, 22–24px in header).
- Eyebrows / panel titles / tab captions: **Cormorant SC 700**, 13–14px, letter-spacing .12em,
  color ink-2 on light, gold on dark. Max ~4 words. NEVER numbers.
- Page H1 (optional, ≤1 per screen, ≥28px): Cormorant SC 700 or Cinzel Decorative.
- Everything else: **IBM Plex Sans** 400/500/600/700 with
  `font-variant-numeric: tabular-nums lining-nums`. Tickers/order ids may use **IBM Plex Mono** 500.
- Google Fonts link (helmet):
  `https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cormorant+SC:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap`
- Sizes: total account value 32px/600; KPI 20–24px; table 14px (13px compact); secondary 12px.

## 4. Data conventions

- Currency: Doubloons, symbol **Ð**, 2 decimals, thousands separators; true minus `−` (U+2212).
- Signed changes use THREE channels: sign + small SVG triangle (▲/▼ drawn as SVG, 8px) + color.
  Unchanged: `0.00%` in ink-3, no arrow.
- Right-align numeric columns AND headers; same decimals per column; "—" for no data.
- "Today's" is replaced by **Session** (sessions scale with game length); "Total" = since start.
- Chart range tabs derive from game length (`rangeTabs()` in `shared/src/clock.ts`); 30-minute game: `1M 5M 15M All`.
- Baseline charts: dashed line at starting capital / reference price.
- Company crest = 2-letter monogram roundel, never emoji.
- Icons: stroke SVG on a 24px grid, 1.5px stroke, always paired with text in nav.

## 5. Voice

80% plain brokerage English, 20% pirate flavor. Labels, buttons, column headers, errors,
confirmations: plain finance terms ("Buy", "Sell", "Cash available to trade", "Preview order").
Flavor only in subtitles, empty states, loading, toast tails, ceremonies:
"Market open · Sails up", "Trading paused · Becalmed", "Game ended · Anchors dropped",
"Order filled: Bought 50 KRKN at Ð84.12 (Ð4,206.00). Fair winds."

## 6. Information architecture

Global header: wordmark · nav (Summary, Positions, Trade, Markets, Research, Dispatches,
Standings) · symbol search · market status pill with countdown · cash chip · crew menu.
Index strip under it: Pirate Composite + sector indices + "Tick N of M · as of hh:mm:ss".
Host (admin) has its own nav: Control, Crews, Market, News desk, Trade tape, Audit.
Mobile (<600px): bottom bar with 5 items (Summary, Markets, Trade [center, emphasized],
Dispatches, Standings), header keeps cash chip.

## 7. Shared sample data (use EXACTLY these numbers so screens agree) — rebuilt 2026-09-16

Rebuilt for the 2026-09-16 simplification: starting cash Ð250,000, 15 companies in 5 sectors of
three, and 3 tradeable funds. Every figure below is arithmetic on the ones above it — positions sum
to the invested total, cash plus invested is the account value, and each percentage is recomputed
from its own pair. Change one number here and you must redo the sums.

Game: 30-minute voyage, 5s ticks, tick 86 of 360 (session 2 of 8), **22:50 left**, as of 14:02:30.
(Host game lengths are 10/15/20/30 minutes; `deriveClock` puts every one of them on the 5-second
tick floor, so 30 minutes = 360 ticks and 8 sessions of 45 ticks.)
Starting chest Ð250,000.00 (`DEFAULT_STARTING_CAPITAL`). Fee 0.10% (10 bps). Position limit 50%
(host default; the other choices are off / 35% / 25%).
Pirate Composite 1,048.62 · session +8.71 (+0.84%) · since the game started +4.86% (base 1,000.00).
The market-open dot is sea-glass `#5FA39A` on every screen. Percentages round half-up to 2 decimals.

Crew **Saltwind Traders** (initials SW), rank 3 of 14. (The earlier sample name used a film ship's name; do not use it.)
Total account value Ð271,049.55 · Session +Ð1,919.80 (+0.71%) · Total +Ð21,049.55 (+8.42%) · vs Pirate Composite +3.56 pts.
Cash available to trade Ð56,446.55 (20.8%) · Invested Ð214,603.00 (79.2%).
Unrealized gain Ð18,601.20 · Realized gain (after fees) Ð2,448.35 · Fees paid Ð398.62 · 19 trades.
(Total gain = unrealized + realized: Ð18,601.20 + Ð2,448.35 = Ð21,049.55. Session % is measured
against the value at the session open, Ð271,049.55 − Ð1,919.80 = Ð269,129.75.)

Positions (qty · avg cost · last · session change/share → value · session gain · total gain):
KRKN Kraken Shipping Lines (Shipping & Salvage) 750 · 73.50 · 84.12 · +1.90 (+2.31%) → Ð63,090.00 · +Ð1,425.00 · +Ð7,965.00 (+14.45%)
PRYL Port Royal Banking (Treasure Banking) 200 · 184.00 · 212.40 · +1.85 (+0.88%) → Ð42,480.00 · +Ð370.00 · +Ð5,680.00 (+15.43%)
CMPS Compass Rose Navigation (Cartography & Navigation) 300 · 104.75 · 112.05 · −0.74 (−0.66%) → Ð33,615.00 · −Ð222.00 · +Ð2,190.00 (+6.97%)
MRED Mary Read Munitions (Naval Arms) 500 · 58.00 · 64.30 · +1.26 (+2.00%) → Ð32,150.00 · +Ð630.00 · +Ð3,150.00 (+10.86%)
BBRD Blackbeard Incorporated (Naval Arms) 60 · 310.73 · 318.40 · −1.12 (−0.35%) → Ð19,104.00 · −Ð67.20 · +Ð460.20 (+2.47%)
CJST Calico Jack Spice Traders (Provisions & Spice) 400 · 39.00 · 41.18 · −0.22 (−0.53%) → Ð16,472.00 · −Ð88.00 · +Ð872.00 (+5.59%)
FDUT Flying Dutchman Freight (Shipping & Salvage) 80 · 117.60 · 96.15 · −1.60 (−1.64%) → Ð7,692.00 · −Ð128.00 · −Ð1,716.00 (−18.24%)
Sums: value Ð214,603.00 · cost basis Ð196,001.80 · session +Ð1,919.80 · unrealized +Ð18,601.20.
FDUT is the loss-making position: it is the only one whose last price is below its average cost.
Share of account (value ÷ Ð271,049.55): KRKN 23.3% · PRYL 15.7% · CMPS 12.4% · MRED 11.9% ·
BBRD 7.0% · CJST 6.1% · FDUT 2.8% · Cash 20.8%.

Funds (all three open at Ð100.00 — `FUND_OPEN_PRICE` — and a fund's price is only what it holds):
FLEET Grand Fleet Fund (all 15, equal) Ð103.60 · session +Ð0.94 (+0.92%) ·
SHIPS Shipping Lanes Fund (KRKN, FDUT, LVTH) Ð106.20 · session +Ð1.80 (+1.72%) — the average of
+2.31%, −1.64% and +4.49% ·
ARMS Powder and Shot Fund (BBRD, MRED, CNBR) Ð108.30 · session +Ð2.73 (+2.59%).
A fund's session change is the value-weighted average of its holdings' session changes; the weights
are equal at the opening bell and drift only as the holdings drift apart, so these figures are the
plain averages of the member changes below. FLEET is exempt from the position limit; SHIPS and ARMS
are not.

Order-ticket samples (linear impact on KRKN is below 0.01%, so estimated price stays Ð84.12):
- Buy 200 KRKN: value Ð16,824.00 · fee Ð16.82 · total Ð16,840.82 · cash after Ð39,605.73 · 950 sh · 29.5% of account · avg cost Ð75.74.
- Filled immediately at Ð84.12 (orders fill right away at the current price plus a tiny impact): value Ð16,824.00 · fee Ð16.82 · total Ð16,840.82 · cash after Ð39,605.73 · order # BX-7Q2F9K · tick 86.
- Buy 1,000 KRKN: total Ð84,204.12 → "This order is Ð27,757.57 more than your cash available to trade (Ð56,446.55)" · fix "Use max (670 shares)".
- Position limit example (host limit 25%): buy 200 KRKN → "This would put more than 25% of your account in KRKN. You can buy up to 55 more shares." (25% of Ð271,049.55 is Ð67,762.39; the position is Ð63,090.00; Ð4,672.39 ÷ Ð84.12 = 55.)
- Mobile Ð5,000 of KRKN: ≈ 59 shares · Ð31.96 stays as cash · value Ð4,963.08 · fee Ð4.96 · total Ð4,968.04 · cash after Ð51,478.51.

Other quotes (these eight plus the seven held above are the whole 15-company roster, once each):
CNBR Cannonbright Foundries Ð102.66 +6.12% · LVTH Leviathan Logistics Ð57.03 +4.49% ·
GLGD Galleon Goods Co. Ð58.90 −0.72% · ABON Anne Bonny Cartography Ð446.19 +0.12% ·
SPYG Spyglass Instruments Ð63.40 +0.96% · KIDD Kidd Treasure Trust Ð188.90 −0.21% ·
MRGN Henry Morgan Capital Ð267.35 +0.77% · BRTH Bartholomew Provisions Ð49.60 +0.30%.
(Every percentage here is reachable from a whole-cent session-open price: Ð57.03 after Ð54.58 is
+4.49%, not +4.48%, and Ð49.60 after Ð49.45 is +0.30%, not +0.31%. Prices are integer cents in the
engine, so a quote and its change must both round out of the same pair.)

Sector indexes (base 1,000.00, **cap-weighted** by `compositeValue`, so a sector index is NOT the
average of its three companies' changes — only its direction has to agree with them):
Shipping & Salvage 1,062.40 session +1.86% · Naval Arms 1,055.20 session +1.28% ·
Treasure Banking 1,041.80 session +0.54% · Cartography & Navigation 1,036.90 session +0.21% ·
Provisions & Spice 1,022.50 session −0.40%.

KRKN detail: prev session open Ð82.22; session range Ð81.90–Ð84.60; 52-wk Ð58.40–Ð91.20;
market cap Ð20.36B; shares out 242.0M; float 201.3M; P/E 17.8; fwd P/E 15.9; EPS Ð4.73;
div yield 1.9%; payout 34%; volume 184,200; analyst: Buy, target Ð96.00 (+14.1%).
Revenue FY22–FY25: 6.61B, 7.18B, 7.74B, 8.14B · net income 0.94B, 1.03B, 1.09B, 1.14B ·
net margin 14.0% · ROE 18.2% · debt/equity 0.62 · current ratio 1.84 · FCF Ð0.96B.
(EPS Ð4.73 with P/E 17.8 is the self-consistent pair — they imply net income near Ð1.144B, which
rounds to the 1.14B above. COPY §3 `example-company` carries the same pair and the same note.)

Dispatches (a 30-minute game runs news minutes apart, not hours):
14:01 Earnings CNBR "Cannonbright Foundries posts blowout quarterly doubloons" (+6.12% since) ·
14:00 Storm FDUT "Flying Dutchman Freight loses two ships to a gale off Nassau" (−1.64%) ·
13:59 Macro "Crown lifts tariffs across the Spanish Main" (9 companies, Composite +0.61%) ·
13:58 Merger LVTH "Leviathan Logistics agrees to buy a rival fleet at a premium" (+4.49%) ·
13:57 Regulatory CMPS "Compass Rose Navigation fined for selling uncertified charts" (−0.66%).

Standings (total value · return · session): 1 Queen Anne's Revenue Ð280,204.10 +12.08% +0.94% ·
2 Tortuga Capital Ð274,425.00 +9.77% +1.40% · 3 Saltwind Traders Ð271,049.55 +8.42% +0.71% ·
4 The Salty Ledger Ð262,752.33 +5.10% −0.20% · 5 Doubloon Dynasty Ð246,650.00 −1.34% −0.85% ·
6 Kraken Kapital Ð244,850.75 −2.06% +0.33% · 7 Compass & Coin Ð240,275.40 −3.89% −1.02% (14 crews total).
Every return above is that crew's value measured against the same Ð250,000.00 starting chest.

## 8. Canvas format rules (for .dc.html artboards)

Follow the shape of `canvas/Main.dc.html` exactly: `<!doctype html>`, head with
`<meta charset="utf-8">` and `<script src="./support.js"></script>` (keep verbatim),
body → `<x-dc>` → `<helmet>` (font link + `<style>`) → one fixed-size root `<div>` → `</x-dc>`.
Static artboards need NO `<script data-dc-script>`. Canonical HTML: close every non-void
element, quote every attribute, `&amp;` in URLs. Lay out with flex/grid + `gap`. No emoji
or dingbat glyph icons — inline SVG. Define `a`/`a:hover` colors. Root width must equal
the artboard width; set an explicit background.

Render check (must pass before finishing):
```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --window-size=<W>,<H> --virtual-time-budget=4000 \
  --screenshot=<scratch>/<Name>.png "file://<abs path>/<Name>.dc.html"
```
Then Read the PNG and fix: wrapping headers/chips, overflowing tables, clipped content,
overlaps, anything unreadable.

## 9. Beginner-first comprehension (user requirement, 2026-09-14)

Most players have never traded. Every screen must let a newcomer analyze a company from
basic fundamentals **without outside help**. Chosen approach: **Explain + compare**. The game
explains and gives context; it never issues a verdict or reveals the hidden quality score.

1. **Plain label first, finance term second.** "Profit margin (net margin)", "Company size
   (market cap)", "Price vs. profit (P/E)", "Debt vs. owner equity (debt-to-equity)",
   "Short-term bill coverage (current ratio)", "Cash left after investing (free cash flow)",
   "Sales (revenue)", "Profit (net income)", "Swings vs. the market (beta)".
2. **Every metric has an InfoTip** (a "?" button; it opens on hover, focus or tap) with three
   lines: *What it is* (one sentence), *Why it matters* (one sentence), *Usually a good sign
   when…* (one hedged sentence ending with a caution, e.g. "…but a very low P/E can mean
   investors expect trouble").
3. **Explain + compare rows** in research and key stats. Each row shows the value, a sentence
   in everyday numbers ("You pay Ð17.80 for every Ð1 of yearly profit") and the **comparison
   with its peers** beside it ("Rest of Shipping & Salvage: Ð22.10"). The company you are reading
   is never counted in that number — with three companies per sector a median that included it
   landed on the company itself for a third of all stats. Use the rest of the market when the
   sector has fewer than 3 companies, or when no peer has the number. There are no good/bad badges and no color judgments on these rows;
   gain/loss color stays reserved for price changes.
4. **Learn guide** (`/learn`, nav item "Learn"):
   - how the game works (starting cash, ticks, sessions, news, fees, position limit, and that
     healthier companies tend to do better over time but luck and news matter)
   - "Read a company in 5 questions" (Is it making money? Is it growing? Can it handle its debts?
     Is the price reasonable for its profits? What is the news saying?), each pointing to the
     exact metrics and where they are on screen
   - trading basics (market order, fee, price impact, average cost, gains, diversification)
   - a searchable glossary using the same text as the InfoTips
5. **First-login walkthrough:** a 3-step dismissible card (Research a company → Place a
   practice-sized order → Track it on Summary) with a link to Learn. The walkthrough can be
   reopened from the crew menu.
6. **Default views are "Basics":** the research screener's default view shows Price, Session
   change, Company size, Sales growth, Profit margin, Price vs. profit, Debt vs. equity. Advanced
   views (Valuation, Financial health, Analysts) are one click away.
7. **Numbers in words where it helps:** compact "Ð8.1B in sales" alongside tables, and
   percent-of-account phrasing in the ticket ("This order would be 27% of your account").
8. **Order ticket explains itself:** one-line explanations for Fee ("0.10% charged on every
   trade"), Price impact ("Big orders nudge the price against you"), Market order ("Buys now at
   about the current price") and Position limit.
9. **News explains itself:** each dispatch has a "What this means" line in plain words
   ("Earnings beat forecasts: the company made more profit than expected") and shows how the
   price moved since the report. It never says whether to buy.
10. **Reading level:** short sentences, grade 8–9 vocabulary, no unexplained acronyms. The first
    use of any acronym on a screen has an InfoTip.
