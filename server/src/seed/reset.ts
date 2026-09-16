/**
 * Reset CLI: clears every piece of market data (companies, secrets, history,
 * news schedule, engine state, trades, orders, news, leaderboard, crew stats) and
 * deletes all crews and their logins. The host login, the game state and the audit
 * log are kept.
 *
 *   1. stop the server   2. npm run reset   3. npm run seed   4. start the server
 *
 * Run: `npm run reset -w @deca/server`  (DB_FILE selects the database, default ./data/game.db)
 */

import { config } from '../config';
import { normalizeSettings } from '../engine/loopHelpers';
import { clearDynamicData } from '../services/market';
import { closeStore, store } from '../store';

async function reset(): Promise<void> {
  console.log(`Clearing market data, crews and crew logins in ${config.dbFile}…`);
  const settings = normalizeSettings(store.game.get() ?? undefined);
  await clearDynamicData({ keepCrews: false, startingCapital: settings.startingCapital });

  console.log('Reset complete. Cleared companies, history, schedule, engine state, trades, orders, news, leaderboard, crews and crew logins.');
  console.log('   The host login was kept.');
  console.log('   Next: `npm run seed` to create a new market in the lobby, then restart the server.');
}

reset()
  .then(() => {
    closeStore();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
