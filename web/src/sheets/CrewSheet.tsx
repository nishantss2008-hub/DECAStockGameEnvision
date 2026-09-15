/**
 * `?sheet=crew&id=:crewId` (MOBILE §7.12 Crew sheet): one crew's public standings only — crest, rank, trend and
 * the leaderboard figures, each with an inline-expand "?" (§5.9). Never reads another crew's private documents.
 */
import { Sheet } from '../components/ios/Sheet';
import { EmptyState } from '../components/ios/EmptyState';
import { Crest } from '../components/ios/Crest';
import { InsetGroupedList } from '../components/ios/InsetGroupedList';
import { KeyValueRow } from '../components/ios/ListRow';
import { ChangePill } from '../components/ios/Pill';
import { SkeletonGroup, SkeletonList } from '../components/ios/Skeleton';
import { Sparkline } from '../components/charts/Sparkline';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { formatMoney, formatNumber, formatPct } from '../lib/format';
import { useInlineTip } from '../shell/InlineTip';
import { useShellGame } from '../shell/ShellData';
import { crewInitials } from '../shell/device';
import type { RoutedSheetProps } from '../shell/useSheet';
import { STANDINGS, STANDINGS_LABELS } from '../components/standings/copy';
import { fill } from '../components/standings/standings';
import '../components/standings/standings.css';

export interface CrewSheetProps extends RoutedSheetProps {
  crewId: string;
}

export default function CrewSheet({ open, onClose, onClosed, crewId }: CrewSheetProps) {
  const { leaderboard, loading } = useLeaderboard();
  const { game } = useShellGame();
  const symbol = game?.currency.symbol ?? 'Ð';
  const entries = (game?.phase === 'ended' && leaderboard?.final?.entries) || leaderboard?.entries || [];
  const entry = entries.find((e) => e.teamId === crewId) ?? null;

  const value = useInlineTip('accountValue');
  const total = useInlineTip('totalGain');
  const session = useInlineTip('sessionChange');
  const cash = useInlineTip('pctOfAccount');
  const holdings = useInlineTip('diversification');

  let body;
  if (!leaderboard && loading) {
    body = (
      <SkeletonGroup label={STANDINGS.loading.title}>
        <SkeletonList rows={5} rowHeight={44} />
      </SkeletonGroup>
    );
  } else if (!entry) {
    body = <EmptyState title={STANDINGS.crewNotFound} headingLevel={3} />;
  } else {
    body = (
      <>
        <div className="bx-crew__header">
          <span aria-hidden="true">
            <Crest initials={crewInitials(entry.name)} size={64} />
          </span>
          <p className="t-title-2 t-emph bx-crew__name" aria-hidden="true">{entry.name}</p>
          <p className="t-subhead bx-crew__rank num">{fill(STANDINGS.rankOf, { rank: entry.rank, n: entries.length })}</p>
        </div>
        {entry.spark.length > 1 && (
          <div className="bx-crew__spark" aria-hidden="true">
            <Sparkline values={entry.spark} width={329} height={64} fill />
          </div>
        )}
        <InsetGroupedList surface="sheet" aria-label={entry.name}>
          <KeyValueRow label={STANDINGS_LABELS.totalValue.display} info={value.button} value={<span className="num">{formatMoney(entry.totalValue, { symbol })}</span>} />
          {value.panel}
          <KeyValueRow label={STANDINGS.views.total} info={total.button} value={<ChangePill value={entry.returnPct} />} />
          {total.panel}
          <KeyValueRow label={STANDINGS.views.session} info={session.button} value={<ChangePill value={entry.sessionChangePct} />} />
          {session.panel}
          <KeyValueRow label={STANDINGS_LABELS.cashPct.short} info={cash.button} value={<span className="num">{formatPct(entry.cashPct)}</span>} />
          {cash.panel}
          <KeyValueRow label={STANDINGS_LABELS.holdings.short} info={holdings.button} value={<span className="num">{formatNumber(entry.holdings)}</span>} />
          {holdings.panel}
        </InsetGroupedList>
      </>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      onClosed={onClosed}
      title={entry?.name ?? STANDINGS.title}
      headerLayout="hidden"
      detents="fit"
      className="bx-crew-sheet"
    >
      <div className="bx-sheet-body">{body}</div>
    </Sheet>
  );
}
