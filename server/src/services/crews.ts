/**
 * Crew management for the host console (spec §8): create, reset password,
 * turn trading on or off, and remove.
 *
 * A crew is a public-to-itself `teams/{id}` doc plus a server-only `_auth/{id}`
 * login (scrypt hash). The id is the canonical slug of the crew name, which is
 * also the Firebase custom-token uid and the `teamId` claim.
 */

import { slugifyTeamName, type LeaderboardEntry, type Leaderboard, type Team } from '@deca/shared';
import { db } from '../firebase';
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

const MESSAGES: Record<CrewErrorCode, string> = {
  exists: 'A crew with that name already exists. Choose a different name.',
  bad_name: 'Crew names need at least one letter or number, and "admin" is reserved.',
  not_found: "We couldn't find that crew. Refresh the crew list and try again.",
};

const crewError = (code: CrewErrorCode): CrewError => new CrewError(code, MESSAGES[code]);

/** Slugs only: lowercase letters and digits joined by single hyphens. Keeps ids out of other paths. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['admin']);

function assertCrewId(teamId: string): void {
  if (typeof teamId !== 'string' || teamId.length > 128 || !SLUG.test(teamId) || RESERVED.has(teamId)) {
    throw crewError('not_found');
  }
}

/** Creates the crew login and a team doc holding `startingCapital` cents of cash. */
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
  const authRef = db.doc(`_auth/${id}`);
  const teamRef = db.doc(`teams/${id}`);
  await db.runTransaction(async (tx) => {
    const [authSnap, teamSnap] = await Promise.all([tx.get(authRef), tx.get(teamRef)]);
    if (authSnap.exists || teamSnap.exists) throw crewError('exists');
    const team: Team = {
      id,
      name: displayName,
      cashBalance: startingCapital,
      totalValue: startingCapital,
      rank: 0,
      realizedPnl: 0,
      feesPaid: 0,
      tradeCount: 0,
      tradingDisabled: false,
      sessionOpenValue: startingCapital,
      holdingsCount: 0,
      createdAt: Date.now(),
    };
    tx.create(authRef, { passwordHash, role: 'team', teamId: id });
    tx.create(teamRef, team);
  });
  return { id, name: displayName };
}

/** Replaces the crew's password hash. */
export async function resetCrewPassword(teamId: string, password: string): Promise<void> {
  assertCrewId(teamId);
  const authRef = db.doc(`_auth/${teamId}`);
  const passwordHash = hashPassword(password);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(authRef);
    if (!snap.exists || (snap.data() as { role?: string }).role !== 'team') throw crewError('not_found');
    tx.update(authRef, { passwordHash });
  });
}

/** Turns trading on or off for one crew (checked inside every order transaction). */
export async function setCrewTrading(teamId: string, enabled: boolean): Promise<void> {
  assertCrewId(teamId);
  const teamRef = db.doc(`teams/${teamId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(teamRef);
    if (!snap.exists) throw crewError('not_found');
    tx.update(teamRef, { tradingDisabled: !enabled });
  });
}

/** Deletes every doc matching `field == value` in a top-level collection, in batches. */
async function deleteWhere(collection: string, field: string, value: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await db.collection(collection).where(field, '==', value).limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += snap.size;
  }
}

/** Drops the crew from `leaderboard/current` (live and final entries) and renumbers ranks. */
async function removeFromLeaderboard(teamId: string): Promise<void> {
  const ref = db.doc('leaderboard/current');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const lb = snap.data() as Partial<Leaderboard>;
    const prune = <T extends LeaderboardEntry>(entries: T[] | undefined): T[] | undefined =>
      entries
        ?.filter((e) => e.teamId !== teamId)
        .sort((a, b) => a.rank - b.rank)
        .map((e, i) => ({ ...e, rank: i + 1 }));
    const inEntries = lb.entries?.some((e) => e.teamId === teamId) ?? false;
    const inFinal = lb.final?.entries?.some((e) => e.teamId === teamId) ?? false;
    if (!inEntries && !inFinal) return;
    const update: Record<string, unknown> = {};
    if (inEntries) update.entries = prune(lb.entries);
    if (inFinal && lb.final) update.final = { ...lb.final, entries: prune(lb.final.entries) };
    tx.update(ref, update);
  });
}

/**
 * Removes a crew: its login first (no new sign-ins), then the team doc (every
 * later order fails as no_team and writes nothing), then, once the crew's
 * in-flight order writes have settled, its holdings and history, research-grade
 * stats, trades, orders and standings rows. Sweeping before the orders settle
 * could leave a holding, trade or order written just after the sweep.
 */
export async function removeCrew(teamId: string): Promise<void> {
  assertCrewId(teamId);
  const authRef = db.doc(`_auth/${teamId}`);
  const teamRef = db.doc(`teams/${teamId}`);
  const [authSnap, teamSnap] = await Promise.all([authRef.get(), teamRef.get()]);
  const isCrewLogin = authSnap.exists && (authSnap.data() as { role?: string }).role === 'team';
  if (!isCrewLogin && !teamSnap.exists) throw crewError('not_found');

  if (isCrewLogin) await authRef.delete();
  await teamRef.delete();
  await settleTeamOrders(teamId);
  await db.recursiveDelete(teamRef);
  await db.doc(`_teamStats/${teamId}`).delete();
  await deleteWhere('trades', 'teamId', teamId);
  await deleteWhere('orders', 'teamId', teamId);
  await removeFromLeaderboard(teamId);
}
