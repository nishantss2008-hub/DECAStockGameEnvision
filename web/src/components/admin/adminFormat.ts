/**
 * Pure host-console logic (plan Task 13): setting labels, heartbeat, tick progress, news preview,
 * form parsing and host error wording. No React, no Firebase.
 */

import { deriveClock, type GameState, type Phase, type Team, type Trade } from '@deca/shared';
import { formatNumber, formatPct, MINUS, roundHalfUp } from '../../lib/format';
import { lengthLabel as sharedLengthLabel, lengthPhrase } from '../../lib/gameLength';
import { fill, PHASES } from '../../shell/copy';
import { HOST_ERRORS, HOST_SETTINGS, type HostErrorCode } from './hostCopy';

/** 600000 → '10 minutes', 3600000 → '1 hour', 172800000 → '48 hours'. */
export function lengthLabel(ms: number): string {
  return HOST_SETTINGS.gameLength.options[ms] ?? sharedLengthLabel(ms);
}

export function ticksFor(ms: number): { tickIntervalMs: number; totalTicks: number } {
  const { tickIntervalMs, totalTicks } = deriveClock(ms);
  return { tickIntervalMs, totalTicks };
}

/** COPY §11 derived line: '48-hour game · updates every 30 seconds · 5,760 ticks'. */
export function derivedText(ms: number): string {
  const clock = deriveClock(ms);
  return fill(HOST_SETTINGS.gameLength.derived, {
    length: lengthPhrase(ms),
    tickSeconds: formatNumber(clock.tickIntervalMs / 1000),
    totalTicks: formatNumber(clock.totalTicks),
  });
}

export type HeartbeatTone = 'ok' | 'warn' | 'bad' | 'idle';
export interface Heartbeat {
  tone: HeartbeatTone;
  label: string;
}

/** ok ≤ 2× tick interval since the last tick, warn ≤ 6×, else bad; not live → 'Engine idle'. */
export function heartbeat(game: Pick<GameState, 'phase' | 'tickIntervalMs' | 'lastTickAt'>, now: number): Heartbeat {
  const words = HOST_SETTINGS.control.heartbeat;
  if (game.phase !== 'live') return { tone: 'idle', label: words.idle };
  if (game.lastTickAt === null || game.lastTickAt === undefined) return { tone: 'ok', label: words.ok };
  const since = now - game.lastTickAt;
  const interval = Math.max(1, game.tickIntervalMs);
  if (since <= 2 * interval) return { tone: 'ok', label: words.ok };
  if (since <= 6 * interval) return { tone: 'warn', label: words.warn };
  return { tone: 'bad', label: words.bad };
}

/** 0.08 → '+8%', −0.125 → '−13%' (half away from zero), 0 → '0%'. */
export function magnitudeLabel(m: number): string {
  const whole = roundHalfUp(Math.abs(m) * 100);
  if (whole === 0) return '0%';
  return `${m < 0 ? MINUS : '+'}${whole}%`;
}

export function tickProgress(tick: number, totalTicks: number): { fraction: number; text: string } {
  const fraction = totalTicks > 0 ? Math.min(1, Math.max(0, tick / totalTicks)) : 0;
  return {
    fraction,
    text: `Tick ${formatNumber(tick)} of ${formatNumber(totalTicks)} · ${formatPct(fraction, { digits: 1 })} complete`,
  };
}

/** Elapsed time, short: '3s ago', '2m ago', '2h ago'. */
export function agoText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** 'Engine healthy · last tick 3s ago · 0 ticks behind'; idle shows the label alone. */
export function heartbeatLine(beat: Heartbeat, sinceLastTickMs: number | null, ticksBehind: number): string {
  if (beat.tone === 'idle' || sinceLastTickMs === null) return beat.label;
  const behind = Math.max(0, Math.round(ticksBehind));
  return `${beat.label} · last tick ${agoText(sinceLastTickMs)} · ${formatNumber(behind)} ${behind === 1 ? 'tick' : 'ticks'} behind`;
}

/** Host status line (MOBILE §7.17): 'LIVE · Market open · Sails up'. */
export function hostStatusText(phase: Phase): string {
  const p = PHASES[phase];
  return `${phase.toUpperCase()} · ${p.pill} · ${p.flavor}`;
}

/** 10 bps → '0.10%'. */
export function feePctText(bps: number): string {
  return formatPct(bps / 10_000);
}

export function limitLabel(pct: number): string {
  return HOST_SETTINGS.positionLimit.options[pct]?.label ?? (pct >= 1 ? 'Off' : formatPct(pct, { digits: 0 }));
}

export function publishLabel(currentTick: number): string {
  return `Publish at tick ${formatNumber(currentTick + 1)}`;
}

/** Settings schema limits: starting cash Ð1,000 … Ð1,000,000,000 in integer cents. */
export const STARTING_CASH_MIN = 1_000_00;
export const STARTING_CASH_MAX = 1_000_000_000_00;

/** '1,000,000' or 'Ð250000.5' → integer cents; null when not a number with ≤ 2 decimals or out of range. */
export function parseMoneyInput(text: string): number | null {
  const clean = text.trim().replace(/^[^\d.]+/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents >= STARTING_CASH_MIN && cents <= STARTING_CASH_MAX ? cents : null;
}

/** Whole basis points 0…200, else null. */
export function parseFeeBps(text: string): number | null {
  const clean = text.trim();
  if (!/^\d+$/.test(clean)) return null;
  const bps = Number(clean);
  return bps <= 200 ? bps : null;
}

/** Price after a news move, integer cents. */
export function previewPrice(priceCents: number, magnitude: number): number {
  return Math.round(priceCents * (1 + magnitude));
}

/** Screen-reader counter text, only at 80 characters and at the limit (MOBILE §7.17). */
export function headlineAnnouncement(length: number, max: number): string | null {
  return length === 80 || length === max ? `${length} of ${max} characters` : null;
}

export function returnPct(totalValue: number, startingCapital: number): number {
  return startingCapital > 0 ? totalValue / startingCapital - 1 : 0;
}

/** Mirrors the server's crew name rule: a letter or number, not 'admin', ≤ 60; password ≥ 4. */
export function crewFormProblem(name: string, password: string): 'name' | 'password' | null {
  const trimmed = name.trim();
  const key = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (!key || key === 'admin' || trimmed.length > 60) return 'name';
  if (password.length < 4 || password.length > 100) return 'password';
  return null;
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function filterCrews<T extends Pick<Team, 'name'>>(teams: readonly T[], query: string): T[] {
  const q = nameKey(query);
  return q ? teams.filter((t) => nameKey(t.name ?? '').includes(q)) : [...teams];
}

export function filterTape<T extends Pick<Trade, 'teamId' | 'companyId'>>(trades: readonly T[], f: { teamId?: string; companyId?: string }): T[] {
  return trades.filter((t) => (!f.teamId || t.teamId === f.teamId) && (!f.companyId || t.companyId === f.companyId));
}

const OFFLINE = { title: "You're offline", message: 'Check your connection and try again.' };

/** COPY §11.1: known codes get their title and message; engine codes carry their own COPY message. */
export function hostError(err: unknown): { title: string; message: string | undefined } {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : '';
  if (code === 'network') return OFFLINE;
  if (typeof code === 'string' && code in HOST_ERRORS) return HOST_ERRORS[code as HostErrorCode];
  if (typeof code === 'string' && code !== 'request_failed' && message) return { title: message, message: undefined };
  return HOST_ERRORS.internal;
}

/** Hidden quality position q (−1…1) as a 0–100 score. */
export function qualityScore(q: number): number {
  if (!Number.isFinite(q)) return 0;
  return Math.min(100, Math.max(0, roundHalfUp((q + 1) * 50)));
}

/** Signed whole shares: '+1,200', '−40', '0'. */
export function signedShares(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${formatNumber(r)}` : formatNumber(r);
}
