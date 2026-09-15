/** Company page sections below the chart and position (MOBILE §7.7 rows 4–9 and the floating Buy/Sell). */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Newspaper } from 'lucide-react';
import type { Company, Fundamentals, GameState, NewsEvent, OrderRecord, Trade } from '@deca/shared';
import { InsetGroupedList } from '../ios/InsetGroupedList';
import { DisclosureRow, ExplainRow, ListRow } from '../ios/ListRow';
import { Button } from '../ios/Button';
import { RangeBar } from '../charts/RangeBar';
import { explainMetric, metricValue, type MetricId, type SectorAverage } from '../../lib/compare';
import { formatMoney, formatTickTime } from '../../lib/format';
import { NEWS_EXPLAIN } from '../../lib/glossary';
import { buildActivity } from '../portfolio/activity';
import { formatMoneyCents, spokenMoney, type CurrencyNames } from '../ios/signedText';
import { TermTip } from './TermTip';
import { HistoryBars } from './HistoryBars';
import { KEY_STATS, SHORT_LABELS, analystSummary, companyNews, historyBars, newsTag, statementSummary } from './researchModel';
import { RESEARCH, fillCopy } from './researchCopy';

const MARKET_WIDE: SectorAverage = { scope: 'market', sector: 'Shipping & Salvage' as SectorAverage['sector'], value: null, count: 0 };

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
  average: SectorAverage | null;
  symbol: string;
  highlighted?: boolean;
}) {
  const meta = SHORT_LABELS[id]!;
  const explained = explainMetric(id, metricValue(id, fundamentals, company), average ?? { ...MARKET_WIDE, sector: company.sector }, symbol);
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

export function KeyStatsSection({
  company,
  fundamentals,
  averageFor,
  currency,
  statsPath,
  highlight,
}: {
  company: Company;
  fundamentals: Fundamentals;
  averageFor: (id: MetricId) => SectorAverage | null;
  currency: CurrencyNames;
  statsPath: string;
  highlight: string | null;
}) {
  const money = (cents: number) => formatMoneyCents(cents, currency);
  const low = Math.min(company.sessionLow, company.currentPrice);
  const high = Math.max(company.sessionHigh, company.currentPrice);
  return (
    <InsetGroupedList
      header={RESEARCH.keyStats}
      headerAction={
        <Link className="rs-header-link" to={statsPath}>
          {RESEARCH.seeAllStats}
        </Link>
      }
      footer={RESEARCH.helper}
      className="rs-section"
    >
      {KEY_STATS.map((id) => (
        <MetricExplainRow
          key={id}
          id={id}
          company={company}
          fundamentals={fundamentals}
          average={averageFor(id)}
          symbol={currency.symbol}
          highlighted={highlight === id}
        />
      ))}
      <li className="ios-row rs-range-row" id="metric-sessionRange" data-highlighted={highlight === 'sessionRange' || undefined}>
        <div className="rs-range-row__head">
          <span className="rs-label-with-tip">
            <span className="t-body">{RESEARCH.sessionRange}</span>
            <TermTip id="sessionRange" />
          </span>
          <span className="t-body ios-num">
            {money(low)} – {money(high)}
          </span>
        </div>
        <RangeBar
          low={low}
          high={high}
          value={company.currentPrice}
          formatter={money}
          spokenFormatter={(v) => spokenMoney(v, currency)}
          label={RESEARCH.sessionRange}
          valueLabel={RESEARCH.sessionRange}
        />
        <div className="rs-range-row__ends t-caption-1" aria-hidden="true">
          <span>{RESEARCH.sessionLow}</span>
          <span>{RESEARCH.sessionHigh}</span>
        </div>
      </li>
    </InsetGroupedList>
  );
}

export function FinancialsPreviewSection({ fundamentals, symbol, financialsPath }: { fundamentals: Fundamentals; symbol: string; financialsPath: string }) {
  const summary = statementSummary(fundamentals.history, symbol);
  const bars = historyBars(fundamentals.history);
  return (
    <InsetGroupedList header={RESEARCH.lastFourYears} footer={RESEARCH.unitsNote} className="rs-section">
      <li className="ios-row rs-card-row">
        {summary && <p className="t-subhead rs-secondary rs-summary">{summary}</p>}
        {bars.length > 1 && <HistoryBars bars={bars} symbol={symbol} height={64} />}
      </li>
      <DisclosureRow to={financialsPath} title={RESEARCH.seeFinancials} />
    </InsetGroupedList>
  );
}

export function AnalystSection({ fundamentals, company, symbol }: { fundamentals: Fundamentals; company: Company; symbol: string }) {
  const text = analystSummary(fundamentals.analyst, company.currentPrice, symbol);
  return (
    <section className="rs-section rs-analyst" aria-labelledby="rs-analyst-title">
      <div className="rs-section-header">
        <h2 id="rs-analyst-title" className="t-headline rs-heading">
          {RESEARCH.analystTitle}
        </h2>
        <TermTip id="analystRating" />
      </div>
      <div className="rs-card">
        <p className="t-body rs-analyst__summary">{text}</p>
        {fundamentals.analyst && (
          <p className="t-footnote rs-secondary rs-analyst__target">
            <span>{RESEARCH.priceTarget}</span>
            <TermTip id="priceTarget" />
            <span className="ios-num">{formatMoney(fundamentals.analyst.priceTarget, { symbol })}</span>
          </p>
        )}
        <p className="t-footnote rs-secondary">{RESEARCH.analystCaution}</p>
      </div>
    </section>
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
        const meta = `${newsTag(n, companiesById)} · ${formatTickTime(n.firedAt).slice(0, 5)} · ${RESEARCH.sentimentShort[n.sentiment]}`;
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

export function CompanyActivitySection({
  company,
  orders,
  trades,
  companiesById,
  game,
  currency,
}: {
  company: Company;
  orders: readonly OrderRecord[];
  trades: readonly Trade[];
  companiesById: Record<string, Company>;
  game: GameState | null;
  currency: CurrencyNames;
}) {
  const items = useMemo(
    () => buildActivity(orders, trades, companiesById, game?.sessionTicks ?? 720).filter((i) => i.companyId === company.id),
    [orders, trades, companiesById, game?.sessionTicks, company.id],
  );
  const header = fillCopy(RESEARCH.yourActivity, { ticker: company.ticker });
  if (items.length === 0) {
    return (
      <InsetGroupedList header={header} className="rs-section">
        <li className="ios-row rs-card-row">
          <p className="t-body">{fillCopy(RESEARCH.noOrders, { ticker: company.ticker })}</p>
          <p className="t-footnote rs-secondary">{RESEARCH.noOrdersBody}</p>
        </li>
      </InsetGroupedList>
    );
  }
  return (
    <InsetGroupedList
      header={header}
      headerAction={
        items.length > 2 ? (
          <Link className="rs-header-link" to="/portfolio/activity">
            {fillCopy(RESEARCH.seeAllCount, { n: items.length })}
          </Link>
        ) : undefined
      }
      className="rs-section"
    >
      {items.slice(0, 2).map((item) => {
        const net = item.net === null ? '—' : formatMoneyCents(item.net, currency, { signed: true });
        return (
          <ListRow
            key={item.orderNumber}
            to={`/portfolio/activity/${item.orderNumber}`}
            title={item.title}
            subtitle={<span className="ios-num rs-tertiary">{item.subtitle}</span>}
            trailing={
              <span className="rs-trailing-stack">
                <span className="t-body ios-num">{net}</span>
                <span className="t-footnote rs-secondary">{item.status}</span>
              </span>
            }
            aria-label={`${item.title}, ${item.subtitle}, ${item.net === null ? '' : `${item.net < 0 ? 'cash out' : 'cash in'} ${spokenMoney(Math.abs(item.net), currency)}, `}${item.status}`}
          />
        );
      })}
    </InsetGroupedList>
  );
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

