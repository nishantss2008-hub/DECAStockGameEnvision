import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@deca/shared';
import { engine } from '../engine/loop';
import { connectionCount } from '../realtime/hub';

/** GET /health: phase, tick, heartbeat, how many ticks the engine is behind, and open streams. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse & { connections: number }> => ({
    ...engine.health(),
    connections: connectionCount(),
  }));
}
