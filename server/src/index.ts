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
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
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
export const API_PREFIXES = ['/api', '/auth', '/orders', '/health'];

/**
 * `/admin/*` belongs to the host console's client-side routes (`/admin`, `/admin/crews`,
 * `/admin/market`, …). The host API used to live there and now answers under `/api/admin/*`.
 */
export function isLegacyAdminPath(url: string): boolean {
  const path = pathOf(url);
  return path === '/admin' || path.startsWith('/admin/');
}

/** The path part of a request URL, without the query string. */
export function pathOf(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/** A browser navigation (a typed URL, a reload, a PWA launch) rather than a fetch/XHR call. */
export function wantsHtml(req: { method: string; headers: { accept?: string } }): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return typeof req.headers.accept === 'string' && req.headers.accept.includes('text/html');
}

/**
 * What counts against the per-minute budget: the API surface only.
 *
 * A phone loading the app pulls a hundred-odd static files (and the PWA precaches more), and the
 * SSE stream is ONE long-lived connection, not a request rate — counting either would 429 a
 * classroom before it had traded anything.
 */
export function countsAgainstLimit(url: string): boolean {
  const path = pathOf(url);
  if (path === '/health' || path === '/api/stream') return false;
  if (isLegacyAdminPath(path)) return true;
  return API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * The limiter's bucket: the session token when the request carries one (header, or `?token=` for
 * EventSource), else the IP. A school hands every phone the same public IP, so keying on the IP
 * alone would make twenty crews share one crew's worth of budget.
 */
export function limiterKey(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return `t:${token}`;
  }
  const query = (req.query as { token?: unknown } | undefined)?.token;
  if (typeof query === 'string' && query) return `t:${query}`;
  return `ip:${req.ip}`;
}

/** COPY §9 ticket-errors tone: what went wrong, and what to do about it. */
export const RATE_LIMITED = {
  error: 'rate_limited',
  message: 'Too many requests from this device. Wait a few seconds, then try again.',
} as const;

/**
 * The old host API paths. HTML navigations to them are the host console (serve the app shell);
 * anything else is a client still calling the pre-`/api` API, and is redirected there with its
 * method and body intact. Temporary — drop once no deployed client uses the old paths.
 */
export async function legacyAdminRoutes(app: FastifyInstance): Promise<void> {
  const handler = (req: FastifyRequest, reply: FastifyReply): unknown => {
    if (wantsHtml(req)) {
      const sendFile = (reply as FastifyReply & { sendFile?: (f: string) => FastifyReply }).sendFile;
      if (typeof sendFile !== 'function') {
        return reply.code(404).send({ error: 'not_found', message: 'Not found' });
      }
      reply.header('Cache-Control', 'no-cache');
      return sendFile.call(reply, 'index.html');
    }
    return reply.code(308).redirect(`/api${req.url}`);
  };
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
  app.route({ method: [...method], url: '/admin', handler });
  app.route({ method: [...method], url: '/admin/*', handler });
}

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
    const path = pathOf(req.url);
    const isApi = API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
    // A fetch for an unknown `/admin/*` path is a stale API call, not a screen: 404 it as API.
    // (The real server never gets here — legacyAdminRoutes answers those — but registerWeb is
    // also mounted on its own in tests and deployments that only serve the app.)
    if (isApi || (isLegacyAdminPath(path) && !wantsHtml(req)) || (req.method !== 'GET' && req.method !== 'HEAD')) {
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
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    // Per session, not per IP: a school NAT puts every crew behind one address.
    keyGenerator: limiterKey,
    // Static files, /health and the one long-lived SSE connection are not an API request rate.
    allowList: (req) => !countsAgainstLimit(req.url),
    errorResponseBuilder: () => ({ statusCode: 429, ...RATE_LIMITED }),
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
  // After the static plugin, so an HTML navigation to /admin/* can be answered with the app shell.
  await legacyAdminRoutes(app);
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
