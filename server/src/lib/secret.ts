/** High-entropy token helpers for seeds / generated passwords. */

import { randomBytes } from 'node:crypto';

/** A URL-safe random token (~1.3 chars per byte). */
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}
