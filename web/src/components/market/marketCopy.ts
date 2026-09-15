/**
 * Words for Markets (MOBILE §7.6), Sector list and News (§7.11). Phone strings are MOBILE §7.0 `COPY-TBD mobile.*`;
 * the rest come from COPY.md (§1.1, §1.5, §3.2 research, §4 news-extra, §12 empty/loading/errors).
 * Placeholders are filled with `fill()` from shell/copy.
 */
import { COPY_DATA, NEWS_EXTRA } from '../../lib/glossary';

const research = COPY_DATA.explainExtra.research;

/** Column labels COPY does not name yet. */
export const LABELS = {
  /** Analysts view: gap between the analysts' price target and the price (wording of COPY §3.2 analystCard). */
  targetGap: 'Target vs. price',
} as const;

export const LOADING = {
  prices: { title: 'Loading prices…', flavor: 'Reading the winds' },
  news: { title: 'Loading news…', flavor: 'Waiting on the harbor bell' },
} as const;

export const ERRORS = {
  pageLoad: { title: "Couldn't load this page", body: 'Check your connection and try again.', action: 'Try again', flavor: 'Lost the wind.' },
} as const;

export const MARKETS = {
  title: 'Markets',
  searchCompanies: 'Search {n} companies',
  recent: 'Recent',
  removeRecent: 'Remove {ticker}',
  results: '{n} results',
  oneResult: '1 result',
  searchEmpty: { title: 'No companies match “{query}”', body: 'Try a symbol like KRKN or part of a company name.' },
  compositeLabel: 'Whole-market index',
  compositeName: 'Pirate Composite',
  thisSession: 'this session',
  sinceStart: 'since the game began',
  industryGroups: 'Industry groups',
  sectorIndex: 'Sector index',
  biggestMoves: 'Biggest moves this session',
  up: 'Up',
  down: 'Down',
  noMoves: 'No company has moved yet this session.',
  watchlist: 'Watchlist',
  watchlistEmpty: { title: 'Your watchlist is empty', body: 'Tap the star on a company page to follow it here.' },
  allCompanies: 'All companies',
  viewLabel: 'Markets view',
  viewMenuLabel: 'View',
  views: { basics: 'Basics', price: 'Price', value: 'Value', health: 'Health', analysts: 'Analysts' },
  viewHelp: {
    basics: research.views.basics?.help ?? '',
    price: 'Prices and how much they moved this session.',
    value: research.views.valuation?.help ?? '',
    health: research.views.health?.help ?? '',
    analysts: research.views.analysts?.help ?? '',
  },
  helper: research.helper,
  columnsHelp: 'What these columns mean',
  sortFilter: 'Sort and filter companies, sorted by {sort}',
  sortBy: 'Sort by',
  sorts: { size: 'Company size', session: 'Session change', total: 'Total change', price: 'Price', symbol: 'Symbol' },
  industryGroup: 'Industry group',
  allGroups: 'All industry groups',
  showingGroup: 'Showing {sector}',
  showAll: 'Show all',
  noCompanies: 'No companies in this group yet.',
  pricesFooter: 'Prices update every {tickSeconds} seconds · as of {time}',
  seeAllCompanies: 'See in All companies',
  companies: 'Companies',
  sectorNotFound: { title: 'No industry group by that name', action: 'Open Markets' },
  usuallyGood: 'Usually a good sign when ',
} as const;

export const NEWS = {
  title: 'News',
  flavor: 'Dispatches from the Spanish Main',
  filterLabel: 'Show news for',
  filters: NEWS_EXTRA.filters,
  whatThisMeans: NEWS_EXTRA.whatThisMeans,
  sentiment: NEWS_EXTRA.sentiment,
  sinceReport: NEWS_EXTRA.sinceReport,
  sinceReportHelp: NEWS_EXTRA.sinceReportHelp,
  sinceLabel: 'Since the news',
  sinceTerm: 'change since the news',
  companyCount: NEWS_EXTRA.companyCount,
  sourceHost: NEWS_EXTRA.sourceHost,
  composite: 'Composite',
  youOwn: 'You own this',
  viewTicker: 'View {ticker}',
  tickLine: '{time} · tick {tick}',
  readDispatch: 'Read dispatch',
  empty: { title: 'No news yet', body: 'News appears here as it happens during the game.', flavor: 'Quiet seas so far.' },
  emptyFiltered: { title: 'No news for this filter', body: 'Try All to see every dispatch.', action: 'All' },
  notFound: { title: 'This dispatch is not available', body: 'It may not have been sent yet.', action: 'Open News' },
  dispatch: 'Dispatch',
  moreCompanies: '+ {n} more',
} as const;
