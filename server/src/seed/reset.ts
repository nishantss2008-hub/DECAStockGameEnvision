/**
 * Reset the game to a clean slate: clears all dynamic data (teams + their logins,
 * trades, orders, news, leaderboard, and every company's price history) but keeps
 * the admin login. Run `npm run seed` afterward to rebuild the lobby (companies,
 * fundamentals, initial prices, game state).
 *
 *   1. stop the server   2. npm run reset   3. npm run seed   4. start the server
 *
 * Run: `npm run reset -w @deca/server`
 */

import { db } from '../firebase';
import { ROSTER } from './roster';

async function reset(): Promise<void> {
  console.log('Clearing dynamic game data…');
  await db.recursiveDelete(db.collection('teams'));
  await db.recursiveDelete(db.collection('trades'));
  await db.recursiveDelete(db.collection('orders'));
  await db.recursiveDelete(db.collection('news'));
  await db.recursiveDelete(db.collection('leaderboard'));

  // Team logins (keep the admin credential).
  const authSnap = await db.collection('_auth').get();
  await Promise.all(authSnap.docs.filter((d) => d.id !== '_admin').map((d) => d.ref.delete()));

  // Per-company price history.
  for (const r of ROSTER) {
    await db.recursiveDelete(db.collection(`companies/${r.id}/priceHistory`));
  }

  console.log('✅ Reset complete. Cleared teams, logins, trades, orders, news, leaderboard, and price history.');
  console.log('   Next: `npm run seed` to rebuild the lobby, then restart the server.');
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
