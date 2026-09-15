# Buccaneer Exchange — Beginner Copy (COPY.md)

The single source of truth for every beginner-facing word in the game. The design mockups in
`docs/design/canvas/` and the React code both use it. `web/src/lib/glossary.ts` (and the other
copy maps named below) are generated from this file, so its structure is strict.

Companion documents: `docs/design/BRIEF.md` §5 Voice and §9 Beginner-first comprehension;
`docs/superpowers/specs/2026-09-14-buccaneer-exchange-v2-design.md` §3, §5, §6 and §10b.

---

## 0. How to read and parse this file

### 0.1 Parsing rules (for the generator)

- **Data lives only in fenced code blocks whose info string is `yaml <kind>`**, for example
  ` ```yaml glossary `. Parse every such block with a YAML parser and route it by `<kind>`.
  Everything outside those blocks is commentary for humans.
- **Plain-label tables** (section 1) are the only data outside YAML. A plain-label table is any
  Markdown table whose header row is exactly `| key | display | short | glossary |`.
- Block kinds and what they generate:

| kind | one block per | generates |
|---|---|---|
| `glossary` | term | `GLOSSARY` in `web/src/lib/glossary.ts` |
| `formats` | file (1) | number-format tokens used by `explain` |
| `example-company` | file (1) | worked-example data for tests and mockups |
| `explain` | MetricId | templates in `web/src/lib/compare.ts` (`explainMetric`) |
| `explain-extra` | file (1) | average line, analyst card, statement summaries, research helper |
| `news` | news type | `NEWS_EXPLAIN` in `web/src/lib/glossary.ts` |
| `news-extra` | file (1) | sentiment labels, badges, since-report label |
| `walkthrough` | file (1) | `Walkthrough.tsx` copy |
| `five-questions` | question | `FIVE_QUESTIONS` in `web/src/components/learn/fiveQuestions.ts` |
| `guide` | file (1) | `GameGuide.tsx` copy |
| `trading-basics` | topic | `TradingBasics.tsx` copy |
| `ticket` | file (1) | order ticket explanations, lines, buttons |
| `ticket-errors` | file (1) | error map keyed by error code |
| `reveal` | file (1) | `LABEL_COPY`, `PILLAR_COPY` and Results copy in `web/src/components/standings/reveal.ts` |
| `host-settings` | file (1) | host console copy |
| `host-errors` | file (1) | host console error map keyed by error code (the server sends `message`) |
| `states` | file (1) | empty, loading, error and phase states |

### 0.2 Placeholders

- `{name}` is filled in by code. Placeholders count as one word for length limits.
- Common placeholders: `{symbol}` currency symbol · `{ticker}` 4-letter symbol · `{name}` company
  name · `{qty}` share count · `{price}` `{total}` `{cash}` money · `{pct}` percent ·
  `{feePct}` fee as a percent ("0.10%") · `{limitPct}` position limit as a percent ("50%") ·
  `{startingCash}` money · `{tickSeconds}` seconds between price updates · `{query}` search text.
- `explain` templates add `{value}` and `{money}`; each block says which format fills them.

### 0.3 Currency

Copy is written with the default currency: the symbol **Ð** and the word **doubloons**. The host
can rename the currency. Code must then replace the literal `Ð` and the word `doubloons` /
`Doubloons` at render time. `explain` templates use `{symbol}` so `explainMetric` can take the
symbol as an argument.

### 0.4 Glossary field rules

- `label` is the plain label and `term` is the finance term, spelled out. The InfoTip title and the
  Learn glossary show `label (term)`. On-screen metric names, column headers and chips use the
  section 1 `display` and `short` text instead, which may use the short form of a term ("EPS").
- `label` and `term` are always longer than 8 characters (checked by `glossary.test.ts`).
- `whatItIs` and `whyItMatters` are full sentences.
- `usuallyGoodWhen` is stored **without** its lead-in. The InfoTip renders
  `Usually a good sign when ` + the text. It starts in lowercase, and it always ends with a caution
  (a "but …" clause).
- `related` lists other glossary ids only.

### 0.5 Copy rules (every field in this file follows these)

1. Plain label first, finance term second.
2. Grade 8–9 reading level. Sentences have at most 25 words. No single field has more than 32 words.
   A rendered "Usually a good sign when …" sentence also stays within 25 words.
3. No unexplained acronyms. The glossary spells out every acronym the first time it is used.
4. No alcohol words (company names in the roster are data and may appear in examples).
   No film names or characters.
5. Light pirate flavor only in secondary copy, stored in fields named `flavor`. Never in labels,
   explanations or error messages.
6. Explain and compare only. Never say whether a company is good or bad, never tell players to
   buy or sell a company, and never reveal the hidden quality score or how it is weighted.
7. Numbers: true minus sign `−` (U+2212), thousands separators, `—` for no data, tabular figures.
   Every display string uses `−`. Only raw YAML numbers (for example `value: -0.035` in an
   example block) keep the ASCII hyphen, so a YAML parser reads them as numbers.
8. Game time uses **session** (1 of 8 per game) or **since the game began**, never calendar-day
   words.

### 0.6 Facts this copy relies on (from the spec)

- One whole game stands for about one business year, so "yearly" numbers match one game.
- Orders fill right away at about the last price, nudged by price impact, plus a fee (default 0.10%).
  If the price moves more than 2% between preview and placing, the order is sent back for review.
- News jumps are permanent and happen at the tick the news fires. "{pct} since the news" and the
  five-questions news lines include that jump, so `priceAtFire` must be the price from before the
  jump (the previous tick). If the engine stores the post-jump price, those lines overstate what
  they measure and must say "since the news moved the price".
- Dividends are shown as company data only. They are **not** paid into crews' cash.
- The final standings value holdings at the closing price, which leaves out order price nudges.
- Analyst price targets are set above the price on average, so they tend to run high.
- Price impact depends on a company's total shares and its beta, not on this session's volume or
  the float. Orders from every crew in the same price update combine: buys push the price up, sells
  push it down, and the two offset each other. The nudge then fades over time (half-life 5% of the
  game), so a price pushed by crew orders drifts back. For a big company like KRKN (242 million
  shares) a crew-sized order moves the price by less than 0.01%.
- Session volume counts only shares traded by crews (the engine drains it from the order-flow
  book). There is no background trading, so volume shows crew activity, not outside investors.
- The stored `Fundamentals` valuation fields (company size, P/E, forward P/E, P/S, P/B, EV/EBITDA,
  dividend yield) are computed once, at the starting price, and nothing updates them. The explain
  sentences say "you pay" and "at the current price", so `metricValue` must recompute them from
  `Company.currentPrice` (company size, P/E, forward P/E, P/S and P/B scale by currentPrice ÷
  startPrice, dividend yield divides by it, EV/EBITDA uses live company size + totalDebt − cash
  over ebitda), and sector averages must use the recomputed values. BRIEF §7 already does this
  (P/E 17.8 = Ð84.12 ÷ Ð4.73).
  The hidden score's price pillar uses the starting values (spec §3, "at the opening bell").
- Average cost leaves out fees. Realized gain on a sale = sale amount − average cost × shares − the
  sale's fee (plan, trading task). Buy fees count only in fees paid.
- Reveal: `expectedReturn` already includes each company's hidden surprise
  (`shared/src/types.ts`, `QS·qEff + beta·mktDrift`), so "luck" is news, market swings and chance.
  Labels come from the signs of `q` (health) and `luck`.
- The server answers `market_closed` whenever the phase is not live. The ticket picks the lobby,
  paused or ended error copy by reading the game phase.
- Worked examples follow BRIEF §7. Where BRIEF leaves out KRKN's tiny price impact, the copy
  does too, and says so.

---

## 1. PLAIN LABELS

`display` is the full label, "plain label (finance term)". `short` is for narrow column headers
and chips. `glossary` is the InfoTip term id, or `—` when no InfoTip is needed.

### 1.1 Company and quote (`Company` fields)

| key | display | short | glossary |
|---|---|---|---|
| company.ticker | Symbol (ticker) | Symbol | ticker |
| company.name | Company | Company | stock |
| company.sector | Industry group (sector) | Sector | sector |
| company.description | About the business | About | — |
| company.currentPrice | Price (last price) | Price | price |
| company.sessionChange | Change this session (session change) | Session change | sessionChange |
| company.voyageChange | Change since the game began (total change) | Total change | voyageChange |
| company.startPrice | Price when the game began (starting price) | Start price | voyageChange |
| company.sessionOpen | Price when this session began (session open) | Session open | session |
| company.sessionRange | Session high and low (session range) | Session range | sessionRange |
| company.sessionHigh | Highest price this session (session high) | Session high | sessionRange |
| company.sessionLow | Lowest price this session (session low) | Session low | sessionRange |
| company.voyageRange | Game high and low (game range) | Game range | voyageRange |
| company.voyageHigh | Highest price this game (game high) | Game high | voyageRange |
| company.voyageLow | Lowest price this game (game low) | Game low | voyageRange |
| company.marketCap | Company size (market cap) | Company size | marketCap |
| company.sharesOutstanding | Shares that exist (shares outstanding) | Shares | sharesOutstanding |
| company.beta | Swings vs. the market (beta) | Swings vs. market | beta |
| company.sessionVolume | Shares traded this session (volume) | Volume | volume |

### 1.2 Company research (`Fundamentals` fields)

| key | display | short | glossary |
|---|---|---|---|
| fundamentals.marketCap | Company size (market cap) | Company size | marketCap |
| fundamentals.sharesOutstanding | Shares that exist (shares outstanding) | Shares | sharesOutstanding |
| fundamentals.float | Shares available to trade (float) | Float | float |
| fundamentals.week52Range | Past-year high and low (52-week range) | Past-year range | week52Range |
| fundamentals.week52High | Past-year high (52-week high) | Past-year high | week52Range |
| fundamentals.week52Low | Past-year low (52-week low) | Past-year low | week52Range |
| fundamentals.peRatio | Price vs. profit (P/E) | Price vs. profit | peRatio |
| fundamentals.forwardPe | Price vs. next year's profit (forward P/E) | Price vs. future profit | forwardPe |
| fundamentals.psRatio | Price vs. sales (P/S) | Price vs. sales | psRatio |
| fundamentals.pbRatio | Price vs. owner equity (P/B) | Price vs. equity | pbRatio |
| fundamentals.evToEbitda | Business price vs. core profit (EV/EBITDA) | Price vs. core profit | evToEbitda |
| fundamentals.dividendYield | Yearly payout to owners (dividend yield) | Dividend yield | dividendYield |
| fundamentals.payoutRatio | Share of profit paid out (payout ratio) | Payout ratio | payoutRatio |
| fundamentals.revenue | Sales (revenue) | Sales | revenue |
| fundamentals.revenueGrowth | Sales growth per year, last 3 years (revenue growth) | Sales growth | revenueGrowth |
| fundamentals.costOfRevenue | Direct costs (cost of revenue) | Direct costs | costOfRevenue |
| fundamentals.grossProfit | Profit after direct costs (gross profit) | Gross profit | grossProfit |
| fundamentals.operatingIncome | Profit from operations (operating income) | Operating profit | operatingIncome |
| fundamentals.netIncome | Profit (net income) | Profit | netIncome |
| fundamentals.eps | Profit per share (EPS) | Profit per share | eps |
| fundamentals.ebitda | Core profit (EBITDA) | Core profit | ebitda |
| fundamentals.grossMargin | Sales kept after direct costs (gross margin) | Gross margin | grossMargin |
| fundamentals.operatingMargin | Sales kept after running costs (operating margin) | Operating margin | operatingMargin |
| fundamentals.netMargin | Profit margin (net margin) | Profit margin | netMargin |
| fundamentals.cash | Cash on hand (cash) | Cash | cash |
| fundamentals.totalAssets | Everything it owns (total assets) | Total assets | totalAssets |
| fundamentals.totalDebt | Borrowed money (total debt) | Debt | totalDebt |
| fundamentals.totalLiabilities | Everything it owes (total liabilities) | Total owed | totalLiabilities |
| fundamentals.equity | Owner equity (shareholders' equity) | Owner equity | equity |
| fundamentals.currentRatio | Short-term bill coverage (current ratio) | Bill coverage | currentRatio |
| fundamentals.debtToEquity | Debt vs. owner equity (debt-to-equity) | Debt vs. equity | debtToEquity |
| fundamentals.operatingCashFlow | Cash from running the business (operating cash flow) | Operating cash | operatingCashFlow |
| fundamentals.capex | Spending on equipment and buildings (capital spending) | Capital spending | capex |
| fundamentals.freeCashFlow | Cash left after investing (free cash flow) | Free cash flow | freeCashFlow |
| fundamentals.roe | Return on owner equity (ROE) | Return on equity | roe |
| fundamentals.roa | Profit from what it owns (ROA) | Return on assets | roa |
| fundamentals.beta | Swings vs. the market (beta) | Swings vs. market | beta |
| fundamentals.businessOverview | About the business (business overview) | About | — |
| fundamentals.management | Leaders (management) | Leaders | — |
| fundamentals.management.name | Name | Name | — |
| fundamentals.management.role | Job title (role) | Job | — |
| fundamentals.management.bio | Background (biography) | Background | — |
| fundamentals.management.tenureYears | Years in the job (tenure) | Years | — |
| fundamentals.industry | Industry (industry analysis) | Industry | sector |
| fundamentals.industry.sector | Industry group (sector) | Sector | sector |
| fundamentals.industry.tam | Total market size (TAM) | Market size | tam |
| fundamentals.industry.growthRate | Industry growth per year (industry growth rate) | Industry growth | industryGrowth |
| fundamentals.industry.competitivePosition | Place among rivals (competitive position) | Position | — |
| fundamentals.industry.notes | Industry notes | Notes | — |
| fundamentals.marketingStrategy | How it wins customers (marketing strategy) | Marketing | — |
| fundamentals.riskFactors | What could go wrong (risk factors) | Risks | — |
| fundamentals.recentDevelopments | Recent changes (recent developments) | Recent changes | news |
| fundamentals.analyst.rating | Analyst view (analyst rating) | Analyst view | analystRating |
| fundamentals.analyst.priceTarget | Analyst price guess (price target) | Price target | priceTarget |
| fundamentals.history | Last 4 years (financial history) | 4-year history | revenueGrowth |
| fundamentals.history.period | Business year (fiscal year) | Year | — |
| fundamentals.history.revenue | Sales (revenue) | Sales | revenue |
| fundamentals.history.netIncome | Profit (net income) | Profit | netIncome |
| fundamentals.history.eps | Profit per share (EPS) | Profit per share | eps |
| statements.yearChange | Change from last year (year over year) | vs. last year | — |
| statements.fourYearChange | Change from the first year shown to the last | First to last year | — |
| statements.pointsChange | Change in percentage points (points) | Change (points) | — |

Rendering notes for statements: show the period `FY2025` as **Year 2025**, never as "FY2025".
Write "pts" out as "points" on first use in a table caption ("+0.3 points means the margin rose from
13.7% to 14.0%").

### 1.3 Portfolio, positions and activity

| key | display | short | glossary |
|---|---|---|---|
| portfolio.accountValue | Account value (total account value) | Account value | accountValue |
| portfolio.cashAvailable | Cash available to trade (buying power) | Cash | cashAvailable |
| portfolio.invested | Invested (market value of holdings) | Invested | invested |
| portfolio.sessionChange | Change this session (session change) | Session change | sessionChange |
| portfolio.totalGain | Total gain/loss (total return) | Total gain/loss | totalGain |
| portfolio.startingCash | Starting cash (starting capital) | Starting cash | startingCash |
| portfolio.realizedGain | Locked-in gain/loss (realized gain) | Realized | realizedGain |
| portfolio.unrealizedGain | Paper gain/loss (unrealized gain) | Unrealized | unrealizedGain |
| portfolio.feesPaid | Fees paid (commissions) | Fees paid | feesPaid |
| portfolio.tradeCount | Trades made (trade count) | Trades | — |
| portfolio.cashPct | Share of account in cash (% cash) | % cash | pctOfAccount |
| portfolio.rank | Rank | Rank | accountValue |
| portfolio.researchGrade | Research grade | Grade | researchGrade |
| position.shares | Shares owned (quantity) | Shares | stock |
| position.avgCost | Average price paid (average cost) | Avg. price paid | avgCost |
| position.lastPrice | Price (last price) | Price | price |
| position.costBasis | Total paid (cost basis) | Cost basis | costBasis |
| position.value | Current value (market value) | Value | invested |
| position.sessionGain | Change this session (session gain/loss) | Session change | sessionChange |
| position.totalGain | Total gain/loss (since you bought) | Total gain/loss | totalGain |
| position.pctOfAccount | Share of account (% of account) | % of account | pctOfAccount |
| activity.executedAt | Time of trade | Time | — |
| activity.tick | Price update number (tick) | Tick | tick |
| activity.orderId | Order number | Order # | — |
| activity.side | Action (buy or sell) | Action | marketOrder |
| activity.quantity | Shares (quantity) | Shares | — |
| activity.fillPrice | Price per share paid or received (fill price) | Fill price | marketOrder |
| activity.impactBps | Price nudge (price impact) | Impact | priceImpact |
| activity.notional | Order value | Value | — |
| activity.fee | Fee (commission) | Fee | fee |
| activity.net | Cash in or out (net amount) | Net | — |
| activity.cashAfter | Cash after | Cash after | cashAvailable |
| activity.realizedPnl | Locked-in gain/loss (realized gain) | Realized | realizedGain |
| activity.status | Status (filled or rejected) | Status | — |
| activity.reason | Why it was rejected (reason) | Reason | — |

### 1.4 Order ticket

| key | display | short | glossary |
|---|---|---|---|
| ticket.side | Action (buy or sell) | Action | marketOrder |
| ticket.symbol | Symbol (ticker) | Symbol | ticker |
| ticket.mode | Order by (shares or doubloons) | Order by | — |
| ticket.quantity | Number of shares (quantity) | Shares | — |
| ticket.amountBuy | Amount to spend (doubloons) | Amount | — |
| ticket.amountSell | Amount to sell (doubloons) | Amount | — |
| ticket.orderType | Order type (market order) | Type | marketOrder |
| ticket.estPrice | Estimated price per share (estimated fill price) | Est. price | price |
| ticket.estImpact | Price nudge from your order (price impact) | Price impact | priceImpact |
| ticket.estValue | Estimated order value | Order value | — |
| ticket.estFee | Estimated fee ({feePct}) | Fee | fee |
| ticket.estTotalBuy | Estimated total cost | Total cost | — |
| ticket.estTotalSell | Estimated cash you receive (net proceeds) | You receive | — |
| ticket.cashAvailable | Cash available to trade | Cash available | cashAvailable |
| ticket.cashAfter | Cash after this order | Cash after | cashAvailable |
| ticket.sharesOwned | Shares you own | Shares owned | — |
| ticket.sharesAfter | Shares after this order | Shares after | — |
| ticket.avgCostAfter | Average price paid after this order (average cost) | Avg. price after | avgCost |
| ticket.pctOfAccount | Share of account now (% of account) | % of account | pctOfAccount |
| ticket.pctOfAccountAfter | Share of account after this order | % after | pctOfAccount |
| ticket.maxBuy | Most shares you can buy (max) | Max | cashAvailable |
| ticket.positionLimit | Most in one company (position limit) | Limit | positionLimit |
| ticket.intervalLimit | Most shares per price update (interval limit) | Per-update limit | intervalLimit |

### 1.5 Markets, standings and header

| key | display | short | glossary |
|---|---|---|---|
| market.composite | Whole-market index (Pirate Composite) | Composite | index |
| market.sectorIndex | Industry group index (sector index) | Sector index | index |
| market.breadth | Rising vs. falling stocks (market breadth) | Breadth | breadth |
| market.advancers | Rising (advancers) | Rising | breadth |
| market.decliners | Falling (decliners) | Falling | breadth |
| market.unchanged | Unchanged | Unchanged | breadth |
| market.voyageHighs | At a new game high (new highs) | New highs | voyageRange |
| market.voyageLows | At a new game low (new lows) | New lows | voyageRange |
| market.sessionVolume | Shares traded this session (volume) | Volume | volume |
| header.tickStamp | Tick {tick} of {totalTicks} · as of {time} | Tick | tick |
| header.countdown | Time left | Left | session |
| standings.rank | Rank | Rank | accountValue |
| standings.movement | Rank change | Move | — |
| standings.crew | Crew | Crew | — |
| standings.totalValue | Account value | Value | accountValue |
| standings.returnPct | Total return (%) | Return | totalGain |
| standings.sessionChangePct | Change this session (%) | Session | sessionChange |
| standings.cashPct | Share of account in cash (% cash) | % cash | pctOfAccount |
| standings.holdings | Companies held | Holdings | diversification |
| standings.spark | Recent trend | Trend | — |

---

## 2. GLOSSARY

Groups: `basics` · `profit` · `growth` · `debt` · `value` · `trading` · `game`.
The 56 required ids come first, in the required order, then 17 supporting ids used by section 1.

### 2.1 Required terms

```yaml glossary
id: stock
group: basics
label: "Share of a company"
term: "shares of stock"
whatItIs: "A stock is a small piece of ownership in a company, sold as shares that people can buy and sell."
whyItMatters: "When the business does well, its shares usually become worth more, and when it struggles, they usually lose value."
usuallyGoodWhen: "the business behind the stock is healthy, but even strong companies can have falling prices for a while."
related: [price, marketCap, sector, ticker]
```

```yaml glossary
id: price
group: basics
label: "Share price"
term: "last price"
whatItIs: "The latest price of one share, set by the market and updated every tick."
whyItMatters: "It is about what you pay for each share if you buy now, or get if you sell, before fees and price impact."
usuallyGoodWhen: "profits grow along with the price, but a low share price does not make a stock a bargain."
related: [peRatio, marketCap, tick, priceImpact]
```

```yaml glossary
id: marketCap
group: basics
label: "Company size"
term: "market cap"
whatItIs: "The value of all of a company's shares added together: the share price times the number of shares."
whyItMatters: "Size puts other numbers in context: bigger companies usually have bigger sales and profits, so compare margins and growth too."
usuallyGoodWhen: "its size is backed by real profits, but being big does not protect a company from falling prices."
related: [price, sharesOutstanding, peRatio, psRatio]
```

```yaml glossary
id: sector
group: basics
label: "Industry group"
term: "market sector"
whatItIs: "A group of companies that do similar work, such as shipping or banking."
whyItMatters: "Comparing a company with others in its sector is fairer, because normal numbers differ a lot from one industry to another."
usuallyGoodWhen: "a company's numbers hold up well against its own sector, but a whole sector can rise or fall together."
related: [index, industryGrowth, diversification]
```

```yaml glossary
id: index
group: basics
label: "Market tracker"
term: "market index"
whatItIs: "One number that tracks the prices of many companies at once, like the Pirate Composite for the whole market."
whyItMatters: "It shows whether most prices are rising or falling, so you can tell if a move is about one company or everyone."
usuallyGoodWhen: "your account keeps pace with the index over time, but beating it for a short stretch can be pure luck."
related: [sector, beta, breadth]
```

```yaml glossary
id: volume
group: basics
label: "Shares traded this session"
term: "trading volume"
whatItIs: "The number of shares that crews traded during the current session."
whyItMatters: "A jump in volume shows which companies crews are busy trading, which often follows news."
usuallyGoodWhen: "you check the news behind a volume jump, but price moves caused by heavy crew trading fade over time."
related: [news, session, sessionChange]
```

```yaml glossary
id: beta
group: basics
label: "Swings vs. the market"
term: "market beta"
whatItIs: "A number that shows how much a stock tends to move when the whole market moves; 1.0 means about the same amount."
whyItMatters: "A beta above 1 means the stock tends to move more than the market when the market moves, up or down; below 1 means less."
usuallyGoodWhen: "it matches how many ups and downs you can handle, but a low beta does not protect against company news."
related: [index, diversification, news]
```

```yaml glossary
id: analystRating
group: basics
label: "Analyst view"
term: "analyst rating"
whatItIs: "The opinion of the game's analysts, from Strong Buy to Strong Sell, about where they think the price is heading."
whyItMatters: "It is a second opinion to weigh against your own research, but analysts in this game are often wrong."
usuallyGoodWhen: "the analyst view agrees with what the company's numbers show, but analysts give a hint, not a promise."
related: [priceTarget, news, peRatio]
```

```yaml glossary
id: priceTarget
group: basics
label: "Analyst price guess"
term: "price target"
whatItIs: "The price analysts expect the stock to reach over the next year; in this game, one full game counts as a year."
whyItMatters: "The gap between the target and the current price shows how much analysts think the price could rise or fall."
usuallyGoodWhen: "the target is further above the price than for similar companies, but targets here usually run high."
related: [analystRating, price]
```

```yaml glossary
id: voyageRange
group: basics
label: "Game high and low"
term: "game range"
whatItIs: "The highest and lowest prices the stock has reached since this game began."
whyItMatters: "It shows whether the current price is near the top or the bottom of its path so far."
usuallyGoodWhen: "the price holds near the high because the business keeps improving, but prices near a high can also drop back."
related: [week52Range, sessionRange, voyageChange]
```

```yaml glossary
id: sessionChange
group: basics
label: "Change this session"
term: "session change"
whatItIs: "How much a price or your account value has changed since the current session began, in doubloons and as a percent."
whyItMatters: "It shows the short-term move, which is often driven by news or random swings rather than the business itself."
usuallyGoodWhen: "a rise follows real news about the business, but one session is a short time and moves often reverse."
related: [session, voyageChange, totalGain]
```

```yaml glossary
id: revenue
group: profit
label: "Yearly sales"
term: "annual revenue"
whatItIs: "All the money a company brought in from customers last year, before paying any costs."
whyItMatters: "Sales are where profit starts: a company cannot keep making money for long without steady or growing sales."
usuallyGoodWhen: "sales rise year after year, but sales mean little if costs rise even faster."
related: [revenueGrowth, netIncome, netMargin, psRatio]
```

```yaml glossary
id: netIncome
group: profit
label: "Yearly profit"
term: "net income"
whatItIs: "The money left from sales after paying every cost, including interest and taxes, for the most recent year."
whyItMatters: "Profit is what a company earns for its owners, and over time it drives how much the business is worth."
usuallyGoodWhen: "profit is positive and growing, but one big year can come from a one-time event that will not repeat."
related: [revenue, netMargin, eps, peRatio]
```

```yaml glossary
id: netMargin
group: profit
label: "Profit margin"
term: "net margin"
whatItIs: "The share of sales left as profit after all costs, shown as a percent."
whyItMatters: "It shows how well a company turns sales into profit: a 14% margin means 14 of every 100 doubloons of sales is profit."
usuallyGoodWhen: "the margin is steady or rising, but some industries always keep less profit from sales, so compare within the sector."
related: [netIncome, grossMargin, operatingMargin, revenue]
```

```yaml glossary
id: grossMargin
group: profit
label: "Sales kept after direct costs"
term: "gross margin"
whatItIs: "The share of sales left after paying the direct costs of what it sells, before rent, office staff, marketing and other running costs."
whyItMatters: "A high gross margin leaves more room to pay every other cost and still make a profit."
usuallyGoodWhen: "it holds steady over the years, but large other costs can still leave a loss."
related: [grossProfit, costOfRevenue, operatingMargin, netMargin]
```

```yaml glossary
id: operatingMargin
group: profit
label: "Sales kept after running costs"
term: "operating margin"
whatItIs: "The share of sales left after paying direct costs and the everyday costs of running the business, before interest and taxes."
whyItMatters: "It shows how well the main business makes money, without the effects of loans or taxes."
usuallyGoodWhen: "it is steady or rising over time, but interest on big loans can still eat much of this profit."
related: [operatingIncome, grossMargin, netMargin, ebitda]
```

```yaml glossary
id: eps
group: profit
label: "Profit per share"
term: "earnings per share"
whatItIs: "EPS, short for earnings per share, is yearly profit divided by the number of shares. Earnings is another word for profit."
whyItMatters: "It tells you how much profit stands behind each share, and it is used to work out price vs. profit (P/E)."
usuallyGoodWhen: "it grows year after year, but EPS alone cannot compare companies, because each has a different number of shares."
related: [netIncome, peRatio, sharesOutstanding]
```

```yaml glossary
id: roe
group: profit
label: "Return on owner equity"
term: "return on equity"
whatItIs: "ROE, short for return on equity, is yearly profit as a percent of owner equity: what the company owns minus what it owes."
whyItMatters: "It shows how hard the owners' money is working to produce profit."
usuallyGoodWhen: "it is steady and above the sector average, but heavy borrowing can push it up while making the company riskier."
related: [equity, roa, debtToEquity, netIncome]
```

```yaml glossary
id: roa
group: profit
label: "Profit from what it owns"
term: "return on assets"
whatItIs: "ROA, short for return on assets, is yearly profit as a percent of everything the company owns."
whyItMatters: "It shows how well a company turns its buildings, equipment, cash and other things it owns into profit. Borrowing affects it less than return on equity."
usuallyGoodWhen: "it is higher than similar companies, but businesses that need lots of equipment naturally have lower numbers."
related: [totalAssets, roe, netIncome]
```

```yaml glossary
id: ebitda
group: profit
label: "Core profit"
term: "earnings before interest, taxes, depreciation and amortization"
whatItIs: "EBITDA is profit before loan interest and taxes, and before subtracting the yearly cost of wear-and-tear on buildings, equipment and other long-lasting things."
whyItMatters: "It lets you compare what the main business earns, even when companies have different loans or tax bills."
usuallyGoodWhen: "it grows along with sales, but it leaves out real costs like interest and replacing worn-out equipment."
related: [evToEbitda, operatingIncome, operatingMargin]
```

```yaml glossary
id: revenueGrowth
group: growth
label: "Sales growth"
term: "revenue growth"
whatItIs: "The average yearly change in sales over the last 3 years, from the oldest of the 4 yearly reports to the newest."
whyItMatters: "Growing sales can mean more customers and bigger profits later, while shrinking sales can signal trouble."
usuallyGoodWhen: "sales grow faster than the sector average, but fast growth means little if the company keeps losing money."
related: [revenue, industryGrowth, tam, netIncome]
```

```yaml glossary
id: industryGrowth
group: growth
label: "Industry growth"
term: "industry growth rate"
whatItIs: "How fast the whole industry is expected to grow each year, counting all the companies in it together."
whyItMatters: "A growing industry can lift many companies at once, while a shrinking one makes growth harder for everyone."
usuallyGoodWhen: "the industry is growing, but a company can still lose ground to rivals in a booming industry."
related: [sector, tam, revenueGrowth]
```

```yaml glossary
id: tam
group: growth
label: "Total market size"
term: "total addressable market"
whatItIs: "TAM, short for total addressable market, is the yearly sales possible if every customer in this market bought from one company."
whyItMatters: "It shows how much room a company has to grow before it runs out of new customers."
usuallyGoodWhen: "the market is much bigger than the company's sales, but a big market also attracts many rivals."
related: [industryGrowth, revenue, revenueGrowth]
```

```yaml glossary
id: debtToEquity
group: debt
label: "Debt vs. owner equity"
term: "debt-to-equity"
whatItIs: "Borrowed money compared with owner equity; 0.62 means 62 doubloons of debt for every 100 doubloons of owner equity."
whyItMatters: "Debt must be paid back with interest, so a company with lots of debt has less room for mistakes when times get hard."
usuallyGoodWhen: "it is at or below the sector average, but even a little debt can hurt if profits suddenly fall."
related: [totalDebt, equity, currentRatio, roe]
```

```yaml glossary
id: currentRatio
group: debt
label: "Short-term bill coverage"
term: "current ratio"
whatItIs: "Cash and other things the company can turn into cash within a year, divided by the bills it must pay within a year."
whyItMatters: "Above 1 means it has more short-term money than short-term bills, which makes those bills easier to pay on time."
usuallyGoodWhen: "it is above 1, but a very high ratio can mean cash is sitting unused instead of growing the business."
related: [cash, totalLiabilities, debtToEquity]
```

```yaml glossary
id: totalDebt
group: debt
label: "Borrowed money"
term: "total debt"
whatItIs: "All the money the company has borrowed and still has to pay back, such as bank loans."
whyItMatters: "Debt comes with interest payments that must be made in good times and bad."
usuallyGoodWhen: "debt is small next to profit and cash, but a sudden sales drop can make any debt hard to pay."
related: [debtToEquity, cash, totalLiabilities, evToEbitda]
```

```yaml glossary
id: cash
group: debt
label: "Cash on hand"
term: "cash and equivalents"
whatItIs: "The money the company has right now, ready to spend."
whyItMatters: "Cash pays bills during hard times and lets a company act fast without borrowing."
usuallyGoodWhen: "cash covers a good part of its debt, but a large pile of unused cash earns little for owners."
related: [totalDebt, currentRatio, freeCashFlow]
```

```yaml glossary
id: equity
group: debt
label: "Owner equity"
term: "shareholders' equity"
whatItIs: "What the company owns minus what it owes: the part of the business that belongs to its owners."
whyItMatters: "Losses shrink it first, so it works like a safety cushion. It is also used in debt vs. owner equity, return on equity and price vs. owner equity."
usuallyGoodWhen: "it grows over the years, but it comes from the company's records, so it can differ from company size."
related: [totalAssets, totalLiabilities, debtToEquity, pbRatio, roe]
```

```yaml glossary
id: totalAssets
group: debt
label: "Everything it owns"
term: "total assets"
whatItIs: "The value of everything the company owns, including cash, buildings, equipment and money customers still owe it."
whyItMatters: "The things it owns are the tools it uses to make money, and they could be sold to pay what it owes."
usuallyGoodWhen: "what it owns grows along with profit, but things bought with borrowed money also add debt."
related: [totalLiabilities, equity, roa]
```

```yaml glossary
id: totalLiabilities
group: debt
label: "Everything it owes"
term: "total liabilities"
whatItIs: "Everything the company owes to others, including loans, unpaid bills and other promises to pay."
whyItMatters: "The less a company owes compared with what it owns, the more room it has when business slows down."
usuallyGoodWhen: "it is well below what the company owns, but even small bills hurt if cash runs short."
related: [totalAssets, totalDebt, equity, currentRatio]
```

```yaml glossary
id: operatingCashFlow
group: profit
label: "Cash from running the business"
term: "operating cash flow"
whatItIs: "The cash that actually came in from running the business last year, after paying everyday costs."
whyItMatters: "Profit counts a sale even before the customer pays, so this shows whether profit is turning into real cash."
usuallyGoodWhen: "it is at or above profit, but one strong year of cash can come from paying bills late."
related: [netIncome, capex, freeCashFlow]
```

```yaml glossary
id: capex
group: growth
label: "Spending on equipment and buildings"
term: "capital spending"
whatItIs: "Money spent on long-lasting things, like equipment and buildings, that the business will use for years."
whyItMatters: "It keeps the business running and can build future growth, but it lowers the cash left over right now."
usuallyGoodWhen: "the spending leads to growing sales over time, but heavy spending that never pays off drains cash."
related: [freeCashFlow, operatingCashFlow, revenueGrowth]
```

```yaml glossary
id: freeCashFlow
group: profit
label: "Cash left after investing"
term: "free cash flow"
whatItIs: "Cash from running the business minus spending on equipment and buildings: the money truly left over."
whyItMatters: "Free cash can pay down debt, pay owners or fund growth without borrowing."
usuallyGoodWhen: "it is positive and steady, but one strong year can come from cutting spending the business will need later."
related: [operatingCashFlow, capex, cash, dividendYield]
```

```yaml glossary
id: peRatio
group: value
label: "Price vs. profit"
term: "P/E ratio"
whatItIs: "P/E, short for price-to-earnings, is the share price divided by yearly profit per share. Earnings is another word for profit."
whyItMatters: "It shows what you pay for each Ð1 of profit, so you can compare prices fairly. A Ð50 share with Ð5 of profit per share has a P/E of 10."
usuallyGoodWhen: "it is lower than similar companies, but a very low P/E can mean investors expect trouble."
related: [forwardPe, eps, psRatio, evToEbitda]
```

```yaml glossary
id: forwardPe
group: value
label: "Price vs. next year's profit"
term: "forward P/E"
whatItIs: "The share price divided by the profit per share expected next year, instead of last year."
whyItMatters: "If it is lower than the regular P/E, profit is expected to grow; if it is higher, profit is expected to shrink."
usuallyGoodWhen: "it is below the regular P/E, but forecasts are guesses and often miss."
related: [peRatio, eps, analystRating]
```

```yaml glossary
id: psRatio
group: value
label: "Price vs. sales"
term: "P/S ratio"
whatItIs: "P/S, short for price-to-sales, is company size divided by yearly sales. A company worth Ð10 billion with Ð5 billion of sales has a P/S of 2."
whyItMatters: "It still works when a company has no profit, so it helps compare companies that are losing money."
usuallyGoodWhen: "it is lower than similar companies, but a low P/S can mean the company keeps little profit from sales."
related: [peRatio, revenue, netMargin, marketCap]
```

```yaml glossary
id: pbRatio
group: value
label: "Price vs. owner equity"
term: "P/B ratio"
whatItIs: "P/B, short for price-to-book, is company size divided by owner equity: what it owns minus what it owes. Book means the company's own records."
whyItMatters: "It shows how much investors pay compared with what the company's records say would be left for owners after paying all it owes."
usuallyGoodWhen: "it is lower than similar companies, but companies that earn a lot while owning little naturally have a high P/B."
related: [equity, peRatio, roe]
```

```yaml glossary
id: evToEbitda
group: value
label: "Business price vs. core profit"
term: "EV/EBITDA"
whatItIs: "EV/EBITDA compares enterprise value (EV) with core profit (EBITDA). Enterprise value is company size plus debt minus cash; core profit is profit before interest, taxes and wear-and-tear."
whyItMatters: "Because it counts debt, it compares prices fairly between companies that borrow a lot and companies that borrow little."
usuallyGoodWhen: "it is lower than similar companies, but a low number can mean the business is expected to shrink."
related: [ebitda, peRatio, totalDebt, cash]
```

```yaml glossary
id: dividendYield
group: value
label: "Yearly payout to owners"
term: "dividend yield"
whatItIs: "A dividend is cash a company pays its owners. The yield is one year of dividends as a percent of the share price."
whyItMatters: "Steady payouts often come from steady profits; in this game they are shown for research and never added to your cash."
usuallyGoodWhen: "payouts are steady, but companies can cut payouts, and a very high yield can mean the price fell."
related: [payoutRatio, freeCashFlow, netIncome]
```

```yaml glossary
id: payoutRatio
group: value
label: "Share of profit paid out"
term: "payout ratio"
whatItIs: "The percent of yearly profit that a company pays its owners in cash, called dividends."
whyItMatters: "It shows how much profit is shared and how much is kept to grow the business or pay down debt."
usuallyGoodWhen: "it is well below 100%, but a low payout alone does not show that the profit itself is healthy."
related: [dividendYield, netIncome, freeCashFlow]
```

```yaml glossary
id: marketOrder
group: trading
label: "Buy or sell now"
term: "market order"
whatItIs: "An order to buy or sell right away at about the current price, instead of waiting for a price you choose. Once the trade happens, it is filled."
whyItMatters: "It is the only order type in this game, so the price you get depends on the moment you place it."
usuallyGoodWhen: "you preview the estimate right before placing it, but the final price can still differ a little from the preview."
related: [price, fee, priceImpact, tick]
```

```yaml glossary
id: fee
group: trading
label: "Trading fee"
term: "commission"
whatItIs: "A charge on every buy and every sell, set by the host as a percent of the order value (0.10% by default)."
whyItMatters: "Fees come out of your account win or lose, so trading back and forth adds up quickly."
usuallyGoodWhen: "your expected gain is much larger than the fee, but the fee is charged even on losing trades."
related: [feesPaid, marketOrder, priceImpact]
```

```yaml glossary
id: priceImpact
group: trading
label: "Price nudge from your order"
term: "price impact"
whatItIs: "The way an order pushes the price against you, more for bigger orders: buying raises it a little, and selling lowers it a little."
whyItMatters: "Big orders get a slightly worse price, and the nudge fades over time, so buying and quickly selling back usually loses money."
usuallyGoodWhen: "your order is small compared with the company's share count, but every order moves the price a little."
related: [marketOrder, fee, intervalLimit, sharesOutstanding]
```

```yaml glossary
id: avgCost
group: trading
label: "Average price paid"
term: "average cost"
whatItIs: "The average price per share across all your buys of one company, not counting fees."
whyItMatters: "Comparing it with the current price shows whether your shares are up or down since you bought them."
usuallyGoodWhen: "the price is above your average cost, but a paper gain can vanish if the price falls before you sell."
related: [costBasis, unrealizedGain, realizedGain]
```

```yaml glossary
id: costBasis
group: trading
label: "Total paid"
term: "cost basis"
whatItIs: "Your average price paid times the number of shares you own: what you paid for the shares you still hold."
whyItMatters: "Your gain or loss on a holding is its current value minus its cost basis."
usuallyGoodWhen: "the holding's value is above its cost basis, but that gain is not locked in until you sell."
related: [avgCost, unrealizedGain, totalGain]
```

```yaml glossary
id: totalGain
group: trading
label: "Total gain/loss"
term: "total return"
whatItIs: "How much you are up or down: account value minus starting cash, or for one holding, its value minus its cost basis."
whyItMatters: "Every crew starts with the same cash, so the crew with the biggest total gain has the highest account value."
usuallyGoodWhen: "it grows steadily over many sessions, but a gain can shrink fast if a big holding gets bad news."
related: [accountValue, realizedGain, unrealizedGain, startingCash]
```

```yaml glossary
id: realizedGain
group: trading
label: "Locked-in gain/loss"
term: "realized gain"
whatItIs: "Profit or loss you locked in by selling: the sale amount, minus what those shares cost at your average price, minus the sale's fee."
whyItMatters: "Once realized, the result is final, and later price moves cannot change it."
usuallyGoodWhen: "you sell for more than your average cost, but fees on every sale can shrink small gains to almost nothing."
related: [unrealizedGain, avgCost, fee, totalGain]
```

```yaml glossary
id: unrealizedGain
group: trading
label: "Paper gain/loss"
term: "unrealized gain"
whatItIs: "Profit or loss on shares you still own: their current value minus what you paid for them, not counting fees."
whyItMatters: "It changes every tick with the price, and it only becomes final when you sell."
usuallyGoodWhen: "it is positive, but a paper gain can disappear if the price drops before you sell."
related: [realizedGain, costBasis, avgCost]
```

```yaml glossary
id: positionLimit
group: trading
label: "Most in one company"
term: "position limit"
whatItIs: "A host rule that stops any buy from putting more than a set share of your account value into one company."
whyItMatters: "It keeps any single company, lucky or unlucky, from deciding your whole game."
usuallyGoodWhen: "your biggest holding stays well under the limit, but staying under the limit does not make a holding safe."
related: [diversification, pctOfAccount, intervalLimit]
```

```yaml glossary
id: diversification
group: trading
label: "Spreading your money"
term: "diversification"
whatItIs: "Owning several companies, ideally in different sectors, instead of putting all your money into one."
whyItMatters: "When one company gets bad news, the others can soften the hit to your account."
usuallyGoodWhen: "your holdings are spread across sectors, but spreading out cannot stop losses when the whole market falls."
related: [positionLimit, sector, beta, pctOfAccount]
```

```yaml glossary
id: cashAvailable
group: trading
label: "Cash available to trade"
term: "buying power"
whatItIs: "The cash in your account that you can use right now to buy shares."
whyItMatters: "Every buy spends this cash, including the fee, and every sell adds cash back minus the fee."
usuallyGoodWhen: "you keep some cash for later chances, but cash sitting unused earns nothing in this game."
related: [accountValue, invested, fee]
```

```yaml glossary
id: tick
group: game
label: "Price update"
term: "market tick"
whatItIs: "A tick is one price update; all prices and standings refresh each tick, every 5 to 30 seconds depending on game length."
whyItMatters: "Prices can change between the moment you look and the moment you trade, so the ticket always shows an estimate."
usuallyGoodWhen: "you preview an order right before placing it, but the price can still change if a new tick arrives first."
related: [session, price, marketOrder]
```

```yaml glossary
id: session
group: game
label: "Game session"
term: "trading session"
whatItIs: "One of 8 equal parts of the game, like a trading day in a real market."
whyItMatters: "Session change shows how prices and your account moved since the current session began, apart from the whole game."
usuallyGoodWhen: "your account rises across many sessions, but a single session is short and its moves often reverse."
related: [tick, sessionChange, voyageChange]
```

```yaml glossary
id: quality
group: game
label: "Health score"
term: "quality score"
whatItIs: "A hidden score the game gives each company, built only from financial numbers that every crew can read."
whyItMatters: "Healthier companies tend to do a bit better over the whole game, but the score stays hidden until the market reveal."
usuallyGoodWhen: "profit, growth, debt and price all look sensible together, but news, luck and hidden surprises still move prices."
related: [researchGrade, researchEdge, news]
```

```yaml glossary
id: news
group: basics
label: "News reports"
term: "dispatches"
whatItIs: "Reports about a company or the whole market, such as profit reports, deals, storms or rule changes, shown in Dispatches."
whyItMatters: "News can move a price quickly, up or down, because it changes what the business is likely to earn."
usuallyGoodWhen: "the news points to lasting changes in the business, but the price jumps the moment news comes out."
related: [sessionChange, volume, analystRating]
```

```yaml glossary
id: researchEdge
group: game
label: "How much health matters"
term: "research edge"
whatItIs: "A host setting for how strongly a company's financial health tilts its price over the whole game: Low, Normal or High."
whyItMatters: "On High, careful research pays off more often; on Low, luck plays a bigger part in the results."
usuallyGoodWhen: "you research carefully on any setting, but news and luck can still beat research, most of all on Low."
related: [quality, news, diversification]
```

### 2.2 Supporting terms

```yaml glossary
id: ticker
group: basics
label: "Company symbol"
term: "ticker symbol"
whatItIs: "A short code of 4 letters that stands for a company, such as KRKN for Kraken Shipping Lines."
whyItMatters: "Symbols are how you search for a company and how it appears in tables, orders and news."
usuallyGoodWhen: "you double-check the symbol before placing an order, but similar symbols are easy to mix up."
related: [stock, marketOrder]
```

```yaml glossary
id: voyageChange
group: basics
label: "Change since the game began"
term: "total change"
whatItIs: "How much a price has moved since the first tick of this game, as a percent."
whyItMatters: "It shows the long-run move, which says more about the business than a single session does."
usuallyGoodWhen: "the rise is steady over many sessions, but one news jump can explain most of a big total change."
related: [sessionChange, voyageRange, totalGain]
```

```yaml glossary
id: sharesOutstanding
group: basics
label: "Shares that exist"
term: "shares outstanding"
whatItIs: "The total number of shares a company has created, owned by all its investors together."
whyItMatters: "Share count turns company-wide numbers into per-share numbers, like profit per share, and times the price gives company size."
usuallyGoodWhen: "the count stays steady, but comparing share prices across companies means little because share counts differ."
related: [marketCap, eps, float, priceImpact]
```

```yaml glossary
id: float
group: basics
label: "Shares available to trade"
term: "public float"
whatItIs: "The shares that ordinary investors can trade, leaving out shares held by insiders like founders and leaders."
whyItMatters: "It shows how much of the company is really out in the market, beyond shares that rarely change hands."
usuallyGoodWhen: "most shares are in the float, but here your order's price nudge depends on total shares, not float."
related: [sharesOutstanding, volume]
```

```yaml glossary
id: week52Range
group: basics
label: "Past-year high and low"
term: "52-week range"
whatItIs: "The highest and lowest prices of the stock during the year before this game began."
whyItMatters: "It shows how widely the price swung in the past, a rough guide to how much it can move."
usuallyGoodWhen: "the price has swung less than similar companies, but past swings do not predict where the price goes next."
related: [voyageRange, beta]
```

```yaml glossary
id: sessionRange
group: basics
label: "Session high and low"
term: "session range"
whatItIs: "The highest and lowest prices during the current session."
whyItMatters: "A wide range means the price has been jumping around, often because of news."
usuallyGoodWhen: "the range is calm and the business is steady, but a calm session can turn quickly when news arrives."
related: [session, sessionChange, voyageRange]
```

```yaml glossary
id: costOfRevenue
group: profit
label: "Direct costs"
term: "cost of revenue"
whatItIs: "What the company spent to make or deliver the things it sold, such as materials, fuel and pay for those workers."
whyItMatters: "Sales minus these costs gives gross profit, the money left to pay every other cost."
usuallyGoodWhen: "these costs grow more slowly than sales, but cutting them too far can hurt quality and future sales."
related: [grossProfit, grossMargin, revenue]
```

```yaml glossary
id: grossProfit
group: profit
label: "Profit after direct costs"
term: "gross profit"
whatItIs: "Sales minus direct costs, before paying for things like offices, marketing, interest and taxes."
whyItMatters: "It is the money available to cover all other costs and still leave a profit."
usuallyGoodWhen: "it grows along with sales, but large other costs can still turn it into a loss."
related: [costOfRevenue, grossMargin, operatingIncome]
```

```yaml glossary
id: operatingIncome
group: profit
label: "Profit from operations"
term: "operating income"
whatItIs: "Profit from the main business after direct costs and everyday running costs, before interest and taxes."
whyItMatters: "It shows whether the main business makes money on its own, apart from loans and taxes."
usuallyGoodWhen: "it is positive and rising, but heavy interest payments can still leave little final profit."
related: [operatingMargin, grossProfit, netIncome, ebitda]
```

```yaml glossary
id: accountValue
group: trading
label: "Account value"
term: "total account value"
whatItIs: "Your cash plus the current value of all the shares you own."
whyItMatters: "Standings rank crews by account value, and the highest value when the game ends wins."
usuallyGoodWhen: "it rises over many sessions, but it moves with every tick, so a high reading can slip away."
related: [cashAvailable, invested, totalGain, startingCash]
```

```yaml glossary
id: invested
group: trading
label: "Money invested"
term: "market value of holdings"
whatItIs: "The current value of all the shares you own, at the latest prices."
whyItMatters: "This is the part of your account that goes up and down with stock prices."
usuallyGoodWhen: "it is spread across several companies, but having more invested also means bigger swings in your account."
related: [accountValue, cashAvailable, diversification]
```

```yaml glossary
id: pctOfAccount
group: trading
label: "Share of account"
term: "% of account"
whatItIs: "How much of your total account value one holding, or your cash, makes up, as a percent."
whyItMatters: "A big share means that company's price moves have a big effect on your whole account."
usuallyGoodWhen: "no single holding takes up too much, but small holdings can still add up if they all move together."
related: [positionLimit, diversification, accountValue]
```

```yaml glossary
id: feesPaid
group: trading
label: "Fees paid"
term: "commissions paid"
whatItIs: "The total of all the trading fees your crew has paid this game."
whyItMatters: "Fees come straight out of your account value, win or lose."
usuallyGoodWhen: "fees stay small next to your gains, but many small trades can add up to a large total."
related: [fee, totalGain]
```

```yaml glossary
id: intervalLimit
group: trading
label: "Most shares per price update"
term: "interval limit"
whatItIs: "The most shares of one company your crew can trade between two price updates."
whyItMatters: "It stops giant orders from swinging a price all at once, and the ticket shows the number for each company."
usuallyGoodWhen: "your order fits within the limit, but each order still pays a fee and a small price nudge."
related: [priceImpact, tick, positionLimit]
```

```yaml glossary
id: startingCash
group: game
label: "Starting cash"
term: "starting capital"
whatItIs: "The cash every crew gets when the game begins, set by the host."
whyItMatters: "Every crew starts equal, so your total gain compares directly with every other crew's."
usuallyGoodWhen: "your account value stays above it, but a lead early in the game can vanish before the end."
related: [accountValue, totalGain, cashAvailable]
```

```yaml glossary
id: researchGrade
group: game
label: "Research grade"
term: "research grade"
whatItIs: "A letter from A to F, shown when the game ends, for how healthy the companies you held were over the whole game."
whyItMatters: "It shows how well your picks matched company health, separate from the luck in your final rank."
usuallyGoodWhen: "you held mostly healthy companies for most of the game, but a high grade does not promise a high rank."
related: [quality, diversification, accountValue]
```

```yaml glossary
id: breadth
group: basics
label: "Rising vs. falling stocks"
term: "market breadth"
whatItIs: "How many companies are up, down or unchanged this session."
whyItMatters: "It shows whether a market move is broad, lifting most companies, or narrow, led by just a few."
usuallyGoodWhen: "most companies are rising together, but broad moves can reverse just as broadly."
related: [index, sessionChange, sector]
```

---

## 3. EXPLAIN SENTENCES

`explainMetric(id, value, avg, symbol)` returns `{ valueText, sentence, averageText }`.

- `valueFormat` fills `valueText` (and `{avg}` in the average line).
- `money` names the format that fills `{money}`; `value` names the format that fills `{value}`;
  `pct` names the format that fills `{pct}`.
- Negative values use the absolute value in `{money}` and `{pct}`; the words carry the sign.
- Pick the sentence in this order: `whenNull` (value is null) → `whenZero` → `whenFlat` →
  `whenNegative` → `sentence`.
- `compareNote` (optional) is a fixed line shown under the average line. It appears on metrics whose
  raw size grows with company size or share count, where a bigger number is not a like-for-like
  comparison. `explainMetric` needs an optional `note` field in `Explained` to carry it.
- When the value is null, `valueText` is `—`.
- Every block has an `example` (KRKN) and at least one edge example: `lossExample` (below zero),
  `nullExample` (not meaningful or missing) or `zeroExample`. Edge examples are illustrative.
- Example numbers marked `brief` are exact BRIEF §7 figures. `mockup` numbers come from the KRKN
  statements in `canvas/ResearchReport.dc.html` and satisfy the spec §4 accounting identities.
  `derived` numbers are computed from those two. `illustrative` numbers appear in neither and are
  fixed here so screens agree.
- Sector averages are Shipping & Salvage medians. Where `ResearchReport.dc.html` shows a median,
  the value matches it. P/E 22.1 is the exception: it matches the plan's `compare.test.ts`, so the
  mockup's 24.6 should change to 22.1.

```yaml formats
money2: "Symbol, thousands separators, 2 decimals, true minus: 4.73 → Ð4.73; −1.2 → −Ð1.20"
moneyCompact: "Symbol, 2 decimals and a unit, true minus. B from Ð100 million (0.96e9 → Ð0.96B; 20357040000 → Ð20.36B), M from Ð100 thousand, K from Ð1,000, money2 below Ð1,000"
per100: "Absolute fraction × 100 as money; drop .00 when whole: 0.14 → Ð14; 0.182 → Ð18.20; 0.378 → Ð37.80; 0.019 → Ð1.90"
ratioMoney: "Absolute ratio as money with 2 decimals: 17.8 → Ð17.80; 0.62 → Ð0.62"
pct1: "Fraction × 100, 1 decimal, % sign, true minus: 0.14 → 14.0%; −0.031 → −3.1%"
pctWhole: "Absolute fraction × 100 rounded to a whole percent; 1 decimal when below 1%: 0.0719 → 7%; 0.004 → 0.4%"
ratio1: "1 decimal: 17.78 → 17.8"
ratio2: "2 decimals: 0.624 → 0.62"
betaPct: "Beta × 10 as a whole percent: 1.12 → 11%"
nullValueText: "—"
```

```yaml example-company
ticker: "KRKN"
name: "Kraken Shipping Lines"
sector: "Shipping & Salvage"
averageScope: "sector"
values:
  price: { value: 84.12, source: brief }
  sharesOutstanding: { value: 242000000, source: brief }
  marketCap: { value: 20360000000, source: brief }
  revenueByYear: { value: [6.61e9, 7.18e9, 7.74e9, 8.14e9], source: brief }
  netIncomeByYear: { value: [0.94e9, 1.03e9, 1.09e9, 1.14e9], source: brief }
  revenue: { value: 8140000000, source: brief }
  netIncome: { value: 1140000000, source: brief }
  netMargin: { value: 0.140, source: brief }
  revenueGrowth: { value: 0.0719, source: derived, note: "(8.14 ÷ 6.61) to the power 1/3, minus 1" }
  eps: { value: 4.73, source: brief, note: "BRIEF rounding: 1.14B ÷ 242.0M is Ð4.71 and 20.36B ÷ 1.14B is 17.9. BRIEF's EPS 4.73 and P/E 17.8 imply net income near Ð1.144B. Keep BRIEF figures on screens; do not assert EPS = netIncome ÷ shares on this set." }
  peRatio: { value: 17.8, source: brief }
  forwardPe: { value: 15.9, source: brief }
  psRatio: { value: 2.50, source: derived, note: "20.36B ÷ 8.14B" }
  equity: { value: 6260000000, source: derived, note: "1.14B ÷ 18.2%" }
  pbRatio: { value: 3.25, source: derived, note: "20.36B ÷ 6.26B" }
  totalDebt: { value: 3880000000, source: derived, note: "0.62 × 6.26B" }
  dividendYield: { value: 0.019, source: brief }
  payoutRatio: { value: 0.34, source: brief }
  roe: { value: 0.182, source: brief }
  debtToEquity: { value: 0.62, source: brief }
  currentRatio: { value: 1.84, source: brief }
  freeCashFlow: { value: 960000000, source: brief }
  costOfRevenue: { value: 5060000000, source: mockup }
  grossProfit: { value: 3080000000, source: mockup }
  operatingIncome: { value: 1600000000, source: mockup }
  grossMargin: { value: 0.378, source: mockup, note: "3.08B ÷ 8.14B" }
  operatingMargin: { value: 0.197, source: mockup, note: "1.60B ÷ 8.14B" }
  ebitda: { value: 2280000000, source: mockup }
  cash: { value: 1420000000, source: mockup }
  evToEbitda: { value: 10.0, source: mockup, note: "(20.36B + 3.88B − 1.42B) ÷ 2.28B" }
  totalLiabilities: { value: 6540000000, source: mockup }
  totalAssets: { value: 12800000000, source: mockup, note: "6.26B + 6.54B" }
  roa: { value: 0.089, source: mockup, note: "1.14B ÷ 12.80B" }
  capex: { value: 880000000, source: mockup }
  operatingCashFlow: { value: 1840000000, source: mockup, note: "0.96B + 0.88B" }
  beta: { value: 1.12, source: illustrative }
  intervalCap: { value: 1613333, source: derived, note: "242,000,000 ÷ 150, rounded down" }
  volume: { value: 184200, source: brief }
  analystRating: { value: "Buy", source: brief }
  priceTarget: { value: 96.00, source: brief }
sectorAverages:
  marketCap: 9840000000
  revenue: 5200000000
  netIncome: 520000000
  netMargin: 0.100
  grossMargin: 0.310
  revenueGrowth: 0.049
  eps: 2.60
  peRatio: 22.1
  forwardPe: 21.3
  psRatio: 1.90
  pbRatio: 2.40
  evToEbitda: 16.4
  dividendYield: 0.012
  debtToEquity: 0.95
  currentRatio: 1.35
  freeCashFlow: 380000000
  roe: 0.116
  roa: 0.054
  beta: 1.10
```

### 3.1 Metric templates

```yaml explain
id: marketCap
label: "Company size (market cap)"
valueFormat: moneyCompact
money: moneyCompact
sentence: "All of its shares together are worth {money} at the current price."
whenNull: "Not available for this company."
example:
  value: 20360000000
  valueText: "Ð20.36B"
  sentence: "All of its shares together are worth Ð20.36B at the current price."
  averageText: "Sector average: Ð9.84B"
nullExample:
  value: null
  valueText: "—"
  sentence: "Not available for this company."
```

```yaml explain
id: revenue
label: "Sales (revenue)"
valueFormat: moneyCompact
money: moneyCompact
sentence: "It brought in {money} in sales last year."
compareNote: "Bigger companies usually have bigger sales, so also compare sales growth, which works at any size."
whenZero: "It had no sales last year."
whenNull: "Not available for this company."
example:
  value: 8140000000
  valueText: "Ð8.14B"
  sentence: "It brought in Ð8.14B in sales last year."
  averageText: "Sector average: Ð5.20B"
zeroExample:
  value: 0
  valueText: "Ð0.00"
  sentence: "It had no sales last year."
```

```yaml explain
id: netIncome
label: "Profit (net income)"
valueFormat: moneyCompact
money: moneyCompact
sentence: "It made {money} of profit last year after paying every cost."
compareNote: "Bigger companies usually make bigger profits, so also compare profit margin, which works at any size."
whenZero: "It broke even last year: no profit and no loss."
whenNegative: "It lost {money} last year after paying every cost."
whenNull: "Not available for this company."
example:
  value: 1140000000
  valueText: "Ð1.14B"
  sentence: "It made Ð1.14B of profit last year after paying every cost."
  averageText: "Sector average: Ð0.52B"
lossExample:
  value: -210000000
  valueText: "−Ð0.21B"
  sentence: "It lost Ð0.21B last year after paying every cost."
```

```yaml explain
id: netMargin
label: "Profit margin (net margin)"
valueFormat: pct1
money: per100
sentence: "It keeps {money} of profit from every {symbol}100 of sales."
whenZero: "It broke even: no profit left from its sales."
whenNegative: "It loses {money} for every {symbol}100 of sales."
whenNull: "Not available for this company."
example:
  value: 0.140
  valueText: "14.0%"
  sentence: "It keeps Ð14 of profit from every Ð100 of sales."
  averageText: "Sector average: 10.0%"
lossExample:
  value: -0.035
  valueText: "−3.5%"
  sentence: "It loses Ð3.50 for every Ð100 of sales."
```

```yaml explain
id: grossMargin
label: "Sales kept after direct costs (gross margin)"
valueFormat: pct1
money: per100
sentence: "After paying for what it sells, it keeps {money} of every {symbol}100 of sales."
whenNegative: "What it sells costs more than it brings in: it loses {money} of every {symbol}100 before other costs."
whenNull: "Not available for this company."
example:
  value: 0.378
  valueText: "37.8%"
  sentence: "After paying for what it sells, it keeps Ð37.80 of every Ð100 of sales."
  averageText: "Sector average: 31.0%"
lossExample:
  value: -0.05
  valueText: "−5.0%"
  sentence: "What it sells costs more than it brings in: it loses Ð5 of every Ð100 before other costs."
```

```yaml explain
id: revenueGrowth
label: "Sales growth (revenue growth)"
valueFormat: pct1
pct: pctWhole
flatBelow: 0.005
sentence: "Sales grew about {pct} a year over the last 3 years."
whenFlat: "Sales stayed about the same over the last 3 years."
whenNegative: "Sales shrank about {pct} a year over the last 3 years."
whenNull: "Not enough history to measure sales growth."
example:
  value: 0.0719
  valueText: "7.2%"
  sentence: "Sales grew about 7% a year over the last 3 years."
  averageText: "Sector average: 4.9%"
lossExample:
  value: -0.042
  valueText: "−4.2%"
  sentence: "Sales shrank about 4% a year over the last 3 years."
```

```yaml explain
id: eps
label: "Profit per share (EPS)"
valueFormat: money2
money: money2
sentence: "It made {money} of profit for each share last year."
compareNote: "Profit per share depends on how many shares a company has, so the sector average means little; compare its change over the years instead."
whenZero: "It broke even last year: no profit for each share."
whenNegative: "It lost {money} for each share last year."
whenNull: "Not available for this company."
example:
  value: 4.73
  valueText: "Ð4.73"
  sentence: "It made Ð4.73 of profit for each share last year."
  averageText: "Sector average: Ð2.60"
lossExample:
  value: -1.20
  valueText: "−Ð1.20"
  sentence: "It lost Ð1.20 for each share last year."
```

```yaml explain
id: peRatio
label: "Price vs. profit (P/E)"
valueFormat: ratio1
money: ratioMoney
sentence: "You pay {money} for every {symbol}1 of yearly profit."
whenNull: "Not meaningful because the company is losing money."
nullWhen: "netIncome ≤ 0"
example:
  value: 17.8
  valueText: "17.8"
  sentence: "You pay Ð17.80 for every Ð1 of yearly profit."
  averageText: "Sector average: 22.1"
lossExample:
  value: null
  valueText: "—"
  sentence: "Not meaningful because the company is losing money."
```

```yaml explain
id: forwardPe
label: "Price vs. next year's profit (forward P/E)"
valueFormat: ratio1
money: ratioMoney
sentence: "You pay {money} for every {symbol}1 of profit expected next year."
whenNull: "Not meaningful because the company is losing money."
nullWhen: "netIncome ≤ 0"
example:
  value: 15.9
  valueText: "15.9"
  sentence: "You pay Ð15.90 for every Ð1 of profit expected next year."
  averageText: "Sector average: 21.3"
lossExample:
  value: null
  valueText: "—"
  sentence: "Not meaningful because the company is losing money."
```

```yaml explain
id: psRatio
label: "Price vs. sales (P/S)"
valueFormat: ratio2
money: ratioMoney
sentence: "You pay {money} for every {symbol}1 of yearly sales."
whenNull: "Not meaningful because the company had no sales."
nullWhen: "revenue ≤ 0"
example:
  value: 2.50
  valueText: "2.50"
  sentence: "You pay Ð2.50 for every Ð1 of yearly sales."
  averageText: "Sector average: 1.90"
nullExample:
  value: null
  valueText: "—"
  sentence: "Not meaningful because the company had no sales."
```

```yaml explain
id: pbRatio
label: "Price vs. owner equity (P/B)"
valueFormat: ratio2
money: ratioMoney
sentence: "You pay {money} for every {symbol}1 of owner equity."
whenNull: "Not meaningful because the company owes more than it owns."
nullWhen: "equity ≤ 0"
example:
  value: 3.25
  valueText: "3.25"
  sentence: "You pay Ð3.25 for every Ð1 of owner equity."
  averageText: "Sector average: 2.40"
nullExample:
  value: null
  valueText: "—"
  sentence: "Not meaningful because the company owes more than it owns."
```

```yaml explain
id: evToEbitda
label: "Business price vs. core profit (EV/EBITDA)"
valueFormat: ratio1
money: ratioMoney
sentence: "Counting its debt and subtracting its cash, the whole business is priced at {money} for every {symbol}1 of yearly core profit."
whenNull: "Not meaningful because its core profit, or its price after counting debt and cash, is zero or below."
nullWhen: "ebitda ≤ 0 or enterprise value ≤ 0 (the generator stores 0 in both cases)"
example:
  value: 10.0
  valueText: "10.0"
  sentence: "Counting its debt and subtracting its cash, the whole business is priced at Ð10.00 for every Ð1 of yearly core profit."
  averageText: "Sector average: 16.4"
lossExample:
  value: null
  valueText: "—"
  sentence: "Not meaningful because its core profit, or its price after counting debt and cash, is zero or below."
```

```yaml explain
id: dividendYield
label: "Yearly payout to owners (dividend yield)"
valueFormat: pct1
money: per100
sentence: "It pays owners about {money} a year for every {symbol}100 spent on its shares at the current price. Dividends are not added to your cash in this game."
whenZero: "It does not pay owners a dividend right now."
whenNull: "Not available for this company."
example:
  value: 0.019
  valueText: "1.9%"
  sentence: "It pays owners about Ð1.90 a year for every Ð100 spent on its shares at the current price. Dividends are not added to your cash in this game."
  averageText: "Sector average: 1.2%"
zeroExample:
  value: 0
  valueText: "0.0%"
  sentence: "It does not pay owners a dividend right now."
```

```yaml explain
id: debtToEquity
label: "Debt vs. owner equity (debt-to-equity)"
valueFormat: ratio2
money: ratioMoney
sentence: "It has {money} of debt for every {symbol}1 of owner equity (what it owns minus what it owes)."
whenZero: "It has no borrowed money."
whenNull: "Not meaningful because the company owes more than it owns."
nullWhen: "equity ≤ 0"
example:
  value: 0.62
  valueText: "0.62"
  sentence: "It has Ð0.62 of debt for every Ð1 of owner equity (what it owns minus what it owes)."
  averageText: "Sector average: 0.95"
zeroExample:
  value: 0
  valueText: "0.00"
  sentence: "It has no borrowed money."
nullExample:
  value: null
  valueText: "—"
  sentence: "Not meaningful because the company owes more than it owns."
```

```yaml explain
id: currentRatio
label: "Short-term bill coverage (current ratio)"
valueFormat: ratio2
money: ratioMoney
sentence: "It has {money} of short-term money for every {symbol}1 of bills due within a year."
whenNull: "Not available for this company."
example:
  value: 1.84
  valueText: "1.84"
  sentence: "It has Ð1.84 of short-term money for every Ð1 of bills due within a year."
  averageText: "Sector average: 1.35"
nullExample:
  value: null
  valueText: "—"
  sentence: "Not available for this company."
```

```yaml explain
id: freeCashFlow
label: "Cash left after investing (free cash flow)"
valueFormat: moneyCompact
money: moneyCompact
sentence: "After running and investing in the business, it had {money} of cash left last year."
compareNote: "Bigger companies usually have more cash left over, so also compare it with the company's own profit."
whenZero: "After running and investing in the business, it had no cash left over last year."
whenNegative: "It spent {money} more cash than it brought in last year, after investing in the business."
whenNull: "Not available for this company."
example:
  value: 960000000
  valueText: "Ð0.96B"
  sentence: "After running and investing in the business, it had Ð0.96B of cash left last year."
  averageText: "Sector average: Ð0.38B"
lossExample:
  value: -150000000
  valueText: "−Ð0.15B"
  sentence: "It spent Ð0.15B more cash than it brought in last year, after investing in the business."
```

```yaml explain
id: roe
label: "Return on owner equity (ROE)"
valueFormat: pct1
money: per100
sentence: "It earned {money} of profit for every {symbol}100 of owner equity."
whenNegative: "It lost {money} for every {symbol}100 of owner equity."
whenNull: "Not meaningful because the company owes more than it owns."
nullWhen: "equity ≤ 0"
example:
  value: 0.182
  valueText: "18.2%"
  sentence: "It earned Ð18.20 of profit for every Ð100 of owner equity."
  averageText: "Sector average: 11.6%"
lossExample:
  value: -0.06
  valueText: "−6.0%"
  sentence: "It lost Ð6 for every Ð100 of owner equity."
```

```yaml explain
id: roa
label: "Profit from what it owns (ROA)"
valueFormat: pct1
money: per100
sentence: "It earned {money} of profit for every {symbol}100 of things it owns."
whenNegative: "It lost {money} for every {symbol}100 of things it owns."
whenNull: "Not available for this company."
example:
  value: 0.089
  valueText: "8.9%"
  sentence: "It earned Ð8.90 of profit for every Ð100 of things it owns."
  averageText: "Sector average: 5.4%"
lossExample:
  value: -0.025
  valueText: "−2.5%"
  sentence: "It lost Ð2.50 for every Ð100 of things it owns."
```

```yaml explain
id: beta
label: "Swings vs. the market (beta)"
valueFormat: ratio2
pct: betaPct
sentence: "When the whole market moves 10%, this stock tends to move about {pct} the same way."
whenNull: "Not available for this company."
example:
  value: 1.12
  valueText: "1.12"
  sentence: "When the whole market moves 10%, this stock tends to move about 11% the same way."
  averageText: "Sector average: 1.10"
nullExample:
  value: null
  valueText: "—"
  sentence: "Not available for this company."
```

### 3.2 Average line, analyst card, statement summaries, research helper

```yaml explain-extra
averageLine:
  sector: "Sector average: {avg}"
  market: "Market average: {avg}"
  missingAvg: "—"
  formatRule: "Format {avg} with the metric's valueFormat. Use the market line when the sector has fewer than 3 companies."
  marketNote: "This sector has fewer than 3 companies, so the average uses every company in the market."
  whatAverageMeans: "The average here is the middle value of the group, so one unusual company cannot pull it far."
  unitsNote: "B means billion, M means million and K means thousand. Ð8.14B is Ð8,140,000,000."
  examples:
    - "Sector average: 22.1"
    - "Sector average: 10.0%"
    - "Sector average: Ð9.84B"
    - "Market average: 21.4"
analystCard:
  title: "Analyst view"
  summaryAbove: "Analyst view: {rating}. Their price target of {target} is {pct} above the current price."
  summaryBelow: "Analyst view: {rating}. Their price target of {target} is {pct} below the current price."
  summaryNone: "No analyst view for this company."
  caution: "Analysts in this game are often wrong, and their price targets tend to run high."
  example: "Analyst view: Buy. Their price target of Ð96.00 is 14.1% above the current price."
statementSummaries:
  note: "{firstYear} and {lastYear} are the 4-digit years of the oldest and newest history periods (FY2022 → 2022)."
  salesUp: "Sales grew from {first} in {firstYear} to {last} in {lastYear}."
  salesDown: "Sales fell from {first} in {firstYear} to {last} in {lastYear}."
  salesFlat: "Sales stayed about the same from {firstYear} to {lastYear}, near {last}."
  profitUp: "Profit grew too, from {first} to {last}."
  profitUpSalesDown: "Profit still grew, from {first} to {last}."
  profitDown: "Profit fell, from {first} to {last}."
  profitFlat: "Profit stayed about the same, near {last}."
  lossYears: "The company lost money in {n} of the 4 years shown."
  balance: "It has {debtMoney} of debt for every {symbol}1 of owner equity (what it owns minus what it owes)."
  cashFlow: "After running and investing in the business, it had {fcf} of cash left last year."
  flatBelow: 0.03
  example: "Sales grew from Ð6.61B in 2022 to Ð8.14B in 2025. Profit grew too, from Ð0.94B to Ð1.14B."
research:
  helper: "New to this? Start with profit margin, sales growth and debt, then compare price vs. profit (P/E) with similar companies."
  fiveQuestionsPanel: "Read this company in 5 questions"
  fiveQuestionsNote: "Each answer is one clue, not the whole story."
  flavor: "Chart every company before you commit your doubloons."
  views:
    basics: { label: "Basics", help: "The key numbers for a first look." }
    valuation: { label: "Valuation", help: "How the price compares with profit, sales and owner equity." }
    health: { label: "Financial health", help: "Debt, bills due soon and cash." }
    analysts: { label: "Analysts", help: "What the game's analysts think, and their price targets." }
```

---

## 4. NEWS_EXPLAIN

Each dispatch shows a "What this means" line: `NEWS_EXPLAIN[type][sentiment]`. Each line says
what happened to the business. It never says what to do, and it never shows the size of the move.

```yaml news
type: earnings
badge: "Earnings"
bullish: "Earnings beat forecasts: the company made more profit than expected in its latest report."
bearish: "Earnings missed forecasts: the company made less profit than expected in its latest report."
```

```yaml news
type: merger
badge: "Merger"
bullish: "Merger deal: the company agreed to combine with or buy another business, which could bring more customers, sales or savings."
bearish: "Merger trouble: a planned deal fell apart or now looks too costly, so the hoped-for sales and savings may not come."
```

```yaml news
type: discovery
badge: "Discovery"
bullish: "New discovery: the company found something valuable, such as a new resource or trade route, that could add to future sales."
bearish: "Discovery letdown: something the company was counting on turned out smaller or less valuable than hoped, so future sales may be lower."
```

```yaml news
type: management
badge: "Leadership"
bullish: "Leadership win: the company gained a strong leader or a clearer plan, which could help it run better."
bearish: "Leadership trouble: a key leader left or made a costly mistake, which could make the company harder to run well."
```

```yaml news
type: regulatory
badge: "Rules"
bullish: "Rule change in its favor: officials approved a request or eased a rule, which could lower costs or open new business."
bearish: "Trouble with officials: the company was fined or hit by a stricter rule, which adds costs or limits what it can do."
```

```yaml news
type: scandal
badge: "Scandal"
bullish: "Scandal cleared: the company was found not at fault, which removes a worry about fines or lost customers."
bearish: "Scandal: wrongdoing came to light, which can bring fines, lost customers and damage to the company's name."
```

```yaml news
type: storm
badge: "Storm"
bullish: "Storm recovery: the company came through bad weather better than feared, so less business was lost."
bearish: "Storm damage: bad weather hurt ships, cargo or buildings, which means repair costs and lost sales for a while."
```

```yaml news
type: macro
badge: "Whole market"
bullish: "Market-wide boost: a change such as lower trade taxes helps many companies at once, especially those that swing more with the market."
bearish: "Market-wide setback: a change such as higher trade taxes hurts many companies at once, especially those that swing more with the market."
```

```yaml news-extra
whatThisMeans: "What this means"
sentiment:
  bullish: { label: "Good news for the business (bullish)", short: "Good news" }
  bearish: { label: "Bad news for the business (bearish)", short: "Bad news" }
sinceReport: "{pct} since the news"
sinceReportHelp: "How much the price has moved since this news came out."
companyCount: "{n} companies"
sourceHost: "Posted by the host"
filters:
  all: "All"
  holdings: "My holdings"
  watchlist: "Watchlist"
tradeLink: "Trade {ticker}"
readMore: "Read more"
readLess: "Show less"
flavor: "Word from the harbor."
```

---

## 5. WALKTHROUGH

```yaml walkthrough
eyebrow: "Getting started"
title: "Your first trade in 3 steps"
flavor: "New to the Exchange? Here's how to find your sea legs."
stepCounter: "Step {n} of 3"
steps:
  - id: research
    title: "Research a company"
    body: "Open Research, pick a company, and compare its profit, sales growth and debt with its sector average."
    action: "Open Research"
    route: "/research"
  - id: order
    title: "Place a small first order"
    body: "On Trade, enter a few shares, preview the cost and fee, then place the order."
    action: "Go to Trade"
    route: "/trade"
  - id: track
    title: "Track it on Summary"
    body: "Summary shows your account value, your cash and how each holding has changed since you bought it."
    action: "Open Summary"
    route: "/"
learnLink: "Open the Learn guide"
next: "Next"
back: "Back"
dismiss: "Got it, hide this"
reopen: "How to play"
```

---

## 6. FIVE QUESTIONS

"Read a company in 5 questions". `where` lists screen paths separated by ` · `. `compare` says in
plain words which number to compare with which; it explains and never judges. `example` reads the
question with the BRIEF §7 sample numbers, under `guide.examplesNote`, so players know the figures
will not match their game. Both fields need matching `compare: string` and `example: string`
entries on the plan's `Question` interface (Task 13b).

```yaml five-questions
id: profit
number: 1
question: "Is it making money?"
lookAt: [netIncome, netMargin, freeCashFlow, operatingCashFlow]
where: "Research → Basics view (Profit margin column) · Trade → Financials → Income statement and Cash flow · Trade → Snapshot → Key facts"
compare: "Profit above zero means it made money. Compare its profit margin with the sector average to see how much of each sale it keeps."
example: "KRKN made Ð1.14B of profit last year. It keeps Ð14 of every Ð100 of sales; the sector average is Ð10. Profit rose every year, from Ð0.94B to Ð1.14B."
tip: "One year can mislead, so check whether profit held up across all 4 years."
```

```yaml five-questions
id: growth
number: 2
question: "Is it growing?"
lookAt: [revenueGrowth, revenue, industryGrowth, tam]
where: "Research → Basics view (Sales growth column) · Trade → Financials → Income statement and Industry"
compare: "Compare its sales growth with the sector average and with how fast its whole industry is growing."
example: "KRKN's sales grew about 7% a year, from Ð6.61B to Ð8.14B. The sector average is 4.9% a year."
tip: "Fast sales growth means less if the losses grow along with it."
```

```yaml five-questions
id: debt
number: 3
question: "Can it handle its debts?"
lookAt: [debtToEquity, currentRatio, totalDebt, cash]
where: "Research → Basics view (Debt vs. equity column) or Financial health view · Trade → Financials → Balance sheet · Trade → Snapshot → Key facts"
compare: "Compare debt vs. owner equity with the sector average; a lower number means less debt per Ð1 of equity. Short-term bill coverage above 1 means more short-term money than bills due soon."
example: "KRKN's debt vs. owner equity is 0.62; the sector average is 0.95. Its short-term bill coverage is 1.84; the sector average is 1.35."
tip: "Normal debt levels differ by industry, so compare with the sector average rather than with every company."
```

```yaml five-questions
id: price
number: 4
question: "Is the price reasonable for its profits?"
lookAt: [peRatio, forwardPe, psRatio, evToEbitda]
where: "Research → Basics view (Price vs. profit column) or Valuation view · Trade → Snapshot → Key statistics · Trade → Financials → Valuation"
compare: "Compare price vs. profit (P/E) with the sector average; a lower number means you pay less for each Ð1 of profit."
example: "KRKN's price vs. profit (P/E) is 17.8, so you pay Ð17.80 for every Ð1 of yearly profit. The sector average is 22.1."
tip: "A low price vs. profit can signal trouble ahead, so read it together with your answers about profit, growth and debt."
```

```yaml five-questions
id: news
number: 5
question: "What is the news saying?"
lookAt: [news, sessionChange, analystRating, priceTarget]
where: "Dispatches (read the What this means line) · Trade → Dispatches · Trade → Analysts"
compare: "Read the What this means line, then check how much the price has already moved since the news came out."
example: "CNBR's dispatch says earnings beat forecasts: it made more profit than expected. Its price is up 6.12% since the news came out."
tip: "News moves prices at once, so by the time you read it, the price has already moved."
```

---

## 7. GAME GUIDE

"How the game works". Settings placeholders come from `game/state`. No scoring weights appear.

```yaml guide
title: "How the game works"
flavor: "The rules of the voyage, in plain words."
examplesNote: "Examples in this guide use sample numbers, so they will not match the prices and figures in your game."
paragraphs:
  - id: start
    heading: "Starting cash"
    body: "Every crew starts with {startingCash} in cash and no shares; {symbol} stands for doubloons, the game's money. The crew with the highest account value (cash plus shares) at the end wins."
  - id: ticks
    heading: "Ticks and sessions"
    body: "Prices update every {tickSeconds} seconds, and each update is a tick. The game has 8 sessions, and the whole game stands for about one year of business."
  - id: prices
    heading: "Prices and news"
    body: "Prices move every tick. Part of each move follows the whole market, part is random, and part comes from news about the company, shown in Dispatches."
  - id: fees
    heading: "Fees"
    body: "Every buy and sell pays a fee of {feePct} of the order value. Fees are charged even on losing trades, so trading back and forth adds up."
  - id: impact
    heading: "Price impact"
    body: "Big orders nudge the price against you: you pay a bit more when buying and get a bit less when selling. The ticket shows this before you place an order."
  - id: limit
    heading: "Position limit"
    body: "A buy cannot put more than {limitPct} of your account value into one company. If an order would pass that line, the ticket shows the most you can buy."
    bodyWhenOff: "This game has no position limit, so you can put as much of your account into one company as your cash allows."
  - id: health
    heading: "What moves prices over time"
    body: "Companies with healthy finances and sensible prices for their profits tend to do better over the game. News, luck and hidden surprises still move prices. Nothing is certain, so spread your bets."
  - id: end
    heading: "When the game ends"
    body: "Holdings are valued at closing prices and the standings lock. The market reveal then shows each company's hidden health score and gives your crew a research grade."
```

---

## 8. TRADING BASICS

Worked examples use KRKN at Ð84.12, the default fee of 0.10%, and the BRIEF §7 crew position of
3,000 KRKN at an average cost of Ð73.50. KRKN has 242 million shares, so orders of these sizes
move its price by less than 0.01%. The KRKN examples leave that out, as BRIEF §7 does. The price
impact example uses a smaller made-up company so the nudge is visible. Its numbers come from
`shared/src/estimate.ts` with beta 1.00. `TradingBasics.tsx` shows `guide.examplesNote` above the
examples, because KRKN's price and figures in a live game will differ from these sample numbers.

```yaml trading-basics
id: marketOrder
title: "Market orders"
glossary: marketOrder
explain: "A market order buys or sells right away at about the current price. It is the only order type in this game."
example:
  - "KRKN's price is Ð84.12, and you place a market order to buy 10 shares."
  - "The ticket shows an estimate. When you place the order, it goes through right away at about Ð84.12 a share."
  - "If the price moves more than 2% before you place it, the ticket asks you to review a new estimate."
caution: "The final price can differ a little from the preview, because prices update every tick."
```

```yaml trading-basics
id: fee
title: "Fees"
glossary: fee
explain: "Every buy and every sell pays a fee, a percent of the order value. The default fee is 0.10%."
example:
  - "Buy 10 KRKN at Ð84.12: order value Ð841.20 + fee Ð0.84 = total cost Ð842.04."
  - "Sell 10 KRKN at Ð84.12: order value Ð841.20 − fee Ð0.84 = you receive Ð840.36."
caution: "A quick buy and sell at the same price still loses both fees."
```

```yaml trading-basics
id: priceImpact
title: "Price impact"
glossary: priceImpact
explain: "Large orders nudge the price against you as they go through. The nudge is bigger for companies with fewer shares, and the ticket shows it before you place an order."
example:
  - "Buy 500 KRKN at Ð84.12: KRKN has 242 million shares, so the nudge is under 0.01% and the estimate stays Ð84.12."
  - "A smaller company has 70 million shares at Ð50.00. You buy 8,000 shares, and the ticket shows a price impact of 0.02%."
  - "You pay about Ð50.01 a share: order value Ð400,083.13 + fee Ð400.08 = total cost Ð400,483.21."
  - "Without the nudge, 8,000 shares would cost Ð400,000.00, so the nudge added Ð83.13."
caution: "Other crews' orders in the same price update also move the price, and the nudge fades, so quickly selling back usually loses money."
```

```yaml trading-basics
id: avgCost
title: "Average cost"
glossary: avgCost
explain: "Average cost is the average price you paid per share across all your buys of one company. Fees are not included, and selling does not change it."
example:
  - "You own 3,000 KRKN at an average cost of Ð73.50 and buy 500 more at Ð84.12."
  - "Cost basis: 3,000 × Ð73.50 + 500 × Ð84.12 = Ð262,560.00, what you paid for all 3,500 shares."
  - "New average cost: Ð262,560.00 ÷ 3,500 = Ð75.02."
caution: "A higher average cost means the price must climb further before the holding shows a gain."
```

```yaml trading-basics
id: gains
title: "Gains and losses"
glossary: totalGain
explain: "Unrealized gain is profit or loss on shares you still own. Realized gain is profit or loss you locked in by selling, after the sale's fee."
example:
  - "You own 3,000 KRKN at an average cost of Ð73.50, and the price is now Ð84.12."
  - "Unrealized gain: 3,000 × (Ð84.12 − Ð73.50) = Ð31,860.00."
  - "You sell 1,000 at Ð84.12, a sale of Ð84,120.00 with a fee of Ð84.12."
  - "Realized gain: Ð84,120.00 − (1,000 × Ð73.50) − Ð84.12 = Ð10,535.88."
  - "The 2,000 shares you keep still show Ð21,240.00 of unrealized gain, and your average cost stays Ð73.50."
caution: "An unrealized gain can shrink or vanish if the price falls before you sell."
```

```yaml trading-basics
id: diversification
title: "Diversification"
glossary: diversification
explain: "Diversification means spreading your money across several companies and sectors, so one bad surprise hurts your account less."
example:
  - "Put Ð400,000 into one company and it drops 20%: you lose Ð80,000."
  - "Split Ð400,000 across four companies at Ð100,000 each. If one drops 20% and the rest hold steady, you lose Ð20,000."
caution: "Spreading out lowers the damage from one company, but it cannot stop losses when the whole market falls."
```

---

## 9. ORDER TICKET COPY

```yaml ticket
explain:
  marketOrderBuy: "Buys right away at about the current price."
  marketOrderSell: "Sells right away at about the current price."
  fee: "{feePct} charged on every trade."
  priceImpact: "Big orders nudge the price against you."
  priceImpactDetailBuy: "Because of its size, this order pays about {impactPct} more per share."
  priceImpactDetailSell: "Because of its size, this order gets about {impactPct} less per share."
  priceImpactTiny: "This order is small for {ticker}, so the nudge is under 0.01%."
  positionLimit: "A buy can't put more than {limitPct} of your account into one company."
  positionLimitOff: "This game has no limit on how much of your account can be in one company."
  intervalLimit: "You can trade up to {cap} shares of {ticker} per price update."
lines:
  shareOfAccount: "This order would make {ticker} {pct} of your account."
  amountModeBuy: "≈ {shares} shares · {leftover} stays as cash"
  amountModeSell: "≈ {shares} shares of the {owned} you own"
  youOwn: "You own {owned} shares"
  youOwnNone: "You don't own any {ticker} yet"
  priceAsOf: "Price as of tick {tick}"
  previewRecapBuy: "Buy {qty} shares of {ticker} ({name}) at about the current price."
  previewRecapSell: "Sell {qty} shares of {ticker} ({name}) at about the current price."
  pricedAt: "Priced at tick {tick} · {time}"
  estimatedNote: "Estimated. Prices can change between this preview and when you place the order, so the final price may differ slightly."
  filledBuy: "Order filled: Bought {qty} {ticker} at {price} ({total})."
  filledSell: "Order filled: Sold {qty} {ticker} at {price} ({total})."
  filledFlavor: "Fair winds."
  filledVsPreviewAbove: "{diff} above the preview estimate of {est}"
  filledVsPreviewBelow: "{diff} below the preview estimate of {est}"
  filledVsPreviewSame: "Same as the preview estimate"
  exampleShareOfAccount: "This order would make KRKN 27.2% of your account."
  exampleAmountModeBuy: "≈ 59 shares · Ð31.96 stays as cash"
  exampleFilled: "Order filled: Bought 50 KRKN at Ð84.12 (Ð4,206.00)."
  exampleFilledVsPreview: "Ð0.03 above the preview estimate of Ð84.12"
stages:
  entry: "Step 1 · enter your order"
  preview: "Step 2 · review before placing"
  filled: "Step 3 · order filled"
  rejected: "Needs attention"
buttons:
  buy: "Buy"
  sell: "Sell"
  shares: "Shares"
  amount: "Doubloons"
  preview: "Preview order"
  edit: "Edit order"
  place: "Place order"
  placing: "Placing order…"
  clear: "Clear"
  tradeAgain: "Trade again"
  viewActivity: "View activity"
  close: "Close"
chips:
  buy: ["10", "50", "100", "Max"]
  sell: ["25%", "50%", "All"]
banners:
  paused:
    title: "Trading paused"
    flavor: "Becalmed"
    body: "The host paused the market at tick {tick}. You can preview orders, but you can't place them until trading resumes."
  lobby:
    title: "Market not open yet"
    flavor: "Anchored in port"
    body: "Trading opens when the host starts the game. You can research companies and preview orders now."
  ended:
    title: "Game ended"
    flavor: "Anchors dropped"
    body: "Trading is closed for this game. See the final standings and the market reveal."
  tradingDisabled:
    title: "Trading turned off for your crew"
    body: "The host has turned off trading for your crew. You can still research companies and view your account."
```

Every error has a `title`, a `message` that says what went wrong in numbers, and a `fix` (a button
label, or `null` when the only fix is waiting). `example` shows the message filled in with BRIEF §7
figures.

Keys match the codes from `estimateOrder()` and `POST /orders`. Oversell is `insufficient_shares`.
For `interval_limit`, use `messageOneSecond` instead of `message` when `{seconds}` is 1, so the text
never says "1 seconds".
The server sends `market_closed` whenever the game is not live, so the ticket chooses
`market_closed` (lobby), `paused` or `market_closed_ended` by reading the game phase. Codes with
no server equivalent (`amount_too_small`, `network`, `unknown_error`) are ticket-only.

```yaml ticket-errors
insufficient_funds:
  title: "Not enough cash"
  message: "This order is {shortfall} more than your cash available to trade ({cash}). Lower the shares or amount, or use the most you can afford."
  fix: "Use max ({maxShares} shares)"
  example: "This order is Ð88,466.93 more than your cash available to trade (Ð248,349.55). Lower the shares or amount, or use the most you can afford."
  exampleFix: "Use max (2,949 shares)"
  exampleContext: "Buy 4,000 KRKN at Ð84.12, total Ð336,816.48, with Ð248,349.55 of cash (BRIEF §7, which leaves out KRKN's price impact of under 0.01%)."
insufficient_shares:
  title: "Not enough shares"
  message: "You own {owned} shares of {ticker}, so you can sell up to {owned}. Lower the number of shares or choose All."
  messageNoneOwned: "You don't own any {ticker} shares, so there is nothing to sell. Switch to Buy or pick a company you own."
  fix: "Sell all {owned}"
  example: "You own 3,000 shares of KRKN, so you can sell up to 3,000. Lower the number of shares or choose All."
position_limit:
  title: "Over the position limit"
  message: "This would put more than {limitPct} of your account in {ticker}. You can buy up to {maxShares} more shares."
  messageAtLimit: "{ticker} already makes up {limitPct} or more of your account, the most a buy can reach. You can buy more only if that share falls below the limit."
  fix: "Use {maxShares}"
  example: "This would put more than 25% of your account in KRKN. You can buy up to 222 more shares."
  exampleFix: "Use 222"
  exampleContext: "Host position limit 25%. Buy 500 KRKN with 3,000 owned and an account value of Ð1,084,219.55 (BRIEF §7)."
interval_limit:
  title: "Too many shares for one price update"
  message: "You can trade up to {cap} shares of {ticker} per price update. Lower the shares, or place the rest after the next update in about {seconds} seconds."
  messageOneSecond: "You can trade up to {cap} shares of {ticker} per price update. Lower the shares, or place the rest after the next update in about 1 second."
  messageAfterTrades: "You already traded {used} shares of {ticker} in this price update. You can trade {remaining} more now, or the rest after the next update."
  fix: "Use {cap}"
  example: "You can trade up to 1,613,333 shares of KRKN per price update. Lower the shares, or place the rest after the next update in about 30 seconds."
  exampleContext: "The limit is a company's total shares ÷ 150, rounded down. KRKN: 242,000,000 ÷ 150 = 1,613,333."
price_moved:
  title: "Price moved"
  message: "The price of {ticker} moved more than 2% since your preview, from {quoted} to {last}. Review the updated estimate, then place the order again."
  fix: "Review updated order"
  example: "The price of KRKN moved more than 2% since your preview, from Ð84.12 to Ð86.03. Review the updated estimate, then place the order again."
market_closed:
  title: "Market not open yet"
  message: "Trading opens when the host starts the game. You can research companies and preview orders now."
  fix: "Open Research"
market_closed_ended:
  title: "Game ended"
  message: "The game has ended, so trading is closed. See how every crew finished and what drove each company's price."
  fix: "See final standings"
paused:
  title: "Trading paused"
  message: "The host has paused trading. We kept your order details, so you can place it as soon as trading resumes."
  fix: null
trading_disabled:
  title: "Trading turned off for your crew"
  message: "The host has turned off trading for your crew. Ask your host to turn it back on; you can still research and view your account."
  fix: null
bad_quantity:
  title: "Check the number of shares"
  message: "Enter a whole number of shares that is 1 or more, like 10 or 250."
  fix: "Clear"
amount_too_small:
  title: "Amount too small"
  message: "That amount is less than 1 share of {ticker} at {price}. Enter at least {minAmount}, which includes the fee."
  fix: "Use {minAmount}"
unknown_company:
  title: "Company not found"
  message: "We couldn't find a company with that symbol. Pick one from the search list, like KRKN."
  fix: "Search companies"
no_team:
  title: "Crew account not found"
  message: "We couldn't find your crew's account. Sign out, sign back in, and try again; if it keeps happening, tell your host."
  fix: "Sign out"
network:
  title: "Order not sent"
  message: "Your order didn't reach the exchange. Check your connection and press Place order again; you won't be charged twice."
  fix: "Place order again"
unknown_error:
  title: "Something went wrong"
  message: "Your order could not be placed. Press Place order to try again; if it keeps failing, tell your host."
  fix: "Try again"
```

---

## 10. REVEAL COPY

Shown only on the Final Reckoning screen after the game ends.

Pillar phrases name each pillar's overall direction, never a single number, because every pillar
mixes several items (spec §3): Growth mixes sales growth, profit change and industry growth; Safety
mixes debt vs. owner equity, short-term bill coverage and how steady profit per share grew; Price
compares P/E and EV/EBITDA with the sector at the starting price. So "Growing sales" or "Light
debt" could be false for a company whose pillar is high for other reasons, and "Cheap for its
profits" could contradict the end-of-game price.

```yaml reveal
eyebrow: "Market reveal"
title: "What was behind the prices"
flavor: "The fog lifts."
intro: "Each company had a hidden health score built from its financial numbers. Healthier companies had better odds, but news, luck and hidden surprises still mattered."
hiddenDuringPlay: "Scores were hidden during trading."
closingPrice: "Every holding was valued at its closing price, which leaves out the last price nudges from orders."
scatter:
  title: "Health score vs. return"
  xLabel: "Health score (0–100)"
  yLabel: "Actual return"
  trendLabel: "Typical return"
  yourHoldings: "Your crew's holdings"
  others: "Other companies"
  caption: "Each dot is one company. The dashed line shows the typical return for each health score; dots above it did better, and dots below did worse."
  luckiest: "Luckiest: {ticker}"
  unluckiest: "Unluckiest: {ticker}"
table:
  title: "Company scorecard"
  caption: "{n} companies · returns from the first tick to the last"
  columns:
    company: "Company"
    quality: "Health score (quality score)"
    grade: "Grade"
    drivers: "What drove the score"
    expected: "Expected return"
    actual: "Actual return"
    luck: "Luck (actual − expected)"
    label: "Result"
  help:
    quality: "A score from 0 to 100 built from each company's financial numbers, including its starting price vs. profit. Higher means healthier."
    grade: "A to F, from the healthiest fifth of companies to the least healthy fifth."
    expected: "What the company's odds pointed to: its health, its hidden surprise and how much it usually rises with the market."
    actual: "How much the price really changed from the first tick to the last."
    luck: "The part of the move its odds did not explain, such as news, market swings and chance."
  sortBy: "Sort by"
  sortOptions:
    quality: "Health score"
    luck: "Luck"
    actual: "Actual return"
labels:
  rule: "The server sets each label from the signs of q (health) and luck; these meanings describe the four cases."
  compounder:
    name: "Compounder"
    meaning: "Above-average health, and the price did at least as well as expected."
  unlucky_gem:
    name: "Unlucky gem"
    meaning: "Above-average health, but news or chance left the price below what was expected."
  lucky_turnaround:
    name: "Lucky turnaround"
    meaning: "Below-average health, but news or chance pushed the price above what was expected."
  decliner:
    name: "Decliner"
    meaning: "Below-average health, and the price did worse than expected."
pillars:
  rule: "Drivers are the 2 pillars farthest from 0, so a weak company shows its weak spots. Use high when a pillar is 0 or above and low when below. Join them with a comma and lowercase the second."
  prof:
    name: "Profits"
    high: "Strong profits"
    low: "Weak profits"
  grow:
    name: "Growth"
    high: "Growing business"
    low: "Slow or shrinking business"
  safe:
    name: "Safety"
    high: "Safer finances"
    low: "Riskier finances"
  val:
    name: "Price"
    high: "Low starting price for its profits"
    low: "High starting price for its profits"
  example: "Strong profits, safer finances"
hiddenSurprise:
  title: "Hidden surprises"
  body: "Each company also had a hidden surprise: a random push, set at the start, that helped or hurt its odds. No amount of research could see it."
  note: "The expected return already includes the surprise, so it is not counted as luck."
researchGrade:
  title: "Your crew's research grade"
  body: "How healthy your holdings were, averaged over the whole game and weighted by how much you held in each."
  rankNote: "Your grade does not change your rank. Rank comes only from account value."
  noHoldings: "Your crew held no shares, so there is no research grade this game."
  marketAverage: "Market average"
  winner: "Winner"
  holdingsTable:
    holding: "Holding"
    weight: "Share of invested value"
    quality: "Health score"
    total: "Weighted average"
  gradeBOrBetter: "{pct} of your invested value sat in companies graded B or better."
  grades:
    A:
      meaning: "Most of your money sat in the healthiest companies."
      flavor: "Sharp eyes on the charts."
    B:
      meaning: "Much of your money sat in healthier-than-average companies."
      flavor: "Steady navigation."
    C:
      meaning: "Your holdings were about as healthy as the average company."
      flavor: "A middle course."
    D:
      meaning: "Much of your money sat in less healthy companies."
      flavor: "Rough waters this time."
    F:
      meaning: "Most of your money sat in the least healthy companies."
      flavor: "Every captain learns from a storm."
  nextTime: "Next game, try reading each company with the 5 questions in the Learn guide."
```

---

## 11. HOST SETTINGS COPY

```yaml host-settings
panelTitle: "Game settings"
lockedNote: "Locked while the game is running. You can change settings only in the lobby."
saved: "Settings saved."
gameLength:
  label: "Game length"
  help: "How long trading lasts. Every game has 8 sessions, and prices update every 5 to 30 seconds depending on length."
  derived: "{hours}-hour game · updates every {tickSeconds} seconds · {totalTicks} ticks"
  options:
    "3600000": "1 hour"
    "7200000": "2 hours"
    "14400000": "4 hours"
    "28800000": "8 hours"
    "43200000": "12 hours"
    "86400000": "24 hours"
    "172800000": "48 hours"
startingCash:
  label: "Starting cash"
  help: "The cash each crew gets at the start. New crews and new games use this amount."
  flavor: "Every crew's starting chest."
tradingFee:
  label: "Trading fee"
  help: "Charged on every buy and sell as a percent of the order value. The default is 0.10%."
  unitNote: "Entered in basis points: 10 basis points equals 0.10%."
researchEdge:
  label: "Research edge"
  help: "How much company health affects prices over the whole game."
  options:
    low: { label: "Low", help: "More luck. Company health matters less." }
    normal: { label: "Normal", help: "Balanced. Health and luck both matter. This is the default." }
    high: { label: "High", help: "Research pays more. Company health matters more." }
  caution: "On every setting, news and luck still move prices."
positionLimit:
  label: "Position limit"
  help: "Caps how much of a crew's account can go into one company, so one all-in bet can't decide the standings."
  options:
    "1": { label: "Off", help: "No cap. A crew can put its whole account into one company." }
    "0.5": { label: "50%", help: "Up to half of an account in one company. This is the default." }
    "0.35": { label: "35%", help: "Up to about a third of an account in one company." }
    "0.25": { label: "25%", help: "Up to a quarter of an account in one company." }
currency:
  label: "Currency"
  help: "The money name and symbol shown everywhere in the game."
newGame:
  title: "Start a new game"
  body: "Creates a fresh market: the same companies with new financial numbers and news. All trades, holdings and history are cleared, and the game returns to the lobby."
  confirmTitle: "Start a new game?"
  confirmPrompt: "Type NEW GAME to confirm."
  confirmWord: "NEW GAME"
  confirmButton: "Start new game"
  cancel: "Cancel"
  done: "New game ready. The game is back in the lobby."
  flavor: "Fresh charts drawn."
keepCrews:
  label: "Keep crews and passwords"
  whenOn: "Crews keep their names and passwords, and each starts again with {startingCash}."
  whenOff: "All crews and their sign-ins are deleted. You will need to add crews again."
control:
  start:
    title: "Start the game?"
    body: "Trading opens for every crew and the clock starts. Settings stay locked until you start a new game."
    button: "Start game"
  pause:
    title: "Pause trading?"
    body: "Crews can't place orders, and the clock stops until you resume."
    button: "Pause"
  resume:
    title: "Resume trading?"
    body: "Orders open again, and the clock continues from where it stopped."
    button: "Resume"
  end:
    title: "End the game now?"
    body: "Trading closes for good, holdings are valued at closing prices, and the market reveal opens. This can't be undone."
    button: "End game"
  heartbeat:
    ok: "Engine healthy"
    warn: "Engine running slow"
    bad: "Engine not responding"
    idle: "Engine idle"
```

### 11.1 Host console errors

The server answers a failed host action with `{ error: <code>, message }`, where `message` is the
`message` below. The host console shows `title` above it. Crew codes come from the Crews screen
(add, reset password, trading switch, remove). `busy` answers any change made while a new game is
being built. `internal` is the fallback for anything unexpected.

```yaml host-errors
exists:
  title: "Name already taken"
  message: "A crew with this name already exists. Names ignore capitals and punctuation, so pick a clearly different name."
bad_name:
  title: "Check the crew name"
  message: "Use at least one letter or number. The name admin is kept for the host."
not_found:
  title: "Crew not found"
  message: "We couldn't find that crew. It may have been removed. Refresh the crew list and try again."
busy:
  title: "New game in progress"
  message: "A new game is being prepared. Wait a moment, then try again."
bad_request:
  title: "Check your entry"
  message: "Something in that request isn't valid. Check the fields and try again."
internal:
  title: "Something went wrong"
  message: "The server couldn't finish that. Try again. If it keeps failing, ask your developer to check the server logs."
```

---

## 12. EMPTY, LOADING AND PHASE STATES

`title` and `body` are plain. `flavor` is optional secondary copy.

```yaml states
phases:
  lobby:
    pill: "In the lobby"
    flavor: "Anchored in port"
    body: "The market opens when the host starts the game. You can research companies now."
  live:
    pill: "Market open"
    flavor: "Sails up"
    body: "Trading is open. Prices update every {tickSeconds} seconds."
  paused:
    pill: "Trading paused"
    flavor: "Becalmed"
    body: "The host paused trading. The clock stops, and orders can be placed again when trading resumes."
  finalSession:
    pill: "Final session"
    flavor: "Land in sight"
    body: "This is the last of 8 sessions. The game ends in {timeLeft}."
  ended:
    pill: "Game ended"
    flavor: "Anchors dropped"
    body: "Trading is closed. Holdings were valued at closing prices, and the standings are final."
  countdown: "{timeLeft} left"
  countdownPaused: "Clock stopped while paused"
loading:
  generic: { title: "Loading…", flavor: "Charting the course" }
  prices: { title: "Loading prices…", flavor: "Reading the winds" }
  financials: { title: "Loading financials…", flavor: "Unrolling the ledgers" }
  standings: { title: "Loading standings…", flavor: "Counting the treasure" }
  news: { title: "Loading news…", flavor: "Waiting on the harbor bell" }
empty:
  positions:
    title: "No positions yet"
    body: "You haven't bought any shares. Research a company, then place a small order to get started."
    action: "Open Research"
    flavor: "The hold is empty."
  orders:
    title: "No orders yet"
    body: "Orders you place will show here, with their prices and fees."
    flavor: "The logbook awaits its first entry."
  fills:
    title: "No filled orders yet"
    body: "Filled orders will show here with their price, fee and cash after."
  news:
    title: "No news yet"
    body: "News appears here as it happens during the game."
    flavor: "Quiet seas so far."
  newsFiltered:
    title: "No news for this filter"
    body: "Try All to see every dispatch."
  watchlist:
    title: "Your watchlist is empty"
    body: "Add a company with the Watchlist button on its Trade page to follow it here."
  search:
    title: "No companies match “{query}”"
    body: "Try a symbol like KRKN or part of a company name."
  glossarySearch:
    title: "No terms match “{query}”"
    body: "Try a simpler word, like profit or debt."
  chart:
    title: "Not enough price history yet"
    body: "The chart fills in as prices update."
  standings:
    title: "No standings yet"
    body: "Standings appear after the game starts and the first prices update."
  results:
    title: "The market reveal isn't open yet"
    body: "It opens when the game ends. Until then, the health scores stay hidden."
    flavor: "The fog hasn't lifted."
  hostCrews:
    title: "No crews yet"
    body: "Add a crew to give players a name and password."
  hostNews:
    title: "No news scheduled"
    body: "Scheduled news appears here after the game starts."
errors:
  pageLoad:
    title: "Couldn't load this page"
    body: "Check your connection and try again."
    action: "Try again"
    flavor: "Lost the wind."
  offline:
    title: "You're offline"
    body: "Prices and standings will update when you reconnect."
  stale:
    title: "Prices may be out of date"
    body: "The last price update was {ago} ago. Wait a moment or refresh the page."
signIn:
  error: "Crew name or password is incorrect. Check the spelling with your host and try again."
  help: "Your host gives each crew its name and password."
  disabled: "Your crew can sign in, but trading is turned off. Ask your host to turn it back on."
  footer: "A market simulation. No real money."
```
