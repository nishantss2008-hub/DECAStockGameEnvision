/**
 * News tab root (MOBILE §7.11): title + status → flavor → All | My holdings | Watchlist (?filter=) → ten dispatch
 * cards → "See older dispatches". Cards open the dispatch; chips open the company (News stack). Nothing here
 * opens Trade.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ios/Button';
import { EmptyState } from '../../components/ios/EmptyState';
import { SegmentedControl } from '../../components/ios/SegmentedControl';
import { SkeletonGroup, SkeletonList } from '../../components/ios/Skeleton';
import { DispatchCard, useSinceTip } from '../../components/market/DispatchCard';
import { ERRORS, LOADING, NEWS } from '../../components/market/marketCopy';
import { NEWS_FILTERS, filterNews, newsFilterSearch, ownsAny, parseNewsFilter, type NewsFilter } from '../../components/market/newsView';
import '../../components/market/market.css';
import './news.css';
import { useCompanies } from '../../hooks/useCompanies';
import { NEWS_PAGE_SIZE } from '../../hooks/crewFeed';
import { useMarket } from '../../hooks/useMarket';
import { useNews } from '../../hooks/useNews';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useWatchlist } from '../../lib/watchlist';
import { useShellGame } from '../../shell/ShellData';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { fill } from '../../shell/copy';
import { useDocumentTitle } from '../../shell/StubPage';

const FILTER_OPTIONS = NEWS_FILTERS.map((f) => ({ value: f, label: NEWS.filters[f] }));

/** COPY-TBD `mobile.news*` (MOBILE §7.11): the older-dispatches control under the cards. */
const PAGING = {
  seeOlder: 'See older dispatches',
  showing: 'Showing {shown} of {n}',
  allShown: "That's every dispatch, back to the start of the game.",
} as const;

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

  // Ten cards, then "See older" for the next ten. A new filter starts the count again.
  const [shown, setShown] = useState(NEWS_PAGE_SIZE);
  useEffect(() => setShown(NEWS_PAGE_SIZE), [filter]);
  const page = visible.slice(0, shown);
  const older = visible.length - page.length;
  // When the last tap removes the button, focus must land somewhere: the line that replaces it takes it.
  const endRef = useRef<HTMLParagraphElement>(null);
  const revealing = useRef(false);
  useEffect(() => {
    if (revealing.current && older === 0) {
      revealing.current = false;
      endRef.current?.focus();
    }
  }, [older]);
  const seeOlder = () => {
    revealing.current = true;
    setShown((n) => n + NEWS_PAGE_SIZE);
  };

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
      <>
        <div className="bx-dispatches">
          {page.map((event) => (
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
        {older > 0 ? (
          <div className="bx-news__more">
            <Button variant="gray" size="medium" onClick={seeOlder}>
              {PAGING.seeOlder}
            </Button>
            <p className="t-footnote bx-news__count" role="status">
              {fill(PAGING.showing, { shown: page.length, n: visible.length })}
            </p>
          </div>
        ) : (
          visible.length > NEWS_PAGE_SIZE && (
            <p className="t-footnote bx-news__count bx-news__end" tabIndex={-1} ref={endRef} role="status">
              {PAGING.allShown}
            </p>
          )
        )}
      </>
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
