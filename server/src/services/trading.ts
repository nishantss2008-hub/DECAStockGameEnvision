/**
 * Trade execution — the only path by which team balances/holdings change.
 * Runs as a Firestore transaction (atomic, race-safe), validates funds/shares
 * server-side, applies a fee, records the fill + audit log, and feeds the order
 * into the engine's order-flow book so the trade nudges the price next tick.
 */

import type { OrderRequest, Trade } from '@deca/shared';
import { ORDER_FEE_BPS } from '@deca/shared';
import { db } from '../firebase';
import { shareValue, feeFor } from '../lib/money';
import { auditLog } from '../lib/logger';
import type { GameEngine } from '../engine/loop';

export class TradeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'TradeError';
  }
}

export interface FillResult {
  notional: number;
  fee: number;
  cashAfter: number;
  sharesAfter: number;
  avgCost: number;
}

/**
 * Pure trade-math (no IO) so it can be unit-tested. Throws TradeError on
 * insufficient funds/shares. All values are integer cents / whole shares.
 */
export function computeFill(
  side: OrderRequest['side'],
  quantity: number,
  price: number,
  cash: number,
  holdingShares: number,
  holdingAvgCost: number,
): FillResult {
  const notional = shareValue(quantity, price);
  const fee = feeFor(notional, ORDER_FEE_BPS);
  if (side === 'buy') {
    const cost = notional + fee;
    if (cash < cost) throw new TradeError('insufficient_funds', 'Not enough doubloons for that purchase');
    const sharesAfter = holdingShares + quantity;
    return {
      notional,
      fee,
      cashAfter: cash - cost,
      sharesAfter,
      avgCost: Math.round((holdingShares * holdingAvgCost + notional) / sharesAfter),
    };
  }
  if (holdingShares < quantity) throw new TradeError('insufficient_shares', 'Not enough shares to sell');
  const sharesAfter = holdingShares - quantity;
  return {
    notional,
    fee,
    cashAfter: cash + (notional - fee),
    sharesAfter,
    avgCost: sharesAfter > 0 ? holdingAvgCost : 0,
  };
}

export async function executeOrder(
  engine: GameEngine,
  teamId: string,
  order: OrderRequest,
): Promise<Trade> {
  if (engine.phase !== 'live') throw new TradeError('market_closed', 'The market is not open for trading');
  const price = engine.getPrice(order.companyId);
  if (!price || price <= 0) throw new TradeError('unknown_company', 'No such company');
  if (!Number.isInteger(order.quantity) || order.quantity <= 0) {
    throw new TradeError('bad_quantity', 'Quantity must be a positive whole number');
  }

  const teamRef = db.doc(`teams/${teamId}`);
  const holdingRef = db.doc(`teams/${teamId}/holdings/${order.companyId}`);

  const trade = await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists) throw new TradeError('no_team', 'Team not found');
    const team = teamSnap.data() as { cashBalance: number };
    const holdingSnap = await tx.get(holdingRef);
    const holding = holdingSnap.exists
      ? (holdingSnap.data() as { shares: number; avgCost: number })
      : { shares: 0, avgCost: 0 };

    const notional = shareValue(order.quantity, price);
    const fee = feeFor(notional, ORDER_FEE_BPS);
    let cashAfter: number;
    let sharesAfter: number;
    let avgCost = holding.avgCost;

    if (order.side === 'buy') {
      const cost = notional + fee;
      if (team.cashBalance < cost) throw new TradeError('insufficient_funds', 'Not enough doubloons for that purchase');
      cashAfter = team.cashBalance - cost;
      sharesAfter = holding.shares + order.quantity;
      avgCost = Math.round((holding.shares * holding.avgCost + notional) / sharesAfter);
    } else {
      if (holding.shares < order.quantity) throw new TradeError('insufficient_shares', 'Not enough shares to sell');
      const proceeds = notional - fee;
      cashAfter = team.cashBalance + proceeds;
      sharesAfter = holding.shares - order.quantity;
      avgCost = sharesAfter > 0 ? holding.avgCost : 0;
    }

    const tradeId = db.collection('trades').doc().id;
    const t: Trade = {
      id: tradeId,
      teamId,
      companyId: order.companyId,
      side: order.side,
      quantity: order.quantity,
      price,
      fee,
      executedAt: Date.now(),
      cashAfter,
      sharesAfter,
    };

    tx.update(teamRef, { cashBalance: cashAfter });
    if (sharesAfter > 0) {
      tx.set(holdingRef, { companyId: order.companyId, shares: sharesAfter, avgCost });
    } else {
      tx.delete(holdingRef);
    }
    tx.set(db.doc(`trades/${tradeId}`), t);
    return t;
  });

  engine.recordOrderFlow(order.companyId, order.side, order.quantity);
  await auditLog('order.fill', teamId, {
    companyId: order.companyId,
    side: order.side,
    quantity: order.quantity,
    price: trade.price,
    fee: trade.fee,
  });
  return trade;
}
