/**
 * Pure portfolio maths (plan Task 9): position rows, account totals, sorting, the "Show" metric,
 * chart series helpers and the allocation legend. Money is integer cents; changes are fractions.
 */
import { DEFAULT_STARTING_CAPITAL, isFund, type Company, type GameState, type Holding, type Instrument, type Sector, type Team } from '@deca/shared';
import type { AllocationItem } from '../charts/allocation';
import type { Point } from '../charts/scale';

export interface PositionRow {
  companyId: string;
  ticker: string;
  name: string;
  /**
   * The sector whose crest colour this row wears. Absent on the broad fund, which belongs to no
   * one sector; a sector fund wears the sector it tracks.
   */
  sector?: Sector;
  /** True when this position is a fund, so rows can say so without re-looking it up. */
  isFund: boolean;
  shares: number;
  avgCost: number;
  last: number;
  sessionChangePerShare: number;
  sessionGain: number;
  sessionPct: number;
  totalGain: number;
  totalPct: number;
  value: number;
  pctOfAccount: number;
  costBasis: number;
}

const ratio = (a: number, b: number): number => (b === 0 || !Number.isFinite(a) || !Number.isFinite(b) ? 0 : a / b);

/** One row per holding, sorted by current value (largest first). */
/**
 * Account value right now: cash plus every holding at its company's latest price. The server checks the position
 * limit with this same sum, and `team.totalValue` is only re-marked once per tick, so it lags a fill until then.
 * Falls back to the server's mark while a price is still loading, and after the end (final closing prices).
 */
export function liveAccountValue(
  team: Pick<Team, 'cashBalance' | 'totalValue'>,
  holdings: readonly Holding[],
  byId: Record<string, Pick<Company, 'currentPrice'>>,
  phase?: GameState['phase'] | null,
): number {
  if (phase === 'ended') return team.totalValue;
  let invested = 0;
  for (const h of holdings) {
    const c = byId[h.companyId];
    if (!c) return team.totalValue;
    invested += h.shares * c.currentPrice;
  }
  return team.cashBalance + invested;
}

/**
 * One row per holding, whatever it holds. `byId` must carry FUNDS as well as companies: a crew can
 * own a basket, and a row whose instrument is missing falls back to its cost basis, which would
 * silently mis-state the account.
 */
export function buildPositions(holdings: Holding[], byId: Record<string, Instrument>, totalValue: number): PositionRow[] {
  const rows = holdings.map((h): PositionRow => {
    const c = byId[h.companyId];
    const last = c?.currentPrice ?? h.avgCost;
    const open = c?.sessionOpen ?? last;
    const value = h.shares * last;
    const costBasis = h.shares * h.avgCost;
    const totalGain = value - costBasis;
    const sessionChangePerShare = last - open;
    return {
      companyId: h.companyId,
      ticker: c?.ticker ?? h.companyId.toUpperCase(),
      name: c?.name ?? h.companyId.toUpperCase(),
      sector: c?.sector,
      isFund: c ? isFund(c) : false,
      shares: h.shares,
      avgCost: h.avgCost,
      last,
      sessionChangePerShare,
      sessionGain: h.shares * sessionChangePerShare,
      sessionPct: ratio(sessionChangePerShare, open),
      totalGain,
      totalPct: ratio(totalGain, costBasis),
      value,
      pctOfAccount: ratio(value, totalValue),
      costBasis,
    };
  });
  return rows.sort((a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker));
}

export interface AccountTotals {
  /** Market value of all holdings. */
  invested: number;
  cashPct: number;
  /** Σ shares·(last − sessionOpen) over holdings. */
  sessionGain: number;
  /** (totalValue − sessionOpenValue) / sessionOpenValue. */
  sessionPct: number;
  /** totalValue − sessionOpenValue: the account's change this session (fees included). */
  sessionValueChange: number;
  /** totalValue − starting cash. */
  totalGain: number;
  totalPct: number;
  startingCapital: number;
  /** Paper gain/loss: Σ (value − cost basis). */
  unrealized: number;
}

export function accountTotals(
  team: Pick<Team, 'cashBalance' | 'totalValue' | 'sessionOpenValue'>,
  rows: PositionRow[],
  startingCapital: number = DEFAULT_STARTING_CAPITAL,
): AccountTotals {
  const invested = rows.reduce((s, r) => s + r.value, 0);
  const sessionGain = rows.reduce((s, r) => s + r.sessionGain, 0);
  const unrealized = rows.reduce((s, r) => s + r.totalGain, 0);
  const sessionValueChange = team.sessionOpenValue > 0 ? team.totalValue - team.sessionOpenValue : 0;
  const totalGain = team.totalValue - startingCapital;
  return {
    invested,
    cashPct: ratio(team.cashBalance, team.totalValue),
    sessionGain,
    sessionPct: team.sessionOpenValue > 0 ? ratio(sessionValueChange, team.sessionOpenValue) : 0,
    sessionValueChange,
    totalGain,
    totalPct: ratio(totalGain, startingCapital),
    startingCapital,
    unrealized,
  };
}

/** Positions sort menu (MOBILE §7.4): Value, Total gain %, Session change, Name. */
export type PositionSort = 'value' | 'totalPct' | 'session' | 'name';

export function sortPositions(rows: readonly PositionRow[], sort: PositionSort): PositionRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'totalPct':
      return copy.sort((a, b) => b.totalPct - a.totalPct || b.value - a.value);
    case 'session':
      return copy.sort((a, b) => b.sessionGain - a.sessionGain || b.value - a.value);
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name) || a.ticker.localeCompare(b.ticker));
    default:
      return copy.sort((a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker));
  }
}

/** Portfolio "Show:" menu (COPY-TBD mobile.show). */
export type ShowMetric = 'totalGain' | 'session' | 'pctOfAccount';

export const SHOW_TERM: Record<ShowMetric, string> = { totalGain: 'totalGain', session: 'sessionChange', pctOfAccount: 'pctOfAccount' };

export interface ShowValue {
  kind: 'money' | 'share';
  value: number;
  pct: number | null;
  termId: string;
}

export function showMetricValue(row: PositionRow, metric: ShowMetric): ShowValue {
  if (metric === 'session') return { kind: 'money', value: row.sessionGain, pct: row.sessionPct, termId: SHOW_TERM.session };
  if (metric === 'pctOfAccount') return { kind: 'share', value: row.pctOfAccount, pct: null, termId: SHOW_TERM.pctOfAccount };
  return { kind: 'money', value: row.totalGain, pct: row.totalPct, termId: SHOW_TERM.totalGain };
}

/** "vs Pirate Composite +3.56 points": the crew's return minus the composite's, in percentage points. */
export function vsCompositePoints(totalPct: number, compositeChange: number): number {
  return (totalPct - compositeChange) * 100;
}

/** Value history as chart points. */
export function valueSeries(points: readonly { tick: number; value: number }[]): Point[] {
  return points.map((p) => ({ x: p.tick, y: p.value }));
}

/** Composite history rebased so its starting level equals starting cash (the dashed compare line). */
export function rebaseSeries(points: readonly { tick: number; value: number }[], base: number, startingCapital: number): Point[] {
  if (!(base > 0)) return [];
  return points.map((p) => ({ x: p.tick, y: Math.round((p.value / base) * startingCapital) }));
}

/** Tick → approximate wall-clock epoch, counted back from the last price update (null before the game starts). */
export function tickEpoch(game: Pick<GameState, 'currentTick' | 'lastTickAt' | 'tickIntervalMs'> | null): (tick: number) => number | null {
  return (tick) => (game && game.lastTickAt != null ? game.lastTickAt - (game.currentTick - tick) * game.tickIntervalMs : null);
}

/** Holdings in value order, then cash, for the "Where your money is" bar. */
export function allocationItems(rows: readonly PositionRow[], cash: number): AllocationItem[] {
  return [
    ...rows.map((r): AllocationItem => ({ id: r.companyId, label: r.ticker, value: r.value, sector: r.sector, kind: 'holding' })),
    { id: 'cash', label: 'Cash', value: cash, kind: 'cash' },
  ];
}

/** "3 of 14", or a dash before the first standings. */
export function rankText(rank: number, count: number): string {
  return rank > 0 && count > 0 ? `${rank} of ${count}` : '—';
}
