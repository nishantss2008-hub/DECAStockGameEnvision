/**
 * COPY.md §13 `funds-extra` and §13.1 `markets-extra`, verbatim (spec 2026-09-16 §1–§4).
 *
 * The fund blocks are keyed by fund id on the server and reach the client on the wire, so only the
 * SHARED strings live here — the words every fund screen says about what a basket is. `fundCopy.sync.test.ts`
 * re-reads COPY.md and fails when this drifts, the same contract `server/test/copySync.test.ts` enforces.
 *
 * Two rules this copy exists to keep (COPY §13): never call a fund safe, safer, better or the right
 * choice; and keep saying that its price is the prices it holds, added together.
 */

export const FUNDS_EXTRA = {
  fund: {
    label: 'Fund (basket of companies)',
    sectionTitle: 'Funds',
    whatItIs: 'A fund is a basket of companies you buy in one trade.',
    whyItMatters: "Its price is the prices it holds, added together, so one company's news moves it less.",
    openPrice: 'Every fund opened at {price} a share.',
    noNews: 'A fund has no news of its own. It moves when the companies it holds move.',
  },
  holdings: {
    title: 'What this fund holds',
    note: 'The weights were set when the game began and do not change.',
    weightLabel: 'Share of the fund',
    changeLabel: 'Change this session',
    empty: "We could not load this fund's holdings. Try again in a moment.",
  },
  trading: {
    buy: 'Buying a fund buys a slice of every company it holds.',
    sell: 'Selling a fund sells a slice of every company it holds.',
    impact: "A large fund order nudges each of those companies' prices, the same way a company order does.",
    intervalLimit: 'The shares you trade through a fund count against your limit in each company it holds.',
    limitNote: 'The position limit applies to companies and to the sector funds. {ticker} holds the whole market, so it has no limit.',
  },
} as const;

/**
 * COPY.md §13.1 `markets-extra`: the strings the two-section Markets list and the Compare screen
 * added (MOBILE §7.6, §7.6b). `{n}` in `searchPlaceholder` is companies + funds from the live
 * roster; `{sector}` in `seeGroup` is the chip short name.
 */
export const MARKETS_EXTRA = {
  list: {
    searchPlaceholder: 'Search {n} companies and funds',
    searchEmptyTitle: 'Nothing matches “{query}”',
    searchEmptyBody: 'Try a symbol like KRKN or FLEET, or part of a name.',
    fundBadge: 'Fund',
    companies: 'Companies',
    seeGroup: 'See {sector}',
  },
  compare: {
    link: 'Compare',
    menuItem: 'Compare all companies',
    title: 'Compare companies',
    intro: 'Every company side by side. Pick a set of numbers, then sort.',
  },
} as const;
