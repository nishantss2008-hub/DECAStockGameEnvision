/**
 * Terminal — the live trading deck.
 *
 * Layout:
 *   - TickerStrip across the top (every company's live quote).
 *   - Left rail: a searchable, sector-filterable list of companies; clicking
 *     one selects it for the center pane.
 *   - Center: the selected company's price header + PriceChart.
 *   - Right rail: the TradeTicket for the selected company.
 *
 * Reads come from useCompanies / usePriceHistory / useGame. Trading is gated to
 * the live phase by TradeTicket itself; here we just reflect the phase.
 */

import { useEffect, useMemo, useState } from 'react';
import { useCompanies } from '../hooks/useCompanies';
import { usePriceHistory } from '../hooks/usePriceHistory';
import { useGame } from '../hooks/useGame';
import TickerStrip from '../components/TickerStrip';
import PriceChart from '../components/PriceChart';
import TradeTicket from '../components/TradeTicket';
import {
  classNames,
  formatMarketCap,
  formatMoney,
  formatPct,
  formatPrice,
} from '../lib/format';
import type { Company } from '@deca/shared';

const STYLE_ID = 'terminal-page-styles';
const CSS = `
.terminal { display: flex; flex-direction: column; min-height: calc(100vh - var(--nav-height)); }
.terminal__body {
  flex: 1;
  display: grid;
  grid-template-columns: 19rem minmax(0, 1fr) 21rem;
  gap: var(--sp-5);
  width: 100%;
  max-width: var(--maxw-content);
  margin: 0 auto;
  padding: var(--sp-5);
}
.terminal__rail { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.terminal__list-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-height: calc(100vh - var(--nav-height) - 4rem);
  position: sticky;
  top: calc(var(--nav-height) + var(--sp-3));
}
.terminal__search { position: relative; }
.terminal__filters { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.terminal__filter {
  border: 1px solid rgba(138, 106, 31, 0.4);
  background: rgba(255, 251, 240, 0.5);
  color: var(--ink-700);
  font-family: var(--font-heading);
  font-size: var(--fs-xs);
  letter-spacing: 0.03em;
  padding: 0.3em 0.6em;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.terminal__filter.is-active {
  color: var(--navy-900);
  background: linear-gradient(180deg, var(--gold-400), var(--gold-500));
  border-color: var(--gold-600);
}
.terminal__list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-height: 0;
}
.terminal__list-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0.55rem 0.6rem;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: rgba(255, 251, 240, 0.4);
  cursor: pointer;
  text-align: left;
  transition: all var(--dur-fast) var(--ease);
  color: var(--ink-800);
}
.terminal__list-item:hover { background: rgba(138, 106, 31, 0.12); }
.terminal__list-item.is-selected {
  border-color: var(--gold-500);
  background: rgba(201, 161, 59, 0.18);
  box-shadow: inset 2px 0 0 var(--gold-500);
}
.terminal__li-emoji { font-size: 1.3rem; line-height: 1; }
.terminal__li-id { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.terminal__li-ticker { font-family: var(--font-heading); font-weight: 700; letter-spacing: 0.04em; color: var(--ink-900); }
.terminal__li-name {
  font-size: var(--fs-xs);
  color: var(--ink-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.terminal__li-quote { display: flex; flex-direction: column; align-items: flex-end; }
.terminal__li-price { font-family: var(--font-mono); font-weight: 600; color: var(--ink-900); font-size: var(--fs-sm); }
.terminal__li-change { font-family: var(--font-mono); font-size: var(--fs-xs); font-weight: 600; }

.terminal__main { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.terminal__quote-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}
.terminal__crest { display: flex; align-items: center; gap: var(--sp-4); }
.terminal__crest-emoji { font-size: 2.8rem; line-height: 1; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.35)); }
.terminal__crest-name { font-family: var(--font-heading); font-weight: 700; color: var(--ink-900); font-size: var(--fs-lg); line-height: 1.1; }
.terminal__crest-sub { display: flex; align-items: center; gap: var(--sp-2); margin-top: 0.25rem; }
.terminal__crest-ticker { font-family: var(--font-mono); color: var(--ink-600); letter-spacing: 0.06em; }
.terminal__price-block { text-align: right; }
.terminal__price { font-family: var(--font-mono); font-size: var(--fs-2xl); font-weight: 700; color: var(--ink-900); line-height: 1; }
.terminal__change { font-family: var(--font-mono); font-weight: 600; display: inline-flex; gap: 0.3em; align-items: center; margin-top: 0.3rem; }
.terminal__meta-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--sp-3);
  margin-top: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: 1px solid rgba(138, 106, 31, 0.25);
}
.terminal__meta { display: flex; flex-direction: column; gap: 0.1rem; }
.terminal__meta-label {
  font-family: var(--font-heading);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: var(--fs-xs);
  color: var(--ink-600);
}
.terminal__meta-value { font-family: var(--font-mono); font-weight: 600; color: var(--ink-900); }
.terminal__phase-banner { margin-bottom: 0; }
.terminal__empty { display: grid; place-items: center; min-height: 18rem; text-align: center; }
.terminal__right { position: sticky; top: calc(var(--nav-height) + var(--sp-3)); }

@media (max-width: 1100px) {
  .terminal__body { grid-template-columns: 17rem minmax(0, 1fr); }
  .terminal__right { grid-column: 1 / -1; position: static; max-width: 25rem; }
}
@media (max-width: 760px) {
  .terminal__body { grid-template-columns: minmax(0, 1fr); padding: var(--sp-4); }
  .terminal__list-panel { position: static; max-height: 22rem; }
  .terminal__right { max-width: none; }
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

function dirClass(change: number): string {
  return change > 0 ? 'gain' : change < 0 ? 'loss' : 'flat';
}
function arrow(change: number): string {
  return change > 0 ? '▲' : change < 0 ? '▼' : '◆';
}

const PHASE_LABEL: Record<string, string> = {
  lobby: 'The market opens when the host raises the colors.',
  paused: 'Trading is paused by the quartermaster. Hold fast.',
  ended: 'The voyage has ended. The books are closed.',
};

export default function Terminal() {
  useInjectedStyles();
  const { companies, loading } = useCompanies();
  const { game } = useGame();

  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.sector));
    return Array.from(set).sort();
  }, [companies]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (sector !== 'all' && c.sector !== sector) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.ticker.toLowerCase().includes(term) ||
        c.sector.toLowerCase().includes(term)
      );
    });
  }, [companies, search, sector]);

  // Default selection to the first company once data arrives.
  useEffect(() => {
    const first = companies[0];
    if (!selectedId && first) {
      setSelectedId(first.id);
    }
  }, [companies, selectedId]);

  const selected: Company | null =
    companies.find((c) => c.id === selectedId) ?? null;

  const { history } = usePriceHistory(selected?.id, 240);

  return (
    <div className="terminal">
      <TickerStrip companies={companies} />

      <div className="terminal__body">
        {/* Left rail — company list */}
        <aside className="terminal__rail">
          <div className="panel terminal__list-panel">
            <div className="panel-title">
              <span aria-hidden="true">🧭</span>
              Trading Houses
            </div>

            <div className="terminal__search field">
              <input
                className="input"
                type="search"
                placeholder="Search name or ticker…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search companies"
              />
            </div>

            <div className="terminal__filters">
              <button
                type="button"
                className={classNames('terminal__filter', sector === 'all' && 'is-active')}
                onClick={() => setSector('all')}
              >
                All
              </button>
              {sectors.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={classNames('terminal__filter', sector === s && 'is-active')}
                  onClick={() => setSector(s)}
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>

            <ul className="terminal__list">
              {loading && companies.length === 0 && (
                <li className="muted text-center" style={{ padding: 'var(--sp-4)' }}>
                  Charting the houses…
                </li>
              )}
              {!loading && filtered.length === 0 && (
                <li className="muted text-center" style={{ padding: 'var(--sp-4)' }}>
                  No houses match your search.
                </li>
              )}
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={classNames(
                      'terminal__list-item',
                      c.id === selectedId && 'is-selected',
                    )}
                    onClick={() => setSelectedId(c.id)}
                    aria-pressed={c.id === selectedId}
                  >
                    <span className="terminal__li-emoji" aria-hidden="true">
                      {c.emoji}
                    </span>
                    <span className="terminal__li-id">
                      <span className="terminal__li-ticker">{c.ticker}</span>
                      <span className="terminal__li-name">{c.name}</span>
                    </span>
                    <span className="terminal__li-quote">
                      <span className="terminal__li-price">
                        {formatPrice(c.currentPrice)}
                      </span>
                      <span className={classNames('terminal__li-change', dirClass(c.dayChange))}>
                        {arrow(c.dayChange)} {formatPct(c.dayChange)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Center — quote header + chart */}
        <main className="terminal__main">
          {game && game.phase !== 'live' && (
            <div className="alert alert--info terminal__phase-banner" role="status">
              {PHASE_LABEL[game.phase] ?? 'The market is closed.'}
            </div>
          )}

          {selected ? (
            <>
              <section className="panel">
                <div className="terminal__quote-head">
                  <div className="terminal__crest">
                    <span className="terminal__crest-emoji" aria-hidden="true">
                      {selected.emoji}
                    </span>
                    <div>
                      <div className="terminal__crest-name">{selected.name}</div>
                      <div className="terminal__crest-sub">
                        <span className="terminal__crest-ticker">{selected.ticker}</span>
                        <span className="badge badge--sector">{selected.sector}</span>
                      </div>
                    </div>
                  </div>

                  <div className="terminal__price-block">
                    <div className="terminal__price">
                      {formatPrice(selected.currentPrice)}
                    </div>
                    <div
                      className={classNames(
                        'terminal__change',
                        dirClass(selected.dayChange),
                      )}
                    >
                      <span aria-hidden="true">{arrow(selected.dayChange)}</span>
                      {formatPct(selected.dayChange)}
                    </div>
                  </div>
                </div>

                <div className="terminal__meta-row">
                  <div className="terminal__meta">
                    <span className="terminal__meta-label">Prev Close</span>
                    <span className="terminal__meta-value">
                      {formatPrice(selected.prevClose)}
                    </span>
                  </div>
                  <div className="terminal__meta">
                    <span className="terminal__meta-label">Market Cap</span>
                    <span className="terminal__meta-value">
                      {formatMarketCap(selected.marketCap)}
                    </span>
                  </div>
                  <div className="terminal__meta">
                    <span className="terminal__meta-label">Shares Out</span>
                    <span className="terminal__meta-value">
                      {selected.sharesOutstanding.toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="terminal__meta">
                    <span className="terminal__meta-label">Day Change (Ð)</span>
                    <span
                      className={classNames(
                        'terminal__meta-value',
                        dirClass(selected.currentPrice - selected.prevClose),
                      )}
                    >
                      {formatMoney(selected.currentPrice - selected.prevClose)}
                    </span>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-title">
                  <span aria-hidden="true">📈</span>
                  Price Soundings
                </div>
                <PriceChart history={history} height={340} xMode="tick" />
              </section>
            </>
          ) : (
            <section className="panel terminal__empty">
              <p className="muted">
                {loading ? 'Charting the houses…' : 'Select a trading house from the left to view its chart.'}
              </p>
            </section>
          )}
        </main>

        {/* Right rail — trade ticket */}
        <aside className="terminal__right">
          {selected ? (
            <TradeTicket company={selected} phase={game?.phase} />
          ) : (
            <div className="panel">
              <p className="muted text-center">
                Select a house to place an order.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
