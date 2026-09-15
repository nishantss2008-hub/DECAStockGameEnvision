/**
 * News tab root (MOBILE §7.11): title + status → flavor → All | My holdings | Watchlist (?filter=) → dispatch cards.
 * Cards open the dispatch; chips open the company (News stack). Nothing here opens Trade.
 */
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/ios/EmptyState';
import { SegmentedControl } from '../../components/ios/SegmentedControl';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { DispatchCard, useSinceTip } from '../../components/market/DispatchCard';
import { ERRORS, LOADING, NEWS } from '../../components/market/marketCopy';
import { NEWS_FILTERS, filterNews, newsFilterSearch, ownsAny, parseNewsFilter, type NewsFilter } from '../../components/market/newsView';
import '../../components/market/market.css';
import { useCompanies } from '../../hooks/useCompanies';
import { useMarket } from '../../hooks/useMarket';
import { useNews } from '../../hooks/useNews';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useWatchlist } from '../../lib/watchlist';
import { useShellGame } from '../../shell/ShellData';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { useDocumentTitle } from '../../shell/StubPage';

const FILTER_OPTIONS = NEWS_FILTERS.map((f) => ({ value: f, label: NEWS.filters[f] }));

export default function NewsPage() {
  useDocumentTitle(NEWS.title);
  const location = useLocation();
  const navigate = useNavigate();
  const { team } = useShellGame();
  const { news, loading, error } = useNews();
  const { byId } = useCompanies();
  const { market } = useMarket();
  const { holdings } = usePortfolio();
  const watchlist = useWatchlist(team?.id ?? null);
  const since = useSinceTip();

  const filter = parseNewsFilter(location.search);
  const held = useMemo(() => new Set(holdings.map((h) => h.companyId)), [holdings]);
  const watched = useMemo(() => new Set(watchlist.symbols), [watchlist.symbols]);
  const visible = useMemo(() => filterNews(news, filter, held, watched), [news, filter, held, watched]);
  const setFilter = (next: NewsFilter) =>
    navigate({ pathname: location.pathname, search: newsFilterSearch(location.search, next) }, { replace: true, preventScrollReset: true, state: location.state });

  let body;
  if (loading && news.length === 0) {
    body = (
      <SkeletonGroup label={LOADING.news.title}>
        <SkeletonList rows={4} rowHeight={160} />
      </SkeletonGroup>
    );
  } else if (error && news.length === 0) {
    body = (
      <EmptyState
        title={ERRORS.pageLoad.title}
        body={ERRORS.pageLoad.body}
        flavor={ERRORS.pageLoad.flavor}
        action={{ label: ERRORS.pageLoad.action, onClick: () => window.location.reload() }}
      />
    );
  } else if (news.length === 0) {
    body = <EmptyState title={NEWS.empty.title} body={NEWS.empty.body} flavor={NEWS.empty.flavor} />;
  } else if (visible.length === 0) {
    body = <EmptyState title={NEWS.emptyFiltered.title} body={NEWS.emptyFiltered.body} action={{ label: NEWS.emptyFiltered.action, onClick: () => setFilter('all') }} />;
  } else {
    body = (
      <div className="bx-dispatches">
        {visible.map((event) => (
          <DispatchCard
            key={event.id}
            event={event}
            byId={byId}
            owned={ownsAny(event, held)}
            compositeNow={market?.composite?.value ?? null}
            onSinceHelp={since.openTip}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <ShellNavBar title={NEWS.title} />
      <div className="bx-page bx-news">
        <p className="bx-news__flavor t-footnote">{NEWS.flavor}</p>
        <SegmentedControl className="bx-news__filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} ariaLabel={NEWS.filterLabel} />
        {body}
      </div>
      {since.sheet}
    </>
  );
}
