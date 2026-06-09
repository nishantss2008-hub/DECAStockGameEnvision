/**
 * Leaderboard recompute. Marks every team to market using the engine's live
 * prices and writes a public `leaderboard/current` doc (no private holdings) plus
 * each team's totalValue + rank.
 */

import type { LeaderboardEntry } from '@deca/shared';
import { db } from '../firebase';
import { shareValue } from '../lib/money';
import type { GameEngine } from '../engine/loop';

export async function recomputeLeaderboard(engine: GameEngine): Promise<void> {
  const teamsSnap = await db.collection('teams').get();
  if (teamsSnap.empty) return;

  const entries: LeaderboardEntry[] = [];
  for (const teamDoc of teamsSnap.docs) {
    const team = teamDoc.data() as { name: string; cashBalance: number };
    const holdingsSnap = await db.collection(`teams/${teamDoc.id}/holdings`).get();
    let holdingsValue = 0;
    holdingsSnap.forEach((h) => {
      const hd = h.data() as { companyId: string; shares: number };
      holdingsValue += shareValue(hd.shares, engine.getPrice(hd.companyId));
    });
    entries.push({
      teamId: teamDoc.id,
      name: team.name,
      totalValue: team.cashBalance + holdingsValue,
      rank: 0,
    });
  }

  entries.sort((a, b) => b.totalValue - a.totalValue);
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  const batch = db.batch();
  batch.set(db.doc('leaderboard/current'), { updatedAt: Date.now(), entries });
  for (const e of entries) {
    batch.update(db.doc(`teams/${e.teamId}`), { totalValue: e.totalValue, rank: e.rank });
  }
  await batch.commit();
}
