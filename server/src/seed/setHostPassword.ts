/**
 * Set-host-password CLI: sets the host (admin) password without creating a new market.
 *
 *   ADMIN_PASSWORD='a-long-password' npm run set-host-password      # from the environment
 *   npm run set-host-password                                        # asks twice, without echo
 *
 * Crews, the market and the running game are untouched. The server reads `_auth/_admin` at every
 * sign-in, so the new password works at once, with no restart. Host sessions signed in with the old
 * password are signed out within an hour.
 *
 * If the deployed server has ADMIN_PASSWORD set (a Cloud Run secret), it applies that value at every
 * start, so update the secret too or the next restart puts it back.
 *
 * The password is never printed. Like `npm run seed`, this uses server/service-account.json, or the
 * emulators when FIRESTORE_EMULATOR_HOST is set.
 */

import { config } from '../config';
import { hiddenPrompt, resolveHostPassword } from './hostPasswordInput';

async function main(): Promise<void> {
  const password = await resolveHostPassword({
    env: config.adminPassword,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompt: hiddenPrompt,
  });
  // Firebase loads only once a password is in hand, so a typo in the prompt never touches the database.
  const [{ emulatorMode }, { setHostPassword }] = await Promise.all([import('../firebase'), import('../services/hostPassword')]);
  const target = emulatorMode ? `the local emulators (${process.env.FIRESTORE_EMULATOR_HOST})` : `project ${process.env.GCLOUD_PROJECT || 'decastockenvision'}`;
  const result = await setHostPassword(password);
  if (result === 'unchanged') {
    console.log(`The host password in ${target} already matches. Nothing changed.`);
  } else {
    console.log(`Host password set in ${target}. Sign in with the name "admin" and the new password.`);
    console.log('Crews, the market and the game were not changed.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Could not set the host password: ${message}`);
    process.exit(1);
  });
