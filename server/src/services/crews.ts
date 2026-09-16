/**
 * Crew management for the host console (spec §8): create, reset password,
 * turn trading on or off, mark the "Meet the market" intro done, and remove.
 *
 * A crew is one row in `crews`: its public fields, its scrypt password hash and its
 * `token_version`. The id is the canonical slug of the crew name, which is also the
 * `teamId` claim in the session token.
 *
 * Sign-out is instant now: a password reset bumps `token_version`, and a removal deletes the row,
 * so every token already issued to that crew fails its next `verifyToken` (auth/sessions.ts).
 */

import { slugifyTeamName, type Holding, type LeaderboardEntry, type Team } from '@deca/shared';
import { store } from '../store';
import { HOST_ERRORS } from '../lib/hostCopy';
import { hashPassword } from '../lib/password';
import { settleTeamOrders } from './trading';

export type CrewErrorCode = 'exists' | 'bad_name' | 'not_found';

export class CrewError extends Error {
  constructor(
    public code: CrewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CrewError';
  }
}

/** A CrewError with the COPY.md §11.1 host-errors message for its code. */
export const crewError = (code: CrewErrorCode): CrewError => new CrewError(code, HOST_ERRORS[code].message);

/** Slugs only: lowercase letters and digits joined by single hyphens. Keeps ids out of other paths. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['admin']);

function assertCrewId(teamId: string): void {
  if (typeof teamId !== 'string' || teamId.length > 128 || !SLUG.test(teamId) || RESERVED.has(teamId)) {
    throw crewError('not_found');
  }
}

/** Creates the crew with `startingCapital` cents of cash and its login hash, in one transaction. */
export async function createCrew(
  name: string,
  password: string,
  startingCapital: number,
): Promise<{ id: string; name: string }> {
  if (!Number.isInteger(startingCapital) || startingCapital < 0) {
    throw new Error(`createCrew: startingCapital must be a non-negative integer (got ${startingCapital})`);
  }
  const displayName = name.trim();
  const id = slugifyTeamName(displayName);
  if (!id || RESERVED.has(id)) throw crewError('bad_name');

  const passwordHash = hashPassword(password);
  store.tx(() => {
    if (store.crews.get(id)) throw crewError('exists');
    store.crews.create({ id, name: displayName, passwordHash, startingCapital, createdAt: Date.now() });
  });
  return { id, name: displayName };
}

/**
 * Replaces the crew's password hash and bumps its token version, so every device signed in with
 * the old password is signed out on its next request.
 */
export async function resetCrewPassword(teamId: string, password: string): Promise<void> {
  assertCrewId(teamId);
  const passwordHash = hashPassword(password);
  store.tx(() => {
    if (!store.crews.get(teamId)) throw crewError('not_found');
    store.crews.update(teamId, { passwordHash });
    store.crews.bumpTokenVersion(teamId);
  });
}

/**
 * Marks the crew's "Meet the market" intro complete (design §6) and returns the stored time.
 * Idempotent: a crew that finishes the flow twice (two devices, a replay from Learn) keeps its
 * FIRST completion time and gets no error. The crew id comes from the caller's session token,
 * so a crew can only ever complete its own.
 */
export async function completeCrewIntro(teamId: string, at: number = Date.now()): Promise<number> {
  assertCrewId(teamId);
  return store.tx(() => {
    const crew = store.crews.get(teamId);
    if (!crew) throw crewError('not_found');
    if (crew.introCompletedAt) return crew.introCompletedAt;
    store.crews.update(teamId, { introCompletedAt: at });
    return at;
  });
}

/**
 * Host override for the intro gate: mark a crew complete (a phone that died mid-flow must not cost
 * a crew its competition) or clear it, sending the crew back through the flow before its next order.
 * Returns the stored time, or null when cleared.
 */
export async function setCrewIntro(teamId: string, completed: boolean, at: number = Date.now()): Promise<number | null> {
  if (completed) return completeCrewIntro(teamId, at);
  assertCrewId(teamId);
  return store.tx(() => {
    if (!store.crews.get(teamId)) throw crewError('not_found');
    store.crews.update(teamId, { introCompletedAt: null });
    return null;
  });
}

/** Turns trading on or off for one crew (checked inside every order transaction). */
export async function setCrewTrading(teamId: string, enabled: boolean): Promise<void> {
  assertCrewId(teamId);
  store.tx(() => {
    if (!store.crews.get(teamId)) throw crewError('not_found');
    store.crews.update(teamId, { tradingDisabled: !enabled });
  });
}

/**
 * Drops the crew from the standings (live and final entries) and renumbers the ranks. Movement
 * arrows compare with prevRank, so every crew whose prevRank was below the removed crew's moves up
 * one place too. After the end nothing recomputes the standings, so the remaining crews' own `rank`
 * follows the pruned final standings (in a live game the refresh after the removal does that).
 */
function removeFromLeaderboard(teamId: string): void {
  store.tx(() => {
    const lb = store.leaderboard.get();
    if (!lb) return;
    const prune = <T extends LeaderboardEntry>(entries: T[]): T[] => {
      const gone = entries.find((e) => e.teamId === teamId);
      return entries
        .filter((e) => e.teamId !== teamId)
        .sort((a, b) => a.rank - b.rank)
        .map((e, i) => ({ ...e, rank: i + 1, prevRank: gone && e.prevRank > gone.prevRank ? e.prevRank - 1 : e.prevRank }));
    };
    const inEntries = lb.entries?.some((e) => e.teamId === teamId) ?? false;
    const inFinal = lb.final?.entries?.some((e) => e.teamId === teamId) ?? false;
    if (!inEntries && !inFinal) return;
    const entries = inEntries ? prune(lb.entries) : lb.entries;
    const finalEntries = inFinal && lb.final ? prune(lb.final.entries) : undefined;
    store.leaderboard.set({
      ...lb,
      entries,
      ...(finalEntries && lb.final ? { final: { ...lb.final, entries: finalEntries } } : {}),
    });
    // The final standings are the last word on rank, so the crews' own rows follow them.
    for (const e of finalEntries ?? []) {
      const crew = store.crews.get(e.teamId);
      if (crew && crew.rank !== e.rank) store.crews.update(e.teamId, { rank: e.rank });
    }
  });
}

/**
 * Every crew that started the session ranked below the removed one moves up a place, so the
 * removal itself shows no movement arrow for anyone.
 */
function shiftSessionStartRanks(teamId: string, removed: Team): void {
  const start = Number(removed.sessionStartRank) || 0;
  if (start <= 0) return;
  for (const crew of store.crews.all()) {
    if (crew.id === teamId) continue;
    const rank = Number(crew.sessionStartRank) || 0;
    if (rank > start) store.crews.update(crew.id, { sessionStartRank: rank - 1 });
  }
}

/**
 * Removes a crew: its token version first (no request from its devices authenticates again), then,
 * once the crew's in-flight order writes have settled, the row itself — which takes its holdings,
 * history, research stats, trades and orders with it — and finally its standings entry. Sweeping
 * before the orders settle could leave a holding, trade or order written just after the sweep.
 * A failure part-way is safe to retry.
 *
 * Run it through `engine.runCrewRemoval` (as the host route does): that keeps every tick and
 * standings recompute from running alongside, so none can write the crew's history or stats back,
 * and refreshes the live standings afterwards.
 */
export async function removeCrew(teamId: string): Promise<void> {
  assertCrewId(teamId);
  const crew = store.crews.get(teamId);
  if (!crew) throw crewError('not_found');

  // Signed out immediately, even though the row lives a moment longer.
  store.crews.bumpTokenVersion(teamId);
  await settleTeamOrders(teamId);

  store.tx(() => {
    shiftSessionStartRanks(teamId, crew);
    // Explicit, so a store that does not cascade still leaves no orphan position.
    for (const h of store.holdings.forCrew(teamId) as Holding[]) store.holdings.remove(teamId, h.companyId);
    // Takes the crew's holdings, history, stats, trades and orders with the row (spec §8): a crew
    // re-created under the same slug must never inherit the old one's ledger.
    store.crews.remove(teamId);
  });
  removeFromLeaderboard(teamId);
}
