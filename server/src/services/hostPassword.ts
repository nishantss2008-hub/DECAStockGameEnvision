/**
 * The host (admin) password outside of market creation.
 *
 * `npm run seed` and New game keep the stored host login, so a lost password used to need a new
 * market. Now:
 *   - on boot, a set ADMIN_PASSWORD is applied to `meta.admin_password_hash` (server/src/index.ts);
 *   - `npm run set-host-password` applies one from ADMIN_PASSWORD or a hidden prompt.
 *
 * Only the scrypt hash is stored and the value is never logged. When the password actually changes,
 * `meta.admin_token_version` is bumped, which invalidates every host session token immediately.
 */

import { HostPasswordError, checkHostPassword } from '../lib/hostPasswordRules';
import { hashPassword, verifyPassword } from '../lib/password';
import { store } from '../store';
import { ADMIN_PASSWORD_KEY } from './market';

/** The only thing the server logs about ADMIN_PASSWORD. */
export const HOST_PASSWORD_LOG = 'host password set from ADMIN_PASSWORD';

/** `meta` key holding the host session generation; a token below it no longer verifies. */
export const ADMIN_TOKEN_VERSION_KEY = 'admin_token_version';

/** Current host session generation (1 when never bumped). */
export function adminTokenVersion(): number {
  const n = Number(store.meta.get(ADMIN_TOKEN_VERSION_KEY));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Signs every host session out at once. Returns the new generation. */
export function bumpAdminTokenVersion(): number {
  return store.tx(() => {
    const next = adminTokenVersion() + 1;
    store.meta.set(ADMIN_TOKEN_VERSION_KEY, String(next));
    return next;
  });
}

/** The stored host password hash, or null when no host login exists yet. */
export function hostPasswordHash(): string | null {
  return store.meta.get(ADMIN_PASSWORD_KEY);
}

/** Upserts the hashed host login. 'unchanged' (and no write) when the stored hash already matches. */
export async function setHostPassword(password: string): Promise<'set' | 'unchanged'> {
  checkHostPassword(password);
  const stored = hostPasswordHash();
  if (stored && verifyPassword(password, stored)) return 'unchanged';
  store.tx(() => {
    store.meta.set(ADMIN_PASSWORD_KEY, hashPassword(password));
    store.meta.set(ADMIN_TOKEN_VERSION_KEY, String(adminTokenVersion() + 1));
  });
  return 'set';
}

/**
 * Server boot: applies ADMIN_PASSWORD when it is set. Logs HOST_PASSWORD_LOG and nothing else about it.
 * A password out of bounds is skipped with a warning (the server still starts); a store failure throws.
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
