/** Runtime configuration parsed from the environment. */

export const config = {
  /** HTTP port for the authority service. */
  port: Number(process.env.PORT ?? 8081),
  /** Allowed CORS origin for the web client (the hosting URL in production). */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /**
   * Deterministic game seed — same seed reproduces the entire hidden market.
   * SECURITY: there is intentionally NO hardcoded fallback. The seed script
   * generates a high-entropy random seed when GAME_SEED is unset and persists it
   * to the server-only `_schedule/_meta` doc (never exposed to clients); the
   * engine reads the seed from there. Anyone who knew the seed could reproduce
   * every future tick + news event, so it must never be guessable or committed.
   */
  seed: process.env.GAME_SEED ?? '',
  /** Optional override for the admin/host password (else a random one is generated at seed time). */
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
} as const;
