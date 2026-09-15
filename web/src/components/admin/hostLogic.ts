/**
 * Pure host-screen logic (MOBILE §7.17–§7.18): which control buttons a phase shows, the fire-news form rules,
 * the settings summary, host-only "?" explanations, and audit/tape row text. No React, no Firebase.
 */
import type { GameSettings, Phase, Trade } from '@deca/shared';
import { formatMoney, formatNumber } from '../../lib/format';
import { GLOSSARY } from '../../lib/glossary';
import type { GlossaryEntry } from '../../lib/copyTypes';
import { feePctText, lengthLabel, limitLabel, magnitudeLabel } from './adminFormat';
import { HOST_PHONE, HOST_SETTINGS } from './hostCopy';

export type ControlAction = 'start' | 'pause' | 'resume' | 'end' | 'newGame';

export function controlActions(phase: Phase): { primary: ControlAction | null; secondary: ControlAction | null } {
  switch (phase) {
    case 'lobby':
      return { primary: 'start', secondary: null };
    case 'live':
      return { primary: 'pause', secondary: 'end' };
    case 'paused':
      return { primary: 'resume', secondary: 'end' };
    default:
      return { primary: 'newGame', secondary: null };
  }
}

export function trackPrimaryLabel(action: ControlAction): string {
  switch (action) {
    case 'pause':
      return HOST_PHONE.pauseTrading;
    case 'resume':
      return HOST_PHONE.resumeTrading;
    case 'start':
      return HOST_SETTINGS.control.start.button;
    case 'end':
      return HOST_PHONE.endGame;
    default:
      return HOST_PHONE.newGame;
  }
}

// ─── Fire news ────────────────────────────────────────────────────────────────

/** MOBILE §7.17: counter "54/90", announced at 80 and 90. */
export const HEADLINE_MAX = 90;
export const BODY_MAX = 2000;
export const MAGNITUDE_LIMIT = 0.5;
export const SIZE_SEGMENTS = [-0.5, -0.25, 0, 0.25, 0.5] as const;

/** Segment value for a magnitude that sits exactly on one, else null (no segment selected). */
export function sizeSegmentValue(magnitude: number): string | null {
  const hit = SIZE_SEGMENTS.find((s) => Math.abs(s - magnitude) < 1e-9);
  return hit === undefined ? null : String(hit);
}

/** Moves the magnitude by whole percent steps, kept within ±50%. */
export function stepMagnitude(magnitude: number, deltaPct: number): number {
  const pct = Math.round(magnitude * 100) + deltaPct;
  const clamped = Math.max(-MAGNITUDE_LIMIT * 100, Math.min(MAGNITUDE_LIMIT * 100, pct));
  return clamped / 100 || 0;
}

export type FireNewsProblem = 'phase' | 'companies' | 'zero' | 'headline';

export function fireNewsProblem(input: { phase: Phase | undefined; companyIds: readonly string[]; magnitude: number; headline: string }): FireNewsProblem | null {
  if (input.phase !== 'live' && input.phase !== 'paused') return 'phase';
  if (input.companyIds.length === 0) return 'companies';
  if (Math.round(input.magnitude * 100) === 0) return 'zero';
  const h = input.headline.trim();
  if (!h || h.length > HEADLINE_MAX) return 'headline';
  return null;
}

// ─── Settings summary ─────────────────────────────────────────────────────────

export type SettingId = 'gameLength' | 'startingCash' | 'tradingFee' | 'researchEdge' | 'positionLimit' | 'currency';

export interface SettingRow {
  id: SettingId;
  label: string;
  value: string;
  /** Glossary or host term explained by the row's "?". */
  termId: string;
}

export function settingsSummary(s: GameSettings): SettingRow[] {
  const edge = HOST_SETTINGS.researchEdge.options[s.researchEdge];
  return [
    { id: 'gameLength', label: HOST_SETTINGS.gameLength.label, value: lengthLabel(s.gameLengthMs), termId: 'gameLength' },
    { id: 'startingCash', label: HOST_SETTINGS.startingCash.label, value: formatMoney(s.startingCapital, { symbol: s.currency.symbol }), termId: 'startingCash' },
    { id: 'tradingFee', label: HOST_SETTINGS.tradingFee.label, value: feePctText(s.feeBps), termId: 'fee' },
    { id: 'researchEdge', label: HOST_SETTINGS.researchEdge.label, value: edge?.label ?? s.researchEdge, termId: 'researchEdge' },
    { id: 'positionLimit', label: HOST_SETTINGS.positionLimit.label, value: limitLabel(s.maxPositionPct), termId: 'positionLimit' },
    { id: 'currency', label: HOST_SETTINGS.currency.label, value: `${s.currency.name} (${s.currency.symbol})`, termId: 'currency' },
  ];
}

// ─── Host-only explanations (COPY-TBD: host phone strings, MOBILE §7.0) ───────

const hostEntry = (id: string, label: string, term: string, whatItIs: string, whyItMatters: string, usuallyGoodWhen: string): GlossaryEntry => ({
  id,
  label,
  term,
  whatItIs,
  whyItMatters,
  usuallyGoodWhen,
  related: [],
  group: 'game',
});

export const HOST_TERMS: Record<string, GlossaryEntry> = {
  fairValue: hostEntry(
    'fairValue',
    'Fair value',
    'engine value',
    "The price the game's engine thinks a share is really worth, based on the company's hidden health and the news so far.",
    'Prices drift toward fair value over time, so a big gap tends to shrink. Crews never see this number.',
    'the price is close to it, which means crews are pricing the company sensibly.',
  ),
  deviation: hostEntry(
    'deviation',
    'Price vs fair value',
    'deviation',
    'How far the last price is above (+) or below (−) fair value, as a percent.',
    'A large plus means crews may be overpaying; a large minus means the stock may be a bargain.',
    'it stays within a few percent either way.',
  ),
  netFlow: hostEntry(
    'netFlow',
    'Net order flow',
    'net flow',
    'Shares crews bought minus shares they sold in this company recently.',
    'Heavy buying pushes the price up a little and heavy selling pushes it down, on top of news and luck.',
    'it swings both ways, which means crews disagree and the market is busy.',
  ),
  heartbeat: hostEntry(
    'heartbeat',
    'Engine health',
    'heartbeat',
    'Whether the price engine is updating on time. It checks how long ago the last price update ran.',
    'If the engine stops, prices freeze and orders may fail, so you should check the server.',
    'it says Engine healthy and the last tick was a few seconds ago.',
  ),
  ticksBehind: hostEntry(
    'ticksBehind',
    'Ticks behind',
    'catch-up',
    'How many price updates the engine still has to run to catch up with the clock.',
    'A few is normal after a restart; a growing number means the server is too slow.',
    'it reads 0.',
  ),
  timeLeft: hostEntry(
    'timeLeft',
    'Time left',
    'countdown',
    'How long trading lasts before the game ends on its own. The clock stops while trading is paused.',
    'When it reaches zero, holdings are valued at closing prices and the standings are final.',
    'crews have enough time left to act on what they learn.',
  ),
  gameLength: hostEntry(
    'gameLength',
    'Game length',
    'game length',
    HOST_SETTINGS.gameLength.help,
    'Longer games update prices less often, so each session lasts longer.',
    'it matches how long your event runs.',
  ),
  currency: hostEntry(
    'currency',
    'Currency',
    'currency',
    HOST_SETTINGS.currency.help,
    'Every price and account value uses this name and symbol.',
    'crews recognise the symbol at a glance.',
  ),
  returnPct: hostEntry(
    'returnPct',
    'Return',
    'return on starting cash',
    "How much a crew's account value is up (+) or down (−) compared with the cash it started with.",
    'Standings are decided by account value, so return shows who is ahead.',
    'it is above 0%, which means the crew has made money.',
  ),
  tradeCount: hostEntry(
    'tradeCount',
    'Trades',
    'trade count',
    'How many buy and sell orders a crew has filled.',
    'Each trade pays a fee, so many small trades can eat into returns.',
    'trades follow research rather than guesses.',
  ),
  rank: hostEntry(
    'rank',
    'Rank',
    'standing',
    "A crew's place in the standings, ordered by account value.",
    'The crew ranked 1 when the game ends wins.',
    'it is moving toward 1.',
  ),
};

/** Every metric the host screens show; each has a "?" (MOBILE §10). */
export const HOST_METRIC_TERMS = [
  'price',
  'sessionChange',
  'volume',
  'netFlow',
  'quality',
  'researchGrade',
  'fairValue',
  'deviation',
  'tick',
  'session',
  'timeLeft',
  'heartbeat',
  'ticksBehind',
  'accountValue',
  'cash',
  'returnPct',
  'tradeCount',
  'rank',
  'fee',
  'gameLength',
  'startingCash',
  'researchEdge',
  'positionLimit',
  'currency',
] as const;

export function hostTermEntry(id: string): GlossaryEntry | null {
  return HOST_TERMS[id] ?? GLOSSARY[id] ?? null;
}

// ─── Audit and tape ───────────────────────────────────────────────────────────

const AUDIT_LABELS: Record<string, string> = {
  'game.start': 'Game started',
  'game.pause': 'Trading paused',
  'game.resume': 'Trading resumed',
  'game.end': 'Game ended',
  'game.new': 'New game created',
  'game.new_failed': 'New game failed',
  'settings.update': 'Settings changed',
  'team.create': 'Crew added',
  'team.password_reset': 'Password reset',
  'team.trading': 'Trading switched',
  'team.remove': 'Crew removed',
  'news.queue': 'News fired',
  'auth.login': 'Signed in',
  'order.fill': 'Order filled',
};

export function auditActionLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

export function auditDetails(entry: { action: string; payload?: Record<string, unknown> }, teamNames: Record<string, string>): string {
  const p = entry.payload ?? {};
  const crew = typeof p.teamId === 'string' ? (teamNames[p.teamId] ?? (typeof p.name === 'string' ? p.name : p.teamId)) : null;
  switch (entry.action) {
    case 'team.trading':
      return `${crew} · ${p.enabled ? HOST_PHONE.crews.tradingAllowed : HOST_PHONE.crews.tradingOff}`;
    case 'team.create':
    case 'team.remove':
    case 'team.password_reset':
      return crew ?? '';
    case 'news.queue':
      return `${typeof p.magnitude === 'number' ? magnitudeLabel(p.magnitude) : ''} · ${String(p.headline ?? '')}`;
    case 'game.new':
      return p.keepCrews ? 'Crews kept' : 'Crews deleted';
    default:
      if (typeof p.tick === 'number') return `Tick ${formatNumber(p.tick)}`;
      return Object.keys(p)
        .filter((k) => ['string', 'number', 'boolean'].includes(typeof p[k]))
        .map((k) => `${k}: ${String(p[k])}`)
        .join(' · ');
  }
}

export function tapeLine(trade: Pick<Trade, 'side' | 'quantity' | 'price'>, ticker: string): { action: string; text: string; amount: number } {
  const action = trade.side === 'buy' ? HOST_PHONE.tape.bought : HOST_PHONE.tape.sold;
  return { action, text: `${action} ${formatNumber(trade.quantity)} ${ticker}`, amount: trade.quantity * trade.price };
}

/** Crest letters for a crew: first letters of the first two words ("Black Pearl" → "BP"), else its first two letters. */
export function crewInitials(name: string): string {
  const words = name.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}
