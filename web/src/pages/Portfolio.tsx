/**
 * Portfolio — the crew's hold.
 *
 * Top: headline stat tiles (cash, holdings value, total fleet value, rank, and
 * total unrealized P&L vs. starting capital). Middle: the live PortfolioTable
 * of positions. Bottom: a trade-history blotter from useTrades.
 *
 * Money is integer cents throughout; we compute notionals here as integers and
 * format only at the edge. Reads: usePortfolio, useCompanies, useTrades, useGame.
 */

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import { useCompanies } from '../hooks/useCompanies';
import { useTrades } from '../hooks/useTrades';
import { useGame } from '../hooks/useGame';
import PortfolioTable from '../components/PortfolioTable';
import {
  classNames,
  formatMoney,
  formatNumber,
  formatPct,
  formatPrice,
} from '../lib/format';
import type { Company } from '@deca/shared';
import { STARTING_CAPITAL } from '@deca/shared';

const STYLE_ID = 'portfolio-page-styles';
const CSS = `
.portfolio__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--sp-4);
  margin-bottom: var(--sp-6);
}
.portfolio__stat-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.portfolio__stat-card .stat-value.gain { color: var(--gold-200); }
.portfolio__stat-delta { font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 600; }
.portfolio__section-title { margin: var(--sp-6) 0 var(--sp-3); }
.portfolio__trade-side {
  font-family: var(--font-heading);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: var(--fs-xs);
}
.portfolio__trade-link { display: inline-flex; align-items: center; gap: 0.4em; }
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

function dirClass(n: number): string {
  return n > 0 ? 'gain' : n < 0 ? 'loss' : 'flat';
}

function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Portfolio() {
  useInjectedStyles();
  const { team, holdings, loading } = usePortfolio();
  const { companies } = useCompanies();
  const { trades } = useTrades();
  const { game } = useGame();

  const startingCapital = game?.startingCapital ?? STARTING_CAPITAL;

  const byId = useMemo(() => {
    const map: Record<string, Company> = {};
    companies.forEach((c) => (map[c.id] = c));
    return map;
  }, [companies]);

  // Live mark-to-market value of holdings (integer cents).
  const holdingsValue = useMemo(() => {
    let total = 0;
    for (const h of holdings) {
      const c = byId[h.companyId];
      if (!c || h.shares <= 0) continue;
      total += h.shares * c.currentPrice;
    }
    return total;
  }, [holdings, byId]);

  const cash = team?.cashBalance ?? 0;
  // Prefer the engine-computed totalValue; fall back to our local sum.
  const totalValue = team?.totalValue ?? cash + holdingsValue;
  const overallPnl = totalValue - startingCapital;
  const overallPnlPct = startingCapital > 0 ? overallPnl / startingCapital : 0;

  if (loading && !team) {
    return (
      <div className="page">
        <div className="loading-block" style={{ minHeight: '40vh' }}>
          <div className="spinner" aria-hidden="true" />
          <span>Counting the doubloons…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">The Hold</p>
          <h1>{team?.name ? `${team.name} · Portfolio` : 'Portfolio'}</h1>
        </div>
        {team?.rank ? (
          <span className="badge badge--gold">Fleet Rank #{team.rank}</span>
        ) : null}
      </header>

      {/* Headline stats */}
      <div className="portfolio__stats">
        <div className="panel portfolio__stat-card">
          <span className="stat-label">Cash on Hand</span>
          <span className="stat-value">{formatMoney(cash)}</span>
        </div>
        <div className="panel portfolio__stat-card">
          <span className="stat-label">Holdings Value</span>
          <span className="stat-value">{formatMoney(holdingsValue)}</span>
        </div>
        <div className="panel portfolio__stat-card">
          <span className="stat-label">Total Fleet Value</span>
          <span className="stat-value gain">{formatMoney(totalValue)}</span>
          <span className={classNames('portfolio__stat-delta', dirClass(overallPnl))}>
            {formatMoney(overallPnl)} ({formatPct(overallPnlPct)})
          </span>
        </div>
        <div className="panel portfolio__stat-card">
          <span className="stat-label">vs. Starting Chest</span>
          <span className={classNames('stat-value', dirClass(overallPnl))}>
            {formatPct(overallPnlPct)}
          </span>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
            from {formatMoney(startingCapital)}
          </span>
        </div>
      </div>

      {/* Positions */}
      <h2 className="portfolio__section-title">Positions</h2>
      <PortfolioTable holdings={holdings} companies={companies} />

      {/* Trade history */}
      <h2 className="portfolio__section-title">Trade Log</h2>
      {trades.length === 0 ? (
        <div className="panel">
          <p className="muted text-center">
            No trades logged yet. Make your first move from the Terminal.
          </p>
        </div>
      ) : (
        <div className="panel panel--flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Side</th>
                  <th>House</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Fee</th>
                  <th className="num">Cash After</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const c = byId[t.companyId];
                  const isBuy = t.side === 'buy';
                  return (
                    <tr key={t.id}>
                      <td className="mono">{formatWhen(t.executedAt)}</td>
                      <td>
                        <span
                          className={classNames(
                            'portfolio__trade-side',
                            isBuy ? 'gain' : 'loss',
                          )}
                        >
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/research/${t.companyId}`}
                          className="portfolio__trade-link"
                        >
                          {c?.emoji && <span aria-hidden="true">{c.emoji}</span>}
                          <span className="mono">{c?.ticker ?? t.companyId}</span>
                        </Link>
                      </td>
                      <td className="num">{formatNumber(t.quantity)}</td>
                      <td className="num">{formatPrice(t.price)}</td>
                      <td className="num muted">{formatMoney(t.fee)}</td>
                      <td className="num">{formatMoney(t.cashAfter)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
