/**
 * Pure helpers for the Learn tab (MOBILE §7.14): glossary topic sections, the term-beside-label fit rule,
 * chapter subtitles, the game guide filled from game/state, COPY §6 `where` paths for the phone, related
 * terms, and the "See it on a company" deep link.
 */
import { DEFAULT_FEE_BPS, DEFAULT_MAX_POSITION_PCT, DEFAULT_STARTING_CAPITAL, DEFAULT_TICK_INTERVAL_MS, CURRENCY, type Company, type GameSettings } from '@deca/shared';
import { METRIC_IDS, type MetricId } from '../../lib/compare';
import { GLOSSARY, GLOSSARY_GROUPS, withCurrency, type GlossaryEntry, type GlossaryGroup } from '../../lib/glossary';
import { formatMoney, formatPct } from '../../lib/format';
import { fill } from '../../shell/copy';
import { GUIDE_COPY } from './learnCopy';
import { INTRO } from './introCopy';
import { INTRO_PATH } from './introFlow';

/** Phone-only Learn strings (MOBILE §7.0 `mobile.*`, §7.14). Section labels inside chapters are COPY-TBD. */
export const LEARN_MOBILE = {
  title: 'Learn',
  searchTerms: 'Search {n} terms',
  glossary: 'Glossary',
  seeItOnCompany: 'See it on a company',
  openTicker: 'Open {ticker}',
  relatedTerms: 'Related terms',
  resultsCount: '{n} results',
  oneResult: '1 result',
  termsCount: '{n} terms',
  oneTerm: '1 term',
  lookAt: 'Look at',
  whereToFind: 'Where to find it',
  compare: 'Compare',
  example: 'Example',
  tip: 'Tip',
  keepInMind: 'Keep in mind',
  chapters: 'Guide',
  termNotFound: 'This term is not in the glossary',
  backToLearn: 'Open Learn',
} as const;

export const LEARN_PATHS = {
  root: '/learn',
  meetTheMarket: INTRO_PATH,
  guide: '/learn/guide',
  fiveQuestions: '/learn/five-questions',
  basics: '/learn/basics',
} as const;

export type ChapterId = 'guide' | 'fiveQuestions' | 'basics';

export function chapterForPath(pathname: string): ChapterId | null {
  const p = pathname.replace(/\/+$/, '');
  if (p === LEARN_PATHS.guide) return 'guide';
  if (p === LEARN_PATHS.fiveQuestions) return 'fiveQuestions';
  if (p === LEARN_PATHS.basics) return 'basics';
  return null;
}

export function searchTermsPlaceholder(n: number): string {
  return fill(LEARN_MOBILE.searchTerms, { n });
}

/**
 * Row subtitles on the Learn root. A subtitle turns a 44px row into a 60px one, so a chapter keeps one only
 * when it says something its title does not: "Meet the market" does not say what is inside it or how long it
 * takes. The others quoted their own chapter's opening words ("How the game works" over its own flavor line,
 * "Read a company in 5 questions" over its first two questions) and are gone.
 */
export function chapterSubtitles(): Partial<Record<'meetTheMarket' | ChapterId, string>> {
  return { meetTheMarket: INTRO.learnSubtitle };
}

// ─── Glossary list ───────────────────────────────────────────────────────────

export interface GlossarySection {
  group: GlossaryGroup;
  label: string;
  entries: GlossaryEntry[];
}

const byLabel = (a: GlossaryEntry, b: GlossaryEntry) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });

/** Plain-English name for each COPY §2 group, in the app's voice (the research views say "Value" and "Health" too). */
export const GLOSSARY_GROUP_LABELS: Record<GlossaryGroup, string> = {
  basics: 'The basics',
  profit: 'Profit',
  growth: 'Growth',
  debt: 'Financial health',
  value: 'Value',
  trading: 'Trading',
  game: 'This game',
};

/**
 * Topic sections in COPY §2 group order, entries sorted by label inside each (MOBILE §7.14). Grouping by topic
 * instead of by letter is what lets Learn open as one screen: 73 terms in 18 letter sections was 4,528px, and a
 * student looking for "Price vs. profit" has no reason to know it starts with P. Search is unchanged and still
 * reaches every term, closed group or not.
 */
export function glossaryGroupSections(entries: readonly GlossaryEntry[]): GlossarySection[] {
  const sorted = [...entries].sort(byLabel);
  return GLOSSARY_GROUPS.map((group) => ({
    group,
    label: GLOSSARY_GROUP_LABELS[group],
    entries: sorted.filter((e) => e.group === group),
  }));
}

/** Row detail on a closed group: "7 terms". */
export function groupTermsCount(n: number): string {
  return n === 1 ? LEARN_MOBILE.oneTerm : fill(LEARN_MOBILE.termsCount, { n });
}

// Approximate SF Pro advance widths (em) for the fit rule below.
const NARROW: Record<string, number> = {
  ' ': 0.26, i: 0.23, l: 0.23, j: 0.23, '.': 0.26, ',': 0.26, "'": 0.2, '’': 0.2, ':': 0.26,
  f: 0.32, t: 0.34, r: 0.36, I: 0.26, m: 0.87, w: 0.77, M: 0.88, W: 0.98, '/': 0.38, '-': 0.38, '&': 0.66, '(': 0.33, ')': 0.33, '%': 0.8,
};

function widthEm(text: string): number {
  let sum = 0;
  for (const ch of text) {
    const known = NARROW[ch];
    if (known !== undefined) sum += known;
    else if (/[0-9]/.test(ch)) sum += 0.6;
    else if (/[A-Z]/.test(ch)) sum += 0.67;
    else if (/[a-z]/.test(ch)) sum += 'cesxzyvk'.includes(ch) ? 0.5 : 0.56;
    else sum += 0.6;
  }
  return sum;
}

/** Body text size and the room for label + term in a 44px disclosure row on a 393pt phone. */
const BODY_PX = 17;
const ROW_TEXT_ROOM_PX = 293;
/** A term row inside an open glossary topic is indented 8px, and has that much less room (learn.css). */
export const GROUPED_ROW_TEXT_ROOM_PX = ROW_TEXT_ROOM_PX - 8;

/**
 * Whether the finance term fits beside the label as the row's detail; otherwise it goes under the label as a
 * subtitle (iPhoneLearn: "Cash on hand · cash and equivalents" vs "Cash from running the business" over
 * "operating cash flow"). Always stacked at large text sizes.
 */
export function termFitsBeside(label: string, term: string, largeText = false, roomPx: number = ROW_TEXT_ROOM_PX): boolean {
  if (largeText) return false;
  return (widthEm(label) + widthEm(term)) * BODY_PX <= roomPx;
}

export function relatedEntries(entry: GlossaryEntry): GlossaryEntry[] {
  return entry.related.map((id) => GLOSSARY[id]).filter((e): e is GlossaryEntry => Boolean(e));
}

// ─── Guide ───────────────────────────────────────────────────────────────────

export type GuideSettings = Pick<GameSettings, 'startingCapital' | 'feeBps' | 'maxPositionPct' | 'currency'> & { tickIntervalMs: number };

export interface FilledParagraph {
  id: string;
  heading: string;
  body: string;
}

/** COPY §7 paragraphs with this game's settings (defaults before game/state loads). */
export function guideParagraphs(game: GuideSettings | null): FilledParagraph[] {
  const currency = game?.currency ?? CURRENCY;
  const maxPct = game?.maxPositionPct ?? DEFAULT_MAX_POSITION_PCT;
  const values = {
    startingCash: formatMoney(game?.startingCapital ?? DEFAULT_STARTING_CAPITAL, { symbol: currency.symbol }),
    symbol: currency.symbol,
    tickSeconds: Math.round((game?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS) / 1000),
    feePct: formatPct((game?.feeBps ?? DEFAULT_FEE_BPS) / 10_000),
    limitPct: formatPct(maxPct, { digits: 0 }),
  };
  return GUIDE_COPY.paragraphs.map((p) => {
    const template = p.id === 'limit' && maxPct >= 1 && p.bodyWhenOff ? p.bodyWhenOff : p.body;
    return { id: p.id, heading: p.heading, body: fill(withCurrency(template, currency), values) };
  });
}

// ─── Five questions: where to find it on the phone ───────────────────────────

const WHERE_RULES: Array<[RegExp, string]> = [
  [/^Research → Basics view/, 'Markets › All companies › Basics'],
  [/ or Financial health view$/, ' or Health'],
  [/ or Valuation view$/, ' or Value'],
  [/^Trade → Snapshot → Key facts$/, 'Company page › Key stats'],
  [/^Trade → Snapshot → Key statistics$/, 'Company page › All stats'],
  [/^Trade → Dispatches$/, 'Company page › News'],
  [/^Trade → Analysts$/, 'Company page › Analyst view'],
  [/^Trade → /, 'Company page › '],
  [/^Dispatches\b/, 'News'],
  [/ → /g, ' › '],
];

/**
 * COPY §6 `where` lists desktop screens separated by " · ". MOBILE §7.0 asks for phone paths
 * ("Markets › All companies › Basics", "Company page › Financials"): one string per location.
 */
export function phoneWhere(where: string): string[] {
  return where.split(' · ').map((loc) => WHERE_RULES.reduce((text, [re, to]) => text.replace(re, to), loc.trim()));
}

// ─── See it on a company ─────────────────────────────────────────────────────

const METRICS = new Set<string>(METRIC_IDS);

export function metricForTerm(termId: string): MetricId | null {
  return METRICS.has(termId) ? (termId as MetricId) : null;
}

/** COPY §1.2 `short` text for each company metric (ExplainRow labels on the phone). */
const METRIC_SHORT: Record<MetricId, string> = {
  marketCap: 'Company size',
  revenue: 'Sales',
  netIncome: 'Profit',
  netMargin: 'Profit margin',
  grossMargin: 'Gross margin',
  revenueGrowth: 'Sales growth',
  eps: 'Profit per share',
  peRatio: 'Price vs. profit',
  forwardPe: 'Price vs. future profit',
  psRatio: 'Price vs. sales',
  pbRatio: 'Price vs. equity',
  evToEbitda: 'Price vs. core profit',
  dividendYield: 'Dividend yield',
  debtToEquity: 'Debt vs. equity',
  currentRatio: 'Bill coverage',
  freeCashFlow: 'Free cash flow',
  roe: 'Return on equity',
  roa: 'Return on assets',
  beta: 'Swings vs. market',
};

export function metricShortLabel(id: MetricId): string {
  return METRIC_SHORT[id];
}

/** The company used for "See it on a company": KRKN (BRIEF §7's example) when it exists, else the first by ticker. */
export function exampleCompany(companies: readonly Company[]): Company | null {
  if (companies.length === 0) return null;
  const krkn = companies.find((c) => c.ticker?.toUpperCase() === 'KRKN');
  if (krkn) return krkn;
  return [...companies].sort((a, b) => (a.ticker ?? '').localeCompare(b.ticker ?? ''))[0] ?? null;
}

export function learnCompanyPath(ticker: string, termId: string): string {
  return `/learn/company/${encodeURIComponent(ticker)}?highlight=${encodeURIComponent(termId)}`;
}
