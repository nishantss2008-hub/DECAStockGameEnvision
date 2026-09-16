/**
 * The projector scoreboard as data (MOBILE §7.19): one object a room can read from across it.
 *
 * Pure on purpose. A projector screen is the one surface nobody can interrogate — no scrolling, no
 * tapping, no "let me refresh that" — so every decision it makes is decided here, where a test can
 * hold it still: how many rows fit before the type stops being legible, which words say the phase,
 * and when the board has to admit that what it is showing is no longer live.
 *
 * It shows only what a crew can already see on its own phone. Hidden company data (quality, grade,
 * fair value) never reaches the client before the game ends, and nothing here asks for it.
 *
 * Lengths are in the 1920×1080 design frame; `projector.css` maps one design pixel onto `--px`, so
 * the same board fills a 1280×720 projector at exactly the same proportions.
 */
import { SESSIONS_PER_GAME, type GameState, type InstrumentQuote, type Leaderboard, type LeaderboardEntry, type MarketSummary, type NewsEvent, type Phase } from '@deca/shared';
import { direction, formatClock, formatIndex, formatMoney, formatPct, formatTickTime } from '../../lib/format';
import { countdownRemaining, sessionInfo } from '../../lib/gameTime';
import { fill } from '../../shell/copy';
import { movement, type Movement, type MovementDir } from '../standings/reveal';
import { sortStandings } from '../standings/standings';
import { PROJECTOR } from './projectorCopy';

/**
 * The design frame. 1920×1080 and 1280×720 are the same shape, so one set of numbers serves both.
 * Every height below was measured off the rendered screen, not guessed; `projector.css` draws the
 * same boxes, and `designScale` is the JS twin of its `--px`.
 */
export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;
/** Page padding, top plus bottom. */
const FRAME_PADDING = 52;
/** The gap between the header, the strips and the body. */
const STACK_GAP = 16;
/** Wordmark and clock, with and without the "Session n of 8" line (the ended header has none). */
const HEAD_HEIGHT = 138;
const HEAD_HEIGHT_NO_SESSION = 104;
/** The strip that admits the stream has dropped. */
const ALERT_HEIGHT = 76;
/** The band that says the phase, and the winner line it grows by once the game has ended. */
const BAND_HEIGHT = 123;
const WINNER_HEIGHT = 71;
/** The board's own column header, and the strip that holds the "top N of M" line. */
const COLS_HEIGHT = 52;
const OVERFLOW_HEIGHT = 44;

/** Height of the standings column when nothing sits above it, and the row heights it may use. */
export const BOARD_HEIGHT = FRAME_HEIGHT - FRAME_PADDING - HEAD_HEIGHT - STACK_GAP - COLS_HEIGHT - OVERFLOW_HEIGHT;
export const ROW_HEIGHT_MAX = 84;
/**
 * Two floors, both read off a 1280×720 render rather than a 1920×1080 one, because 720p is where a
 * projected row either survives or does not.
 *
 * `ROW_HEIGHT_FIT_MIN` (54, ~36 real px at 720p) is how far rows may be squeezed to get EVERY crew
 * on the wall. A class period is around 14 crews, and the two at the bottom are the ones most
 * eagerly hunting for their own name — cutting them to make the rows prettier is the wrong trade.
 * 54 was verified legible in the render; 48 is where the board starts to crowd.
 *
 * `ROW_HEIGHT_MIN` (64, ~43 real px at 720p, a crew name near 21px) is the height rows take once the
 * field is too big to fit legibly at all. Past that point the board stops squeezing, goes back to a
 * comfortable row, and the "top N of M" line carries the crews it could not draw.
 */
export const ROW_HEIGHT_FIT_MIN = 54;
export const ROW_HEIGHT_MIN = 64;

/**
 * What is left for the board once the bands above it have taken their share. Every number above was
 * measured off the rendered screen at both 1920×1080 and 1280×720 (`projector.test.ts` holds this
 * against those measurements), because reserving a worst case that never co-occurs costs whole rows
 * — and the crews near the bottom of the board are the ones scanning for their own name.
 */
export function availableBoardHeight(opts: { band: boolean; winner: boolean; alert: boolean; session: boolean }): number {
  let height = FRAME_HEIGHT - FRAME_PADDING - (opts.session ? HEAD_HEIGHT : HEAD_HEIGHT_NO_SESSION) - STACK_GAP - COLS_HEIGHT - OVERFLOW_HEIGHT;
  if (opts.alert) height -= ALERT_HEIGHT + STACK_GAP;
  if (opts.band) height -= BAND_HEIGHT + STACK_GAP + (opts.winner ? WINNER_HEIGHT : 0);
  return height;
}

/**
 * One design pixel in real pixels — the JS twin of `--px` in projector.css, so the screen can
 * measure its own board and convert the answer back into the frame these numbers are written in.
 * The budget above is the fallback; a measured height is the truth, because a wrapped phase line
 * on an unfamiliar system font is exactly the case a hand-written budget gets wrong.
 */
export function designScale(width: number, height: number): number {
  return Math.min(width / FRAME_WIDTH, height / FRAME_HEIGHT);
}

export interface BoardFit {
  /** Rows actually drawn. */
  shown: number;
  /** Crews in the standings. */
  total: number;
  /** Row height in design pixels. */
  rowHeight: number;
  /** True when crews were left off the board. */
  overflow: boolean;
}

/**
 * Fit every crew if it can be done legibly; otherwise use big rows and truncate.
 *
 * Rows shrink to hold the whole field, as far as `ROW_HEIGHT_FIT_MIN` — so a 14-crew class sees all
 * 14 and no footer. Below that the board gives up on fitting everyone, goes back up to
 * `ROW_HEIGHT_MIN`, and says how many it left off. A smaller field never stretches past
 * `ROW_HEIGHT_MAX` — 6 crews on a full column would otherwise be six billboards with gaps between.
 *
 * One comparison decides the branch, so the same height and field always land on the same side:
 * there is nothing here that can flip back and forth between renders.
 */
export function fitBoard(total: number, height = BOARD_HEIGHT): BoardFit {
  const crews = Math.max(0, Math.floor(total) || 0);
  if (crews === 0) return { shown: 0, total: 0, rowHeight: ROW_HEIGHT_MAX, overflow: false };
  const ideal = height / crews;
  if (ideal >= ROW_HEIGHT_FIT_MIN) return { shown: crews, total: crews, rowHeight: Math.min(ROW_HEIGHT_MAX, ideal), overflow: false };
  const shown = Math.max(1, Math.floor(height / ROW_HEIGHT_MIN));
  return { shown, total: crews, rowHeight: ROW_HEIGHT_MIN, overflow: shown < crews };
}

/** Time left, sized for a wall: "22:50", and "1:05:00" only when there is an hour to show. */
export function bigClock(ms: number): string {
  const clock = formatClock(ms);
  return clock.startsWith('00:') ? clock.slice(3) : clock.replace(/^0/, '');
}

export interface ProjectorRow {
  teamId: string;
  rank: number;
  name: string;
  /** Account value, already formatted in the host's currency. */
  value: string;
  /** Total return since the game began, signed. */
  change: string;
  dir: MovementDir;
  /** Places moved since this session began (COPY §15 / MOBILE §7.12 movement). */
  move: Movement;
}

export interface ProjectorNote {
  title: string;
  body: string;
}

/** One row of the movers card: public quote data, exactly what a crew sees on its own phone. */
export interface MoverRow {
  id: string;
  ticker: string;
  name: string;
  price: string;
  change: string;
  dir: MovementDir;
}

/**
 * The biggest risers and fallers this session, `n` of each, risers first.
 *
 * A flat instrument is not a mover, so before the first tick the list is empty and the card says so
 * rather than ranking eighteen zeroes. Ties break on ticker, so the card holds still between ticks
 * instead of shuffling two equal names in front of a room.
 */
export function pickMovers(instruments: readonly InstrumentQuote[], symbol: string, n = 2): MoverRow[] {
  const row = (q: InstrumentQuote): MoverRow => ({
    id: q.id,
    ticker: q.ticker,
    name: q.name,
    price: formatMoney(q.currentPrice, { symbol }),
    change: formatPct(q.sessionChange, { signed: true }),
    dir: direction(q.sessionChange),
  });
  const moved = instruments.filter((q) => q && q.ticker && Number.isFinite(q.sessionChange) && direction(q.sessionChange) !== 'flat');
  const byChange = (a: InstrumentQuote, b: InstrumentQuote) => b.sessionChange - a.sessionChange || a.ticker.localeCompare(b.ticker);
  const risers = moved.filter((q) => q.sessionChange > 0).sort(byChange).slice(0, n);
  const fallers = moved
    .filter((q) => q.sessionChange < 0)
    .sort((a, b) => a.sessionChange - b.sessionChange || a.ticker.localeCompare(b.ticker))
    .slice(0, n);
  return [...risers, ...fallers].map(row);
}

export interface ProjectorModel {
  phase: Phase;
  /** Said large, above the board — but only when the game is not simply running. */
  phaseNote: { title: string; flavor: string; body: string } | null;
  clock: string;
  /** "Session 2 of 8", or null when the game has ended and the winner takes the slot. */
  session: string | null;
  composite: { label: string; value: string; change: string; dir: MovementDir } | null;
  headline: { text: string; time: string } | null;
  /**
   * Two risers and two fallers; empty before anything has moved, and null once the game has ended —
   * there is no "this session" left to rank, and the rail's room goes to the winner instead.
   */
  movers: MoverRow[] | null;
  rows: ProjectorRow[];
  fit: BoardFit;
  /** "Showing the top 14 of 24 crews", or null when every crew is on the board. */
  overflowNote: string | null;
  /** Nothing to rank yet: no market, or no crews. */
  notice: ProjectorNote | null;
  /** The stream is down: the numbers on screen may be behind the server. */
  connection: ProjectorNote | null;
  winner: string | null;
}

export interface ProjectorInput {
  game: GameState | null;
  leaderboard: Leaderboard | null;
  market: MarketSummary | null;
  news: readonly NewsEvent[];
  /** Every tradeable thing — the 15 companies and the 3 funds — for the movers card. */
  instruments?: readonly InstrumentQuote[];
  /** Server time (lib/gameTime `serverNow()`), so the countdown survives a wrong device clock. */
  now: number;
  /** The live snapshot's `fromCache`: offline, or the stream is not open. */
  stale: boolean;
  /** A snapshot has been folded in. */
  ready: boolean;
  boardHeight?: number;
}

function clockText(game: GameState | null, now: number): string {
  if (!game) return bigClock(0);
  switch (game.phase) {
    case 'paused':
      return PROJECTOR.clock.paused;
    case 'ended':
      return PROJECTOR.clock.ended;
    case 'lobby':
      return fill(PROJECTOR.clock.lobby, { timeLeft: bigClock(countdownRemaining(game, now)) });
    case 'live':
    default:
      return fill(PROJECTOR.clock.live, { timeLeft: bigClock(countdownRemaining(game, now)) });
  }
}

function sessionText(game: GameState | null): string | null {
  if (!game || game.phase === 'ended') return null;
  const per = game.sessionTicks > 0 ? game.sessionTicks : Math.max(1, Math.round((game.totalTicks || 1) / SESSIONS_PER_GAME));
  return fill(PROJECTOR.session, { session: sessionInfo(game.currentTick, per).session });
}

/** One dispatch: the newest that has fired. The room reads a headline, never a feed. */
function newest(news: readonly NewsEvent[]): { text: string; time: string } | null {
  let best: NewsEvent | null = null;
  for (const item of news) {
    if (!item?.headline) continue;
    if (!best || item.firedAt > best.firedAt || (item.firedAt === best.firedAt && item.tick > best.tick)) best = item;
  }
  return best ? { text: best.headline, time: formatTickTime(best.firedAt) } : null;
}

export function buildProjector(input: ProjectorInput): ProjectorModel {
  const { game, leaderboard, market, news, now } = input;
  const phase: Phase = game?.phase ?? 'lobby';
  const symbol = game?.currency?.symbol ?? 'Ð';
  const ended = phase === 'ended';

  // Once the game ends the final block is the truth; before the server writes it, the live rows are.
  const entries: LeaderboardEntry[] = (ended && leaderboard?.final?.entries) || leaderboard?.entries || [];
  const ranked = sortStandings(entries, 'total');
  const hasWinner = ended && ranked.length > 0;
  const session = sessionText(game);
  // The board takes the space the bands above it leave, so a paused game with a dropped stream
  // still fits one screen — it just ranks fewer crews and says how many it left off.
  const height = input.boardHeight ?? availableBoardHeight({ band: phase !== 'live', winner: hasWinner, alert: input.stale, session: session !== null });
  const fit = fitBoard(ranked.length, height);
  const rows: ProjectorRow[] = ranked.slice(0, fit.shown).map((e) => ({
    teamId: e.teamId,
    rank: e.rank,
    name: e.name,
    value: formatMoney(e.totalValue, { symbol }),
    change: formatPct(e.returnPct, { signed: true }),
    dir: direction(e.returnPct),
    move: movement(e),
  }));

  let notice: ProjectorNote | null = null;
  if (!game || !input.ready) notice = PROJECTOR.waiting;
  else if (ranked.length === 0) notice = { title: PROJECTOR.empty, body: '' };

  const composite = market?.composite
    ? {
        label: PROJECTOR.composite.label,
        value: formatIndex(market.composite.value),
        change: fill(PROJECTOR.composite.change, { pct: formatPct(market.composite.sessionChange, { signed: true }) }),
        dir: direction(market.composite.sessionChange),
      }
    : null;

  return {
    phase,
    phaseNote: phase === 'live' ? null : PROJECTOR.phases[phase],
    clock: clockText(game, now),
    session,
    composite,
    headline: newest(news),
    movers: ended ? null : pickMovers(input.instruments ?? [], symbol),
    rows,
    fit,
    overflowNote: fit.overflow ? fill(PROJECTOR.overflow, { n: fit.shown, total: fit.total }) : null,
    notice,
    connection: input.stale ? PROJECTOR.connection : null,
    winner: hasWinner ? fill(PROJECTOR.winner, { crew: ranked[0]!.name }) : null,
  };
}
