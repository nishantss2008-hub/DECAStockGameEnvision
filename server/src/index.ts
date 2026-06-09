/**
 * Authority-service bootstrap. Registers CORS + rate limiting + routes, loads the
 * hidden market into the engine, starts the tick loop, and listens.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { engine } from './engine/loop';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { orderRoutes } from './routes/orders';
import { adminRoutes } from './routes/admin';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    // Key by the auth token when present so teams behind one NAT aren't lumped together.
    keyGenerator: (req) => (req.headers.authorization as string) ?? req.ip,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(orderRoutes);
  await app.register(adminRoutes);

  await engine.load();
  engine.start();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`⚓ Authority service listening on :${config.port} (phase=${engine.phase}, tick=${engine.currentTick})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
