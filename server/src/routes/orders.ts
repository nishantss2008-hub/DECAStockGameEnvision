/**
 * POST /orders (spec §6, §8): a crew places a market order.
 *
 * 200 `{ trade }` on a fill (or on a retry of an already-filled clientOrderId).
 * 400 `{ error: code, message }` for a TradeError, 409 for `price_moved`.
 */

import type { FastifyInstance } from 'fastify';
import { orderRequestSchema } from '@deca/shared';
import { requireTeam } from '../auth/middleware';
import { executeOrder, TradeError, tradeError, UNKNOWN_ORDER_ERROR_MESSAGE } from '../services/trading';
import { engine } from '../engine/loop';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/orders', { preHandler: requireTeam }, async (req, reply) => {
    const parsed = orderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      // Crews read these, so the text is COPY §9: a bad share count or company gets its own
      // ticket error; anything else (malformed clientOrderId, side, quote) the generic one.
      const fields = new Set(parsed.error.issues.map((i) => i.path[0]));
      const e = fields.has('quantity')
        ? tradeError('bad_quantity')
        : fields.has('companyId')
          ? tradeError('unknown_company')
          : null;
      if (e) return reply.code(400).send({ error: e.code, message: e.message });
      return reply.code(400).send({ error: 'bad_request', message: UNKNOWN_ORDER_ERROR_MESSAGE });
    }
    try {
      const trade = await executeOrder(engine, req.user!.teamId!, parsed.data);
      return { trade };
    } catch (err) {
      if (err instanceof TradeError) {
        return reply.code(err.code === 'price_moved' ? 409 : 400).send({ error: err.code, message: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: 'internal', message: UNKNOWN_ORDER_ERROR_MESSAGE });
    }
  });
}
