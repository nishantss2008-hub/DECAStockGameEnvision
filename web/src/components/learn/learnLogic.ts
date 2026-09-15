/**
 * Pure helpers for the Learn tab (MOBILE §7.14): glossary letter sections, the term-beside-label fit rule,
 * chapter subtitles, the game guide filled from game/state, COPY §6 `where` paths for the phone, related
 * terms, and the "See it on a company" deep link.
 */
import { DEFAULT_FEE_BPS, DEFAULT_MAX_POSITION_PCT, DEFAULT_STARTING_CAPITAL, CURRENCY, type Company, type GameSettings } from '@deca/shared';
import { METRIC_IDS, type MetricId } from '../../lib/compare';
import { GLOSSARY, withCurrency, type GlossaryEntry } from '../../lib/glossary';
import { formatMoney, formatPct } from '../../lib/format';
import { fill, WALKTHROUGH } from '../../shell/copy';
import { FIVE_QUESTIONS } from './fiveQuestions';
import { GUIDE_COPY, TRADING_BASICS } from './learnCopy';

/** Phone-only Learn strings (MOBILE §7.0 `mobile.*`, §7.14). Section labels inside chapters are COPY-TBD. */
export const LEARN_MOBILE = {
  title: 'Learn',
  searchTerms: 'Search {n} terms',
  howToPlay: WALKTHROUGH.reopen,
  glossary: 'Glossary',
  seeItOnCompany: 'See it on a company',
  openTicker: 'Open {ticker}',
  relatedTerms: 'Related terms',
  resultsCount: '{n} results',
  oneResult: '1 result',
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

/** Row subtitles on the Learn root, from the chapters' own copy (iPhoneLearn artboard). */
export function chapterSubtitles(): Record<'howToPlay' | ChapterId, string> {
  return {
    howToPlay: WALKTHROUGH.title,
    guide: GUIDE_COPY.flavor,
    fiveQuestions: FIVE_QUESTIONS.slice(0, 2)
      .map((q) => q.question)
      .join(' '),
    basics: TRADING_BASICS.slice(0, 3)
      .map((t) => t.title)
      .join(' · '),
  };
}

// ─── Glossary list ───────────────────────────────────────────────────────────

export interface GlossarySection {
  letter: string;
  entries: GlossaryEntry[];
}

const byLabel = (a: GlossaryEntry, b: GlossaryEntry) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });

/** Letter sections ("A", "B"…) of entries sorted by label (MOBILE §7.14; no side index). */
export function glossarySections(entries: readonly GlossaryEntry[]): GlossarySection[] {
  const sections: GlossarySection[] = [];
  for (const entry of [...entries].sort(byLabel)) {
    const letter = entry.label.charAt(0).toUpperCase();
    const last = sections[sections.length - 1];
    if (last && last.letter === letter) last.entries.push(entry);
    else sections.push({ letter, entries: [entry] });
  }
  return sections;
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

/**
 * Whether the finance term fits beside the label as the row's detail; otherwise it goes under the label as a
 * subtitle (iPhoneLearn: "Cash on hand · cash and equivalents" vs "Cash from running the business" over
 * "operating cash flow"). Always stacked at large text sizes.
 */
export function termFitsBeside(label: string, term: string, largeText = false): boolean {
  if (largeText) return false;
  return (widthEm(label) + widthEm(term)) * BODY_PX <= ROW_TEXT_ROOM_PX;
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
    tickSeconds: Math.round((game?.tickIntervalMs ?? 30_000) / 1000),
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
