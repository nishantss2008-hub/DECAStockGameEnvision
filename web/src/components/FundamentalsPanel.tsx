/**
 * FundamentalsPanel — a key-statistics grid distilled from a company's
 * Fundamentals document.
 *
 * Groups the headline valuation, profitability, balance-sheet, and returns
 * metrics into a scannable grid. Ratios are plain multiples; yields, margins,
 * ROE/ROA, and dividend/payout are stored as fractions and shown as percents;
 * money (market cap, 52w range, EPS) is integer cents.
 */

import { useEffect } from 'react';
import type { Fundamentals } from '@deca/shared';
import {
  classNames,
  formatMarketCap,
  formatNumber,
  formatPct,
  formatPrice,
} from '../lib/format';

const STYLE_ID = 'fundamentals-panel-styles';
const CSS = `
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--sp-3);
}
.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  background: rgba(255, 251, 240, 0.55);
  border: 1px solid rgba(138, 106, 31, 0.25);
}
.stat-tile__label {
  font-family: var(--font-heading);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: var(--fs-xs);
  color: var(--ink-600);
}
.stat-tile__value {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--ink-900);
}
.panel .stat-tile__value.gain { color: var(--gain-strong) !important; }
.panel .stat-tile__value.loss { color: var(--loss-strong) !important; }
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

export interface FundamentalsPanelProps {
  fundamentals: Fundamentals;
  className?: string;
}

/** A multiple like P/E — plain number with an 'x' suffix; em-dash if N/A. */
function ratio(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(2)}×`;
}

interface Stat {
  label: string;
  value: string;
  tone?: 'gain' | 'loss';
}

export default function FundamentalsPanel({
  fundamentals: f,
  className,
}: FundamentalsPanelProps) {
  useInjectedStyles();
  const week52Range = `${formatPrice(f.week52Low)} – ${formatPrice(f.week52High)}`;

  const sections: Array<{ title: string; stats: Stat[] }> = [
    {
      title: 'Valuation & Size',
      stats: [
        { label: 'Market Cap', value: formatMarketCap(f.marketCap) },
        { label: 'P/E', value: ratio(f.peRatio) },
        { label: 'Forward P/E', value: ratio(f.forwardPe) },
        { label: 'P/S', value: ratio(f.psRatio) },
        { label: 'P/B', value: ratio(f.pbRatio) },
        { label: 'EV / EBITDA', value: ratio(f.evToEbitda) },
        { label: 'Shares Out', value: formatNumber(f.sharesOutstanding) },
        { label: 'Float', value: formatNumber(f.float) },
        { label: 'Div Yield', value: formatPct(f.dividendYield) },
        { label: 'Payout Ratio', value: formatPct(f.payoutRatio) },
        { label: '52-Week Range', value: week52Range },
        { label: 'EPS', value: formatPrice(f.eps) },
      ],
    },
    {
      title: 'Profitability',
      stats: [
        {
          label: 'Gross Margin',
          value: formatPct(f.grossMargin),
          tone: f.grossMargin >= 0 ? 'gain' : 'loss',
        },
        {
          label: 'Operating Margin',
          value: formatPct(f.operatingMargin),
          tone: f.operatingMargin >= 0 ? 'gain' : 'loss',
        },
        {
          label: 'Net Margin',
          value: formatPct(f.netMargin),
          tone: f.netMargin >= 0 ? 'gain' : 'loss',
        },
        { label: 'Revenue', value: formatMarketCap(f.revenue) },
        { label: 'Net Income', value: formatMarketCap(f.netIncome) },
        { label: 'EBITDA', value: formatMarketCap(f.ebitda) },
      ],
    },
    {
      title: 'Balance Sheet & Returns',
      stats: [
        { label: 'Cash', value: formatMarketCap(f.cash) },
        { label: 'Total Debt', value: formatMarketCap(f.totalDebt) },
        { label: 'Total Assets', value: formatMarketCap(f.totalAssets) },
        { label: 'Equity', value: formatMarketCap(f.equity) },
        { label: 'Current Ratio', value: ratio(f.currentRatio) },
        { label: 'Debt / Equity', value: ratio(f.debtToEquity) },
        {
          label: 'ROE',
          value: formatPct(f.roe),
          tone: f.roe >= 0 ? 'gain' : 'loss',
        },
        {
          label: 'ROA',
          value: formatPct(f.roa),
          tone: f.roa >= 0 ? 'gain' : 'loss',
        },
        { label: 'Free Cash Flow', value: formatMarketCap(f.freeCashFlow) },
      ],
    },
  ];

  return (
    <div className={classNames('fundamentals-panel stack', className)}>
      {sections.map((section) => (
        <section className="panel" key={section.title}>
          <h3 className="panel-title">{section.title}</h3>
          <div className="stat-grid">
            {section.stats.map((stat) => (
              <div className="stat-tile" key={stat.label}>
                <span className="stat-tile__label">{stat.label}</span>
                <span
                  className={classNames(
                    'stat-tile__value mono',
                    stat.tone === 'gain' && 'gain',
                    stat.tone === 'loss' && 'loss',
                  )}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
