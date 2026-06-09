import type { FastifyInstance } from 'fastify';
import { engine } from '../engine/loop';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
    phase: engine.phase,
    tick: engine.currentTick,
    serverTime: Date.now(),
  }));
}
