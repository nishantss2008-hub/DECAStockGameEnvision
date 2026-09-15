/**
 * Pure logic for News (MOBILE §7.11): the ?filter= query, holdings/watchlist filters, "since the news" chips from
 * `priceAtFire`, the composite change since a dispatch, and type icons (type is shown as icon + text, never colour).
 */
import type { Company, NewsEvent, NewsType } from '@deca/shared';
import { Cloudy, Coins, Gem, Globe, Handshake, Scale, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react';
import type { GlossaryEntry } from '../../lib/copyTypes';
import { GLOSSARY } from '../../lib/glossary';
import { sinceReport } from '../../lib/market';
import { changeParts } from '../ios/changeText';
import { NEWS } from './marketCopy';

export const NEWS_FILTERS = ['all', 'holdings', 'watchlist'] as const;
export type NewsFilter = (typeof NEWS_FILTERS)[number];

export function parseNewsFilter(search: string): NewsFilter {
  const f = new URLSearchParams(search).get('filter');
  return (NEWS_FILTERS as readonly string[]).includes(f ?? '') ? (f as NewsFilter) : 'all';
}

/** Search string with the filter set; `all` is the default and is left out. Other params stay. */
export function newsFilterSearch(search: string, filter: NewsFilter): string {
  const p = new URLSearchParams(search);
  if (filter === 'all') p.delete('filter');
  else p.set('filter', filter);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function ownsAny(event: NewsEvent, held: ReadonlySet<string>): boolean {
  return (event.companyIds ?? []).some((id) => held.has(id));
}

export function filterNews(news: readonly NewsEvent[], filter: NewsFilter, held: ReadonlySet<string>, watched: ReadonlySet<string>): NewsEvent[] {
  if (filter === 'holdings') return news.filter((e) => ownsAny(e, held));
  if (filter === 'watchlist') return news.filter((e) => ownsAny(e, watched));
  return [...news];
}

export interface SinceChip {
  companyId: string;
  ticker: string;
  name: string;
  sector: Company['sector'];
  /** currentPrice ÷ priceAtFire − 1. */
  pct: number;
}

export function sinceChips(event: NewsEvent, byId: Record<string, Company>): SinceChip[] {
  return sinceReport(event, byId).map(({ companyId, pct }) => {
    const c = byId[companyId]!;
    return { companyId, ticker: c.ticker, name: c.name, sector: c.sector, pct };
  });
}

/** Composite change since the news, or null without a positive value at the news. */
export function compositeSince(then: number | null | undefined, now: number | null | undefined): number | null {
  if (typeof then !== 'number' || !(then > 0) || typeof now !== 'number' || !Number.isFinite(now)) return null;
  return now / then - 1;
}

/** Company chips for narrow news; a "{n} companies · Composite" line for macro or wider news. */
export const MAX_CHIPS = 3;
export function chipMode(event: NewsEvent): 'companies' | 'market' {
  return event.type === 'macro' || (event.companyIds ?? []).length > MAX_CHIPS ? 'market' : 'companies';
}

/** "up 6.12 percent since the news" (the triangle is never announced). */
export function sinceSpoken(pct: number): string {
  const parts = changeParts(pct);
  return parts.direction === 'flat' ? 'unchanged since the news' : `${parts.spoken} since the news`;
}

/** InfoTip for "since the news" (COPY §4 sinceReportHelp); Learn opens the News reports term. */
export function sinceEntry(): GlossaryEntry {
  const news = GLOSSARY.news;
  return {
    id: 'news',
    label: NEWS.sinceLabel,
    term: NEWS.sinceTerm,
    whatItIs: NEWS.sinceReportHelp,
    whyItMatters: news?.whyItMatters ?? '',
    usuallyGoodWhen: news?.usuallyGoodWhen ?? '',
    related: news?.related ?? [],
    group: 'basics',
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local 24-hour time of a dispatch: "14:01". */
export function clockHM(epochMs: number): string {
  const d = new Date(Number.isFinite(epochMs) ? epochMs : 0);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const NEWS_TYPE_ICONS: Record<NewsType, LucideIcon> = {
  earnings: Coins,
  merger: Handshake,
  discovery: Gem,
  management: UserRound,
  regulatory: Scale,
  scandal: TriangleAlert,
  storm: Cloudy,
  macro: Globe,
};
