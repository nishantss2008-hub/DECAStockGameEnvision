/**
 * The host (admin) password outside of market creation.
 *
 * `npm run seed` and New game keep the stored host login, so a lost password used to need a new
 * market. Now:
 *   - on boot, a set ADMIN_PASSWORD is applied to `_auth/_admin` (server/src/index.ts);
 *   - `npm run set-host-password` applies one from ADMIN_PASSWORD or a hidden prompt.
 *
 * Only the scrypt hash is stored and the value is never logged. When the password actually changes,
 * the host's existing sessions are revoked (signed out within an hour).
 */

import { revokeSessions } from '../auth/sessions';
import { db } from '../firebase';
import { HostPasswordError, checkHostPassword } from '../lib/hostPasswordRules';
import { hashPassword, verifyPassword } from '../lib/password';

/** The only thing the server logs about ADMIN_PASSWORD. */
export const HOST_PASSWORD_LOG = 'host password set from ADMIN_PASSWORD';

/** Upserts the hashed host login. 'unchanged' (and no write) when the stored hash already matches. */
export async function setHostPassword(password: string): Promise<'set' | 'unchanged'> {
  checkHostPassword(password);
  const ref = db.doc('_auth/_admin');
  const stored = (await ref.get()).data() as { passwordHash?: unknown } | undefined;
  if (typeof stored?.passwordHash === 'string' && verifyPassword(password, stored.passwordHash)) return 'unchanged';
  await ref.set({ passwordHash: hashPassword(password), role: 'admin' }, { merge: true });
  await revokeSessions('admin');
  return 'set';
}

/**
 * Server boot: applies ADMIN_PASSWORD when it is set. Logs HOST_PASSWORD_LOG and nothing else about it.
 * A password out of bounds is skipped with a warning (the server still starts); a Firestore failure throws.
 */
export async function applyAdminPasswordFromEnv(
  password: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<boolean> {
  if (!password) return false;
  try {
    await setHostPassword(password);
  } catch (err) {
    if (err instanceof HostPasswordError) {
      log.warn(`ADMIN_PASSWORD was not applied: ${err.message} The stored host password is unchanged.`);
      return false;
    }
    throw err;
  }
  log.info(HOST_PASSWORD_LOG);
  return true;
}
