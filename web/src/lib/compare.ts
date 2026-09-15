/**
 * Explain + compare (BRIEF §9, spec §10b, COPY §3).
 *
 * - `metricValue` reads one metric for a company. Valuation fields stored in
 *   Fundamentals are start-of-game values, so size and multiples are recomputed from
 *   `Company.currentPrice` (COPY §0.6).
 * - `sectorAverages` returns sector medians, falling back to the whole market when a
 *   sector has fewer than 3 companies.
 * - `explainMetric` turns a value into COPY §3.1 words. It never grades a company.
 *
 * Units: money metrics (company size, sales, profit, profit per share, free cash flow) are
 * INTEGER CENTS, like every other money field. Ratios are plain numbers; margins, growth,
 * yields and returns are fractions. Formatting to Ð happens only here, at the boundary.
 */

import type { Company, Fundamentals, Sector } from '@deca/shared';
import type { ExplainFormat, ExplainTemplate } from './copyTypes';
import { COPY_DATA } from './glossary.data';
import { formatMoney, formatNumber, formatPct, roundHalfUp } from './format';

export type MetricId =
  | 'marketCap'
  | 'revenue'
  | 'netIncome'
  | 'netMargin'
  | 'grossMargin'
  | 'revenueGrowth'
  | 'eps'
  | 'peRatio'
  | 'forwardPe'
  | 'psRatio'
  | 'pbRatio'
  | 'evToEbitda'
  | 'dividendYield'
  | 'debtToEquity'
  | 'currentRatio'
  | 'freeCashFlow'
  | 'roe'
  | 'roa'
  | 'beta';

export const METRIC_IDS: readonly MetricId[] = [
  'marketCap',
  'revenue',
  'netIncome',
  'netMargin',
  'grossMargin',
  'revenueGrowth',
  'eps',
  'peRatio',
  'forwardPe',
  'psRatio',
  'pbRatio',
  'evToEbitda',
  'dividendYield',
  'debtToEquity',
  'currentRatio',
  'freeCashFlow',
  'roe',
  'roa',
  'beta',
];

/** Metrics whose values are integer cents. */
export const MONEY_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(['marketCap', 'revenue', 'netIncome', 'eps', 'freeCashFlow']);

/** Price multiples shown as "n/m" (not meaningful) when at or below zero or above NM_CEILING. */
export const NM_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(['peRatio', 'forwardPe', 'evToEbitda']);
export const NM_CEILING = 200;
export const NM_TEXT = 'n/m';

const NULL_TEXT = COPY_DATA.formats.nullValueText; // '—'

const TEMPLATES = new Map<string, ExplainTemplate>(COPY_DATA.explain.map((t) => [t.id, t]));

function template(id: MetricId): ExplainTemplate {
  const t = TEMPLATES.get(id);
  if (!t) throw new Error(`No COPY.md explain template for "${id}"`);
  return t;
}

// ─── metricValue ─────────────────────────────────────────────────────────────

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isPos = (x: unknown): x is number => isNum(x) && x > 0;
const stored = (x: unknown): number | null => (isNum(x) ? x : null);

/** currentPrice ÷ startPrice, or null when either price is missing. */
function priceScale(c: Company): number | null {
  return isPos(c?.currentPrice) && isPos(c?.startPrice) ? c.currentPrice / c.startPrice : null;
}

/** Company size at the current price, in cents. */
function liveMarketCap(f: Fundamentals, c: Company): number | null {
  const shares = isPos(c?.sharesOutstanding) ? c.sharesOutstanding : f?.sharesOutstanding;
  if (isPos(c?.currentPrice) && isPos(shares)) return c.currentPrice * shares;
  const scale = priceScale(c);
  if (isNum(f?.marketCap)) return scale === null ? f.marketCap : f.marketCap * scale;
  return isNum(c?.marketCap) ? c.marketCap : null;
}

/** Average yearly sales growth over the history (oldest → newest): (last ÷ first)^(1/years) − 1. */
function revenueGrowth(f: Fundamentals): number | null {
  const h = Array.isArray(f?.history) ? f.history : [];
  if (h.length < 2) return null;
  const first = h[0]?.revenue;
  const last = h[h.length - 1]?.revenue;
  if (!isPos(first) || !isPos(last)) return null;
  return (last / first) ** (1 / (h.length - 1)) - 1;
}

/**
 * A price multiple at the current price (COPY §0.6): the stored start-of-game value scaled by
 * currentPrice ÷ startPrice, so the opening number matches the stored one exactly (BRIEF §7
 * KRKN P/E 17.8). When no start value is stored, live company size ÷ `base`.
 */
function liveMultiple(storedStart: unknown, base: number, f: Fundamentals, c: Company): number | null {
  if (isPos(storedStart)) return storedStart * (priceScale(c) ?? 1);
  const cap = liveMarketCap(f, c);
  return cap !== null && base > 0 ? cap / base : null;
}

/**
 * One metric for a company. Returns null when COPY §3.1 `nullWhen` applies or data is missing.
 * Valuation uses the LIVE price (COPY §0.6): company size = currentPrice × shares; P/E, forward
 * P/E, P/S and P/B scale their stored start values by currentPrice ÷ startPrice; dividend yield
 * divides by it; EV/EBITDA uses live size + totalDebt − cash over EBITDA. When the company has
 * no price yet, the stored start-of-game value is used.
 */
export function metricValue(id: MetricId, f: Fundamentals, c: Company): number | null {
  switch (id) {
    case 'marketCap':
      return liveMarketCap(f, c);
    case 'revenue':
      return stored(f?.revenue);
    case 'netIncome':
      return stored(f?.netIncome);
    case 'netMargin':
      return stored(f?.netMargin);
    case 'grossMargin':
      return stored(f?.grossMargin);
    case 'revenueGrowth':
      return revenueGrowth(f);
    case 'eps':
      return stored(f?.eps);
    case 'peRatio':
      if (!isNum(f?.netIncome) || f.netIncome <= 0) return null;
      return liveMultiple(f.peRatio, f.netIncome, f, c);
    case 'forwardPe': {
      if ((isNum(f?.netIncome) && f.netIncome <= 0) || !isPos(f?.forwardPe)) return null;
      return f.forwardPe * (priceScale(c) ?? 1);
    }
    case 'psRatio':
      if (!isNum(f?.revenue) || f.revenue <= 0) return null;
      return liveMultiple(f.psRatio, f.revenue, f, c);
    case 'pbRatio':
      if (isNum(f?.equity) && f.equity <= 0) return null;
      return liveMultiple(f?.pbRatio, isPos(f?.equity) ? f.equity : 0, f, c);
    case 'evToEbitda': {
      if (isNum(f?.ebitda) && f.ebitda <= 0) return null;
      const cap = isPos(c?.currentPrice) ? liveMarketCap(f, c) : null;
      if (cap !== null && isPos(f?.ebitda) && isNum(f.totalDebt) && isNum(f.cash)) {
        const ev = cap + f.totalDebt - f.cash;
        return ev > 0 ? ev / f.ebitda : null;
      }
      return isPos(f?.evToEbitda) ? f.evToEbitda : null;
    }
    case 'dividendYield': {
      if (!isNum(f?.dividendYield)) return null;
      const scale = priceScale(c);
      return scale === null ? f.dividendYield : f.dividendYield / scale;
    }
    case 'debtToEquity':
      if (isNum(f?.equity) && f.equity <= 0) return null;
      return stored(f?.debtToEquity);
    case 'currentRatio':
      return stored(f?.currentRatio);
    case 'freeCashFlow':
      return stored(f?.freeCashFlow);
    case 'roe':
      if (isNum(f?.equity) && f.equity <= 0) return null;
      return stored(f?.roe);
    case 'roa':
      return stored(f?.roa);
    case 'beta':
      return isNum(c?.beta) ? c.beta : stored(f?.beta);
  }
}

/** True for P/E, forward P/E and EV/EBITDA values at or below zero or above 200. */
export function isNotMeaningful(id: MetricId, value: number | null): boolean {
  return value !== null && NM_METRICS.has(id) && (value <= 0 || value > NM_CEILING);
}

// ─── sectorAverages ──────────────────────────────────────────────────────────

export interface SectorAverage {
  scope: 'sector' | 'market';
  sector: Sector;
  /** Median of the usable values (same units as metricValue), or null when there are none. */
  value: number | null;
  /** How many companies the median uses. */
  count: number;
}

/** Fewest companies a sector needs before its own median is shown (COPY §3.2). */
export const MIN_SECTOR_COMPANIES = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Returns a lookup of median values. A sector with at least 3 companies (with fundamentals)
 * uses its own median; otherwise, or when none of its values are usable, the market median.
 * Null values and "n/m" multiples are left out. Results are memoized per metric and sector.
 */
export function sectorAverages(
  fundamentalsById: Record<string, Fundamentals>,
  companiesById: Record<string, Company>,
): (id: MetricId, sector: Sector) => SectorAverage {
  const members = Object.values(companiesById).filter((c) => c && fundamentalsById[c.id]);
  const sectorSize = new Map<string, number>();
  for (const c of members) sectorSize.set(c.sector, (sectorSize.get(c.sector) ?? 0) + 1);

  const valuesCache = new Map<MetricId, { all: number[]; bySector: Map<string, number[]> }>();
  const valuesFor = (id: MetricId) => {
    let cached = valuesCache.get(id);
    if (!cached) {
      cached = { all: [], bySector: new Map() };
      for (const c of members) {
        const v = metricValue(id, fundamentalsById[c.id]!, c);
        if (v === null || isNotMeaningful(id, v)) continue;
        cached.all.push(v);
        const list = cached.bySector.get(c.sector);
        if (list) list.push(v);
        else cached.bySector.set(c.sector, [v]);
      }
      valuesCache.set(id, cached);
    }
    return cached;
  };

  const results = new Map<string, SectorAverage>();
  return (id, sector) => {
    const key = `${id}|${sector}`;
    const hit = results.get(key);
    if (hit) return hit;
    const { all, bySector } = valuesFor(id);
    const own = bySector.get(sector) ?? [];
    const useSector = (sectorSize.get(sector) ?? 0) >= MIN_SECTOR_COMPANIES && own.length > 0;
    const pool = useSector ? own : all;
    const result: SectorAverage = { scope: useSector ? 'sector' : 'market', sector, value: median(pool), count: pool.length };
    results.set(key, result);
    return result;
  };
}

// ─── explainMetric ───────────────────────────────────────────────────────────

export interface Explained {
  valueText: string;
  sentence: string;
  averageText: string;
  /** COPY §3.1 compareNote, when the template has one. */
  note?: string;
}

const FIXED = new Map<number, Intl.NumberFormat>();
function fixed(n: number, digits: number): string {
  let f = FIXED.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    FIXED.set(digits, f);
  }
  return f.format(n);
}

/**
 * Applies a COPY §3 format token. `internal` is in metricValue units: cents for money
 * metrics formatted with money2/moneyCompact, plain numbers otherwise. Every token rounds
 * through lib/format's roundHalfUp (half away from zero, no binary drift), so a number reads
 * the same here as anywhere else in the app.
 */
function applyFormat(token: ExplainFormat, internal: number, symbol: string): string {
  switch (token) {
    case 'money2':
      return formatMoney(internal, { symbol });
    case 'moneyCompact':
      return formatMoney(internal, { symbol, compact: true });
    case 'per100': {
      const cents = roundHalfUp(Math.abs(internal) * 100 * 100);
      return cents % 100 === 0 ? `${symbol}${fixed(cents / 100, 0)}` : formatMoney(cents, { symbol });
    }
    case 'ratioMoney':
      return formatMoney(Math.abs(internal) * 100, { symbol });
    case 'pct1':
      return formatPct(internal, { digits: 1 });
    case 'pctWhole': {
      const pct = Math.abs(internal) * 100;
      const oneDecimal = roundHalfUp(pct, 1);
      return oneDecimal < 1 ? `${fixed(oneDecimal, 1)}%` : `${fixed(roundHalfUp(pct), 0)}%`;
    }
    case 'ratio1':
      return formatNumber(internal, 1);
    case 'ratio2':
      return formatNumber(internal, 2);
    case 'betaPct':
      return `${fixed(roundHalfUp(Math.abs(internal) * 10), 0)}%`;
  }
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

/** The value as shown in an ExplainRow or a list cell: '—' for null, 'n/m' for meaningless multiples. */
export function formatMetricValue(id: MetricId, value: number | null, currencySymbol: string): string {
  if (value === null || !Number.isFinite(value)) return NULL_TEXT;
  if (isNotMeaningful(id, value)) return NM_TEXT;
  return applyFormat(template(id).valueFormat, value, currencySymbol);
}

/** The COPY §3.2 average line: "Sector average: 22.1" / "Market average: 21.4" / "Sector average: —". */
export function averageLine(id: MetricId, avg: SectorAverage, currencySymbol: string): string {
  const lines = COPY_DATA.explainExtra.averageLine;
  const avgText =
    avg.value === null || !Number.isFinite(avg.value)
      ? lines.missingAvg
      : applyFormat(template(id).valueFormat, avg.value, currencySymbol);
  return fill(avg.scope === 'market' ? lines.market : lines.sector, { avg: avgText });
}

/**
 * COPY §3.1 words for one metric. Sentence order: whenNull (null) → whenZero → whenFlat
 * (|value| < flatBelow) → whenNegative → sentence. `{money}` and `{pct}` use the absolute
 * value; the words carry the sign. P/E-style multiples at or below zero read as whenNull and
 * show 'n/m'; above 200 they show 'n/m' with the ordinary sentence.
 */
export function explainMetric(id: MetricId, value: number | null, avg: SectorAverage, currencySymbol: string): Explained {
  const t = template(id);
  const averageText = averageLine(id, avg, currencySymbol);
  const withNote = (e: Omit<Explained, 'averageText' | 'note'>): Explained =>
    t.compareNote ? { ...e, averageText, note: t.compareNote } : { ...e, averageText };

  const nullSentence = t.whenNull ?? '';
  if (value === null || !Number.isFinite(value)) return withNote({ valueText: NULL_TEXT, sentence: nullSentence });

  const vars: Record<string, string> = { symbol: currencySymbol };
  if (t.money) vars.money = applyFormat(t.money, Math.abs(value), currencySymbol);
  if (t.pct) vars.pct = applyFormat(t.pct, Math.abs(value), currencySymbol);

  if (isNotMeaningful(id, value)) {
    return withNote({ valueText: NM_TEXT, sentence: value <= 0 ? nullSentence : fill(t.sentence, vars) });
  }

  let sentence = t.sentence;
  if (value === 0 && t.whenZero) sentence = t.whenZero;
  else if (t.whenFlat && t.flatBelow !== undefined && Math.abs(value) < t.flatBelow) sentence = t.whenFlat;
  else if (value < 0 && t.whenNegative) sentence = t.whenNegative;

  return withNote({ valueText: applyFormat(t.valueFormat, value, currencySymbol), sentence: fill(sentence, vars) });
}
