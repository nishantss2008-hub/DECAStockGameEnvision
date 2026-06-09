import type { FastifyInstance } from 'fastify';
import { orderRequestSchema } from '@deca/shared';
import { requireTeam } from '../auth/middleware';
import { executeOrder, TradeError } from '../services/trading';
import { engine } from '../engine/loop';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/orders', { preHandler: requireTeam }, async (req, reply) => {
    const parsed = orderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid order' });
    }
    try {
      const trade = await executeOrder(engine, req.user!.teamId!, parsed.data);
      return { trade };
    } catch (err) {
      if (err instanceof TradeError) {
        return reply.code(400).send({ error: err.code, message: err.message });
      }
      app.log.error(err);
      return reply.code(500).send({ error: 'internal', message: 'Order failed' });
    }
  });
}
