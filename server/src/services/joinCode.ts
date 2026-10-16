/**
 * The game code (Kahoot-style join). Every market gets a short code the host reads out or projects;
 * a student types it with a crew name and is in — no passwords handed out beforehand.
 *
 * - The code lives in `meta.join_code`. A new market (createMarket) gets a fresh one, so a code from
 *   yesterday's class never opens today's game.
 * - The first device to join with a crew name creates that crew and is shown a 4-digit crew PIN.
 *   Teammates (or the same student on a new phone) join that crew with code + name + PIN. The PIN is
 *   the crew's ordinary password, so the host's "Reset password" on the Crews page still works as a
 *   way to recover a forgotten PIN, and crew-name + password sign-in keeps working too.
 * - Wrong PINs are throttled per crew so a classmate cannot guess their way into a rival crew.
 */

import { randomInt } from 'node:crypto';
import { store } from '../store';

export const JOIN_CODE_KEY = 'join_code';

/** No 0/O, 1/I/L: a code read off a projector should not be ambiguous. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** What a student typed, made comparable: uppercase, no spaces or dashes. */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The current code, creating one if this database has none yet (a market made before codes existed). */
export function currentJoinCode(): string {
  const stored = store.meta.get(JOIN_CODE_KEY);
  if (stored) return stored;
  const code = generateJoinCode();
  store.meta.set(JOIN_CODE_KEY, code);
  return code;
}

/** Replaces the code; every device that has not joined yet needs the new one. */
export function rotateJoinCode(): string {
  const code = generateJoinCode();
  store.meta.set(JOIN_CODE_KEY, code);
  return code;
}

export function joinCodeMatches(input: string): boolean {
  const typed = normalizeJoinCode(input);
  return typed.length > 0 && typed === currentJoinCode();
}

/** A fresh 4-digit crew PIN (1000–9999, so it never starts with a zero someone drops). */
export function generateCrewPin(): string {
  return String(randomInt(1000, 10000));
}

// ----- wrong-PIN throttle --------------------------------------------------------------------------

const PIN_WINDOW_MS = 5 * 60_000;
const PIN_MAX_MISSES = 6;
const misses = new Map<string, number[]>();

function recent(teamId: string, now: number): number[] {
  const list = (misses.get(teamId) ?? []).filter((t) => now - t < PIN_WINDOW_MS);
  if (list.length) misses.set(teamId, list);
  else misses.delete(teamId);
  return list;
}

/** True when this crew has had too many wrong PINs lately. */
export function pinLocked(teamId: string, now = Date.now()): boolean {
  return recent(teamId, now).length >= PIN_MAX_MISSES;
}

export function recordPinMiss(teamId: string, now = Date.now()): void {
  misses.set(teamId, [...recent(teamId, now), now]);
}

export function clearPinMisses(teamId: string): void {
  misses.delete(teamId);
}

/** Tests only. */
export function resetPinThrottle(): void {
  misses.clear();
}
