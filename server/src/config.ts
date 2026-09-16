/** Runtime configuration parsed from the environment. */

/** Where the SQLite database lives when DB_FILE is unset. */
const DEFAULT_DB_FILE = './data/game.db';

export const config = {
  /** HTTP port for the authority service. */
  port: Number(process.env.PORT ?? 8081),
  /** Allowed CORS origin for the web client (the hosting URL in production). */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /**
   * SQLite database file. The server owns all of its data here (WAL mode); the
   * directory is created on open. ':memory:' is allowed and used by tests.
   */
  dbFile: process.env.DB_FILE ?? DEFAULT_DB_FILE,
  /**
   * Built web app to serve as static files. Empty means "use the default
   * `web/dist` next to the server workspace, if it exists".
   */
  webDir: process.env.WEB_DIR ?? '',
  /**
   * Deterministic game seed — same seed reproduces the entire hidden market.
   * SECURITY: there is intentionally NO hardcoded fallback. The seed script
   * generates a high-entropy random seed when GAME_SEED is unset and persists it
   * to the server-only `meta.seed` row (never exposed to clients); the engine
   * reads the seed from there. Anyone who knew the seed could reproduce every
   * future tick + news event, so it must never be guessable or committed.
   */
  seed: process.env.GAME_SEED ?? '',
  /**
   * HS256 signing key for session tokens. SECURITY: no fallback — when unset the
   * server generates a high-entropy secret on first use and stores it in
   * `meta.session_secret`, so restarts keep existing sessions valid. Setting it
   * lets several processes (or a redeploy on fresh storage) share sessions.
   */
  sessionSecret: process.env.SESSION_SECRET ?? '',
  /**
   * Host password. When set, the server applies it to the host login at every start (logging only
   * "host password set from ADMIN_PASSWORD"), and `npm run seed` / `npm run set-host-password` use it.
   * When unset, the first seed generates one.
   */
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
} as const;
