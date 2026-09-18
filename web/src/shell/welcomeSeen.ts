/**
 * Has this crew answered the Welcome sheet? (MOBILE §7.2)
 *
 * All that survives of `shell/walkthrough.ts`, deleted 2026-09-18 with the 3-step card it drove. The
 * shell still has to know one thing the card never owned: whether this crew has been welcomed on this
 * device, so the sheet opens exactly once (AppShell) and the Add to Home Screen tip waits its turn.
 *
 * Per crew, per device, in localStorage — a convenience flag, never a gate. The thing a crew is
 * actually required to finish is "Meet the market", and that is server truth on `Team.introCompletedAt`
 * (`components/learn/introFlow.ts`), not anything stored here.
 *
 * MIGRATION. Phones in the wild still hold the walkthrough's `bx.walkthrough.{teamId}`. Its statuses
 * were 'new' (Welcome never answered), 'active' (walkthrough running) and 'hidden' (skipped or done),
 * and an even older build wrote the bare string "dismissed" — so anything readable that is not an
 * explicit 'new' means the crew already answered the sheet. We honour that, write the new key, and
 * drop the old one: a returning student is not welcomed twice, and the stale key does not linger.
 */

/** Where the answer lives now. */
export const welcomeKey = (teamId: string) => `bx.welcome.${teamId}`;

/** The walkthrough's old key: read once, migrated, then removed. */
export const legacyWalkthroughKey = (teamId: string) => `bx.walkthrough.${teamId}`;

/** The only value the new key ever holds. */
const SEEN = '1';

/**
 * Did the walkthrough's old value mean "the Welcome sheet was already answered"?
 *
 * Deliberately generous. An unreadable or unknown value from a build we no longer ship says nothing
 * about the crew, and the cost of the two answers is not symmetric: welcoming a returning crew again
 * is noise on the screen it least wants it, while treating a truly new crew as welcomed costs it
 * nothing — the sheet is not the gate, "Meet the market" is, and AppShell still routes a crew that
 * has not finished the intro into it. So only an explicit 'new' counts as unanswered.
 */
export function legacySeen(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') return (value as { status?: unknown }).status !== 'new';
  } catch {
    // An unreadable leftover is still a leftover: this crew has been here before.
  }
  return true;
}

/** Pure read, safe during render: the new key, else what the walkthrough's key implies. */
export function readWelcomeSeen(store: Storage, teamId: string): boolean {
  try {
    if (store.getItem(welcomeKey(teamId)) === SEEN) return true;
    return legacySeen(store.getItem(legacyWalkthroughKey(teamId)));
  } catch {
    // Storage blocked (private mode, blocked site data): welcome this crew for this visit only.
    return false;
  }
}

/** Any dismissal of the sheet counts, so it never opens by itself again. */
export function markWelcomeSeen(store: Storage, teamId: string): void {
  try {
    store.setItem(welcomeKey(teamId), SEEN);
    store.removeItem(legacyWalkthroughKey(teamId));
  } catch {
    // Storage blocked: the sheet still closes, it just reopens on the next sign-in.
  }
}

/**
 * Carry a returning crew's answer onto the new key and drop the old one. Called from an effect, not
 * from a render: reading is pure, writing is not.
 */
export function migrateWelcomeSeen(store: Storage, teamId: string): void {
  try {
    const legacy = store.getItem(legacyWalkthroughKey(teamId));
    if (legacy === null) return;
    if (legacySeen(legacy)) store.setItem(welcomeKey(teamId), SEEN);
    store.removeItem(legacyWalkthroughKey(teamId));
  } catch {
    // Storage blocked: nothing to migrate and nothing to clean up.
  }
}
