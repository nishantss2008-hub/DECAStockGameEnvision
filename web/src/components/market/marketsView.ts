/**
 * Pure logic for Markets (MOBILE §7.6) and Compare (§7.6b): URL query (?view=&sort=&sector=), the
 * Compare views and their columns, sorting, sector filter, instrument search, recent searches,
 * sector session changes, breadth and composite figures. Rendering lives next to this file.
 *
 * The Markets list is Apple Stocks semantics (spec 2026-09-16 §4): two sections, Funds then
 * Companies grouped by sector. `sectorGroups` builds the second one; it is driven by SECTORS, so
 * a roster change moves the screen without touching a component. The 2026-09-17 pass folded the
 * chip row's percentages into those group headings and deleted "Biggest moves": every row already
 * carries its own change pill, so the section repeated what was under it.
 */
import { CURRENCY, SECTORS, fundValueWeights, isFund, type Company, type Fund, type Fundamentals, type IndexQuote, type Instrument, type MarketBreadth, type MarketSummary, type Sector } from '@deca/shared';
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
};

/** Chip and filter names from the Markets artboard ("Provisions"). */
export function sectorShortName(sector: Sector | string): string {
  return SECTOR_SHORT[sector as Sector] ?? sector;
}

/**
 * Session change per sector — the number each group heading carries now that the chip row and the
 * sector screen are gone (2026-09-17 pass). Index quotes from `market/summary` when the server has
 * sent them, else the cap-weighted members, so the figure is the same one the chips showed.
 */
export function sectorSessionChanges(market: MarketSummary | null, companies: readonly Company[]): Map<Sector, number> {
  const quotes = market?.sectors ?? {};
  const entries: [Sector, number][] =
    Object.keys(quotes).length > 0
      ? SECTORS.filter((s) => quotes[s]).map((s) => [s, quotes[s]!.sessionChange])
      : sectorSummaries([...companies]).map((s) => [s.sector, s.sessionChange]);
  return new Map(entries);
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

/** The part of an instrument sorting and searching need. */
type Named = { id: string; ticker: string; name: string };

const byTicker = (a: Named, b: Named) => (a.ticker ?? '').localeCompare(b.ticker ?? '') || a.id.localeCompare(b.id);
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

// ─── Markets list: Funds, then Companies by sector ────────────────────────────

export interface SectorGroup {
  sector: Sector;
  /** Short name ("Provisions"), the group header. */
  name: string;
  /** The sector's session change, printed on the heading. Null until a quote or a member exists. */
  sessionChange: number | null;
  companies: Company[];
}

/**
 * The second section of the Markets list: one group per sector, in SECTORS order, each holding the
 * companies in that sector sorted by `sort`, and carrying that sector's session change on its
 * heading — the number the chip row used to hold. A sector with no companies on the wire is left
 * out rather than drawn as an empty header, so a half-loaded snapshot never shows five empty groups.
 */
export function sectorGroups(companies: readonly Company[], sort: SortKey = 'size', market: MarketSummary | null = null): SectorGroup[] {
  const changes = sectorSessionChanges(market, companies);
  return SECTORS.map((sector) => ({
    sector,
    name: sectorShortName(sector),
    sessionChange: changes.get(sector) ?? null,
    companies: sortCompanies(filterBySector(companies, sector), sort),
  })).filter((g) => g.companies.length > 0);
}

/** Every instrument the search field covers, and what the placeholder counts. */
export function instrumentCount(companies: readonly unknown[], funds: readonly unknown[]): number {
  return companies.length + funds.length;
}

/**
 * What each constituent of a fund is worth right now, for "What this fund holds" (spec §3).
 *
 * `weight` here is the SHARE OF THE FUND'S VALUE (`fundValueWeights`), not the fixed basket
 * coefficient wᵢ: "KRKN is 34% of this fund" is the number a student can check against the row
 * beside it. Weights and holdings are public; nothing hidden is read.
 */
export interface FundHoldingRow {
  companyId: string;
  ticker: string;
  name: string;
  sector: Sector | null;
  /** Share of the fund's value, 0–1. */
  weight: number;
  price: number;
  sessionChange: number;
}

export function fundHoldingRows(fund: Fund, byId: Record<string, Company>): FundHoldingRow[] {
  const weights = new Map(fundValueWeights(fund, (id) => byId[id]?.currentPrice ?? 0).map((v) => [v.companyId, v.weight]));
  return fund.holdings
    .map((h): FundHoldingRow => {
      const c = byId[h.companyId];
      // Before prices arrive every value weight is 0. Show the FIXED basket weight instead: it is
      // public, it is the number that never changes, and a column of "0.0%" would be a lie.
      const valueWeight = weights.get(h.companyId);
      return {
        companyId: h.companyId,
        ticker: c?.ticker ?? h.ticker,
        name: c?.name ?? h.ticker,
        sector: c?.sector ?? null,
        weight: valueWeight && valueWeight > 0 ? valueWeight : h.weight,
        price: c?.currentPrice ?? 0,
        sessionChange: c?.sessionChange ?? 0,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));
}

/** A fund's crest colour follows the sector it tracks; the broad fund has none (hull fill). */
export function fundSector(fund: Fund): Sector | undefined {
  return fund.sector;
}

/** Narrowing helper for lists that hold both kinds. */
export function splitInstruments(instruments: readonly Instrument[]): { funds: Fund[]; companies: Company[] } {
  const funds: Fund[] = [];
  const companies: Company[] = [];
  for (const i of instruments) {
    if (isFund(i)) funds.push(i);
    else companies.push(i);
  }
  return { funds, companies };
}

/**
 * Ticker prefix first, then name prefix, then a later word of the name. Funds are searched exactly
 * like companies and rank against them, so "s" finds both SHIPS and SPYG in one list.
 */
export function searchInstruments<T extends Named>(instruments: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (c: Named): number => {
    const ticker = (c.ticker ?? '').toLowerCase();
    const name = (c.name ?? '').toLowerCase();
    if (ticker === q) return 0;
    if (ticker.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.split(/[\s&().,-]+/).some((w) => w.startsWith(q))) return 3;
    return -1;
  };
  return instruments
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
