/**
 * Market status words for the shell (pure): the status line under every large title (MOBILE §7.0), the one state
 * banner (§7.16), the Market status sheet (§7.9), stale-price detection and the "Sails up" moment (§6.3).
 */
import { SESSIONS_PER_GAME, type GameState, type Phase } from '@deca/shared';
import { countdownRemaining, sessionInfo } from '../lib/gameTime';
import { formatClock, formatNumber, formatPct, formatTickTime } from '../lib/format';
import type { BannerTone } from '../components/ios/Banner';
import type { StatusTone } from '../components/ios/Pill';
import { BANNERS, ERRORS, LOADING, MOBILE, PHASES, SHELL, fill } from './copy';

export interface StatusLineModel {
  tone: StatusTone;
  text: string;
  /** Short form for the collapsed bar subtitle. */
  collapsed: string;
}

function sessionOf(game: GameState) {
  return sessionInfo(game.currentTick, game.sessionTicks > 0 ? game.sessionTicks : Math.max(1, Math.round((game.totalTicks || 1) / SESSIONS_PER_GAME)));
}

function livePill(game: GameState): (typeof PHASES)['live'] | (typeof PHASES)['finalSession'] {
  return sessionOf(game).isFinal ? PHASES.finalSession : PHASES.live;
}

export function statusLine(game: GameState | null, now: number): StatusLineModel {
  if (!game) return { tone: 'idle', text: LOADING.generic.title, collapsed: LOADING.generic.title };
  const timeLeft = formatClock(countdownRemaining(game, now));
  switch (game.phase) {
    case 'live': {
      const text = fill(MOBILE.statusLine, { pill: livePill(game).pill, timeLeft, session: sessionOf(game).session });
      return { tone: 'open', text, collapsed: fill(MOBILE.statusLineCollapsed, { timeLeft }) };
    }
    case 'paused':
      return { tone: 'paused', text: `${PHASES.paused.pill} · ${PHASES.countdownPaused}`, collapsed: PHASES.paused.pill };
    case 'lobby':
      return { tone: 'idle', text: `${PHASES.lobby.pill} · ${fill(PHASES.countdown, { timeLeft })}`, collapsed: PHASES.lobby.pill };
    case 'ended':
    default:
      return { tone: 'idle', text: PHASES.ended.pill, collapsed: PHASES.ended.pill };
  }
}

export interface ShellBannerModel {
  tone: BannerTone;
  title: string;
  flavor?: string;
  body: string;
  action?: 'reload';
}

/** Minimum silence before prices count as stale: three missed ticks, and never under 90 seconds. */
export function staleAfterMs(game: GameState): number {
  return Math.max(90_000, 3 * (game.tickIntervalMs || 30_000));
}

export function staleAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
  const m = Math.floor(s / 60);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** The single banner under the status line: offline › phase › trading off › stale. */
export function shellBanner({ game, online, tradingDisabled, now }: { game: GameState | null; online: boolean; tradingDisabled: boolean; now: number }): ShellBannerModel | null {
  if (!online) return { tone: 'offline', title: ERRORS.offline.title, body: ERRORS.offline.body };
  if (game?.phase === 'paused') return { tone: 'paused', ...BANNERS.paused, body: fill(BANNERS.paused.body, { tick: formatNumber(game.currentTick) }) };
  if (game?.phase === 'lobby') return { tone: 'lobby', ...BANNERS.lobby };
  if (game?.phase === 'ended') return { tone: 'ended', ...BANNERS.ended };
  if (tradingDisabled) return { tone: 'tradingDisabled', ...BANNERS.tradingDisabled };
  if (game?.phase === 'live' && game.lastTickAt && now - game.lastTickAt > staleAfterMs(game)) {
    return { tone: 'stale', title: ERRORS.stale.title, body: fill(MOBILE.staleBody, { ago: staleAgo(now - game.lastTickAt) }), action: 'reload' };
  }
  return null;
}

export interface StatusSheetModel {
  title: string;
  flavor: string;
  timeLeft: string;
  session: number;
  sessions: number;
  sessionLine: string;
  tickLine: string | null;
  body: string;
}

export function statusSheetModel(game: GameState, now: number): StatusSheetModel {
  const info = sessionOf(game);
  const remaining = countdownRemaining(game, now);
  const tickSeconds = Math.round((game.tickIntervalMs || 30_000) / 1000);
  const phaseCopy = game.phase === 'live' ? livePill(game) : PHASES[game.phase];
  // Sessions are equal parts of the game clock, so the current one ends when the later sessions' time is all that is left.
  const laterSessionsMs = (info.sessions - info.session) * ((game.gameLengthMs || 0) / info.sessions);
  const sessionMs = Math.max(0, remaining - laterSessionsMs);
  const tickLine =
    game.phase === 'lobby' || !(game.totalTicks > 0)
      ? null
      : fill(SHELL.tickLine, {
          tick: formatNumber(game.currentTick),
          totalTicks: formatNumber(game.totalTicks),
          pct: formatPct(game.currentTick / game.totalTicks, { digits: 1 }),
          time: game.lastTickAt ? formatTickTime(game.lastTickAt) : '—',
        });
  return {
    title: phaseCopy.pill,
    flavor: phaseCopy.flavor,
    timeLeft: game.phase === 'paused' ? PHASES.countdownPaused : fill(PHASES.countdown, { timeLeft: formatClock(remaining) }),
    session: info.session,
    sessions: info.sessions,
    sessionLine: game.phase === 'live' ? fill(SHELL.sessionEnds, { session: info.session, time: formatClock(sessionMs) }) : fill(SHELL.sessionOnly, { session: info.session }),
    tickLine,
    body: fill(phaseCopy.body, { tickSeconds, timeLeft: formatClock(remaining) }),
  };
}

export function shouldShowSailsUp(input: { prevPhase: Phase | undefined; phase: Phase | undefined; reducedMotion: boolean; sheetOpen: boolean; fieldFocused: boolean }): boolean {
  if (input.prevPhase === undefined || input.prevPhase === 'live' || input.phase !== 'live') return false;
  return !input.reducedMotion && !input.sheetOpen && !input.fieldFocused;
}
