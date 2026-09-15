/**
 * Pure logic for Markets (MOBILE §7.6): URL query (?view=&sort=&sector=), the All companies views and
 * their columns, sorting, sector filter, company search, recent searches, biggest moves, sector chips,
 * breadth and composite figures. Rendering lives in the components next to this file.
 */
import { CURRENCY, SECTORS, type Company, type Fundamentals, type IndexQuote, type MarketBreadth, type MarketSummary, type Sector } from '@deca/shared';
import { formatMetricValue, metricValue, type MetricId } from '../../lib/compare';
import { formatIndex, formatMoney, formatPct, MINUS } from '../../lib/format';
import { sectorSummaries } from '../../lib/market';
import { sectorFromSlug, sectorSlug } from '../../lib/sector';
import type { HelpSet } from '../../shell/sheetParams';
import { LABELS } from './marketCopy';

// ─── Query ────────────────────────────────────────────────────────────────────

export const MARKETS_VIEWS = ['basics', 'price', 'value', 'health', 'analysts'] as const;
export type MarketsView = (typeof MARKETS_VIEWS)[number];

export const SORT_KEYS = ['size', 'session', 'total', 'price', 'symbol'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface MarketsQuery {
  view: MarketsView;
  sort: SortKey;
  sector: Sector | null;
}

const DEFAULT_QUERY: MarketsQuery = { view: 'basics', sort: 'size', sector: null };

export function parseMarketsQuery(search: string): MarketsQuery {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  const sort = p.get('sort');
  const sector = p.get('sector');
  return {
    view: (MARKETS_VIEWS as readonly string[]).includes(view ?? '') ? (view as MarketsView) : DEFAULT_QUERY.view,
    sort: (SORT_KEYS as readonly string[]).includes(sort ?? '') ? (sort as SortKey) : DEFAULT_QUERY.sort,
    sector: sector ? sectorFromSlug(sector) : null,
  };
}

/** Search string with the patch applied; default values are left out so plain /markets stays clean. */
export function withMarketsQuery(search: string, patch: Partial<MarketsQuery>): string {
  const p = new URLSearchParams(search);
  const next = { ...parseMarketsQuery(search), ...patch };
  const set = (key: string, value: string | null, fallback: string | null) => {
    if (value === null || value === fallback) p.delete(key);
    else p.set(key, value);
  };
  set('view', next.view, DEFAULT_QUERY.view);
  set('sort', next.sort, DEFAULT_QUERY.sort);
  set('sector', next.sector ? sectorSlug(next.sector) : null, null);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function helpSetFor(view: MarketsView): HelpSet {
  return `markets-${view}` as HelpSet;
}

export function viewFromHelpSet(set: string): MarketsView | null {
  const view = set.startsWith('markets-') ? set.slice('markets-'.length) : '';
  return (MARKETS_VIEWS as readonly string[]).includes(view) ? (view as MarketsView) : null;
}

// ─── Sectors ──────────────────────────────────────────────────────────────────

const SECTOR_SHORT: Partial<Record<Sector, string>> = {
  'Provisions & Spice': 'Provisions',
  'Letters of Marque (Insurance)': 'Letters of Marque',
};

/** Chip and filter names from the Markets artboard ("Provisions", "Letters of Marque"). */
export function sectorShortName(sector: Sector | string): string {
  return SECTOR_SHORT[sector as Sector] ?? sector;
}

export interface SectorChip {
  sector: Sector;
  slug: string;
  name: string;
  sessionChange: number;
  /** Change since the game began (fraction). */
  totalChange: number;
  value: number | null;
  sessionOpen: number | null;
}

/** Industry group chips, biggest session gain first. Index quotes from `market/summary`, else cap-weighted members. */
export function sectorChips(market: MarketSummary | null, companies: readonly Company[]): SectorChip[] {
  const quotes = market?.sectors ?? {};
  const fromMarket = Object.keys(quotes).length > 0;
  const chips: SectorChip[] = fromMarket
    ? SECTORS.filter((s) => quotes[s]).map((s) => {
        const q = quotes[s]!;
        return { sector: s, slug: sectorSlug(s), name: sectorShortName(s), sessionChange: q.sessionChange, totalChange: q.change, value: q.value, sessionOpen: q.sessionOpen };
      })
    : sectorSummaries([...companies]).map((s) => ({
        sector: s.sector,
        slug: sectorSlug(s.sector),
        name: sectorShortName(s.sector),
        sessionChange: s.sessionChange,
        totalChange: s.voyageChange,
        value: null,
        sessionOpen: null,
      }));
  return chips.sort((a, b) => b.sessionChange - a.sessionChange || SECTORS.indexOf(a.sector) - SECTORS.indexOf(b.sector));
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export interface ColumnSpec {
  id: string;
  /** COPY §1.2 / §1.1 short label. */
  label: string;
  termId: string;
}

const col = (id: string, label: string, termId = id): ColumnSpec => ({ id, label, termId });

/** Line-2 cells of a CompanyMetricsRow for each view (Price view rows are StockRows, so these are its header labels). */
export const VIEW_COLUMNS: Record<MarketsView, readonly ColumnSpec[]> = {
  basics: [
    col('marketCap', 'Company size'),
    col('revenueGrowth', 'Sales growth'),
    col('netMargin', 'Profit margin'),
    col('peRatio', 'Price vs. profit'),
    col('debtToEquity', 'Debt vs. equity'),
  ],
  price: [col('trend', 'Trend', 'session'), col('price', 'Price'), col('sessionChange', 'Session change')],
  value: [
    col('peRatio', 'Price vs. profit'),
    col('forwardPe', 'Price vs. future profit'),
    col('psRatio', 'Price vs. sales'),
    col('pbRatio', 'Price vs. equity'),
    col('dividendYield', 'Dividend yield'),
  ],
  health: [
    col('debtToEquity', 'Debt vs. equity'),
    col('currentRatio', 'Bill coverage'),
    col('cash', 'Cash'),
    col('totalDebt', 'Debt'),
    col('freeCashFlow', 'Free cash flow'),
  ],
  analysts: [col('analystRating', 'Analyst view'), col('priceTarget', 'Price target'), col('targetGap', LABELS.targetGap, 'priceTarget')],
};

/** Everything the "What these columns mean" sheet explains for a view: its columns, then price and session change. */
export function helpColumns(view: MarketsView): ColumnSpec[] {
  const out: ColumnSpec[] = [];
  const seen = new Set<string>();
  for (const c of [...VIEW_COLUMNS[view], col('price', 'Price'), col('sessionChange', 'Session change')]) {
    if (seen.has(c.termId)) continue;
    seen.add(c.termId);
    out.push(c);
  }
  return out;
}

const DASH = '—';
const METRIC_IDS = new Set<string>(['marketCap', 'revenueGrowth', 'netMargin', 'peRatio', 'debtToEquity', 'forwardPe', 'psRatio', 'pbRatio', 'dividendYield', 'currentRatio', 'freeCashFlow']);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function cellText(id: string, c: Company, f: Fundamentals | undefined): string {
  if (!f) return DASH;
  if (METRIC_IDS.has(id)) return formatMetricValue(id as MetricId, metricValue(id as MetricId, f, c), CURRENCY.symbol);
  switch (id) {
    case 'cash':
    case 'totalDebt': {
      const v = f[id];
      return isNum(v) ? formatMoney(v, { compact: true }) : DASH;
    }
    case 'analystRating':
      return f.analyst?.rating?.trim() || DASH;
    case 'priceTarget':
      return isNum(f.analyst?.priceTarget) && f.analyst.priceTarget > 0 ? formatMoney(f.analyst.priceTarget) : DASH;
    case 'targetGap': {
      const target = f.analyst?.priceTarget;
      return isNum(target) && target > 0 && c.currentPrice > 0 ? formatPct(target / c.currentPrice - 1, { signed: true }) : DASH;
    }
    default:
      return DASH;
  }
}

export function columnCells(view: MarketsView, c: Company, f: Fundamentals | undefined): string[] {
  return VIEW_COLUMNS[view].map((column) => cellText(column.id, c, f));
}

const UNIT_WORDS: Record<string, string> = { B: 'billion', M: 'million', K: 'thousand', T: 'trillion' };

/** VoiceOver text for a cell: "Ð20.36B" → "20.36 billion doubloons", "—" → "not available". */
export function spokenCell(text: string): string {
  if (text === DASH) return 'not available';
  if (text === 'n/m') return 'not meaningful';
  const m = new RegExp(`^([+${MINUS}-]?)${CURRENCY.symbol}([\\d.,]+)([TBMK]?)$`).exec(text);
  if (!m) return text;
  const sign = m[1] === MINUS || m[1] === '-' ? 'minus ' : m[1] === '+' ? 'plus ' : '';
  const unit = m[3] ? ` ${UNIT_WORDS[m[3]]}` : '';
  return `${sign}${m[2]}${unit} ${CURRENCY.name.toLowerCase()}`;
}

// ─── Sorting, filtering, search ───────────────────────────────────────────────

const byTicker = (a: Company, b: Company) => (a.ticker ?? '').localeCompare(b.ticker ?? '') || a.id.localeCompare(b.id);
const num = (x: number) => (Number.isFinite(x) ? x : 0);

export function sortCompanies(companies: readonly Company[], sort: SortKey): Company[] {
  const desc = (pick: (c: Company) => number) => (a: Company, b: Company) => num(pick(b)) - num(pick(a)) || byTicker(a, b);
  const cmp =
    sort === 'size'
      ? desc((c) => c.marketCap)
      : sort === 'session'
        ? desc((c) => c.sessionChange)
        : sort === 'total'
          ? desc((c) => c.voyageChange)
          : sort === 'price'
            ? desc((c) => c.currentPrice)
            : byTicker;
  return [...companies].sort(cmp);
}

export function filterBySector(companies: readonly Company[], sector: Sector | null): Company[] {
  return sector ? companies.filter((c) => c.sector === sector) : [...companies];
}

/** Ticker prefix first, then name prefix, then a later word of the name. */
export function searchCompanies(companies: readonly Company[], query: string): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (c: Company): number => {
    const ticker = (c.ticker ?? '').toLowerCase();
    const name = (c.name ?? '').toLowerCase();
    if (ticker === q) return 0;
    if (ticker.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.split(/[\s&().,-]+/).some((w) => w.startsWith(q))) return 3;
    return -1;
  };
  return companies
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || byTicker(a.c, b.c))
    .map((x) => x.c);
}

export const MAX_RECENTS = 5;

export function recentsKey(teamId: string | null): string {
  return `bx.recentSearches.${teamId ?? 'signed-out'}`;
}

export function pushRecent(list: readonly string[], ticker: string, max = MAX_RECENTS): string[] {
  return [ticker, ...list.filter((t) => t !== ticker)].slice(0, max);
}

export function removeRecent(list: readonly string[], ticker: string): string[] {
  return list.filter((t) => t !== ticker);
}

export function parseRecents(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0))].slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export function biggestMoves(companies: readonly Company[], n = 3): { up: Company[]; down: Company[] } {
  const sorted = sortCompanies(companies, 'session');
  return {
    up: sorted.filter((c) => num(c.sessionChange) > 0).slice(0, n),
    down: sorted.filter((c) => num(c.sessionChange) < 0).reverse().slice(0, n),
  };
}

export function breadthText(b: Pick<MarketBreadth, 'advancers' | 'decliners' | 'unchanged'>): string {
  return `${b.advancers} rising · ${b.decliners} falling · ${b.unchanged} unchanged`;
}

export interface CompositeParts {
  valueText: string;
  /** Index points gained this session. */
  points: number;
  sessionPct: number;
  totalPct: number;
}

export function compositeParts(q: IndexQuote): CompositeParts {
  return {
    valueText: formatIndex(q.value),
    points: num(q.value) - num(q.sessionOpen),
    sessionPct: num(q.sessionChange),
    totalPct: num(q.change),
  };
}
