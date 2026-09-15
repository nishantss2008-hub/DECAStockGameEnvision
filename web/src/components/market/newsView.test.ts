import { describe, expect, it } from 'vitest';
import type { Company, NewsEvent } from '@deca/shared';
import { chipMode, clockHM, compositeSince, filterNews, newsFilterSearch, ownsAny, parseNewsFilter, sinceChips, sinceEntry, sinceSpoken, NEWS_TYPE_ICONS, MAX_CHIPS } from './newsView';
import { NEWS_TYPES } from '@deca/shared';

const ev = (p: Partial<NewsEvent> & { id: string }): NewsEvent =>
  ({
    headline: 'h',
    body: 'b',
    companyIds: [],
    type: 'earnings',
    sentiment: 'bullish',
    source: 'scheduled',
    tick: 1,
    firedAt: 0,
    priceAtFire: {},
    ...p,
  }) as NewsEvent;

const NEWS = [
  ev({ id: 'n1', companyIds: ['kraken'] }),
  ev({ id: 'n2', companyIds: ['cursed-doubloon'], type: 'storm', sentiment: 'bearish' }),
  ev({ id: 'n3', companyIds: ['kraken', 'astrolabe'], type: 'macro' }),
];

describe('news filter (MOBILE §7.11, ?filter=holdings|watchlist)', () => {
  it('parses and writes the filter, keeping other params', () => {
    expect(parseNewsFilter('')).toBe('all');
    expect(parseNewsFilter('?filter=holdings')).toBe('holdings');
    expect(parseNewsFilter('?filter=junk')).toBe('all');
    expect(newsFilterSearch('?filter=holdings&sheet=term&id=news', 'all')).toBe('?sheet=term&id=news');
    expect(newsFilterSearch('', 'watchlist')).toBe('?filter=watchlist');
  });
  it('keeps dispatches that mention a held or watched company', () => {
    const held = new Set(['cursed-doubloon']);
    const watched = new Set(['astrolabe']);
    expect(filterNews(NEWS, 'all', held, watched).map((e) => e.id)).toEqual(['n1', 'n2', 'n3']);
    expect(filterNews(NEWS, 'holdings', held, watched).map((e) => e.id)).toEqual(['n2']);
    expect(filterNews(NEWS, 'watchlist', held, watched).map((e) => e.id)).toEqual(['n3']);
    expect(ownsAny(NEWS[0]!, held)).toBe(false);
    expect(ownsAny(NEWS[1]!, held)).toBe(true);
  });
});

describe('since the news', () => {
  const byId = {
    cannonbright: { id: 'cannonbright', ticker: 'CNBR', name: 'Cannonbright Foundries', sector: 'Naval Arms', currentPrice: 10_266 } as Company,
  };
  it('builds one chip per company with a price at the news, using priceAtFire', () => {
    const chips = sinceChips(ev({ id: 'x', companyIds: ['cannonbright', 'ghost'], priceAtFire: { cannonbright: 9_674, ghost: 100 } }), byId);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ companyId: 'cannonbright', ticker: 'CNBR', name: 'Cannonbright Foundries' });
    expect(chips[0]!.pct).toBeCloseTo(0.0612, 4);
  });
  it('computes the composite change since the news, or null without data', () => {
    expect(compositeSince(1000, 1006.1)).toBeCloseTo(0.0061, 4);
    expect(compositeSince(null, 1006.1)).toBeNull();
    expect(compositeSince(0, 1006.1)).toBeNull();
  });
  it('explains "since the news" with COPY §4 sinceReportHelp', () => {
    expect(sinceEntry().whatItIs).toBe('How much the price has moved since this news came out.');
  });
});

describe('formatting', () => {
  it('shows the local time as HH:MM', () => {
    const d = new Date(2026, 8, 14, 14, 1, 30);
    expect(clockHM(d.getTime())).toBe('14:01');
  });
  it('has an icon for every news type (type is shown with icon and text, never colour)', () => {
    for (const t of NEWS_TYPES) expect(NEWS_TYPE_ICONS[t]).toBeTruthy();
  });
});

describe('card chips (MOBILE §7.11)', () => {
  it('uses company chips for up to three companies and a market line for macro or wider news', () => {
    expect(chipMode(ev({ id: 'a', companyIds: ['kraken'] }))).toBe('companies');
    expect(chipMode(ev({ id: 'b', companyIds: ['a', 'b', 'c', 'd'].slice(0, MAX_CHIPS) }))).toBe('companies');
    expect(chipMode(ev({ id: 'c', companyIds: ['a', 'b', 'c', 'd'] }))).toBe('market');
    expect(chipMode(ev({ id: 'd', companyIds: ['kraken'], type: 'macro' }))).toBe('market');
  });
  it('speaks the change with a direction word and the context', () => {
    expect(sinceSpoken(0.0612)).toBe('up 6.12 percent since the news');
    expect(sinceSpoken(-0.0346)).toBe('down 3.46 percent since the news');
    expect(sinceSpoken(0)).toBe('unchanged since the news');
  });
});
