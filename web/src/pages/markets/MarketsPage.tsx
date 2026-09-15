/**
 * Markets tab root (MOBILE §7.6): title + status → search → Pirate Composite → breadth → Industry groups → Biggest moves
 * → Watchlist → All companies (?view=&sort=&sector=, #companies) → prices footer. Search pins into the collapsed bar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/ios/EmptyState';
import { SearchField } from '../../components/ios/SearchField';
import { Skeleton, SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { CompaniesSection, ColumnsHelpSheet } from '../../components/market/CompaniesSection';
import { BiggestMoves, BreadthLine, CompositeCard, SectorChips, WatchlistSection } from '../../components/market/MarketSections';
import { SearchPanel, searchAnnouncement, useRecents } from '../../components/market/MarketSearch';
import { ERRORS, LOADING, MARKETS } from '../../components/market/marketCopy';
import { biggestMoves, parseMarketsQuery, searchCompanies, sectorChips, withMarketsQuery, type MarketsQuery } from '../../components/market/marketsView';
import '../../components/market/market.css';
import { useAllFundamentals } from '../../hooks/useAllFundamentals';
import { useCompanies } from '../../hooks/useCompanies';
import { useCompositeHistory, useMarket } from '../../hooks/useMarket';
import { formatTickTime } from '../../lib/format';
import { sessionInfo } from '../../lib/gameTime';
import { useWatchlist } from '../../lib/watchlist';
import { fill } from '../../shell/copy';
import { useShellGame } from '../../shell/ShellData';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { useDocumentTitle } from '../../shell/StubPage';

export default function MarketsPage() {
  useDocumentTitle(MARKETS.title);
  const location = useLocation();
  const navigate = useNavigate();
  const { game, team } = useShellGame();
  const { companies, byId, byTicker, loading, error } = useCompanies();
  const { market } = useMarket();
  const { byId: fundamentals } = useAllFundamentals(game?.marketCreatedAt ?? null);
  const watchlist = useWatchlist(team?.id ?? null);
  const recents = useRecents(team?.id ?? null);

  const query = useMemo(() => parseMarketsQuery(location.search), [location.search]);
  const onQuery = (patch: Partial<MarketsQuery>) =>
    navigate({ pathname: location.pathname, search: withMarketsQuery(location.search, patch), hash: '' }, { replace: true, preventScrollReset: true, state: location.state });

  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const searching = focused || search.trim() !== '';

  const tick = game?.currentTick ?? 0;
  const sessionStart = sessionInfo(tick, game?.sessionTicks ?? 1).startTick;
  const { points: compositePoints } = useCompositeHistory(sessionStart, tick);
  const trend = useMemo(() => compositePoints.map((p) => p.value), [compositePoints]);

  const chips = useMemo(() => sectorChips(market, companies), [market, companies]);
  const moves = useMemo(() => biggestMoves(companies, 3), [companies]);
  const watched = watchlist.symbols.map((id) => byId[id]).filter((c): c is NonNullable<typeof c> => Boolean(c));

  // #companies (e.g. /research redirects) scrolls to the list once rows exist.
  const scrolledHash = useRef(false);
  useEffect(() => {
    if (scrolledHash.current || location.hash !== '#companies' || companies.length === 0) return;
    scrolledHash.current = true;
    document.getElementById('companies')?.scrollIntoView({ block: 'start' });
  }, [location.hash, companies.length]);

  const placeholder = fill(MARKETS.searchCompanies, { n: companies.length || 25 });
  const results = searching ? searchCompanies(companies, search).length : 0;
  const field = (pinned: boolean) => (
    <SearchField
      pinned={pinned}
      value={search}
      onChange={setSearch}
      placeholder={placeholder}
      onFocusChange={setFocused}
      onCancel={() => setSearch('')}
      announcement={searchAnnouncement(search, results)}
      className={pinned ? undefined : 'bx-market-search'}
    />
  );

  const tickSeconds = Math.round((game?.tickIntervalMs ?? 30_000) / 1000);
  const asOf = market?.updatedAt ?? game?.lastTickAt ?? null;
  const footer = asOf
    ? fill(MARKETS.pricesFooter, { tickSeconds, time: formatTickTime(asOf) })
    : MARKETS.pricesFooter.replace(/ · as of \{time\}$/, '').replace('{tickSeconds}', String(tickSeconds));

  let body;
  if (loading && companies.length === 0) {
    body = (
      <SkeletonGroup label={LOADING.prices.title}>
        <Skeleton height={148} radius="card" className="bx-section" />
        <div className="bx-section">
          <SkeletonList rows={6} rowHeight={76} />
        </div>
      </SkeletonGroup>
    );
  } else if (error && companies.length === 0) {
    body = (
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        flavor={ERRORS.pageLoad.flavor}
        action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }}
      />
    );
  } else if (searching) {
    body = <SearchPanel query={search} companies={companies} byTicker={byTicker} recents={recents} />;
  } else {
    body = (
      <>
        {market?.composite && <CompositeCard quote={market.composite} trend={trend} />}
        {market?.breadth && <BreadthLine breadth={market.breadth} />}
        <SectorChips chips={chips} />
        <BiggestMoves up={moves.up} down={moves.down} />
        <WatchlistSection companies={watched} />
        <CompaniesSection
          companies={companies}
          fundamentals={fundamentals}
          query={query}
          onQuery={onQuery}
          sessionStartTick={sessionStart}
          currentTick={tick}
        />
        <p className="bx-prices-footer t-footnote">{footer}</p>
      </>
    );
  }

  return (
    <>
      <ShellNavBar title={MARKETS.title} pinnedSearch={field(true)} />
      <div className="bx-page bx-markets">
        <div className="bx-market-search-row">
          {field(false)}
        </div>
        {body}
      </div>
      <ColumnsHelpSheet />
    </>
  );
}
