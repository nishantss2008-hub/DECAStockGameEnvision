/**
 * Beginner glossary and news explanations (BRIEF §9, spec §10b).
 *
 * All words come from docs/design/COPY.md through the generated glossary.data.ts; this
 * module only indexes them and adds small render helpers. It is the single source for
 * InfoTips, the Learn glossary and the "What this means" line on dispatches.
 */

import { CURRENCY, NEWS_TYPES, type NewsType } from '@deca/shared';
import type { GlossaryEntry, GlossaryGroup, NewsCopy } from './copyTypes';
import { COPY_DATA } from './glossary.data';

export type {
  CopyData,
  ExampleCompanyCopy,
  ExplainExample,
  ExplainExtraCopy,
  ExplainFormat,
  ExplainTemplate,
  GlossaryEntry,
  GlossaryGroup,
  NewsCopy,
  NewsExtraCopy,
} from './copyTypes';
export { COPY_DATA };

/** Glossary entries in COPY.md order (56 required ids first, then supporting ids). */
export const GLOSSARY_LIST: readonly GlossaryEntry[] = COPY_DATA.glossary;

/** Glossary entries by id. */
export const GLOSSARY: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY_LIST.map((e) => [e.id, e]));

/** Group order and display names used by the Learn glossary. */
export const GLOSSARY_GROUPS: readonly GlossaryGroup[] = ['basics', 'profit', 'growth', 'debt', 'value', 'trading', 'game'];

const NEWS_BY_TYPE = new Map<string, NewsCopy>(COPY_DATA.news.map((n) => [n.type, n]));

function newsCopy(type: NewsType): NewsCopy {
  return NEWS_BY_TYPE.get(type) ?? { type, badge: type, bullish: '', bearish: '' };
}

/** "What this means" sentences per news type and sentiment (COPY §4). */
export const NEWS_EXPLAIN: Record<NewsType, { bullish: string; bearish: string }> = Object.fromEntries(
  NEWS_TYPES.map((t) => {
    const n = newsCopy(t);
    return [t, { bullish: n.bullish, bearish: n.bearish }];
  }),
) as Record<NewsType, { bullish: string; bearish: string }>;

/** Type badge text per news type ("Earnings", "Whole market"…). */
export const NEWS_BADGE: Record<NewsType, string> = Object.fromEntries(
  NEWS_TYPES.map((t) => [t, newsCopy(t).badge]),
) as Record<NewsType, string>;

/** COPY §4 news-extra: sentiment labels, filters, "since the news" label. */
export const NEWS_EXTRA = COPY_DATA.newsExtra;

/** COPY §0.4: the InfoTip renders this lead-in before `usuallyGoodWhen`. */
export const USUALLY_GOOD_LEAD = 'Usually a good sign when ';

/** "Usually a good sign when …" as one sentence. */
export function usuallyGoodSentence(entry: GlossaryEntry): string {
  return `${USUALLY_GOOD_LEAD}${entry.usuallyGoodWhen}`;
}

/** InfoTip title and Learn heading: "label (term)". */
export function glossaryTitle(entry: GlossaryEntry): string {
  return `${entry.label} (${entry.term})`;
}

/** Accessible name of the "?" trigger (MOBILE §5.9): "What is {label} ({term})?". */
export function infoTipAriaLabel(entry: GlossaryEntry): string {
  return `What is ${glossaryTitle(entry)}?`;
}

const lower = (s: string) => s.toLowerCase();
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, '');

/**
 * Case-insensitive search over label, term and whatItIs. Label/term hits rank before
 * whatItIs hits, prefix hits before inner hits, and COPY order breaks ties. Punctuation is
 * ignored for label/term, so "pe ratio" finds "P/E ratio". A blank query returns every entry.
 */
export function glossarySearch(q: string): GlossaryEntry[] {
  const query = lower(q.trim());
  if (!query) return [...GLOSSARY_LIST];
  const squeezed = compact(query);
  const scored: { entry: GlossaryEntry; score: number; index: number }[] = [];
  GLOSSARY_LIST.forEach((entry, index) => {
    const names = [lower(entry.label), lower(entry.term)];
    const squeezedNames = names.map(compact);
    let score = -1;
    if (names.some((n) => n.startsWith(query))) score = 0;
    else if (names.some((n) => n.includes(query))) score = 1;
    else if (squeezed && squeezedNames.some((n) => n.includes(squeezed))) score = 2;
    else if (lower(entry.whatItIs).includes(query)) score = 3;
    if (score >= 0) scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.entry);
}

/**
 * COPY §0.3: copy is written with Ð and "doubloons". When the host renames the currency,
 * swap the symbol and the plural word at render time. Singular "Doubloon" is left alone
 * because it only appears inside company names, which are data.
 */
export function withCurrency(text: string, currency: { name: string; symbol: string }): string {
  if (currency.symbol === CURRENCY.symbol && currency.name === CURRENCY.name) return text;
  const name = currency.name;
  return text
    .split(CURRENCY.symbol)
    .join(currency.symbol)
    .replace(/\bDoubloons\b/g, name.charAt(0).toUpperCase() + name.slice(1))
    .replace(/\bdoubloons\b/g, name.toLowerCase());
}
