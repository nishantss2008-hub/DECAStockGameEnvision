/**
 * Authority-service bootstrap — now the whole deployment: it owns the data (SQLite), runs the tick
 * loop, pushes live updates over SSE and serves the built web app. One process, one URL, no
 * external services (docs/HOSTING-FREE.md).
 *
 * Run as ONE instance: the trading halt, the per-crew order queue, the pending order flow and the
 * stream connections all live in this process (docs/RUNBOOK.md, docs/DEPLOY.md).
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { engine } from './engine/loop';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { orderRoutes } from './routes/orders';
import { adminRoutes } from './routes/admin';
import { apiRoutes } from './routes/api';
import { closeAll } from './realtime/hub';
import { closeStore } from './store';
import { applyAdminPasswordFromEnv } from './services/hostPassword';

/** Paths the SPA fallback must never swallow: they are API surface, and a 404 there is a 404. */
const API_PREFIXES = ['/api', '/auth', '/admin', '/orders', '/health'];

/** `web/dist` next to the server workspace, unless WEB_DIR names another build. */
export function webRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = config.webDir ? resolve(config.webDir) : resolve(here, '../../web/dist');
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

/**
 * Serves the built app: hashed assets are immutable for a year, while `index.html` and the service
 * worker must never be cached (a stale `sw.js` pins an old app on a phone for good). Anything that
 * is not a file and not API surface falls back to `index.html`, so client-side routes deep-link.
 */
export async function registerWeb(app: FastifyInstance, root: string): Promise<void> {
  await app.register(fastifyStatic, {
    root,
    index: ['index.html'],
    wildcard: false,
    setHeaders(res, path) {
      const noCache = path.endsWith('index.html') || path.endsWith('sw.js') || path.endsWith('manifest.webmanifest');
      res.setHeader('Cache-Control', noCache ? 'no-cache' : 'public, max-age=31536000, immutable');
    },
  });

  app.setNotFoundHandler((req, reply) => {
    const isApi = API_PREFIXES.some((p) => req.url === p || req.url.startsWith(`${p}/`) || req.url.startsWith(`${p}?`));
    if (isApi || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return reply.code(404).send({ error: 'not_found', message: 'Not found' });
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });
}

export async function buildServer(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true });

  // Tolerate empty JSON bodies so bodyless POSTs (game start/pause/resume/end)
  // don't trip Fastify's "Body cannot be empty" error.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    // Key by the auth token when present so crews behind one NAT aren't lumped together.
    keyGenerator: (req) => (req.headers.authorization as string) ?? req.ip,
    // The stream is one long-lived connection per phone, not a request rate.
    allowList: (req) => req.url.startsWith('/api/stream'),
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(orderRoutes);
  await app.register(adminRoutes);
  await app.register(apiRoutes);

  const root = webRoot();
  if (root) {
    await registerWeb(app, root);
    app.log.info(`serving the web app from ${root}`);
  } else {
    app.log.info('no web build found — API only (set WEB_DIR or run npm run build:web)');
  }
  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();

  // Logs only "host password set from ADMIN_PASSWORD", never the value.
  await applyAdminPasswordFromEnv(config.adminPassword, { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) });

  await engine.load();
  engine.start();

  const shutdown = (signal: string): void => {
    app.log.info(`${signal}: shutting down`);
    closeAll();
    void engine
      .stop()
      .then(() => app.close())
      .finally(() => {
        closeStore();
        process.exit(0);
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(
    `⚓ Authority service listening on :${config.port} (phase=${engine.state.phase}, tick=${engine.state.currentTick}, db=${config.dbFile})`,
  );
}

/** True when this file is the process entry point (`tsx src/index.ts`), false when a test imports it. */
const isEntryPoint = Boolean(process.argv[1]) && resolve(process.argv[1] as string) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((err) => {
    console.error('Fatal:', err);
    closeAll();
    try {
      closeStore();
    } catch {
      /* nothing open */
    }
    process.exit(1);
  });
}
