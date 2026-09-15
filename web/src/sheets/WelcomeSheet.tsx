/**
 * Welcome sheet (MOBILE §7.2, large, `?sheet=welcome`): crest, "Welcome aboard, {crew}", three rows, Start the
 * walkthrough / Skip for now. Any dismissal other than Start counts as Skip (never shown automatically again).
 */
import { Briefcase, Clock, Compass } from 'lucide-react';
import { Sheet } from '../components/ios/Sheet';
import { Button } from '../components/ios/Button';
import { Crest } from '../components/ios/Crest';
import type { RoutedSheetProps } from '../shell/useSheet';
import { useShellGame } from '../shell/ShellData';
import { useWalkthrough } from '../shell/useWalkthrough';
import { crewInitials } from '../shell/device';
import { formatMoney } from '../lib/format';
import { MOBILE, fill } from '../shell/copy';

const ICONS = [Briefcase, Clock, Compass];

export default function WelcomeSheet({ open, onClose, onClosed }: RoutedSheetProps) {
  const { team, game } = useShellGame();
  const walkthrough = useWalkthrough();
  const crew = team?.name ?? '';
  const values = {
    crew,
    startingCash: game ? formatMoney(game.startingCapital, { symbol: game.currency.symbol }) : '—',
    tickSeconds: game ? Math.round(game.tickIntervalMs / 1000) : 30,
  };
  const skip = () => {
    if (walkthrough.welcomePending) walkthrough.dismiss();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && skip()}
      onClosed={onClosed}
      title={fill(MOBILE.welcome.title, values)}
      headerLayout="hidden"
      detents="large"
      className="bx-welcome-sheet"
      footer={
        <div className="bx-sheet-footer">
          <Button
            variant="filled"
            size="large"
            fullWidth
            onClick={() => {
              walkthrough.start();
              onClose();
            }}
          >
            {MOBILE.welcome.start}
          </Button>
          <Button variant="plain" size="large" fullWidth onClick={skip}>
            {MOBILE.welcome.skip}
          </Button>
        </div>
      }
    >
      <div className="bx-welcome">
        <Crest initials={crewInitials(crew)} size={64} />
        <p className="t-title-1 t-emph bx-welcome__title" aria-hidden="true">
          {fill(MOBILE.welcome.title, values)}
        </p>
        <ul role="list" className="bx-welcome__rows">
          {MOBILE.welcome.rows.map((row, i) => {
            const Icon = ICONS[i]!;
            return (
              <li key={row} className="bx-welcome__row">
                <Icon size={28} className="bx-welcome__icon" aria-hidden="true" />
                <span className="t-body">{fill(row, values)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
