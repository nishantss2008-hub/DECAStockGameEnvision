/**
 * Company page (MOBILE §7.7), shared by the Portfolio, Markets, News and Learn stacks: StockHeader linked to a
 * scrubbing ChartCard, Your position, Key stats with sector averages, Financials preview, Analyst view, company
 * news, About with the 5 questions entry, the crew's activity in this company, and floating Buy/Sell.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ellipsis, Star } from 'lucide-react';
import { rangeTabs } from '@deca/shared';
import { LargeTitleNavBar, NavBarButton, NavBarButtonGroup } from '../../components/ios/LargeTitleNavBar';
import { StockBarSubtitle, StockHeader, type StockHeaderScrub } from '../../components/ios/StockHeader';
import { headerScrubFromChart } from '../../components/ios/stockHeaderText';
import { PositionSummary } from '../../components/ios/PositionSummary';
import { EmptyState } from '../../components/ios/EmptyState';
import { Menu } from '../../components/ios/Menu';
import { SkeletonChart, SkeletonGroup, SkeletonHeader, SkeletonList } from '../../components/ios/Skeleton';
import { ChartCard } from '../../components/charts/ChartCard';
import { chartSummary, moneyFormatters, seriesStats } from '../../components/charts/scrub';
import { useHistory } from '../../hooks/useHistory';
import { useNews } from '../../hooks/useNews';
import { useOrders } from '../../hooks/useOrders';
import { useTrades } from '../../hooks/useTrades';
import { useAuth } from '../../lib/auth';
import { useWatchlist } from '../../lib/watchlist';
import { formatTickTime } from '../../lib/format';
import { useShellGame } from '../../shell/ShellData';
import { liveAccountValue } from '../../components/portfolio/derive';
import { useSheet } from '../../shell/useSheet';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useCompanyData, useScrolledPast } from '../../components/research/useCompanyData';
import { renderTermTip } from '../../components/research/TermTip';
import {
  AboutSection,
  AnalystSection,
  CompanyActivitySection,
  CompanyNewsSection,
  FinancialsPreviewSection,
  KeyStatsSection,
  TradeActions,
} from '../../components/research/CompanySections';
import { RESEARCH, fillCopy } from '../../components/research/researchCopy';
import '../../components/research/research.css';

const DEFAULT_RANGE = 'all';

export default function CompanyPage() {
  const data = useCompanyData();
  const { company, fundamentals, currency, basePath } = data;
  const back = useStackBack();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { game, team, clock } = useShellGame();
  const { open } = useSheet();
  const { teamId } = useAuth();
  const watchlist = useWatchlist(teamId ?? null);
  const headerRef = useRef<HTMLDivElement>(null);
  const collapsed = useScrolledPast(headerRef);
  const [scrub, setScrub] = useState<StockHeaderScrub | null>(null);
  const [pickedRange, setRange] = useState<string | null>(null);
  const highlight = new URLSearchParams(search).get('highlight');

  useDocumentTitle(company ? `${company.ticker} · ${company.name}` : 'Company');

  const ranges = useMemo(() => (clock ? rangeTabs(clock) : [{ key: 'all', label: 'All', ticks: null }]), [clock]);
  // Opens on the longest tab that fits in one session, so the chart reads "this session" (MOBILE §7.7 row 2).
  const sessionTab = [...ranges].reverse().find((r) => r.ticks !== null && game && r.ticks <= game.sessionTicks);
  const range = pickedRange ?? sessionTab?.key ?? DEFAULT_RANGE;
  const rangeTicks = ranges.find((r) => r.key === range)?.ticks ?? null;
  const lastTick = company?.lastTick ?? game?.currentTick ?? 0;
  const fromTick = rangeTicks === null ? null : Math.max(0, lastTick - rangeTicks);
  const history = useHistory(company?.id ?? null, fromTick, lastTick);
  const { news } = useNews(30);
  const { orders } = useOrders(50);
  const { trades } = useTrades(50);

  useEffect(() => {
    if (!highlight || !company) return;
    const el = document.getElementById(`metric-${highlight}`);
    el?.scrollIntoView({ block: 'center' });
  }, [highlight, company, fundamentals]);

  const points = useMemo(() => history.points.map((p) => ({ x: p.tick, y: p.price })), [history.points]);
  const tickTime = useMemo(() => {
    const at = game?.lastTickAt ?? null;
    const step = game?.tickIntervalMs ?? 30_000;
    const current = game?.currentTick ?? lastTick;
    return (tick: number) => (at ? formatTickTime(at - (current - tick) * step) : `tick ${tick}`);
  }, [game?.lastTickAt, game?.tickIntervalMs, game?.currentTick, lastTick]);

  if (data.notFound || (!company && !data.loading)) {
    return (
      <>
        <LargeTitleNavBar title={RESEARCH.notFoundTitle} back={back} />
        <div className="bx-page">
          <EmptyState
            title={data.error ? RESEARCH.pageLoadTitle : RESEARCH.notFoundTitle}
            body={data.error ? RESEARCH.pageLoadBody : RESEARCH.notFoundBody}
            action={
              data.error
                ? { label: RESEARCH.tryAgain, onClick: () => window.location.reload() }
                : { label: RESEARCH.searchCompanies, onClick: () => navigate('/markets') }
            }
          />
        </div>
      </>
    );
  }

  if (!company) {
    return (
      <>
        <LargeTitleNavBar title="Company" back={back} className="rs-company-nav" />
        <div className="bx-page rs-page">
          <SkeletonGroup label={RESEARCH.loadingPrices}>
            <SkeletonHeader />
            <SkeletonChart plotHeight={220} />
            <SkeletonList rows={4} rowHeight={88} />
          </SkeletonGroup>
        </div>
      </>
    );
  }

  const holding = data.holding;
  const owned = Boolean(holding && holding.shares > 0);
  const watched = watchlist.has(company.id);
  const money = moneyFormatters(currency);
  const allRange = range === 'all';
  const reference = allRange ? company.startPrice : company.sessionOpen;
  const stats = seriesStats(points, reference);
  const summary = stats ? chartSummary(allRange ? 'total' : 'session', stats, money) : '';
  const financialsPath = `${basePath}/financials`;
  const statsPath = `${basePath}/stats`;
  const openTrade = (side: 'buy' | 'sell') => open({ kind: 'trade', ticker: company.ticker, side });

  return (
    <>
      <LargeTitleNavBar
        title={company.name}
        inlineTitle={company.ticker}
        collapsed={collapsed}
        subtitle={<StockBarSubtitle price={company.currentPrice} sessionChange={company.sessionChange} currency={currency} />}
        back={back}
        className="rs-company-nav"
        trailing={
          <NavBarButtonGroup>
            <NavBarButton
              label={fillCopy(RESEARCH.watchAdd, { ticker: company.ticker })}
              icon={Star}
              aria-pressed={watched}
              data-watched={watched || undefined}
              className="rs-star"
              onClick={() => watchlist.toggle(company.id)}
            />
            <Menu
              label={RESEARCH.moreOptions}
              align="end"
              trigger={<NavBarButton label={RESEARCH.moreOptions} icon={Ellipsis} />}
              groups={[
                {
                  items: [
                    { id: 'financials', label: RESEARCH.seeFinancials, onSelect: () => navigate(financialsPath) },
                    { id: 'stats', label: RESEARCH.seeAllStats, onSelect: () => navigate(statsPath) },
                    { id: 'five', label: RESEARCH.fiveQuestions, onSelect: () => navigate('/learn/five-questions') },
                  ],
                },
              ]}
            />
          </NavBarButtonGroup>
        }
      />
      <div className="bx-page rs-page rs-page--actions">
        <div ref={headerRef}>
          <StockHeader
            name={company.name}
            ticker={company.ticker}
            sector={company.sector}
            price={company.currentPrice}
            sessionOpen={company.sessionOpen}
            sessionChange={company.sessionChange}
            tick={company.lastTick}
            timeText={data.timeText}
            scrub={scrub}
            currency={currency}
            renderInfoTip={renderTermTip}
          />
        </div>

        <ChartCard
          className="rs-section"
          label={fillCopy(RESEARCH.chartLabel, { ticker: company.ticker })}
          points={points}
          summary={summary}
          formatters={{ ...money, formatX: tickTime }}
          reference={{ y: reference, label: allRange ? RESEARCH.startPrice : RESEARCH.sessionOpen }}
          ranges={ranges}
          range={range}
          onRangeChange={setRange}
          rangeLabel={RESEARCH.chartRange}
          onScrub={(p) => setScrub(headerScrubFromChart(p))}
          loading={history.loading && points.length === 0}
          paused={game?.phase === 'paused'}
        />

        <PositionSummary
          className="rs-section"
          ticker={company.ticker}
          holding={holding}
          quote={{ price: company.currentPrice, sessionOpen: company.sessionOpen }}
          accountValue={team ? liveAccountValue(team, data.holdings, data.companiesById, game?.phase) : 0}
          cash={team?.cashBalance ?? 0}
          currency={currency}
          renderInfoTip={renderTermTip}
        />

        {fundamentals ? (
          <>
            <KeyStatsSection
              company={company}
              fundamentals={fundamentals}
              averageFor={data.averageFor}
              currency={currency}
              statsPath={statsPath}
              highlight={highlight}
            />
            <FinancialsPreviewSection fundamentals={fundamentals} symbol={currency.symbol} financialsPath={financialsPath} />
            <AnalystSection fundamentals={fundamentals} company={company} symbol={currency.symbol} />
          </>
        ) : (
          <SkeletonGroup label={RESEARCH.loadingFinancials} className="rs-section">
            <SkeletonList rows={5} rowHeight={88} />
          </SkeletonGroup>
        )}

        <CompanyNewsSection news={news} company={company} companiesById={data.companiesById} />
        <AboutSection company={company} fundamentals={fundamentals} />
        <CompanyActivitySection
          company={company}
          orders={orders}
          trades={trades}
          companiesById={data.companiesById}
          game={game}
          currency={currency}
        />
      </div>
      <TradeActions
        ticker={company.ticker}
        owned={owned}
        phase={game?.phase ?? null}
        onTrade={openTrade}
        onResults={() => navigate('/standings/results')}
      />
    </>
  );
}
