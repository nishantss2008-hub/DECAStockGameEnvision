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

**Audience rule:** high-school DECA students. No alcohol references anywhere (the roster was renamed on 2026-09-14: Calico Jack Spice Traders, Galleon Goods Co., Tortuga Harbor Inns, sector Provisions & Spice), no gore, no
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

Crest roundel fills by sector (text `#F8F6F0`, 2px inner ring `rgba(221,190,114,.85)`):
Shipping & Salvage `#2F6F68` · Treasure Banking `#6F5A2E` · Maps/Cartography/Instruments
`#4C5B40` · Naval Arms `#7A3328` · Cursed Relics `#3F3F52` · Hospitality `#5B4A63` ·
Provisions & Spice `#7A5A2E` · Parrot & Livestock `#4E6B3A` · Letters of Marque `#3E5566`.

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
- Chart range tabs derive from game length; 48h game: `1H 6H 24H All`.
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

## 7. Shared sample data (use EXACTLY these numbers so screens agree) — corrected 2026-09-14

Game: 48h voyage, 30s ticks, tick 1,284 of 5,760 (session 2 of 8), **37:17:42 left**, as of 14:02:30.
Starting chest Ð1,000,000.00. Fee 0.10% (10 bps). Position limit 50% (host setting).
Pirate Composite 1,048.62 · session +8.71 (+0.84%) · since the game started +4.86% (base 1,000.00).
The market-open dot is sea-glass `#5FA39A` on every screen. Percentages round half-up to 2 decimals.

Crew **Saltwind Traders** (initials SW), rank 3 of 14. (The earlier sample name used a film ship's name; do not use it.)
Total account value Ð1,084,219.55 · Session +Ð8,510.00 (+0.79%) · Total +Ð84,219.55 (+8.42%) · vs Pirate Composite +3.56 pts.
Cash available to trade Ð248,349.55 (22.9%) · Invested Ð835,870.00 (77.1%).
Unrealized gain Ð74,170.00 · Realized gain (after fees) Ð10,049.55 · Fees paid Ð1,240.33 · 23 trades.

Positions (qty · avg cost · last · session change/share → value · session gain · total gain):
KRKN Kraken Shipping Lines (Shipping & Salvage) 3,000 · 73.50 · 84.12 · +1.90 (+2.31%) → Ð252,360.00 · +Ð5,700.00 · +Ð31,860.00 (+14.45%)
PRYL Port Royal Banking (Treasure Banking) 800 · 184.00 · 212.40 · +1.85 (+0.88%) → Ð169,920.00 · +Ð1,480.00 · +Ð22,720.00 (+15.43%)
ASTR Astrolabe Analytics (Maps & Instruments) 1,000 · 137.00 · 146.55 · +0.60 (+0.41%) → Ð146,550.00 · +Ð600.00 · +Ð9,550.00 (+6.97%)
MRED Mary Read Munitions (Naval Arms) 2,000 · 58.00 · 64.30 · +1.26 (+2.00%) → Ð128,600.00 · +Ð2,520.00 · +Ð12,600.00 (+10.86%)
CJST Calico Jack Spice Traders (Provisions & Spice) 1,500 · 39.00 · 41.18 · −0.22 (−0.53%) → Ð61,770.00 · −Ð330.00 · +Ð3,270.00 (+5.59%)
SALT Saltbeard Shipping (Shipping & Salvage) 2,500 · 17.80 · 18.24 · −0.14 (−0.76%) → Ð45,600.00 · −Ð350.00 · +Ð1,100.00 (+2.47%)
CRSD Cursed Doubloon Relics (Cursed Relics) 1,000 · 38.00 · 31.07 · −1.11 (−3.46%) → Ð31,070.00 · −Ð1,110.00 · −Ð6,930.00 (−18.24%)
Sums: value Ð835,870.00 · session +Ð8,510.00 · unrealized +Ð74,170.00. Cursed Relics sector index = CRSD = −3.46%.

Order-ticket samples (linear impact on KRKN is below 0.01%, so estimated price stays Ð84.12):
- Buy 500 KRKN: value Ð42,060.00 · fee Ð42.06 · total Ð42,102.06 · cash after Ð206,247.49 · 3,500 sh · 27.2% of account · avg cost Ð75.02.
- Filled immediately at Ð84.12 (orders fill right away at the current price plus a tiny impact): value Ð42,060.00 · fee Ð42.06 · total Ð42,102.06 · cash after Ð206,247.49 · order # BX-7Q2F9K · tick 1,284.
- Buy 4,000 KRKN: total Ð336,816.48 → "This order is Ð88,466.93 more than your cash available to trade (Ð248,349.55)" · fix "Use max (2,949 shares)".
- Position limit example (host limit 25%): buy 500 KRKN → "This would put more than 25% of your account in KRKN. You can buy up to 222 more shares."
- Mobile Ð5,000 of KRKN: ≈ 59 shares · Ð31.96 stays as cash · value Ð4,963.08 · fee Ð4.96 · total Ð4,968.04 · cash after Ð243,381.51.

Other quotes: CNBR Cannonbright Foundries Ð102.66 +6.12% · LVTH Leviathan Logistics Ð57.03 +4.48% ·
GLGD Galleon Goods Co. Ð58.90 −0.73% · BBRD Blackbeard Incorporated Ð318.40 −0.35% ·
DJON Davy Jones Salvage Co. Ð44.70 +1.02% · FDUT Flying Dutchman Freight Ð96.15 −1.64% ·
ABON Anne Bonny Cartography Ð446.19 +0.12% · TRTG Tortuga Harbor Inns Ð27.55 −2.10% ·
LMAQ Letters of Marque Assurance Ð131.80 +0.54% · JLLY Jolly Roger Holdings Ð74.25 +1.37% ·
KIDD Kidd Treasure Trust Ð188.90 −0.21% · SPYG Spyglass Instruments Ð63.40 +0.95% ·
CMPS Compass Rose Navigation Ð112.05 −0.66% · PRRT Parrot & Plume Livestock Ð22.30 +3.05% ·
SIRN Siren Song Entertainment Ð39.95 −1.12% · MLSM Maelstrom Maritime Insurance Ð158.20 −2.44% ·
MRGN Henry Morgan Capital Ð267.35 +0.77% · BRTH Bartholomew Provisions Ð49.60 +0.31%.

KRKN detail: prev session open Ð82.22; session range Ð81.90–Ð84.60; 52-wk Ð58.40–Ð91.20;
market cap Ð20.36B; shares out 242.0M; float 201.3M; P/E 17.9; fwd P/E 15.9; EPS Ð4.71;
div yield 1.9%; payout 34%; volume 184,200; analyst: Buy, target Ð96.00 (+14.1%).
Revenue FY22–FY25: 6.61B, 7.18B, 7.74B, 8.14B · net income 0.94B, 1.03B, 1.09B, 1.14B ·
net margin 14.0% · ROE 18.2% · debt/equity 0.62 · current ratio 1.84 · FCF Ð0.96B.

Dispatches: 14:01 Earnings CNBR "Cannonbright Foundries posts blowout quarterly doubloons" (+6.12% since) ·
13:36 Storm CRSD "Cursed Doubloon Relics loses two ships to a gale off Nassau" (−3.46%) ·
12:48 Macro "Crown lifts tariffs across the Spanish Main" (11 companies, Composite +0.61%) ·
11:20 Merger LVTH "Leviathan Logistics agrees to buy a rival fleet at a premium" (+4.48%) ·
10:05 Regulatory MLSM "Maelstrom Maritime Insurance fined for mispriced policies" (−2.44%).

Standings (total value · return · session): 1 Queen Anne's Revenue Ð1,120,804.10 +12.08% +0.94% ·
2 Tortuga Capital Ð1,097,700.00 +9.77% +1.40% · 3 Saltwind Traders Ð1,084,219.55 +8.42% +0.79% ·
4 The Salty Ledger Ð1,051,002.33 +5.10% −0.20% · 5 Doubloon Dynasty Ð986,600.00 −1.34% −0.85% ·
6 Kraken Kapital Ð979,410.75 −2.06% +0.33% · 7 Compass & Coin Ð961,120.40 −3.89% −1.02% (14 crews total).

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
   in everyday numbers ("You pay Ð17.80 for every Ð1 of yearly profit") and the **sector
   average** beside it ("Sector average: Ð22.10"). Use the market average when the sector has
   fewer than 3 companies. There are no good/bad badges and no color judgments on these rows;
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
