/** Standings tab root (MOBILE §7.12): your place and gap, Total return | This session, the ranked list, pinned You row. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { InsetGroupedList } from '../../components/ios/InsetGroupedList';
import { SegmentedControl } from '../../components/ios/SegmentedControl';
import { Crest } from '../../components/ios/Crest';
import { Button } from '../../components/ios/Button';
import { EmptyState } from '../../components/ios/EmptyState';
import { SkeletonGroup, SkeletonList, Skeleton } from '../../components/ios/Skeleton';
import { ChangePill, YouPill } from '../../components/ios/Pill';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useAuth } from '../../lib/auth';
import { formatMoney } from '../../lib/format';
import { ShellNavBar } from '../../shell/ShellNavBar';
import { useShellGame } from '../../shell/ShellData';
import { useSheet } from '../../shell/useSheet';
import { crewInitials } from '../../shell/device';
import { MovementMark, StandingRow, TermTip } from '../../components/standings/StandingRow';
import { fill, placeSummary, sortStandings, type StandingsView } from '../../components/standings/standings';
import { STANDINGS } from '../../components/standings/copy';
import '../../components/standings/standings.css';

const YOU_ROW_ID = 'bx-standing-you';

/** True while your row is out of view (above the top bar or under the tab bar). */
function useRowOffscreen(id: string, active: boolean): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (!active || typeof IntersectionObserver === 'undefined') return setOff(false);
    const el = document.getElementById(id);
    if (!el) return;
    const bottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--content-bottom')) || 100;
    const io = new IntersectionObserver(([e]) => setOff(!e!.isIntersecting), { rootMargin: `-96px 0px -${bottom}px 0px`, threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [id, active]);
  return off;
}

export default function StandingsPage() {
  const navigate = useNavigate();
  const { open } = useSheet();
  const { teamId } = useAuth();
  const { game } = useShellGame();
  const { leaderboard, loading, error } = useLeaderboard();
  const [view, setView] = useState<StandingsView>('total');

  const symbol = game?.currency.symbol ?? 'Ð';
  const ended = game?.phase === 'ended';
  const entries = (ended && leaderboard?.final?.entries) || leaderboard?.entries || [];
  const rows = sortStandings(entries, view);
  const place = placeSummary(entries, teamId, symbol);
  const mine = entries.find((e) => e.teamId === teamId) ?? null;
  const offscreen = useRowOffscreen(YOU_ROW_ID, Boolean(mine));

  let body;
  if (!leaderboard && loading) {
    body = (
      <SkeletonGroup label={STANDINGS.loading.title}>
        <div className="bx-place bx-place--skeleton">
          <Skeleton width={44} height={44} radius="circle" />
          <Skeleton width={180} height={24} />
          <Skeleton width={220} height={18} />
        </div>
        <SkeletonList rows={7} rowHeight={60} />
      </SkeletonGroup>
    );
  } else if (!leaderboard && error) {
    body = (
      <EmptyState
        title={STANDINGS.error.title}
        body={STANDINGS.error.body}
        flavor={STANDINGS.error.flavor}
        action={{ label: STANDINGS.error.action, onClick: () => window.location.reload() }}
      />
    );
  } else if (entries.length === 0) {
    body = <EmptyState icon={Trophy} title={STANDINGS.empty.title} body={STANDINGS.empty.body} />;
  } else {
    body = (
      <>
        {ended && (
          <div className="bx-standings__results">
            <Button variant="filled" size="small" onClick={() => navigate('/standings/results?page=1')}>
              {STANDINGS.seeResults}
            </Button>
          </div>
        )}
        {place && mine && (
          <section className="bx-place" aria-label={STANDINGS.yourPlace}>
            <span aria-hidden="true">
              <Crest initials={crewInitials(mine.name)} size={44} />
            </span>
            <p className="bx-place__title t-title-2 t-emph">
              <span>{place.title}</span>
              <TermTip id="accountValue" className="bx-place__tip" />
            </p>
            {place.gap && <p className="bx-place__gap t-subhead num">{place.gap}</p>}
          </section>
        )}
        <div className="bx-standings__seg">
          <SegmentedControl
            ariaLabel={STANDINGS.viewLabel}
            value={view}
            onChange={setView}
            options={[
              { value: 'total', label: STANDINGS.views.total },
              { value: 'session', label: STANDINGS.views.session },
            ]}
            className="bx-standings__seg-control"
          />
          <TermTip id={view === 'total' ? 'totalGain' : 'sessionChange'} />
        </div>
        <InsetGroupedList
          aria-label={STANDINGS.listLabel}
          className="bx-standings__list"
          footer={
            <span className="bx-standings__footer">
              <span>{`${fill(STANDINGS.crewsCount, { n: entries.length })} · ${STANDINGS.footer}`}</span>
              <TermTip id="accountValue" />
            </span>
          }
        >
          {rows.map((entry) => (
            <StandingRow
              key={entry.teamId}
              id={entry.teamId === teamId ? YOU_ROW_ID : undefined}
              entry={entry}
              you={entry.teamId === teamId}
              view={view}
              symbol={symbol}
              onOpen={() => open({ kind: 'crew', id: entry.teamId })}
            />
          ))}
        </InsetGroupedList>
        {mine && offscreen && (
          <div className="bx-standings__pinned" aria-hidden="true" data-testid="pinned-you">
            <span className="bx-standing__rank t-headline num">{mine.rank}</span>
            <Crest initials={crewInitials(mine.name)} size={32} />
            <span className="bx-pinned__main">
              <span className="bx-standing__name t-body">{mine.name}</span>
              <span className="bx-standing__sub t-subhead">
                <YouPill>{STANDINGS.you}</YouPill>
                <span className="num">{formatMoney(mine.totalValue, { symbol })}</span>
              </span>
            </span>
            <span className="bx-standing__trail">
              <ChangePill value={view === 'total' ? mine.returnPct : mine.sessionChangePct} />
              <MovementMark entry={mine} />
            </span>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <ShellNavBar title={STANDINGS.title} />
      <div className="bx-page bx-standings">{body}</div>
    </>
  );
}
