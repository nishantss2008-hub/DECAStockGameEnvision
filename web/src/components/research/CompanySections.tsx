/** Company page sections below the chart and position (MOBILE §7.7 rows 4–8 and the floating Buy/Sell). */
import { Link } from 'react-router-dom';
import { BookOpen, Newspaper } from 'lucide-react';
import type { Company, Fundamentals, GameState, NewsEvent, OrderRecord, Trade } from '@deca/shared';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { DisclosureRow, ExplainRow, ListRow } from '../ios/ListRow';
import { Button } from '../ios/Button';
import { Sheet } from '../ios/Sheet';
import { INFO_TIP_COPY, glossaryTermPath } from '../ios/InfoTipSheet';
import { RangeBar } from '../charts/RangeBar';
import { explainMetric, metricValue, type MetricId, type PeerComparison } from '../../lib/compare';
import { formatMoney, formatTickTime } from '../../lib/format';
import { GLOSSARY, NEWS_EXPLAIN } from '../../lib/glossary';
import { buildActivity } from '../portfolio/activity';
import { formatMoneyCents, spokenMoney, type CurrencyNames } from '../ios/signedText';
import { TermTip } from './TermTip';
import { StatGrid } from './StatGrid';
import { SHORT_LABELS, analystSummary, companyNews, marketFallback, newsTag, sessionBounds, type StatCell } from './researchModel';
import { RESEARCH, fillCopy } from './researchCopy';

export function MetricExplainRow({
  id,
  company,
  fundamentals,
  average,
  symbol,
  highlighted,
}: {
  id: MetricId;
  company: Company;
  fundamentals: Fundamentals;
  average: PeerComparison | null;
  symbol: string;
  highlighted?: boolean;
}) {
  const meta = SHORT_LABELS[id]!;
  const explained = explainMetric(id, metricValue(id, fundamentals, company), average ?? marketFallback(company.sector), symbol);
  return (
    <ExplainRow
      id={`metric-${id}`}
      label={meta.label}
      info={<TermTip id={meta.termId} />}
      explained={explained}
      highlighted={highlighted}
    />
  );
}

/**
 * Key stats (MOBILE §7.7 row 4): a two-column grid of the five metrics, then the session-range bar
 * full width beneath it. The everyday sentences live in the sheet a cell opens, so the block is a
 * screenful of numbers instead of twenty lines of prose.
 *
 * The range has no cell of its own since 2026-09-17: the bar below says the same two prices and
 * also shows where the price sits between them, so the cell only repeated it (and the chart
 * sentence above said it a third time). The bar keeps the range's "?", so its explanation is still
 * one tap, one Enter or one VoiceOver stop away.
 */
export function KeyStatsSection({
  company,
  cells,
  currency,
  statsPath,
  highlight,
  onOpenStat,
}: {
  company: Company;
  /** From `keyStatCells`; the page builds them once so the grid and its sheet cannot disagree. */
  cells: readonly StatCell[];
  currency: CurrencyNames;
  statsPath: string;
  highlight: string | null;
  onOpenStat: (cell: StatCell) => void;
}) {
  const money = (cents: number) => formatMoneyCents(cents, currency);
  const { low, high } = sessionBounds(company);
  return (
    <section className="rs-section rs-stats" aria-labelledby="rs-key-stats-title" aria-describedby="rs-key-stats-note">
      <div className="ios-list__header" data-variant="prominent">
        <h2 id="rs-key-stats-title" className="ios-list__title">
          {RESEARCH.keyStats}
        </h2>
        <div className="ios-list__action">
          <Link to={statsPath}>{RESEARCH.seeAllStats}</Link>
        </div>
      </div>
      <StatGrid cells={cells} onOpen={onOpenStat} highlight={highlight} />
      {/* The bar labels its own ends with the two prices and names the stat to VoiceOver; the "?"
          beside it is the tap path to the glossary entry the deleted cell used to own (§5.9). */}
      <div className="rs-range rs-card" id="metric-sessionRange">
        <RangeBar
          low={low}
          high={high}
          value={company.currentPrice}
          formatter={money}
          spokenFormatter={(v) => spokenMoney(v, currency)}
          label={RESEARCH.sessionRange}
          valueLabel={RESEARCH.priceNow}
        />
        <TermTip id="sessionRange" />
      </div>
      <p id="rs-key-stats-note" className="ios-list__footer">
        {RESEARCH.helper}
      </p>
    </section>
  );
}

/**
 * More (MOBILE §7.7 row 8): what used to render inline — the financials preview, the analyst view
 * and this crew's activity — now three disclosure rows.
 */
export function MoreSection({
  company,
  financialsPath,
  activityCount,
  onAnalyst,
}: {
  company: Company;
  financialsPath: string;
  activityCount: number;
  onAnalyst: () => void;
}) {
  return (
    <InsetGroupedList header={RESEARCH.more} className="rs-section">
      <DisclosureRow to={financialsPath} title={RESEARCH.seeFinancials} subtitle={RESEARCH.lastFourYears} />
      <DisclosureRow onClick={onAnalyst} title={RESEARCH.analystTitle} aria-haspopup="dialog" />
      <DisclosureRow
        to="/portfolio/activity"
        title={fillCopy(RESEARCH.yourActivity, { ticker: company.ticker })}
        subtitle={activityCount === 0 ? fillCopy(RESEARCH.noOrders, { ticker: company.ticker }) : undefined}
        detail={activityCount > 0 ? String(activityCount) : undefined}
      />
    </InsetGroupedList>
  );
}

/** `?sheet=help&set=company-analyst`: the analyst view, with its caution (COPY §3.2 `analystCard`). */
export function AnalystSheet({
  fundamentals,
  company,
  symbol,
  open,
  onClose,
}: {
  fundamentals: Fundamentals | null;
  company: Company;
  symbol: string;
  open: boolean;
  onClose: () => void;
}) {
  const text = analystSummary(fundamentals?.analyst, company.currentPrice, symbol);
  const entry = GLOSSARY.analystRating ?? null;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={RESEARCH.analystTitle}
      subtitle={entry?.term}
      headerLayout="leading"
      detents="fit"
      scrim="info"
      closeLabel={INFO_TIP_COPY.close}
      className="rs-analyst"
    >
      <div className="rs-analyst__body">
        <p className="t-body rs-analyst__summary">{text}</p>
        {fundamentals?.analyst && (
          <p className="t-footnote rs-secondary rs-analyst__target">
            <span>{RESEARCH.priceTarget}</span>
            <span className="ios-num">{formatMoney(fundamentals.analyst.priceTarget, { symbol })}</span>
          </p>
        )}
        <p className="t-footnote rs-secondary">{RESEARCH.analystCaution}</p>
      </div>
      {entry && (
        <div className="rs-stat-sheet__actions">
          <Link to={glossaryTermPath(entry.id)} className="ios-button" data-style="tinted" data-size="medium">
            <span className="ios-button__label">{INFO_TIP_COPY.openInLearn}</span>
          </Link>
        </div>
      )}
    </Sheet>
  );
}

export function CompanyNewsSection({ news, company, companiesById }: { news: readonly NewsEvent[]; company: Company; companiesById: Record<string, Company> }) {
  const items = companyNews(news, company.id, 3);
  if (items.length === 0) return null;
  return (
    <InsetGroupedList
      header={fillCopy(RESEARCH.newsAbout, { ticker: company.ticker })}
      headerAction={
        <Link className="rs-header-link" to="/news">
          {RESEARCH.seeAllNews}
        </Link>
      }
      className="rs-section"
    >
      {items.map((n) => {
        const meaning = NEWS_EXPLAIN[n.type]?.[n.sentiment];
        const meta = `${newsTag(n, companiesById, company)} · ${formatTickTime(n.firedAt).slice(0, 5)} · ${RESEARCH.sentimentShort[n.sentiment]}`;
        return (
          <ListRow
            key={n.id}
            to={`/news/${n.id}`}
            leading={<Newspaper size={20} strokeWidth={1.75} aria-hidden="true" />}
            leadingWidth={24}
            title={n.headline}
            subtitle={
              <span className="rs-news-sub">
                <span className="t-footnote rs-secondary ios-num">{meta}</span>
                {meaning && (
                  <span className="t-footnote rs-news-meaning">
                    <span className="t-emph">{RESEARCH.whatThisMeans}</span> {meaning}
                  </span>
                )}
              </span>
            }
          />
        );
      })}
    </InsetGroupedList>
  );
}

export function AboutSection({ company, fundamentals }: { company: Company; fundamentals: Fundamentals | null }) {
  const text = company.description || fundamentals?.businessOverview || '';
  return (
    <InsetGroupedList header={RESEARCH.about} className="rs-section">
      {text ? (
        <li className="ios-row rs-card-row">
          <p className="t-body rs-about">{text}</p>
        </li>
      ) : null}
      <DisclosureRow to="/learn/five-questions" title={RESEARCH.fiveQuestions} subtitle={RESEARCH.fiveQuestionsNote} icon={BookOpen} />
    </InsetGroupedList>
  );
}

/** Orders and trades this crew has in this company — the count on the "Your {ticker} activity" row. */
export function companyActivityCount(
  company: Company,
  orders: readonly OrderRecord[],
  trades: readonly Trade[],
  companiesById: Record<string, Company>,
  game: GameState | null,
): number {
  return buildActivity(orders, trades, companiesById, game?.sessionTicks ?? 720).filter((i) => i.companyId === company.id).length;
}

export function TradeActions({
  ticker,
  owned,
  phase,
  onTrade,
  onResults,
}: {
  ticker: string;
  owned: boolean;
  phase: GameState['phase'] | null;
  onTrade: (side: 'buy' | 'sell') => void;
  onResults: () => void;
}) {
  return (
    <div className="rs-float" role="group" aria-label={`Trade ${ticker}`}>
      {phase === 'ended' ? (
        <Button variant="filled" size="large" fullWidth onClick={onResults}>
          {RESEARCH.seeFinalResults}
        </Button>
      ) : (
        <>
          {owned && (
            <Button variant="tinted" tone="sell" size="large" fullWidth aria-haspopup="dialog" aria-label={`${RESEARCH.sell} ${ticker}`} onClick={() => onTrade('sell')}>
              {RESEARCH.sell}
            </Button>
          )}
          <Button variant="filled" tone="buy" size="large" fullWidth aria-haspopup="dialog" aria-label={`${RESEARCH.buy} ${ticker}`} onClick={() => onTrade('buy')}>
            {RESEARCH.buy}
          </Button>
        </>
      )}
    </div>
  );
}

