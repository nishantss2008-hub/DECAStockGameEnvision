/**
 * Market status sheet (MOBILE §7.9, medium, `?sheet=status`): phase title + flavor, time left, session line with an
 * 8-segment bar, tick stamp, phase body and "How the game works". Session and Tick expand inline.
 */
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Sheet } from '../components/ios/Sheet';
import { InfoTipButton } from '../components/ios/InfoTipButton';
import { InfoTipLines } from '../components/ios/InfoTipSheet';
import { InsetGroupedList } from '../components/ios/InsetGroupedList';
import { DisclosureRow, KeyValueRow } from '../components/ios/ListRow';
import { CompassLoader } from '../components/ios/CompassRose';
import type { RoutedSheetProps } from '../shell/useSheet';
import { useShellGame, useShellNow } from '../shell/ShellData';
import { statusSheetModel } from '../shell/marketStatus';
import { useInlineTip } from '../shell/InlineTip';
import { GLOSSARY } from '../lib/glossary';
import { LOADING, SHELL } from '../shell/copy';

/**
 * The session line is a caption under the clock, not a row, so its "?" expands into a plain block rather than
 * the `<li>` `useInlineTip` returns. Printing the session as both a caption and a row (as this sheet used to)
 * spent 68px on one sentence in a sheet the student cannot resize.
 */
function useSessionTip() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = GLOSSARY.session;
  if (!entry) return { button: null, panel: null };
  return {
    button: <InfoTipButton entry={entry} mode="inline" expanded={open} controls={id} onClick={() => setOpen((o) => !o)} />,
    panel: open ? (
      <div className="bx-inline-tip" id={id}>
        <InfoTipLines entry={entry} density="inline" headingLevel={4} />
      </div>
    ) : null,
  };
}

export default function StatusSheet({ open, onClose, onClosed }: RoutedSheetProps) {
  const { game } = useShellGame();
  const now = useShellNow();
  const navigate = useNavigate();
  const sessionTip = useSessionTip();
  const tickTip = useInlineTip('tick');
  const m = game ? statusSheetModel(game, now) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      onClosed={onClosed}
      title={m?.title ?? LOADING.generic.title}
      subtitle={m?.flavor}
      headerLayout="leading"
      detents="medium"
      className="bx-status-sheet"
    >
      {!m ? (
        <CompassLoader label={LOADING.generic.title} flavor={LOADING.generic.flavor} />
      ) : (
        <div className="bx-sheet-body">
          <p className="t-large-title t-emph num bx-status-sheet__left">{m.timeLeft}</p>
          <p className="t-subhead bx-status-sheet__session">
            {m.sessionLine}
            {sessionTip.button}
          </p>
          <div className="bx-session-bar" aria-hidden="true">
            {Array.from({ length: m.sessions }, (_, i) => (
              <span key={i} data-state={i + 1 < m.session ? 'done' : i + 1 === m.session ? 'current' : 'todo'} />
            ))}
          </div>
          {sessionTip.panel}
          <p className="t-body bx-status-sheet__body">{m.body}</p>
          <InsetGroupedList surface="sheet" aria-label={SHELL.howGameWorks}>
            {m.tickLine && <KeyValueRow label={GLOSSARY.tick?.label ?? 'Tick'} info={tickTip.button} value={m.tickLine} valueTone="secondary" stacked />}
            {tickTip.panel}
            <DisclosureRow
              title={SHELL.howGameWorks}
              icon={BookOpen}
              onClick={() => {
                navigate('/learn/guide', { replace: true });
              }}
            />
          </InsetGroupedList>
        </div>
      )}
    </Sheet>
  );
}
