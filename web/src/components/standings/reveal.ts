/**
 * Pure logic for the standings movement and the end-of-game market reveal (plan Task 12, MOBILE §7.13).
 * Words come from COPY §10 via ./copy; numbers are formatted with lib/format so every screen agrees.
 */
import type { Company, FinalEntry, Grade, Holding, LeaderboardEntry, QualityPillars, RevealLabel } from '@deca/shared';
import type { ScatterPoint } from '../charts/ScatterChart';
import { MINUS, formatPct, roundHalfUp } from '../../lib/format';
import { REVEAL } from './copy';

export type MovementDir = 'up' | 'down' | 'flat';
export interface Movement {
  dir: MovementDir;
  by: number;
}

/** Places moved since the session began: prevRank − rank. A missing session-start rank reads as no change. */
export function movement(entry: Pick<LeaderboardEntry, 'rank' | 'prevRank'>): Movement {
  const prev = entry.prevRank;
  if (!prev || !Number.isFinite(prev) || prev < 1) return { dir: 'flat', by: 0 };
  const diff = prev - entry.rank;
  if (diff > 0) return { dir: 'up', by: diff };
  if (diff < 0) return { dir: 'down', by: -diff };
  return { dir: 'flat', by: 0 };
}

/** "up 1 place" · "down 3 places" · "no change". */
export function movementSpoken(m: Movement): string {
  if (m.dir === 'flat' || m.by === 0) return 'no change';
  return `${m.dir} ${m.by} ${m.by === 1 ? 'place' : 'places'}`;
}

/** COPY §10 `labels.*.name`. */
export const LABEL_COPY: Record<RevealLabel, string> = {
  compounder: REVEAL.labels.compounder.name,
  unlucky_gem: REVEAL.labels.unlucky_gem.name,
  lucky_turnaround: REVEAL.labels.lucky_turnaround.name,
  decliner: REVEAL.labels.decliner.name,
};

/** COPY §10 `pillars.*` phrases. */
export const PILLAR_COPY: Record<keyof QualityPillars, { name: string; high: string; low: string }> = REVEAL.pillars;

const PILLAR_ORDER: ReadonlyArray<keyof QualityPillars> = ['prof', 'grow', 'safe', 'val'];

function lowerFirst(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** The 2 pillars farthest from 0 as COPY phrases ("high" at 0 or above), e.g. "Strong profits, safer finances". */
export function driversText(pillars: QualityPillars): string {
  const picked = PILLAR_ORDER.map((key, i) => ({ key, v: Number.isFinite(pillars[key]) ? pillars[key] : 0, i }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v) || a.i - b.i)
    .slice(0, 2)
    .map(({ key, v }) => (v >= 0 ? PILLAR_COPY[key].high : PILLAR_COPY[key].low));
  return picked.map((p, i) => (i === 0 ? p : lowerFirst(p))).join(', ');
}

const clamp100 = (x: number) => Math.min(100, Math.max(0, Math.round(x)));

/** Rank-z quality score s → 0–100: (s + 1.664) / 3.328 · 100, clamped. */
export function healthScore(score: number): number {
  return clamp100(((score + 1.664) / 3.328) * 100);
}

/** Engine q in (−1, 1) (the crew research score) → the same 0–100 scale. */
export function crewHealthScore(q: number): number {
  return clamp100(((q + 1) / 2) * 100);
}

export interface RevealRow {
  companyId: string;
  ticker: string;
  name: string;
  sector: Company['sector'];
  /** Health score 0–100. */
  quality: number;
  grade: Grade;
  /** Simple returns as fractions (0.152 = +15.20%). */
  expected: number;
  actual: number;
  /** actual − expected, in fraction points (0.044 = 4.40 points). */
  luck: number;
  label: RevealLabel;
  drivers: string;
  pillars: QualityPillars;
}

const simple = (logReturn: number) => (Number.isFinite(logReturn) ? Math.exp(logReturn) - 1 : 0);

/** Companies with a reveal, sorted by health score (highest first). Log returns become simple percents. */
export function revealRows(companies: readonly Company[]): RevealRow[] {
  const rows: RevealRow[] = [];
  for (const c of companies) {
    const r = c.reveal;
    if (!r) continue;
    const expected = simple(r.expectedReturn);
    const actual = simple(r.actualReturn);
    rows.push({
      companyId: c.id,
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      quality: healthScore(r.quality),
      grade: r.grade,
      expected,
      actual,
      luck: actual - expected,
      label: r.label,
      drivers: driversText(r.pillars),
      pillars: r.pillars,
    });
  }
  return sortRevealRows(rows, 'quality');
}

export type RevealSort = 'quality' | 'luck' | 'actual';

export function sortRevealRows(rows: readonly RevealRow[], by: RevealSort): RevealRow[] {
  const key = (r: RevealRow) => (by === 'quality' ? r.quality : by === 'luck' ? r.luck : r.actual);
  return [...rows].sort((a, b) => key(b) - key(a) || a.ticker.localeCompare(b.ticker));
}

/** Luck in points with a real minus: "+4.40 points" · "−31.20 points". */
export function luckPoints(luck: number): string {
  const v = roundHalfUp(luck * 100, 2);
  const sign = v < 0 ? MINUS : v > 0 ? '+' : '';
  return `${sign}${Math.abs(v).toFixed(2)} points`;
}

/** "Expected +15.20% · Actual +19.60% · Luck +4.40 points" (never "pts"). */
export function revealLine(row: Pick<RevealRow, 'expected' | 'actual' | 'luck'>): string {
  return `Expected ${formatPct(row.expected, { signed: true })} · Actual ${formatPct(row.actual, { signed: true })} · Luck ${luckPoints(row.luck)}`;
}

export function luckExtremes(rows: readonly RevealRow[]): { luckiest: string | null; unluckiest: string | null } {
  if (rows.length === 0) return { luckiest: null, unluckiest: null };
  const byLuck = sortRevealRows(rows, 'luck');
  return { luckiest: byLuck[0]!.ticker, unluckiest: byLuck[byLuck.length - 1]!.ticker };
}

/** Scatter points keyed by ticker: x = health score, y = actual return; `heldIds` are company ids you held. */
export function scatterPoints(rows: readonly RevealRow[], heldIds: ReadonlySet<string>): ScatterPoint[] {
  return rows.map((r) => ({ id: r.ticker, x: r.quality, y: r.actual, label: r.ticker, highlight: heldIds.has(r.companyId) }));
}

export interface ResearchSummary {
  held: boolean;
  grade: Grade | null;
  health: number | null;
  marketAverage: number | null;
  winner: number | null;
}

const heldShares = (e: FinalEntry) => e.heldAnyShares !== false;

/** Your research grade, the average health of crews that held shares, and the winner's. */
export function researchSummary(entries: readonly FinalEntry[], teamId: string | null): ResearchSummary {
  const held = entries.filter(heldShares);
  const marketAverage = held.length ? Math.round(held.reduce((s, e) => s + crewHealthScore(e.researchScore), 0) / held.length) : null;
  const winnerEntry = entries.find((e) => e.rank === 1);
  const winner = winnerEntry && heldShares(winnerEntry) ? crewHealthScore(winnerEntry.researchScore) : null;
  const mine = entries.find((e) => e.teamId === teamId);
  if (!mine || !heldShares(mine)) return { held: false, grade: null, health: null, marketAverage, winner };
  return { held: true, grade: mine.researchGrade, health: crewHealthScore(mine.researchScore), marketAverage, winner };
}

export interface HoldingRevealRow {
  companyId: string;
  ticker: string;
  name: string;
  sector: Company['sector'];
  /** Share of invested value at closing prices. */
  weight: number;
  quality: number;
  grade: Grade;
}

/** Your closing holdings weighted by value, with their health scores, the weighted average and the B-or-better share. */
export function holdingsBreakdown(
  holdings: readonly Holding[],
  byId: Readonly<Record<string, Company>>,
): { rows: HoldingRevealRow[]; average: number | null; bOrBetter: number } {
  const valued = holdings
    .map((h) => ({ h, c: byId[h.companyId] }))
    .filter((x): x is { h: Holding; c: Company } => Boolean(x.c?.reveal) && x.h.shares > 0)
    .map(({ h, c }) => ({ c, value: h.shares * c.currentPrice }));
  const total = valued.reduce((s, v) => s + v.value, 0);
  if (valued.length === 0 || total <= 0) return { rows: [], average: null, bOrBetter: 0 };
  const rows = valued
    .map(({ c, value }) => ({
      companyId: c.id,
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      weight: value / total,
      quality: healthScore(c.reveal!.quality),
      grade: c.reveal!.grade,
    }))
    .sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));
  const average = Math.round(rows.reduce((s, r) => s + r.weight * r.quality, 0));
  const bOrBetter = rows.filter((r) => r.grade === 'A' || r.grade === 'B').reduce((s, r) => s + r.weight, 0);
  return { rows, average, bOrBetter };
}
