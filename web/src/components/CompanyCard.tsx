/**
 * CompanyCard — a compact, tappable card for a single company.
 *
 * Shows the emoji crest, name, ticker, sector chip, current price, the day
 * change (color-coded), and abbreviated market cap. The whole card links
 * through to that company's research page.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Company } from '@deca/shared';
import {
  classNames,
  formatMarketCap,
  formatPct,
  formatPrice,
} from '../lib/format';

const STYLE_ID = 'company-card-styles';
const CSS = `
.company-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  color: var(--panel-text);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.company-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), var(--shadow-inset-parchment);
  color: var(--panel-text);
}
.company-card__head { display: flex; align-items: center; gap: var(--sp-3); }
.company-card__emoji {
  font-size: 1.9rem;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}
.company-card__id { display: flex; flex-direction: column; min-width: 0; }
.company-card__name {
  font-family: var(--font-heading);
  font-weight: 600;
  color: var(--ink-900);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.company-card__ticker {
  font-size: var(--fs-xs);
  color: var(--ink-600);
  letter-spacing: 0.06em;
}
.company-card__quote {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin-top: auto;
}
.company-card__price {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--ink-900);
}
.company-card__change { display: inline-flex; align-items: center; gap: 0.25em; font-weight: 600; }
.company-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: var(--fs-xs);
  padding-top: var(--sp-2);
  border-top: 1px solid rgba(138, 106, 31, 0.25);
}
.company-card__foot-label {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-family: var(--font-heading);
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

export interface CompanyCardProps {
  company: Company;
  className?: string;
}

function changeClass(dayChange: number): string {
  if (dayChange > 0) return 'gain';
  if (dayChange < 0) return 'loss';
  return 'flat';
}

export default function CompanyCard({ company, className }: CompanyCardProps) {
  useInjectedStyles();
  const dir = changeClass(company.dayChange);
  const arrow = company.dayChange > 0 ? '▲' : company.dayChange < 0 ? '▼' : '◆';

  return (
    <Link
      to={`/research/${company.id}`}
      className={classNames('company-card panel', className)}
      aria-label={`${company.name} (${company.ticker}) — view research`}
    >
      <div className="company-card__head">
        <span className="company-card__emoji" aria-hidden="true">
          {company.emoji}
        </span>
        <div className="company-card__id">
          <span className="company-card__name">{company.name}</span>
          <span className="company-card__ticker mono">{company.ticker}</span>
        </div>
      </div>

      <span className="badge badge--sector">{company.sector}</span>

      <div className="company-card__quote">
        <span className="company-card__price mono">
          {formatPrice(company.currentPrice)}
        </span>
        <span className={classNames('company-card__change mono', dir)}>
          <span aria-hidden="true">{arrow}</span>
          {formatPct(company.dayChange)}
        </span>
      </div>

      <div className="company-card__foot muted">
        <span className="company-card__foot-label">Mkt Cap</span>
        <span className="mono">{formatMarketCap(company.marketCap)}</span>
      </div>
    </Link>
  );
}
