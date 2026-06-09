/**
 * FinancialStatements — the company's financials as three switchable tabs
 * (Income Statement, Balance Sheet, Cash Flow), each a labeled line-item table,
 * plus a multi-period history table beneath.
 *
 * All money fields are integer cents; computed sub-lines (e.g. gross profit)
 * come straight from the Fundamentals doc — we never do money math here, only
 * format at the edge. Margins/returns are fractions shown as percents.
 */

import { useEffect, useState } from 'react';
import type { Fundamentals } from '@deca/shared';
import { classNames, formatMoney, formatPct } from '../lib/format';

const STYLE_ID = 'financial-statements-styles';
const CSS = `
.financial-statements__tabs {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: var(--sp-4);
  border-radius: var(--radius-md);
  background: rgba(138, 106, 31, 0.12);
  border: 1px solid rgba(138, 106, 31, 0.3);
}
.financial-statements__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-heading);
  font-weight: 600;
  font-size: var(--fs-sm);
  letter-spacing: 0.03em;
  color: var(--ink-700);
  padding: 0.45em 0.9em;
  border-radius: var(--radius-sm);
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.financial-statements__tab:hover { color: var(--ink-900); }
.financial-statements__tab.is-active {
  color: var(--navy-900);
  background: linear-gradient(180deg, var(--gold-400), var(--gold-500));
  box-shadow: var(--shadow-sm);
}
.statement-table tbody td { border-bottom-color: rgba(138, 106, 31, 0.14); }
.statement-table__strong td {
  font-weight: 700;
  color: var(--ink-900) !important;
  border-top: 1px solid rgba(138, 106, 31, 0.3);
}
.statement-table__indent td:first-child {
  padding-left: var(--sp-5);
  color: var(--ink-600) !important;
  font-style: italic;
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

export interface FinancialStatementsProps {
  fundamentals: Fundamentals;
  className?: string;
}

type TabKey = 'income' | 'balance' | 'cashflow';

interface Line {
  label: string;
  value: string;
  /** Render emphasized (subtotal/total) row. */
  strong?: boolean;
  /** Indent as a component of the line above. */
  indent?: boolean;
}

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'income', label: 'Income', icon: '📈' },
  { key: 'balance', label: 'Balance', icon: '⚖️' },
  { key: 'cashflow', label: 'Cash Flow', icon: '🪙' },
];

function incomeLines(f: Fundamentals): Line[] {
  return [
    { label: 'Revenue', value: formatMoney(f.revenue), strong: true },
    { label: 'Cost of Revenue', value: formatMoney(f.costOfRevenue), indent: true },
    { label: 'Gross Profit', value: formatMoney(f.grossProfit), strong: true },
    { label: 'Gross Margin', value: formatPct(f.grossMargin), indent: true },
    { label: 'Operating Income', value: formatMoney(f.operatingIncome), strong: true },
    { label: 'Operating Margin', value: formatPct(f.operatingMargin), indent: true },
    { label: 'EBITDA', value: formatMoney(f.ebitda) },
    { label: 'Net Income', value: formatMoney(f.netIncome), strong: true },
    { label: 'Net Margin', value: formatPct(f.netMargin), indent: true },
    { label: 'EPS', value: formatMoney(f.eps) },
  ];
}

function balanceLines(f: Fundamentals): Line[] {
  return [
    { label: 'Cash & Equivalents', value: formatMoney(f.cash) },
    { label: 'Total Assets', value: formatMoney(f.totalAssets), strong: true },
    { label: 'Total Debt', value: formatMoney(f.totalDebt), indent: true },
    { label: 'Total Liabilities', value: formatMoney(f.totalLiabilities), strong: true },
    { label: 'Shareholder Equity', value: formatMoney(f.equity), strong: true },
    { label: 'Current Ratio', value: `${f.currentRatio.toFixed(2)}×` },
    { label: 'Debt / Equity', value: `${f.debtToEquity.toFixed(2)}×` },
  ];
}

function cashflowLines(f: Fundamentals): Line[] {
  return [
    { label: 'Operating Cash Flow', value: formatMoney(f.operatingCashFlow), strong: true },
    { label: 'Capital Expenditure', value: formatMoney(f.capex), indent: true },
    { label: 'Free Cash Flow', value: formatMoney(f.freeCashFlow), strong: true },
    { label: 'Return on Equity', value: formatPct(f.roe) },
    { label: 'Return on Assets', value: formatPct(f.roa) },
  ];
}

function StatementTable({ lines }: { lines: Line[] }) {
  return (
    <div className="table-wrap">
      <table className="table statement-table">
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.label}
              className={classNames(
                line.strong && 'statement-table__strong',
                line.indent && 'statement-table__indent',
              )}
            >
              <td>{line.label}</td>
              <td className="num">{line.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinancialStatements({
  fundamentals: f,
  className,
}: FinancialStatementsProps) {
  useInjectedStyles();
  const [tab, setTab] = useState<TabKey>('income');

  const lines =
    tab === 'income'
      ? incomeLines(f)
      : tab === 'balance'
      ? balanceLines(f)
      : cashflowLines(f);

  const history = f.history ?? [];

  return (
    <div className={classNames('financial-statements stack', className)}>
      <section className="panel">
        <div className="financial-statements__tabs" role="tablist" aria-label="Financial statements">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={classNames(
                'financial-statements__tab',
                tab === t.key && 'is-active',
              )}
              onClick={() => setTab(t.key)}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <StatementTable lines={lines} />
      </section>

      {history.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Period History</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="num">Revenue</th>
                  <th className="num">Net Income</th>
                  <th className="num">EPS</th>
                </tr>
              </thead>
              <tbody>
                {history.map((period) => (
                  <tr key={period.period}>
                    <td>{period.period}</td>
                    <td className="num">{formatMoney(period.revenue)}</td>
                    <td
                      className={classNames(
                        'num',
                        period.netIncome >= 0 ? 'gain' : 'loss',
                      )}
                    >
                      {formatMoney(period.netIncome)}
                    </td>
                    <td className="num">{formatMoney(period.eps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
