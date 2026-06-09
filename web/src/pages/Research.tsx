/**
 * Research — the company research center.
 *
 * Two modes, driven by the optional `:id` route param:
 *   - No id: a searchable, sortable index of every company (by ticker, name,
 *     sector, price, day change, market cap). Cards link into the report.
 *   - With id: the full real-company-format research report — header,
 *     FundamentalsPanel, FinancialStatements, management team, industry
 *     analysis, marketing strategy, risk factors, recent developments, and the
 *     analyst rating + price target.
 *
 * Data: useCompanies for the index, useCompany(id) for a single report.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCompanies } from '../hooks/useCompanies';
import { useCompany } from '../hooks/useCompany';
import CompanyCard from '../components/CompanyCard';
import FundamentalsPanel from '../components/FundamentalsPanel';
import FinancialStatements from '../components/FinancialStatements';
import {
  classNames,
  formatMarketCap,
  formatPct,
  formatPrice,
} from '../lib/format';
import type { Company } from '@deca/shared';

const STYLE_ID = 'research-page-styles';
const CSS = `
.research__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  align-items: flex-end;
  margin-bottom: var(--sp-5);
}
.research__controls .field { flex: 1 1 16rem; }
.research__controls .field--sm { flex: 0 1 12rem; }
.research__count { color: var(--text-on-deep-muted); font-size: var(--fs-sm); }

/* ---- Report ---- */
.report__hero { display: flex; flex-direction: column; gap: var(--sp-4); }
.report__crest { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; }
.report__crest-emoji { font-size: 3.4rem; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); }
.report__name { font-family: var(--font-heading); font-weight: 700; color: var(--ink-900); font-size: var(--fs-xl); line-height: 1.1; }
.report__sub { display: flex; align-items: center; gap: var(--sp-2); margin-top: 0.3rem; flex-wrap: wrap; }
.report__ticker { font-family: var(--font-mono); color: var(--ink-600); letter-spacing: 0.06em; }
.report__quote { margin-left: auto; text-align: right; }
.report__price { font-family: var(--font-mono); font-size: var(--fs-2xl); font-weight: 700; color: var(--ink-900); line-height: 1; }
.report__change { font-family: var(--font-mono); font-weight: 600; display: inline-flex; gap: 0.3em; align-items: center; margin-top: 0.25rem; }
.report__desc { color: var(--ink-700); line-height: var(--lh-normal); }

.report__analyst {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  flex-wrap: wrap;
}
.report__rating-pill {
  font-family: var(--font-heading);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: var(--fs-md);
  padding: 0.45em 1em;
  border-radius: var(--radius-pill);
  border: 1px solid;
}
.report__target { display: flex; flex-direction: column; }
.report__target-label {
  font-family: var(--font-heading);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: var(--fs-xs);
  color: var(--ink-600);
}
.report__target-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--fs-lg); color: var(--ink-900); }
.report__target-delta { font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 600; }

.report__mgmt { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--sp-4); }
.report__mgmt-card {
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  background: rgba(255, 251, 240, 0.55);
  border: 1px solid rgba(138, 106, 31, 0.25);
}
.report__mgmt-name { font-family: var(--font-heading); font-weight: 700; color: var(--ink-900); }
.report__mgmt-role { font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-700); margin-bottom: var(--sp-2); }
.report__mgmt-bio { font-size: var(--fs-sm); color: var(--ink-700); line-height: var(--lh-snug); }
.report__mgmt-tenure { font-size: var(--fs-xs); color: var(--ink-600); margin-top: var(--sp-2); font-style: italic; }

.report__industry-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-4); }
.report__industry-stat { display: flex; flex-direction: column; gap: 0.1rem; }
.report__industry-label { font-family: var(--font-heading); text-transform: uppercase; letter-spacing: 0.1em; font-size: var(--fs-xs); color: var(--ink-600); }
.report__industry-value { font-family: var(--font-mono); font-weight: 600; color: var(--ink-900); }
.report__prose { color: var(--ink-700); line-height: var(--lh-normal); }

.report__list { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: var(--sp-2); color: var(--ink-700); line-height: var(--lh-snug); }
.report__list li::marker { color: var(--gold-600); }

.report__back { margin-bottom: var(--sp-4); display: inline-flex; }
.report__missing { display: grid; place-items: center; min-height: 16rem; text-align: center; }
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

function dirClass(change: number): string {
  return change > 0 ? 'gain' : change < 0 ? 'loss' : 'flat';
}
function arrow(change: number): string {
  return change > 0 ? '▲' : change < 0 ? '▼' : '◆';
}

/* ------------------------------------------------------------------ index */

type SortKey = 'ticker' | 'name' | 'sector' | 'price' | 'change' | 'marketCap';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'marketCap', label: 'Market Cap' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'name', label: 'Name' },
  { key: 'sector', label: 'Sector' },
  { key: 'price', label: 'Price' },
  { key: 'change', label: 'Day Change' },
];

function sortCompanies(list: Company[], key: SortKey): Company[] {
  const copy = [...list];
  switch (key) {
    case 'ticker':
      return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'sector':
      return copy.sort(
        (a, b) => a.sector.localeCompare(b.sector) || a.ticker.localeCompare(b.ticker),
      );
    case 'price':
      return copy.sort((a, b) => b.currentPrice - a.currentPrice);
    case 'change':
      return copy.sort((a, b) => b.dayChange - a.dayChange);
    case 'marketCap':
    default:
      return copy.sort((a, b) => b.marketCap - a.marketCap);
  }
}

function ResearchIndex() {
  const { companies, loading } = useCompanies();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');

  const sectors = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.sector));
    return Array.from(set).sort();
  }, [companies]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = companies.filter((c) => {
      if (sector !== 'all' && c.sector !== sector) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.ticker.toLowerCase().includes(term) ||
        c.sector.toLowerCase().includes(term)
      );
    });
    return sortCompanies(filtered, sortKey);
  }, [companies, search, sector, sortKey]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admiralty Records</p>
          <h1>Research Center</h1>
        </div>
        <span className="research__count">
          {loading ? 'Loading…' : `${shown.length} of ${companies.length} houses`}
        </span>
      </header>

      <div className="research__controls">
        <div className="field">
          <label className="label" htmlFor="research-search">
            Search
          </label>
          <input
            id="research-search"
            className="input"
            type="search"
            placeholder="Name, ticker, or sector…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field field--sm">
          <label className="label" htmlFor="research-sector">
            Sector
          </label>
          <select
            id="research-sector"
            className="select"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field field--sm">
          <label className="label" htmlFor="research-sort">
            Sort by
          </label>
          <select
            id="research-sort"
            className="select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && shown.length === 0 ? (
        <div className="panel text-center">
          <p className="muted">No houses match your search.</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {shown.map((c) => (
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ report */

const RATING_TONE: Record<string, string> = {
  'strong buy': 'gain',
  buy: 'gain',
  outperform: 'gain',
  overweight: 'gain',
  accumulate: 'gain',
  hold: 'flat',
  neutral: 'flat',
  'market perform': 'flat',
  sell: 'loss',
  underperform: 'loss',
  underweight: 'loss',
  'strong sell': 'loss',
};

function ratingTone(rating: string): 'gain' | 'loss' | 'flat' {
  const tone = RATING_TONE[rating.trim().toLowerCase()];
  return (tone as 'gain' | 'loss' | 'flat') ?? 'flat';
}

function ResearchReport({ id }: { id: string }) {
  const { company, fundamentals, loading } = useCompany(id);

  if (loading) {
    return (
      <div className="page">
        <div className="loading-block" style={{ minHeight: '50vh' }}>
          <div className="spinner" aria-hidden="true" />
          <span>Pulling the ledgers…</span>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="page">
        <Link to="/research" className="btn btn--ghost btn--sm report__back">
          ← Back to records
        </Link>
        <div className="panel report__missing">
          <div>
            <h2>House not found</h2>
            <p className="muted">No trading house is logged under “{id}.”</p>
          </div>
        </div>
      </div>
    );
  }

  const tone = ratingTone(fundamentals?.analyst.rating ?? '');
  const priceTarget = fundamentals?.analyst.priceTarget ?? 0;
  const upside = company.currentPrice > 0 ? priceTarget / company.currentPrice - 1 : 0;

  return (
    <div className="page">
      <Link to="/research" className="btn btn--ghost btn--sm report__back">
        ← Back to records
      </Link>

      <div className="stack" style={{ gap: 'var(--sp-5)' }}>
        {/* Header */}
        <section className="panel report__hero">
          <div className="report__crest">
            <span className="report__crest-emoji" aria-hidden="true">
              {company.emoji}
            </span>
            <div>
              <div className="report__name">{company.name}</div>
              <div className="report__sub">
                <span className="report__ticker">{company.ticker}</span>
                <span className="badge badge--sector">{company.sector}</span>
              </div>
            </div>
            <div className="report__quote">
              <div className="report__price">{formatPrice(company.currentPrice)}</div>
              <div className={classNames('report__change', dirClass(company.dayChange))}>
                <span aria-hidden="true">{arrow(company.dayChange)}</span>
                {formatPct(company.dayChange)}
              </div>
            </div>
          </div>
          {company.description && (
            <p className="report__desc">{company.description}</p>
          )}
          <div className="row wrap" style={{ gap: 'var(--sp-3)' }}>
            <Link to="/" className="btn btn--sm">
              Trade {company.ticker}
            </Link>
          </div>
        </section>

        {fundamentals ? (
          <>
            {/* Analyst rating + target */}
            <section className="panel">
              <h3 className="panel-title">
                <span aria-hidden="true">🧮</span>
                Analyst Verdict
              </h3>
              <div className="report__analyst">
                <span
                  className={classNames('report__rating-pill', tone)}
                  style={{ borderColor: 'currentColor' }}
                >
                  {fundamentals.analyst.rating}
                </span>
                <div className="report__target">
                  <span className="report__target-label">Price Target</span>
                  <span className="report__target-value">{formatPrice(priceTarget)}</span>
                  <span className={classNames('report__target-delta', dirClass(upside))}>
                    {formatPct(upside)} {upside >= 0 ? 'upside' : 'downside'}
                  </span>
                </div>
                <div className="report__target">
                  <span className="report__target-label">Current Price</span>
                  <span className="report__target-value">
                    {formatPrice(company.currentPrice)}
                  </span>
                </div>
              </div>
            </section>

            {/* Business overview */}
            {fundamentals.businessOverview && (
              <section className="panel">
                <h3 className="panel-title">
                  <span aria-hidden="true">📜</span>
                  Business Overview
                </h3>
                <p className="report__prose">{fundamentals.businessOverview}</p>
              </section>
            )}

            {/* Key statistics */}
            <FundamentalsPanel fundamentals={fundamentals} />

            {/* Financial statements */}
            <div>
              <h2 style={{ marginBottom: 'var(--sp-3)' }}>Financial Statements</h2>
              <FinancialStatements fundamentals={fundamentals} />
            </div>

            {/* Management team */}
            {fundamentals.management.length > 0 && (
              <section className="panel">
                <h3 className="panel-title">
                  <span aria-hidden="true">⚓</span>
                  Management Team
                </h3>
                <div className="report__mgmt">
                  {fundamentals.management.map((m) => (
                    <div className="report__mgmt-card" key={`${m.name}-${m.role}`}>
                      <div className="report__mgmt-name">{m.name}</div>
                      <div className="report__mgmt-role">{m.role}</div>
                      <p className="report__mgmt-bio">{m.bio}</p>
                      <p className="report__mgmt-tenure">
                        {m.tenureYears} {m.tenureYears === 1 ? 'year' : 'years'} aboard
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Industry analysis */}
            <section className="panel">
              <h3 className="panel-title">
                <span aria-hidden="true">🌊</span>
                Industry Analysis
              </h3>
              <div className="report__industry-grid">
                <div className="report__industry-stat">
                  <span className="report__industry-label">Sector</span>
                  <span className="report__industry-value">{fundamentals.industry.sector}</span>
                </div>
                <div className="report__industry-stat">
                  <span className="report__industry-label">Total Addressable Mkt</span>
                  <span className="report__industry-value">
                    {formatMarketCap(fundamentals.industry.tam)}
                  </span>
                </div>
                <div className="report__industry-stat">
                  <span className="report__industry-label">Growth Rate</span>
                  <span
                    className={classNames(
                      'report__industry-value',
                      dirClass(fundamentals.industry.growthRate),
                    )}
                  >
                    {formatPct(fundamentals.industry.growthRate)}
                  </span>
                </div>
                <div className="report__industry-stat">
                  <span className="report__industry-label">Competitive Position</span>
                  <span className="report__industry-value">
                    {fundamentals.industry.competitivePosition}
                  </span>
                </div>
              </div>
              {fundamentals.industry.notes && (
                <p className="report__prose">{fundamentals.industry.notes}</p>
              )}
            </section>

            {/* Marketing strategy */}
            {fundamentals.marketingStrategy && (
              <section className="panel">
                <h3 className="panel-title">
                  <span aria-hidden="true">🚩</span>
                  Marketing Strategy
                </h3>
                <p className="report__prose">{fundamentals.marketingStrategy}</p>
              </section>
            )}

            {/* Risk factors + recent developments */}
            <div className="grid grid-2">
              {fundamentals.riskFactors.length > 0 && (
                <section className="panel">
                  <h3 className="panel-title">
                    <span aria-hidden="true">🗡️</span>
                    Risk Factors
                  </h3>
                  <ul className="report__list">
                    {fundamentals.riskFactors.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </section>
              )}

              {fundamentals.recentDevelopments.length > 0 && (
                <section className="panel">
                  <h3 className="panel-title">
                    <span aria-hidden="true">📰</span>
                    Recent Developments
                  </h3>
                  <ul className="report__list">
                    {fundamentals.recentDevelopments.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
        ) : (
          <div className="panel">
            <p className="muted text-center">
              No research dossier has been filed for this house yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Research() {
  useInjectedStyles();
  const { id } = useParams<{ id?: string }>();
  return id ? <ResearchReport id={id} /> : <ResearchIndex />;
}
