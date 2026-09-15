/**
 * Dispatch detail (MOBILE §7.11): Back · headline · TagPill + time · tick → body → "What this means" → one card per
 * company (crest, name, mini chart from the price at the news to now, "since the news" + ?, "View {ticker}").
 * Macro dispatches add "{n} companies · Composite" + ?. There is no Buy button: links open the company page only.
 */
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Company, NewsEvent } from '@deca/shared';
import { ChartCard } from '../../components/charts/ChartCard';
import { moneyFormatters } from '../../components/charts/scrub';
import { Crest } from '../../components/ios/Crest';
import { EmptyState } from '../../components/ios/EmptyState';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { ListRow } from '../../components/ios/ListRow';
import { DEFAULT_CURRENCY } from '../../components/ios/signedText';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { ChangeText, companyPath } from '../../components/market/MarketSections';
import { DispatchMeta, MarketLine, SinceTipButton, WhatThisMeans, useSinceTip } from '../../components/market/DispatchCard';
import { ERRORS, LOADING, NEWS } from '../../components/market/marketCopy';
import { chipMode, ownsAny, sinceChips, sinceSpoken, type SinceChip } from '../../components/market/newsView';
import '../../components/market/market.css';
import { useCompanies } from '../../hooks/useCompanies';
import { useHistory } from '../../hooks/useHistory';
import { useMarket } from '../../hooks/useMarket';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useDocSnapshot } from '../../hooks/useSnapshot';
import { fill } from '../../shell/copy';
import { useShellGame } from '../../shell/ShellData';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';

const MONEY = moneyFormatters(DEFAULT_CURRENCY);
const sinceWords = fill(NEWS.sinceReport, { pct: '' }).trim();

export default function DispatchPage() {
  const { newsId = '' } = useParams();
  const back = useStackBack('/news');
  const navigate = useNavigate();
  const { game } = useShellGame();
  const { data, loading, error } = useDocSnapshot<NewsEvent>(newsId ? `news/${newsId}` : null);
  const event = data ? { ...data, id: data.id ?? newsId } : null;
  const { byId } = useCompanies();
  const { market } = useMarket();
  const { holdings } = usePortfolio();
  const held = useMemo(() => new Set(holdings.map((h) => h.companyId)), [holdings]);
  const since = useSinceTip();
  useDocumentTitle(event?.headline ?? NEWS.dispatch);

  let body;
  if (loading) {
    body = (
      <SkeletonGroup label={LOADING.news.title}>
        <SkeletonList rows={3} rowHeight={120} />
      </SkeletonGroup>
    );
  } else if (error && !event) {
    body = <EmptyState title={ERRORS.pageLoad.title} body={ERRORS.pageLoad.body} action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }} />;
  } else if (!event) {
    body = <EmptyState title={NEWS.notFound.title} body={NEWS.notFound.body} action={{ label: NEWS.notFound.action, onClick: () => navigate('/news') }} />;
  } else {
    const chips = sinceChips(event, byId);
    const wide = chipMode(event) === 'market';
    body = (
      <>
        <DispatchMeta event={event} owned={ownsAny(event, held)} withTick />
        <p className="t-body bx-dispatch-detail__body">{event.body}</p>
        <WhatThisMeans event={event} className="bx-card-pad" />
        {wide && (
          <div className="bx-card-pad bx-section">
            <MarketLine event={event} compositeNow={market?.composite?.value ?? null} />
          </div>
        )}
        {wide ? (
          chips.length > 0 && (
            <InsetGroupedList className="bx-section" aria-label={fill(NEWS.companyCount, { n: chips.length })}>
              {chips.map((chip) => (
                <ListRow
                  key={chip.companyId}
                  to={companyPath(chip.ticker, 'news')}
                  leading={<Crest ticker={chip.ticker} sector={chip.sector} size={36} />}
                  leadingWidth={36}
                  title={chip.ticker}
                  subtitle={chip.name}
                  trailing={<ChangeText value={chip.pct} />}
                  aria-label={`${chip.ticker}, ${chip.name}, ${sinceSpoken(chip.pct)}`}
                />
              ))}
            </InsetGroupedList>
          )
        ) : (
          chips.map((chip) => (
            <CompanySinceCard key={chip.companyId} chip={chip} company={byId[chip.companyId]} event={event} currentTick={game?.currentTick ?? event.tick} onHelp={since.openTip} />
          ))
        )}
      </>
    );
  }

  return (
    <>
      <LargeTitleNavBar title={event?.headline ?? NEWS.dispatch} inlineTitle={NEWS.dispatch} back={back} className="bx-dispatch-navbar" />
      <div className="bx-page bx-news bx-dispatch-detail">{body}</div>
      {since.sheet}
    </>
  );
}

function CompanySinceCard({ chip, company, event, currentTick, onHelp }: { chip: SinceChip; company: Company | undefined; event: NewsEvent; currentTick: number; onHelp: () => void }) {
  const { points, loading } = useHistory(chip.companyId, event.tick, Math.max(event.tick, currentTick));
  const series = useMemo(() => points.map((p) => ({ x: p.tick, y: p.price })), [points]);
  const headingId = `bx-since-${chip.companyId}`;
  return (
    <section className="bx-since-card bx-section" aria-labelledby={headingId}>
      <div className="bx-since-card__head">
        <Crest ticker={chip.ticker} sector={chip.sector} size={36} />
        <div className="bx-since-card__names">
          <h2 id={headingId} className="t-headline">
            {chip.ticker}
          </h2>
          <span className="t-subhead bx-muted">{chip.name}</span>
        </div>
      </div>
      <ChartCard
        className="bx-since-card__chart"
        label={`${chip.ticker} ${sinceWords}`}
        points={series}
        summary={{ text: '', spoken: sinceSpoken(chip.pct) }}
        formatters={{ ...MONEY, formatX: (tick) => `Tick ${tick.toLocaleString('en-US')}` }}
        reference={event.priceAtFire[chip.companyId] ? { y: event.priceAtFire[chip.companyId]!, label: sinceWords } : undefined}
        plotHeight={160}
        loading={loading && series.length === 0}
      />
      <p className="bx-since-card__line t-subhead">
        <ChangeText value={chip.pct} />
        <span className="bx-muted">{sinceWords}</span>
        <SinceTipButton onOpen={onHelp} />
      </p>
      {company && (
        <Link className="bx-text-button bx-since-card__view" to={companyPath(chip.ticker, 'news')}>
          {fill(NEWS.viewTicker, { ticker: chip.ticker })}
        </Link>
      )}
    </section>
  );
}
