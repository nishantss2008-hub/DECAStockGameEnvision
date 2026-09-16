/**
 * Markets tab root (MOBILE §7.6, spec 2026-09-16 §4): title + status → search → Pirate Composite →
 * breadth → Industry groups → Biggest moves → Watchlist → **Funds** → **Companies by sector** →
 * prices footer. Search pins into the collapsed bar.
 *
 * Apple Stocks semantics: the list is one row per instrument, nothing more. The five-way metric
 * table (Basics | Price | Value | Health | Analysts) is no longer here — it moved to `/markets/compare`,
 * reached from the sort menu and from the Companies header, because a dense table earns its density
 * only on a screen whose whole job is comparing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TICK_INTERVAL_MS } from '@deca/shared';
import { ArrowUpDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/ios/EmptyState';
import { Menu } from '../../components/ios/Menu';
import { SearchField } from '../../components/ios/SearchField';
import { Skeleton, SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { FundsSection, SectorGroupsSection } from '../../components/market/InstrumentSections';
import { BiggestMoves, BreadthLine, CompositeCard, SectorChips, WatchlistSection } from '../../components/market/MarketSections';
import { SearchPanel, searchAnnouncement, useRecents } from '../../components/market/MarketSearch';
import { ERRORS, LOADING, MARKETS } from '../../components/market/marketCopy';
import {
  SORT_KEYS,
  biggestMoves,
  parseMarketsQuery,
  searchInstruments,
  sectorChips,
  sectorGroups,
  withMarketsQuery,
  type MarketsQuery,
} from '../../components/market/marketsView';
import '../../components/market/market.css';
import { useCompanies } from '../../hooks/useCompanies';
import { useInstruments } from '../../hooks/useInstruments';
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
  const { companies } = useCompanies();
  const { instruments, funds, byId, byTicker, loading, error } = useInstruments();
  const { market } = useMarket();
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
  const groups = useMemo(() => sectorGroups(companies, query.sort), [companies, query.sort]);
  // A starred fund belongs on the watchlist exactly like a starred company.
  const watched = watchlist.symbols.map((id) => byId[id]).filter((c): c is NonNullable<typeof c> => Boolean(c));

  // #companies (e.g. /research redirects) scrolls to the list once rows exist.
  const scrolledHash = useRef(false);
  useEffect(() => {
    if (scrolledHash.current || location.hash !== '#companies' || instruments.length === 0) return;
    scrolledHash.current = true;
    document.getElementById('companies')?.scrollIntoView({ block: 'start' });
  }, [location.hash, instruments.length]);

  // The count is the live roster: companies plus funds, never a literal.
  const placeholder = fill(MARKETS.searchCompanies, { n: instruments.length });
  const results = searching ? searchInstruments(instruments, search).length : 0;
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

  const tickSeconds = Math.round((game?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS) / 1000);
  const asOf = market?.updatedAt ?? game?.lastTickAt ?? null;
  const footer = asOf
    ? fill(MARKETS.pricesFooter, { tickSeconds, time: formatTickTime(asOf) })
    : MARKETS.pricesFooter.replace(/ · as of \{time\}$/, '').replace('{tickSeconds}', String(tickSeconds));

  const sortMenu = (
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
        // Compare lives in the sort menu (spec §4): it is the other way to read the same list.
        { items: [{ id: 'compare', label: MARKETS.compareOpen, onSelect: () => navigate('/markets/compare') }] },
      ]}
    />
  );

  let body;
  if (loading && instruments.length === 0) {
    body = (
      <SkeletonGroup label={LOADING.prices.title}>
        <Skeleton height={148} radius="card" className="bx-section" />
        <div className="bx-section">
          <SkeletonList rows={6} rowHeight={76} />
        </div>
      </SkeletonGroup>
    );
  } else if (error && instruments.length === 0) {
    body = (
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        flavor={ERRORS.pageLoad.flavor}
        action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }}
      />
    );
  } else if (searching) {
    body = <SearchPanel query={search} instruments={instruments} byTicker={byTicker} recents={recents} />;
  } else {
    body = (
      <>
        {market?.composite && <CompositeCard quote={market.composite} trend={trend} />}
        {market?.breadth && <BreadthLine breadth={market.breadth} />}
        <SectorChips chips={chips} />
        <BiggestMoves up={moves.up} down={moves.down} />
        <WatchlistSection instruments={watched} />
        <div className="bx-markets__list-tools">{sortMenu}</div>
        <FundsSection funds={funds} sessionStartTick={sessionStart} currentTick={tick} />
        <SectorGroupsSection groups={groups} sessionStartTick={sessionStart} currentTick={tick} />
        <p className="bx-prices-footer t-footnote">{footer}</p>
      </>
    );
  }

  return (
    <>
      <ShellNavBar title={MARKETS.title} pinnedSearch={field(true)} />
      <div className="bx-page bx-markets">
        <div className="bx-market-search-row">{field(false)}</div>
        {body}
      </div>
    </>
  );
}
