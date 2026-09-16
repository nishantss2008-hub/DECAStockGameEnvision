/**
 * All companies (MOBILE §7.6 row 8): sticky view control (Basics | Price | Value | Health | Analysts) with the sort and
 * filter menu, the view caption, the sticky column header with one "?" for "What these columns mean", one row per
 * company and the research helper footer. Also the help sheet for `?sheet=help&set=markets-*`.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SECTORS, type Company, type Fundamentals } from '@deca/shared';
import { ArrowUpDown, CircleQuestionMark } from 'lucide-react';
import { Sparkline } from '../charts/Sparkline';
import { Menu } from '../ios/Menu';
import { SegmentedControl } from '../ios/SegmentedControl';
import { Sheet } from '../ios/Sheet';
import { Crest } from '../ios/Crest';
import { ChangePill } from '../ios/Pill';
import { changeParts } from '../ios/changeText';
import { useHistory } from '../../hooks/useHistory';
import { formatMoney, formatMoneySpoken } from '../../lib/format';
import { GLOSSARY, glossaryTitle, usuallyGoodSentence } from '../../lib/glossary';
import { sectorSlug } from '../../lib/sector';
import { fill } from '../../shell/copy';
import { useSheet } from '../../shell/useSheet';
import {
  MARKETS_VIEWS,
  SORT_KEYS,
  VIEW_COLUMNS,
  columnCells,
  filterBySector,
  helpColumns,
  helpSetFor,
  sectorShortName,
  sortCompanies,
  spokenCell,
  viewFromHelpSet,
  type MarketsQuery,
  type MarketsView,
} from './marketsView';
import { CompanyStockRow, companyPath } from './MarketSections';
import { MARKETS } from './marketCopy';

export interface CompaniesSectionProps {
  companies: readonly Company[];
  fundamentals: Record<string, Fundamentals>;
  query: MarketsQuery;
  onQuery: (patch: Partial<MarketsQuery>) => void;
  sessionStartTick: number;
  currentTick: number;
}

const VIEW_OPTIONS = MARKETS_VIEWS.map((v) => ({ value: v, label: MARKETS.views[v] }));

export function CompaniesSection({ companies, fundamentals, query, onQuery, sessionStartTick, currentTick }: CompaniesSectionProps) {
  const { open } = useSheet();
  const rows = sortCompanies(filterBySector(companies, query.sector), query.sort);
  const columns = VIEW_COLUMNS[query.view];
  const price = query.view === 'price';

  return (
    <section id="companies" className="bx-section bx-companies" aria-labelledby="bx-companies-title">
      <div className="bx-section__header">
        <h2 id="bx-companies-title" className="bx-section__title">
          {MARKETS.allCompanies}
        </h2>
      </div>
      <div className="bx-companies__views">
        <SegmentedControl
          className="bx-companies__seg"
          options={VIEW_OPTIONS}
          value={query.view}
          onChange={(view) => onQuery({ view })}
          ariaLabel={MARKETS.viewLabel}
          menuLabel={MARKETS.viewMenuLabel}
        />
        <Menu
          trigger={
            <button type="button" className="bx-round-button" aria-label={fill(MARKETS.sortFilter, { sort: MARKETS.sorts[query.sort].toLowerCase() })}>
              <ArrowUpDown size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          }
          groups={[
            {
              label: MARKETS.sortBy,
              value: query.sort,
              onValueChange: (id) => onQuery({ sort: id as MarketsQuery['sort'] }),
              items: SORT_KEYS.map((key) => ({ id: key, label: MARKETS.sorts[key], onSelect: () => onQuery({ sort: key }) })),
            },
            {
              label: MARKETS.industryGroup,
              value: query.sector ? sectorSlug(query.sector) : 'all',
              onValueChange: (id) => onQuery({ sector: SECTORS.find((s) => sectorSlug(s) === id) ?? null }),
              items: [
                { id: 'all', label: MARKETS.allGroups, onSelect: () => onQuery({ sector: null }) },
                ...SECTORS.map((s) => ({ id: sectorSlug(s), label: sectorShortName(s), onSelect: () => onQuery({ sector: s }) })),
              ],
            },
          ]}
        />
      </div>
      <p className="bx-companies__caption t-footnote">{MARKETS.viewHelp[query.view]}</p>
      {query.sector && (
        <p className="bx-companies__filter t-footnote">
          <span>{fill(MARKETS.showingGroup, { sector: sectorShortName(query.sector) })}</span>
          <button type="button" className="bx-text-button" onClick={() => onQuery({ sector: null })}>
            {MARKETS.showAll}
          </button>
        </p>
      )}
      <div className="bx-metrics-head" data-view={query.view} data-count={columns.length}>
        <button
          type="button"
          className="bx-metrics-head__help"
          aria-label={MARKETS.columnsHelp}
          aria-haspopup="dialog"
          onClick={() => open({ kind: 'help', set: helpSetFor(query.view) })}
        >
          <CircleQuestionMark size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {columns.map((c) => (
          <span key={c.id} aria-hidden="true">
            {c.label}
          </span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="bx-muted t-subhead">{MARKETS.noCompanies}</p>
      ) : (
        <ul className="bx-card bx-metrics-card" role="list">
          {rows.map((c) =>
            price ? (
              <CompanyStockRow key={c.id} company={c} sparkline={<RowSparkline company={c} from={sessionStartTick} to={currentTick} />} />
            ) : (
              <CompanyMetricsRow key={c.id} company={c} view={query.view} fundamentals={fundamentals[c.id]} />
            ),
          )}
        </ul>
      )}
      <p className="bx-footer t-footnote">{MARKETS.helper}</p>
    </section>
  );
}

function RowSparkline({ company, from, to }: { company: Company; from: number; to: number }) {
  const { points } = useHistory(company.id, from, to);
  const values = points.map((p) => p.price);
  if (values.length < 2) return null;
  return <Sparkline values={values} width={48} height={20} reference={company.sessionOpen} />;
}

/** CompanyMetricsRow (76px): crest · ticker · name … price · change, then one cell per column. The whole row is one link. */
export function CompanyMetricsRow({ company, view, fundamentals }: { company: Company; view: MarketsView; fundamentals: Fundamentals | undefined }) {
  const cells = columnCells(view, company, fundamentals);
  const columns = VIEW_COLUMNS[view];
  const priceText = formatMoney(company.currentPrice);
  const label = [
    `${company.name}, ${company.ticker}`,
    formatMoneySpoken(company.currentPrice),
    `${changeParts(company.sessionChange).spoken} ${MARKETS.thisSession}`,
    ...columns.map((col, i) => `${col.label} ${spokenCell(cells[i] ?? '—')}`),
  ].join(', ');
  return (
    <li className="ios-row-item bx-metrics-item">
      <Link to={companyPath(company.ticker)} className="bx-metrics-row" aria-label={label}>
        <span className="bx-metrics-row__l1" aria-hidden="true">
          <Crest ticker={company.ticker} sector={company.sector} size={28} />
          <span className="bx-metrics-row__ticker">{company.ticker}</span>
          <span className="bx-metrics-row__name">{company.name}</span>
          <span className="bx-metrics-row__price num">{priceText}</span>
          <ChangePill value={company.sessionChange} />
        </span>
        <span className="bx-metrics-row__cells num" data-count={cells.length} aria-hidden="true">
          {cells.map((text, i) => (
            <span key={columns[i]?.id ?? i}>{text}</span>
          ))}
        </span>
      </Link>
    </li>
  );
}

/** "What these columns mean" (`?sheet=help&set=markets-basics`): each column's term, what it is, and when it is usually good. */
export function ColumnsHelpSheet() {
  const { sheet, close } = useSheet();
  const view = sheet?.kind === 'help' ? viewFromHelpSet(sheet.set) : null;
  const [shown, setShown] = useState<MarketsView | null>(view);
  useEffect(() => {
    if (view) setShown(view);
  }, [view]);
  const current = view ?? shown;
  if (!current) return null;
  return (
    <Sheet
      open={view !== null}
      onOpenChange={(next) => !next && close()}
      onClosed={() => !view && setShown(null)}
      title={MARKETS.columnsHelp}
      subtitle={MARKETS.views[current]}
      headerLayout="leading"
      detents="medium-large"
      scrim="info"
    >
      <div className="bx-help">
        {helpColumns(current).map((col) => {
          const entry = GLOSSARY[col.termId];
          if (!entry) return null;
          return (
            <section key={col.termId} className="bx-help__term" aria-labelledby={`bx-help-${col.termId}`}>
              <h3 id={`bx-help-${col.termId}`} className="t-headline">
                {glossaryTitle(entry)}
              </h3>
              <p className="t-subhead">{entry.whatItIs}</p>
              <p className="t-subhead bx-muted">{usuallyGoodSentence(entry)}</p>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
