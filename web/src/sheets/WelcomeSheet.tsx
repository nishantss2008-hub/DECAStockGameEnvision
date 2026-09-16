/**
 * Welcome sheet (MOBILE §7.2, large, `?sheet=welcome`): crest, "Welcome aboard, {crew}", three rows, a primary
 * action and Skip for now. Any dismissal other than the primary action counts as Skip (never shown automatically
 * again).
 *
 * In the lobby the primary action is "Meet the market" (design 2026-09-16 §6) whenever the crew still has to
 * finish the required-once intro, because that is what gates its first order; once it is finished, the primary
 * action goes back to starting the 3-step walkthrough. Either way the walkthrough is armed, so the Portfolio
 * card is waiting when the crew lands.
 */
import { useNavigate } from 'react-router-dom';
import { DEFAULT_TICK_INTERVAL_MS } from '@deca/shared';
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
import { INTRO } from '../components/learn/introCopy';
import { introComplete, INTRO_PATH } from '../components/learn/introFlow';

const ICONS = [Briefcase, Clock, Compass];

export default function WelcomeSheet({ open, onClose, onClosed }: RoutedSheetProps) {
  const { team, game } = useShellGame();
  const walkthrough = useWalkthrough();
  const navigate = useNavigate();
  const introDone = introComplete(team);
  const crew = team?.name ?? '';
  const values = {
    crew,
    startingCash: game ? formatMoney(game.startingCapital, { symbol: game.currency.symbol }) : '—',
    tickSeconds: Math.round((game?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS) / 1000),
  };
  const skip = () => {
    if (walkthrough.welcomePending) walkthrough.dismiss();
    onClose();
  };

  /**
   * The primary action. Both branches arm the walkthrough; only the un-introduced crew leaves
   * Portfolio.
   *
   * It must NOT be `onClose()` followed by `navigate(INTRO_PATH)`. AppShell opens this sheet by
   * PUSHING `?sheet=welcome`, so `onClose()` is `navigate(-1)` — and `history.back()` is
   * asynchronous. The push would be queued first and the pending pop would then undo it, dropping
   * the crew back on Portfolio with the intro never opened (and its first order refused with
   * `intro_required`, with no way back in except Learn). Replacing the sheet's own history entry
   * has no such race: the sheet leaves the URL, the flow opens, and Back still goes to Portfolio.
   */
  const primary = () => {
    walkthrough.start();
    if (introDone) {
      onClose();
      return;
    }
    navigate(INTRO_PATH, { replace: true });
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
            onClick={primary}
          >
            {introDone ? MOBILE.welcome.start : INTRO.title}
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
