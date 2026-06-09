/** Runtime configuration parsed from the environment. */

export const config = {
  /** HTTP port for the authority service. */
  port: Number(process.env.PORT ?? 8081),
  /** Allowed CORS origin for the web client (the hosting URL in production). */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /** Deterministic game seed — same seed reproduces the entire hidden market. */
  seed: process.env.GAME_SEED ?? 'blackbeard-2026',
  /** Password for the seeded admin/host account (admin@deca-pirates.game). */
  adminPassword: process.env.ADMIN_PASSWORD ?? 'captain',
} as const;
