/**
 * Final results, full screen, 5 pages (MOBILE §7.13). Paging is route-based (`?page=n`, normal document scroll);
 * a horizontal swipe and the Back/Next buttons both replace the page param. X closes to Standings.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import type { RevealSort, RevealRow } from '../../components/standings/reveal';
import { holdingsBreakdown, researchSummary, revealRows, sortRevealRows } from '../../components/standings/reveal';
import { fill, resultsPageFromSearch, RESULTS_PAGES } from '../../components/standings/standings';
import { RESULTS, STANDINGS } from '../../components/standings/copy';
import { CrewPage, FinalPage, LuckPage, RevealDetailSheet, RevealPage, ScorecardHelpSheet, VoyagePage } from '../../components/standings/ResultsSections';
import { markResultsSeen } from '../../components/standings/useResultsAutoOpen';
import { NavBarButton } from '../../components/ios/LargeTitleNavBar';
import { Button } from '../../components/ios/Button';
import { EmptyState } from '../../components/ios/EmptyState';
import { CompassLoader } from '../../components/ios/CompassRose';
import { MAX_SWIPE_ANGLE_DEG } from '../../components/ios/swipeGesture';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useCompanies } from '../../hooks/useCompanies';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useAuth } from '../../lib/auth';
import { useShellGame } from '../../shell/ShellData';
import { useSheet } from '../../shell/useSheet';
import '../../components/standings/standings.css';

const SORTS: readonly RevealSort[] = ['quality', 'luck', 'actual'];
/** A page swipe needs |dx| > 40px within 30° of horizontal (MOBILE §7.13). */
const PAGE_SWIPE_PX = 40;
const APPEARANCE = ['hull', 'light', 'light', 'dark', 'light'] as const;

export default function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sheet, open, close } = useSheet();
  const { teamId } = useAuth();
  const { game, gameLoading } = useShellGame();
  const { leaderboard, loading: boardLoading } = useLeaderboard();
  const { companies, byId } = useCompanies();
  const { holdings } = usePortfolio();
  const [detail, setDetail] = useState<RevealRow | null>(null);

  const params = new URLSearchParams(location.search);
  const page = resultsPageFromSearch(params);
  const sortParam = params.get('sort') as RevealSort | null;
  const sort: RevealSort = sortParam && SORTS.includes(sortParam) ? sortParam : 'quality';
  const symbol = game?.currency.symbol ?? 'Ð';
  const ended = game?.phase === 'ended';
  const final = leaderboard?.final?.entries ?? [];
  const appearance = APPEARANCE[page - 1]!;
  const headingId = `bx-results-h-${page}`;

  const rows = useMemo(() => revealRows(companies), [companies]);
  const sorted = useMemo(() => sortRevealRows(rows, sort), [rows, sort]);
  const heldIds = useMemo(() => new Set(holdings.filter((h) => h.shares > 0).map((h) => h.companyId)), [holdings]);
  const breakdown = useMemo(() => holdingsBreakdown(holdings, byId), [holdings, byId]);
  const research = useMemo(() => researchSummary(final, teamId), [final, teamId]);
  const mine = final.find((e) => e.teamId === teamId) ?? null;

  useEffect(() => {
    document.title = `${RESULTS.title} · Buccaneer Exchange`;
  }, []);

  useEffect(() => {
    if (ended) markResultsSeen(game?.marketCreatedAt);
  }, [ended, game?.marketCreatedAt]);

  // Full-screen view: hide the tab bar; hull and dark pages paint the page behind them.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-results', appearance);
    if (appearance !== 'light') root.setAttribute('data-hull', '');
    return () => {
      root.removeAttribute('data-results');
      root.removeAttribute('data-hull');
    };
  }, [appearance]);

  // Each page change moves focus to the page heading and back to the top (route-based paging).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.getElementById(headingId)?.focus({ preventScroll: true });
  }, [page, headingId]);

  const go = (n: number, extra?: Record<string, string>) => {
    const next = new URLSearchParams();
    next.set('page', String(Math.min(RESULTS_PAGES, Math.max(1, n))));
    for (const [k, v] of Object.entries(extra ?? {})) next.set(k, v);
    navigate({ pathname: location.pathname, search: `?${next}` }, { replace: true, viewTransition: true });
  };
  const exit = () => navigate('/standings', { replace: true });

  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    start.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (Math.abs(dx) > PAGE_SWIPE_PX && angle < MAX_SWIPE_ANGLE_DEG) go(page + (dx < 0 ? 1 : -1));
  };

  const loading = (gameLoading && !game) || (boardLoading && !leaderboard);
  let content;
  if (loading) {
    content = <CompassLoader label={STANDINGS.loading.title} flavor={STANDINGS.loading.flavor} />;
  } else if (!ended || final.length === 0) {
    content = (
      <EmptyState
        title={RESULTS.empty.title}
        body={RESULTS.empty.body}
        flavor={RESULTS.empty.flavor}
        headingLevel={2}
        action={{ label: RESULTS.close, onClick: exit }}
      />
    );
  } else if (page === 1) {
    content = <VoyagePage entries={final} teamId={teamId} symbol={symbol} headingId={headingId} />;
  } else if (page === 2) {
    content = <CrewPage entry={mine} count={final.length} symbol={symbol} research={research} holdings={breakdown} headingId={headingId} />;
  } else if (page === 3) {
    content = (
      <RevealPage
        rows={sorted}
        sort={sort}
        onSort={(s) => go(3, { sort: s })}
        onHelp={() => open({ kind: 'help', set: 'results-scorecard' })}
        onRow={setDetail}
        headingId={headingId}
      />
    );
  } else if (page === 4) {
    content = <LuckPage rows={rows} heldIds={heldIds} onViewList={() => go(3, { sort: 'luck' })} headingId={headingId} />;
  } else {
    content = <FinalPage entries={final} teamId={teamId} symbol={symbol} onDone={exit} onOpenCrew={(id) => open({ kind: 'crew', id })} headingId={headingId} />;
  }
  const paged = !loading && ended && final.length > 0;

  return (
    <div
      className={`bx-results ${appearance === 'light' ? '' : appearance}`}
      data-page={page}
      onPointerDown={paged ? onPointerDown : undefined}
      onPointerUp={paged ? onPointerUp : undefined}
    >
      <header className="bx-results__top">
        <NavBarButton label={RESULTS.close} icon={X} onClick={exit} className="glass" />
        {paged && (
          <span className="bx-results__dots" aria-hidden="true">
            {Array.from({ length: RESULTS_PAGES }, (_, i) => (
              <span key={i} className="bx-results__dot" data-active={i + 1 === page ? '' : undefined} />
            ))}
          </span>
        )}
        <span className="bx-results__top-spacer" />
      </header>
      {paged && (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {fill(RESULTS.pageOf, { n: page, total: RESULTS_PAGES })}
        </p>
      )}
      <div className="bx-results__page" key={page}>
        {content}
      </div>
      {paged && (
        <nav className="bx-results__pager" aria-label={RESULTS.title}>
          <Button variant="gray" size="large" disabled={page === 1} onClick={() => go(page - 1)}>
            {RESULTS.back}
          </Button>
          {page < RESULTS_PAGES && (
            <Button variant="filled" size="large" onClick={() => go(page + 1)}>
              {RESULTS.next}
            </Button>
          )}
        </nav>
      )}
      <RevealDetailSheet row={detail} onClose={() => setDetail(null)} />
      <ScorecardHelpSheet
        open={sheet?.kind === 'help' && sheet.set === 'results-scorecard'}
        onClose={close}
      />
    </div>
  );
}

