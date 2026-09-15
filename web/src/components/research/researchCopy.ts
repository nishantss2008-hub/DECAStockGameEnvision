/**
 * Company page words: COPY §3.2 (`explain-extra`), §4 (`news-extra`), §6, §9 (`buttons`), §12 (`empty`, `loading`)
 * and the phone strings of MOBILE §7.0 / §7.7 / §7.8.
 */
import { COPY_DATA } from '../../lib/glossary';

const extra = COPY_DATA.explainExtra;

export const RESEARCH = {
  keyStats: 'Key stats',
  seeAllStats: 'See all stats',
  lastFourYears: 'Last 4 years',
  seeFinancials: 'See financials',
  sales: 'Sales',
  profit: 'Profit',
  analystTitle: extra.analystCard.title,
  analystCaution: extra.analystCard.caution,
  priceTarget: 'Price target',
  newsAbout: 'News about {ticker}',
  seeAllNews: 'See all news',
  about: 'About',
  fiveQuestions: extra.research.fiveQuestionsPanel,
  fiveQuestionsNote: extra.research.fiveQuestionsNote,
  helper: extra.research.helper,
  unitsNote: extra.averageLine.unitsNote,
  whatThisMeans: COPY_DATA.newsExtra.whatThisMeans,
  sentimentShort: { bullish: COPY_DATA.newsExtra.sentiment.bullish.short, bearish: COPY_DATA.newsExtra.sentiment.bearish.short },
  yourActivity: 'Your {ticker} activity',
  noOrders: 'No {ticker} orders yet',
  noOrdersBody: 'Orders you place will show here, with their prices and fees.',
  seeAllCount: 'See all {n}',
  seeAll: 'See all',
  sessionRange: 'Session range',
  sessionLow: 'Session low',
  sessionHigh: 'Session high',
  sessionOpen: 'Session open',
  startPrice: 'Start price',
  buy: 'Buy',
  sell: 'Sell',
  seeFinalResults: 'See final results',
  watchAdd: 'Add {ticker} to watchlist',
  watchRemove: 'Remove {ticker} from watchlist',
  moreOptions: 'More options',
  financialsTitle: 'Financials',
  allStatsTitle: 'All stats',
  statements: { income: 'Income', balance: 'Balance', cashflow: 'Cash flow' },
  statementRegion: { income: 'Income statement, scrolls sideways', balance: 'Balance sheet, scrolls sideways', cashflow: 'Cash flow statement, scrolls sideways' },
  statementsLabel: 'Statements',
  numbersHelp: 'What these numbers mean',
  loadingPrices: 'Loading prices…',
  loadingFinancials: 'Loading financials…',
  notFoundTitle: 'Company not found',
  notFoundBody: "We couldn't find a company with that symbol. Pick one from the search list, like KRKN.",
  searchCompanies: 'Search companies',
  pageLoadTitle: "Couldn't load this page",
  pageLoadBody: 'Check your connection and try again.',
  tryAgain: 'Try again',
  noFinancials: 'No financials for this company.',
  chartLabel: '{ticker} price',
  chartRange: 'Chart range',
} as const;

export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
