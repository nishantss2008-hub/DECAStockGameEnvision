/**
 * Reset CLI: clears every piece of market data (companies, history, schedule,
 * engine state, trades, orders, news, leaderboard, team stats) and deletes all
 * crews and their logins. The admin login, `game/state` and the audit log are kept.
 *
 *   1. stop the server   2. npm run reset   3. npm run seed   4. start the server
 *
 * Run: `npm run reset -w @deca/server`
 */

import type { GameSettings } from '@deca/shared';
import { db } from '../firebase';
import { normalizeSettings } from '../engine/loopHelpers';
import { clearDynamicData } from '../services/market';

async function reset(): Promise<void> {
  console.log('Clearing market data, crews and crew logins…');
  const settings = normalizeSettings((await db.doc('game/state').get()).data() as Partial<GameSettings> | undefined);
  await clearDynamicData({ keepCrews: false, startingCapital: settings.startingCapital });

  console.log('Reset complete. Cleared companies, history, schedule, engine state, trades, orders, news, leaderboard, crews and crew logins.');
  console.log('   The admin login was kept.');
  console.log('   Next: `npm run seed` to create a new market in the lobby, then restart the server.');
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
