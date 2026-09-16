/**
 * "Meet the market" as data (design 2026-09-16 §6): the ordered card list, the step in the URL, and
 * the one question the whole gate turns on — has this crew finished?
 *
 * Pure on purpose. The page renders what `buildIntroStages` returns and nothing else decides the
 * order, so the flow can be tested without a DOM, and a roster change moves the cards with it.
 *
 * COMPLETION IS NEVER LOCAL STATE. `introComplete` reads `Team.introCompletedAt` from the live
 * store, which the server owns: the host can clear it mid-session, and a crew may be signed in on a
 * second device. This mirrors `introDone()` in `server/src/services/trading.ts`, the order gate.
 */
import { SECTORS, type Company, type Fund, type Sector, type Team } from '@deca/shared';
import { sectorSlug } from '../../lib/sector';
import { INTRO_COMPANIES, INTRO_SECTORS, INTRO_STAGES, type IntroStageCopy } from './introCopy';

/** The flow's route (MOBILE §6.5). It lives in the Learn tab, where it is also replayable. */
export const INTRO_PATH = '/learn/meet-the-market';

/** Has the crew finished the required-once intro? Server truth, never localStorage. */
export function introComplete(team: Pick<Team, 'introCompletedAt'> | null | undefined): boolean {
  return typeof team?.introCompletedAt === 'number' && team.introCompletedAt > 0;
}

export interface IntroCompanyRow {
  ticker: string;
  name: string;
  description: string;
  /** Opening price in integer cents, or null before the market has loaded. */
  openPrice: number | null;
}

export interface IntroFundRow {
  ticker: string;
  name: string;
  /** COPY §13 `holds`, which the server ships as the fund's own description. */
  holds: string;
  openPrice: number | null;
}

export type IntroStage =
  | { kind: 'card'; id: string; title: string; body: string; points: readonly string[] }
  | { kind: 'sector'; id: string; sector: Sector; title: string; body: string; companies: IntroCompanyRow[] }
  | { kind: 'funds'; id: string; title: string; body: string; points: readonly string[]; funds: IntroFundRow[] };

const stageCopy = (id: string): IntroStageCopy => {
  const found = INTRO_STAGES.find((s) => s.id === id);
  if (!found) throw new Error(`COPY §14 has no intro-stage "${id}"`);
  return found;
};

/** Companies of one sector, live where possible, from COPY §14 when the market has not loaded. */
function sectorCompanies(sector: Sector, companies: readonly Company[]): IntroCompanyRow[] {
  const live = companies
    .filter((c) => c.sector === sector)
    .map((c) => ({
      ticker: c.ticker,
      name: c.name,
      description: INTRO_COMPANIES[c.ticker]?.description ?? c.description,
      openPrice: c.startPrice,
    }));
  if (live.length > 0) return live.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return Object.entries(INTRO_COMPANIES)
    .filter(([, c]) => c.sector === sector)
    .map(([ticker, c]) => ({ ticker, name: c.name, description: c.description, openPrice: null }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export interface IntroInput {
  companies: readonly Company[];
  funds: readonly Fund[];
}

/**
 * The cards, in the order design §6 fixes: what you're doing · what a share is · the Pirate
 * Composite · one card per sector · what a fund is · done.
 */
export function buildIntroStages({ companies, funds }: IntroInput): IntroStage[] {
  const card = (id: string): IntroStage => ({ kind: 'card', ...stageCopy(id) });
  const sectors = SECTORS.map((sector): IntroStage => {
    const slug = sectorSlug(sector);
    return {
      kind: 'sector',
      id: slug,
      sector,
      title: sector,
      body: INTRO_SECTORS[slug]?.body ?? '',
      companies: sectorCompanies(sector, companies),
    };
  });
  const fundsCopy = stageCopy('funds');
  const fundsStage: IntroStage = {
    kind: 'funds',
    id: fundsCopy.id,
    title: fundsCopy.title,
    body: fundsCopy.body,
    points: fundsCopy.points,
    funds: funds.map((f) => ({ ticker: f.ticker, name: f.name, holds: f.description, openPrice: f.startPrice })),
  };
  return [card('goal'), card('share'), card('composite'), ...sectors, fundsStage, card('done')];
}

/** How many cards the flow has; the step counter and the clamp both use it. */
export const INTRO_STEPS = 3 + SECTORS.length + 2;

const toParams = (search: string | URLSearchParams): URLSearchParams =>
  typeof search === 'string' ? new URLSearchParams(search) : search;

/** The 1-based step in `?step=`, clamped into range. Anything unreadable is step 1. */
export function stepFromSearch(search: string | URLSearchParams, total = INTRO_STEPS): number {
  const raw = Number.parseInt(toParams(search).get('step') ?? '', 10);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(Math.max(raw, 1), Math.max(1, total));
}

/** `?step=n` for a step, or '' for the first (so the flow's own link stays clean). */
export function introSearch(step: number, total = INTRO_STEPS): string {
  const n = Math.min(Math.max(Math.trunc(step), 1), Math.max(1, total));
  return n <= 1 ? '' : `?step=${n}`;
}

/** Full href for a step, used by the Learn row, the ticket fix and the trade gate. */
export function introHref(step = 1, total = INTRO_STEPS): string {
  return `${INTRO_PATH}${introSearch(step, total)}`;
}
