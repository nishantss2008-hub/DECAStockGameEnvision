/**
 * TradeTicket — buy/sell order form for a single company.
 *
 * Shows the estimated cost (qty × price + fee) and the crew's current cash,
 * submits via `apiPost('/orders', { companyId, side, quantity })`, and surfaces
 * success / error feedback. Trading is disabled unless `phase === 'live'`.
 *
 * Money is integer cents end to end; the fee mirrors the server's basis-point
 * model (ORDER_FEE_BPS). Cash + current holding come from usePortfolio.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Company, OrderResult, OrderSide } from '@deca/shared';
import { ORDER_FEE_BPS } from '@deca/shared';
import { usePortfolio } from '../hooks/usePortfolio';
import { apiPost, ApiRequestError } from '../lib/api';
import { classNames, formatMoney, formatNumber } from '../lib/format';

const STYLE_ID = 'trade-ticket-styles';
const CSS = `
.trade-ticket { display: flex; flex-direction: column; gap: var(--sp-4); }
.trade-ticket__sides { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); }
.trade-ticket__summary { display: flex; flex-direction: column; gap: var(--sp-2); margin: 0; }
.trade-ticket__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0;
}
.trade-ticket__row dt { color: var(--ink-700); font-size: var(--fs-sm); }
.trade-ticket__row dd { margin: 0; color: var(--ink-900); font-weight: 600; }
.trade-ticket__row--total dt { font-family: var(--font-heading); text-transform: uppercase; letter-spacing: 0.08em; }
.trade-ticket__row--total dd { font-size: var(--fs-md); color: var(--ink-900); }
.trade-ticket .divider { margin: var(--sp-2) 0; }
`;

function useInjectedStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

export interface TradeTicketProps {
  company: Company;
  /** Current game phase; trading is only allowed when 'live'. */
  phase: string | undefined;
  className?: string;
  /** Optional callback fired after a successful fill. */
  onFilled?: (result: OrderResult) => void;
}

/** Round-half-up basis-point fee on a notional, in integer cents. */
function estimateFee(notionalCents: number): number {
  return Math.round((notionalCents * ORDER_FEE_BPS) / 10_000);
}

export default function TradeTicket({
  company,
  phase,
  className,
  onFilled,
}: TradeTicketProps) {
  useInjectedStyles();
  const { team, holdings } = usePortfolio();
  const [side, setSide] = useState<OrderSide>('buy');
  const [quantityInput, setQuantityInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isLive = phase === 'live';
  const cash = team?.cashBalance ?? 0;
  const holding = holdings.find((h) => h.companyId === company.id);
  const sharesOwned = holding?.shares ?? 0;

  const quantity = useMemo(() => {
    const n = Number.parseInt(quantityInput, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [quantityInput]);

  const notional = quantity * company.currentPrice;
  const fee = estimateFee(notional);
  const buyTotal = notional + fee; // cash needed to buy
  const sellProceeds = notional - fee; // cash received on sell

  const insufficientCash = side === 'buy' && buyTotal > cash;
  const insufficientShares = side === 'sell' && quantity > sharesOwned;

  const blockedReason = !isLive
    ? 'The market is closed.'
    : quantity <= 0
    ? null
    : insufficientCash
    ? 'Not enough doubloons in the chest.'
    : insufficientShares
    ? 'You cannot sell shares you do not hold.'
    : null;

  const canSubmit =
    isLive &&
    !submitting &&
    quantity > 0 &&
    !insufficientCash &&
    !insufficientShares;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await apiPost<OrderResult>('/orders', {
        companyId: company.id,
        side,
        quantity,
      });
      const { trade } = result;
      const verb = trade.side === 'buy' ? 'Bought' : 'Sold';
      setSuccess(
        `${verb} ${formatNumber(trade.quantity)} ${company.ticker} @ ${formatMoney(
          trade.price,
        )} (fee ${formatMoney(trade.fee)}).`,
      );
      setQuantityInput('');
      onFilled?.(result);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Order failed. Try again, matey.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={classNames('trade-ticket panel', className)}
      onSubmit={handleSubmit}
    >
      <div className="panel-title">
        <span aria-hidden="true">⚖️</span>
        Place an Order
      </div>

      {/* Side toggle */}
      <div className="trade-ticket__sides" role="group" aria-label="Order side">
        <button
          type="button"
          className={classNames(
            'btn',
            side === 'buy' ? 'btn--buy' : 'btn--ghost',
          )}
          aria-pressed={side === 'buy'}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          type="button"
          className={classNames(
            'btn',
            side === 'sell' ? 'btn--sell' : 'btn--ghost',
          )}
          aria-pressed={side === 'sell'}
          onClick={() => setSide('sell')}
        >
          Sell
        </button>
      </div>

      <div className="field">
        <label className="label" htmlFor="trade-qty">
          Quantity (shares)
        </label>
        <input
          id="trade-qty"
          className="input mono"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="0"
          value={quantityInput}
          onChange={(e) => setQuantityInput(e.target.value)}
          disabled={!isLive || submitting}
        />
      </div>

      {/* Estimate summary */}
      <dl className="trade-ticket__summary">
        <div className="trade-ticket__row">
          <dt>Last price</dt>
          <dd className="mono">{formatMoney(company.currentPrice)}</dd>
        </div>
        <div className="trade-ticket__row">
          <dt>Est. {side === 'buy' ? 'cost' : 'proceeds'}</dt>
          <dd className="mono">{formatMoney(notional)}</dd>
        </div>
        <div className="trade-ticket__row">
          <dt>Fee ({(ORDER_FEE_BPS / 100).toFixed(2)}%)</dt>
          <dd className="mono">{formatMoney(fee)}</dd>
        </div>
        <hr className="divider" />
        <div className="trade-ticket__row trade-ticket__row--total">
          <dt>{side === 'buy' ? 'Total due' : 'Net proceeds'}</dt>
          <dd className="mono">
            {formatMoney(side === 'buy' ? buyTotal : sellProceeds)}
          </dd>
        </div>
        <div className="trade-ticket__row muted">
          <dt>Cash on hand</dt>
          <dd className="mono">{formatMoney(cash)}</dd>
        </div>
        <div className="trade-ticket__row muted">
          <dt>Shares held</dt>
          <dd className="mono">{formatNumber(sharesOwned)}</dd>
        </div>
      </dl>

      <button
        type="submit"
        className={classNames(
          'btn btn--block btn--lg',
          side === 'buy' ? 'btn--buy' : 'btn--sell',
        )}
        disabled={!canSubmit}
      >
        {submitting
          ? 'Hauling…'
          : side === 'buy'
          ? `Buy ${company.ticker}`
          : `Sell ${company.ticker}`}
      </button>

      {blockedReason && !error && (
        <p className="alert alert--info" role="status">
          {blockedReason}
        </p>
      )}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="alert alert--success" role="status">
          {success}
        </p>
      )}
    </form>
  );
}
