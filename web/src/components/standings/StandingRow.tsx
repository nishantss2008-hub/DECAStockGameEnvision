/** One crew in the standings (MOBILE §7.12): rank, crest, name + You, value, change pill and rank movement. */
import type { LeaderboardEntry } from '@deca/shared';
import { ListRow } from '../ios/ListRow';
import { ChangePill, ChangeTriangle, YouPill } from '../ios/Pill';
import { Crest } from '../ios/Crest';
import { InfoTipButton } from '../ios/InfoTipButton';
import { formatMoney } from '../../lib/format';
import { GLOSSARY } from '../../lib/glossary';
import { crewInitials } from '../../shell/device';
import { useSheet } from '../../shell/useSheet';
import { movement } from './reveal';
import { STANDINGS } from './copy';
import { standingRowSpoken, type StandingsView } from './standings';

export interface StandingRowProps {
  entry: LeaderboardEntry;
  you: boolean;
  view: StandingsView;
  symbol: string;
  onOpen?: () => void;
  /** Hide movement (final standings never move again). */
  showMovement?: boolean;
  id?: string;
}

export function MovementMark({ entry }: { entry: Pick<LeaderboardEntry, 'rank' | 'prevRank'> }) {
  const m = movement(entry);
  return (
    <span className="bx-standing__move t-caption-1 num" aria-hidden="true">
      {m.dir === 'flat' ? '—' : (
        <>
          <ChangeTriangle direction={m.dir} />
          {m.by}
        </>
      )}
    </span>
  );
}

export function StandingRow({ entry, you, view, symbol, onOpen, showMovement = true, id }: StandingRowProps) {
  const change = view === 'total' ? entry.returnPct : entry.sessionChangePct;
  return (
    <ListRow
      id={id}
      onClick={onOpen}
      chevron={false}
      highlighted={you}
      className="bx-standing"
      aria-label={standingRowSpoken(entry, { you, view, symbol })}
      leading={
        <span className="bx-standing__leading" aria-hidden="true">
          <span className="bx-standing__rank t-headline num">{entry.rank}</span>
          <Crest initials={crewInitials(entry.name)} size={32} />
        </span>
      }
      leadingWidth={68}
      separatorInset={96}
      title={<span className="bx-standing__name">{entry.name}</span>}
      subtitle={
        <span className="bx-standing__sub">
          {you && <YouPill>{STANDINGS.you}</YouPill>}
          <span className="num">{formatMoney(entry.totalValue, { symbol })}</span>
        </span>
      }
      trailing={
        <span className="bx-standing__trail">
          <ChangePill value={change} />
          {showMovement && <MovementMark entry={entry} />}
        </span>
      }
    />
  );
}

/** "?" that opens the glossary InfoTip sheet (`?sheet=term&id=…`). */
export function TermTip({ id, className }: { id: string; className?: string }) {
  const { open } = useSheet();
  const entry = GLOSSARY[id];
  if (!entry) return null;
  return <InfoTipButton entry={entry} className={className} onClick={() => open({ kind: 'term', id })} />;
}
