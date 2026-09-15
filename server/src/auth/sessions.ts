/**
 * Signing a user out everywhere. Revoking refresh tokens stops every device from renewing its
 * Firebase session, so each one ends when its current ID token expires (within an hour).
 *
 * Crews and the host sign in with custom tokens, so an Auth user exists only after a first
 * sign-in. A user that never signed in has no sessions to revoke, which is not an error.
 */

import { adminAuth } from '../firebase';

/** Revokes the uid's refresh tokens. Resolves false when the user never signed in; other Auth errors throw. */
export async function revokeSessions(uid: string): Promise<boolean> {
  try {
    await adminAuth.revokeRefreshTokens(uid);
    return true;
  } catch (err) {
    if ((err as { code?: unknown })?.code === 'auth/user-not-found') return false;
    throw err;
  }
}
