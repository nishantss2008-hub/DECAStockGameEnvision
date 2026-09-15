import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@deca/shared';
import { engine } from '../engine/loop';

/** GET /health: phase, tick, heartbeat and how many ticks the engine is behind the clock. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse> => engine.health());
}
