/**
 * Instrument page (MOBILE §7.7), shared by the Portfolio, Markets, News and Learn stacks: StockHeader linked to a
 * scrubbing ChartCard, Your position when the crew holds it, the Key stats grid with its session-range bar,
 * company news, About with the 5 questions entry, a More group (financials, analyst view, your activity), and
 * floating Buy/Sell. Every stat explains itself in a sheet, one tap away (spec §3).
 *
 * The same route serves a FUND (spec 2026-09-16 §3). Everything a fund shares with a company — header,
 * chart, position, trade buttons — is unchanged; what differs is the middle of the screen. A fund
 * shows "What this fund holds" in place of Key stats, and the fundamentals-shaped sections (news
 * about the company, analyst view, financials, all stats, the 5 questions) are ABSENT, because a
 * fund has no earnings, no analyst and no news of its own.
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
import { useIntroGate } from '../../shell/useIntroGate';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { useCompanyData, useScrolledPast } from '../../components/research/useCompanyData';
import { renderTermTip } from '../../components/research/TermTip';
import {
  AboutSection,
  AnalystSheet,
  CompanyNewsSection,
  KeyStatsSection,
  MoreSection,
  TradeActions,
  companyActivityCount,
} from '../../components/research/CompanySections';
import { FundAboutSection, FundHoldingsSection } from '../../components/research/FundSections';
import { StatSheet, statSheetRequest } from '../../components/research/StatGrid';
import { keyStatCells } from '../../components/research/researchModel';
import { fundHoldingRows } from '../../components/market/marketsView';
import { FUND_OPEN_PRICE } from '@deca/shared';
import { RESEARCH, fillCopy } from '../../components/research/researchCopy';
import '../../components/research/research.css';

const DEFAULT_RANGE = 'all';

export default function CompanyPage() {
  const data = useCompanyData();
  const { instrument, company, fund, fundamentals, currency, basePath } = data;
  const back = useStackBack();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { game, team, clock } = useShellGame();
  const { sheet, open, close } = useSheet();
  const gate = useIntroGate();
  const { teamId } = useAuth();
  const watchlist = useWatchlist(teamId ?? null);
  const headerRef = useRef<HTMLDivElement>(null);
  const collapsed = useScrolledPast(headerRef);
  const [scrub, setScrub] = useState<StockHeaderScrub | null>(null);
  const [pickedRange, setRange] = useState<string | null>(null);
  const highlight = new URLSearchParams(search).get('highlight');

  useDocumentTitle(instrument ? `${instrument.ticker} · ${instrument.name}` : 'Company');

  const ranges = useMemo(() => (clock ? rangeTabs(clock) : [{ key: 'all', label: 'All', ticks: null }]), [clock]);
  // Opens on the longest tab that fits in one session, so the chart reads "this session" (MOBILE §7.7 row 2).
  const sessionTab = [...ranges].reverse().find((r) => r.ticks !== null && game && r.ticks <= game.sessionTicks);
  const range = pickedRange ?? sessionTab?.key ?? DEFAULT_RANGE;
  const rangeTicks = ranges.find((r) => r.key === range)?.ticks ?? null;
  const lastTick = instrument?.lastTick ?? game?.currentTick ?? 0;
  const fromTick = rangeTicks === null ? null : Math.max(0, lastTick - rangeTicks);
  const history = useHistory(instrument?.id ?? null, fromTick, lastTick, fund ? 'fund' : 'company');
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

  if (data.unknownTicker || (!instrument && !data.loading)) {
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

  if (!instrument) {
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
  const watched = watchlist.has(instrument.id);
  const money = moneyFormatters(currency);
  const allRange = range === 'all';
  const reference = allRange ? instrument.startPrice : instrument.sessionOpen;
  const stats = seriesStats(points, reference);
  const summary = stats ? chartSummary(allRange ? 'total' : 'session', stats, money) : '';
  const financialsPath = `${basePath}/financials`;
  const statsPath = `${basePath}/stats`;
  const openTrade = (side: 'buy' | 'sell') => gate.openTrade({ ticker: instrument.ticker, side });
  const cells = company && fundamentals ? keyStatCells(company, fundamentals, data.averageFor, currency.symbol) : [];
  const analystOpen = sheet?.kind === 'help' && sheet.set === 'company-analyst';
  const activityCount = company ? companyActivityCount(company, orders, trades, data.companiesById, game) : 0;
  const holdingRows = fund ? fundHoldingRows(fund, data.companiesById) : [];

  return (
    <>
      <LargeTitleNavBar
        title={instrument.name}
        inlineTitle={instrument.ticker}
        collapsed={collapsed}
        subtitle={<StockBarSubtitle price={instrument.currentPrice} sessionChange={instrument.sessionChange} currency={currency} />}
        back={back}
        className="rs-company-nav"
        trailing={
          <NavBarButtonGroup>
            <NavBarButton
              label={fillCopy(RESEARCH.watchAdd, { ticker: instrument.ticker })}
              icon={Star}
              aria-pressed={watched}
              data-watched={watched || undefined}
              className="rs-star"
              onClick={() => watchlist.toggle(instrument.id)}
            />
            {/* A fund has no financials, no all-stats page and no company questions to read. */}
            {company && (
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
            )}
          </NavBarButtonGroup>
        }
      />
      <div className="bx-page rs-page rs-page--actions">
        <div ref={headerRef}>
          <StockHeader
            name={instrument.name}
            ticker={instrument.ticker}
            sector={fund ? fund.sector : company?.sector}
            price={instrument.currentPrice}
            sessionOpen={instrument.sessionOpen}
            sessionChange={instrument.sessionChange}
            tick={instrument.lastTick}
            timeText={data.timeText}
            scrub={scrub}
            currency={currency}
            renderInfoTip={renderTermTip}
          />
        </div>

        <ChartCard
          className="rs-section"
          label={fillCopy(RESEARCH.chartLabel, { ticker: instrument.ticker })}
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

        {owned && (
          <PositionSummary
            className="rs-section"
            ticker={instrument.ticker}
            holding={holding}
            quote={{ price: instrument.currentPrice, sessionOpen: instrument.sessionOpen }}
            accountValue={team ? liveAccountValue(team, data.holdings, data.instrumentsById, game?.phase) : 0}
            cash={team?.cashBalance ?? 0}
            currency={currency}
            renderInfoTip={renderTermTip}
          />
        )}

        {fund ? (
          <>
            <FundHoldingsSection fund={fund} rows={holdingRows} currency={currency} />
            <FundAboutSection fund={fund} openPrice={FUND_OPEN_PRICE} />
          </>
        ) : (
          <>
            {company && fundamentals ? (
              <KeyStatsSection
                company={company}
                cells={cells}
                currency={currency}
                statsPath={statsPath}
                highlight={highlight}
                onOpenStat={(cell) => open(statSheetRequest(cell))}
              />
            ) : (
              <SkeletonGroup label={RESEARCH.loadingFinancials} className="rs-section">
                <SkeletonList rows={3} rowHeight={72} />
              </SkeletonGroup>
            )}

            {company && <CompanyNewsSection news={news} company={company} companiesById={data.companiesById} />}
            {company && <AboutSection company={company} fundamentals={fundamentals} />}
            {company && (
              <MoreSection
                company={company}
                financialsPath={financialsPath}
                activityCount={activityCount}
                onAnalyst={() => open({ kind: 'help', set: 'company-analyst' })}
              />
            )}
          </>
        )}
      </div>
      <TradeActions
        ticker={instrument.ticker}
        owned={owned}
        phase={game?.phase ?? null}
        onTrade={openTrade}
        onResults={() => navigate('/standings/results')}
      />
      <StatSheet cells={cells} />
      {company && <AnalystSheet fundamentals={fundamentals} company={company} symbol={currency.symbol} open={analystOpen} onClose={close} />}
    </>
  );
}
