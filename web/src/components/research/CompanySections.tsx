/** Company page sections below the chart and position (MOBILE §7.7 rows 4–8 and the floating Buy/Sell). */
import type React from 'react';
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

/** One labelled paragraph inside a profile card. */
function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="ios-row rs-card-row rs-profile-row">
      <p className="t-footnote rs-profile-label">{label}</p>
      <div className="t-body rs-profile-text">{children}</div>
    </li>
  );
}

/**
 * The business behind the ticker (fixed per company): what it does, what it sells, who buys, how it
 * makes money, why customers choose it, and its edge. Descriptive — it never says buy or sell.
 */
export function BusinessSection({ fundamentals }: { fundamentals: Fundamentals | null }) {
  const p = fundamentals?.profile;
  if (!p) return null;
  const position = fundamentals?.industry?.competitivePosition;
  return (
    <InsetGroupedList
      header="The business"
      className="rs-section"
      footer="How a company makes money tells you what has to go right for its profits to grow — and what could go wrong."
    >
      <ProfileRow label="What it does">{p.whatTheyDo}</ProfileRow>
      <ProfileRow label="What it sells">
        <ul className="rs-profile-list">
          {p.products.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </ProfileRow>
      <ProfileRow label="Who buys">{p.customers}</ProfileRow>
      <ProfileRow label="How it makes money">{p.businessModel}</ProfileRow>
      <ProfileRow label="Why customers choose it">{p.valueProposition}</ProfileRow>
      <ProfileRow label="Edge over rivals">{p.competitiveEdge}</ProfileRow>
      {position ? <ProfileRow label="Place in its industry">{`${position}. ${fundamentals?.industry?.notes ?? ''}`.trim()}</ProfileRow> : null}
    </InsetGroupedList>
  );
}

/** Who runs the company, their record, and where they are steering it this game. */
export function LeadershipSection({ fundamentals }: { fundamentals: Fundamentals | null }) {
  const team = fundamentals?.management ?? [];
  if (!fundamentals?.profile || team.length === 0) return null;
  return (
    <InsetGroupedList
      header="Leadership & strategy"
      className="rs-section"
      footer="Good leaders keep costs under control, grow sales and avoid risky borrowing. Check whether their record matches the numbers."
    >
      {fundamentals.strategy ? <ProfileRow label="Strategy">{fundamentals.strategy}</ProfileRow> : null}
      {team.map((m) => (
        <ProfileRow key={m.role} label={`${m.role} · ${m.tenureYears} ${m.tenureYears === 1 ? 'year' : 'years'}`}>
          <strong>{m.name}</strong> — {m.bio}
        </ProfileRow>
      ))}
      {fundamentals.marketingStrategy ? <ProfileRow label="How it wins customers">{fundamentals.marketingStrategy}</ProfileRow> : null}
    </InsetGroupedList>
  );
}

/** What could go wrong, and what has happened lately. */
export function RisksSection({ fundamentals }: { fundamentals: Fundamentals | null }) {
  if (!fundamentals?.profile) return null;
  const risks = fundamentals.riskFactors ?? [];
  const recent = fundamentals.recentDevelopments ?? [];
  if (risks.length === 0 && recent.length === 0) return null;
  return (
    <InsetGroupedList header="Risks & recent news" className="rs-section" footer="Every company has risks. Compare them with its rivals’ before you decide.">
      {recent.length ? (
        <ProfileRow label="Lately">
          <ul className="rs-profile-list">
            {recent.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </ProfileRow>
      ) : null}
      {risks.length ? (
        <ProfileRow label="Key risks">
          <ul className="rs-profile-list">
            {risks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </ProfileRow>
      ) : null}
    </InsetGroupedList>
  );
}

export function AboutSection({ company, fundamentals }: { company: Company; fundamentals: Fundamentals | null }) {
  const text = fundamentals?.profile ? '' : company.description || fundamentals?.businessOverview || '';
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

