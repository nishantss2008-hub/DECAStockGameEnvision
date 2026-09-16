/**
 * Set-host-password CLI: sets the host (admin) password without creating a new market.
 *
 *   ADMIN_PASSWORD='a-long-password' npm run set-host-password      # from the environment
 *   npm run set-host-password                                        # asks twice, without echo
 *
 * Crews, the market and the running game are untouched. The server reads `meta.admin_password_hash`
 * at every sign-in, so the new password works at once, with no restart. Host sessions signed in with
 * the old password stop working immediately (the host session generation is bumped).
 *
 * If the deployed server has ADMIN_PASSWORD set, it applies that value at every start, so update the
 * deployment secret too or the next restart puts it back.
 *
 * The password is never printed. The database is DB_FILE (default ./data/game.db) — the same file the
 * server uses, so this is safe to run while the server is up (SQLite WAL handles the concurrent write).
 */

import { config } from '../config';
import { hiddenPrompt, resolveHostPassword } from './hostPasswordInput';

async function main(): Promise<void> {
  const password = await resolveHostPassword({
    env: config.adminPassword,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompt: hiddenPrompt,
  });
  // The database opens only once a password is in hand, so a typo in the prompt never touches it.
  const [{ setHostPassword }, { closeStore }] = await Promise.all([import('../services/hostPassword'), import('../store')]);
  const result = await setHostPassword(password);
  if (result === 'unchanged') {
    console.log(`The host password in ${config.dbFile} already matches. Nothing changed.`);
  } else {
    console.log(`Host password set in ${config.dbFile}. Sign in with the name "admin" and the new password.`);
    console.log('Crews, the market and the game were not changed.');
  }
  closeStore();
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Could not set the host password: ${message}`);
    process.exit(1);
  });
