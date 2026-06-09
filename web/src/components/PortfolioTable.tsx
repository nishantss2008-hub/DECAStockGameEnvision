/**
 * PortfolioTable — the crew's holdings as a ledger table.
 *
 * For each position: shares, average cost, live price, market value, and the
 * unrealized P&L in both absolute (cents) and percent terms, color-coded
 * gain/loss. A footer totals cost basis, market value, and P&L across the book.
 *
 * Money is integer cents; we compute notionals here (integers throughout) and
 * format only at the edge. Positions for unknown companies are skipped.
 */

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Company, Holding } from '@deca/shared';
import {
  classNames,
  formatMoney,
  formatNumber,
  formatPct,
  formatPrice,
} from '../lib/format';

const STYLE_ID = 'portfolio-table-styles';
const CSS = `
.portfolio-table-empty { padding: var(--sp-6); }
.portfolio-table__name {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  color: var(--text-on-deep);
}
.portfolio-table__name:hover { color: var(--gold-200); }
.portfolio-table__ticker { font-weight: 700; letter-spacing: 0.04em; }
.portfolio-table__company { font-size: var(--fs-xs); }
.portfolio-table__pnl { display: block; }
.portfolio-table__pnl-pct { display: block; font-size: var(--fs-xs); opacity: 0.85; }
.portfolio-table tfoot td {
  border-top: 1px solid rgba(201, 161, 59, 0.4);
  border-bottom: none;
  font-family: var(--font-heading);
  font-weight: 700;
  color: var(--gold-200);
  padding-top: var(--sp-3);
}
.portfolio-table__total td:first-child {
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
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

export interface PortfolioTableProps {
  holdings: Holding[];
  /** All companies (array or keyed map) so we can resolve names/prices. */
  companies: Company[] | Record<string, Company>;
  className?: string;
}

interface Row {
  company: Company;
  shares: number;
  avgCost: number; // cents/share
  costBasis: number; // cents
  marketValue: number; // cents
  pnl: number; // cents
  pnlPct: number; // fraction
}

function toMap(
  companies: Company[] | Record<string, Company>,
): Record<string, Company> {
  if (Array.isArray(companies)) {
    return Object.fromEntries(companies.map((c) => [c.id, c]));
  }
  return companies;
}

export default function PortfolioTable({
  holdings,
  companies,
  className,
}: PortfolioTableProps) {
  useInjectedStyles();
  const byId = useMemo(() => toMap(companies), [companies]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const h of holdings) {
      const company = byId[h.companyId];
      if (h.shares <= 0 || !company) continue;
      const costBasis = h.shares * h.avgCost;
      const marketValue = h.shares * company.currentPrice;
      const pnl = marketValue - costBasis;
      const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
      out.push({
        company,
        shares: h.shares,
        avgCost: h.avgCost,
        costBasis,
        marketValue,
        pnl,
        pnlPct,
      });
    }
    return out.sort((a, b) => b.marketValue - a.marketValue);
  }, [holdings, byId]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          costBasis: acc.costBasis + r.costBasis,
          marketValue: acc.marketValue + r.marketValue,
          pnl: acc.pnl + r.pnl,
        }),
        { costBasis: 0, marketValue: 0, pnl: 0 },
      ),
    [rows],
  );
  const totalPnlPct = totals.costBasis > 0 ? totals.pnl / totals.costBasis : 0;

  if (rows.length === 0) {
    return (
      <div className={classNames('panel portfolio-table-empty', className)}>
        <p className="muted text-center">
          No plunder in the hold yet. Set sail from the Terminal to buy your
          first shares.
        </p>
      </div>
    );
  }

  return (
    <div className={classNames('panel panel--flush', className)}>
      <div className="table-wrap">
        <table className="table portfolio-table">
          <thead>
            <tr>
              <th>Holding</th>
              <th className="num">Shares</th>
              <th className="num">Avg Cost</th>
              <th className="num">Price</th>
              <th className="num">Mkt Value</th>
              <th className="num">Unreal. P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dir = r.pnl > 0 ? 'gain' : r.pnl < 0 ? 'loss' : 'flat';
              return (
                <tr key={r.company.id}>
                  <td>
                    <Link
                      to={`/research/${r.company.id}`}
                      className="portfolio-table__name"
                    >
                      <span aria-hidden="true">{r.company.emoji}</span>
                      <span className="portfolio-table__ticker mono">
                        {r.company.ticker}
                      </span>
                      <span className="portfolio-table__company muted hide-sm">
                        {r.company.name}
                      </span>
                    </Link>
                  </td>
                  <td className="num">{formatNumber(r.shares)}</td>
                  <td className="num">{formatPrice(r.avgCost)}</td>
                  <td className="num">{formatPrice(r.company.currentPrice)}</td>
                  <td className="num">{formatMoney(r.marketValue)}</td>
                  <td className={classNames('num', dir)}>
                    <span className="portfolio-table__pnl">
                      {formatMoney(r.pnl)}
                    </span>
                    <span className="portfolio-table__pnl-pct">
                      {formatPct(r.pnlPct)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="portfolio-table__total">
              <td>Total</td>
              <td className="num" />
              <td className="num" />
              <td className="num" />
              <td className="num">{formatMoney(totals.marketValue)}</td>
              <td
                className={classNames(
                  'num',
                  totals.pnl > 0 ? 'gain' : totals.pnl < 0 ? 'loss' : 'flat',
                )}
              >
                <span className="portfolio-table__pnl">
                  {formatMoney(totals.pnl)}
                </span>
                <span className="portfolio-table__pnl-pct">
                  {formatPct(totalPnlPct)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
