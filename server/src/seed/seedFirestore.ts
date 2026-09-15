/**
 * Seed CLI: creates a fresh market in the lobby (thin wrapper over services/market).
 *
 * Existing crews are kept and reset to the starting capital. The game seed comes
 * from GAME_SEED or is generated and stored server-only; the admin password comes
 * from ADMIN_PASSWORD, or is generated when no admin login exists yet.
 *
 * Run: `npm run seed -w @deca/server`  (set GAME_SEED / ADMIN_PASSWORD as needed)
 * For local runs, point FIRESTORE_EMULATOR_HOST at the emulator first.
 */

import { config } from '../config';
import { createMarket } from '../services/market';

async function seed(): Promise<void> {
  const result = await createMarket({
    seed: config.seed || undefined,
    keepCrews: true,
    adminPassword: config.adminPassword || undefined,
  });

  console.log(`Seeded ${result.companies} companies. The game is in the lobby.`);
  console.log('   ────────────────────────────────────────────────');
  console.log('   Admin/host login:  name "admin"');
  if (result.generatedAdminPassword) {
    console.log(`   Admin password:    ${result.generatedAdminPassword}   (generated — save this!)`);
  } else if (config.adminPassword) {
    console.log('   Admin password:    (from ADMIN_PASSWORD)');
  } else {
    console.log('   Admin password:    (unchanged — an admin login already exists)');
  }
  console.log(`   Game seed:         ${result.seed}   ${config.seed ? '(from GAME_SEED)' : '(generated — stored server-only)'}`);
  console.log('   ────────────────────────────────────────────────');
  console.log('   Restart the server (or use New game in the host console), then start the game from the host console.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
