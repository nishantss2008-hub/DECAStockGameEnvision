/**
 * Welcome sheet (MOBILE §7.2, large, `?sheet=welcome`): crest, "Welcome aboard, {crew}", three rows, a primary
 * action and a plain second action. Any dismissal counts as an answer (never shown automatically again).
 *
 * Both branches go somewhere, because this is the first screen a student ever sees and a button that does
 * nothing is worst here:
 *
 * - **A crew that still has to finish "Meet the market"** (design 2026-09-16 §6) gets it as the primary
 *   action: that flow is what gates its first order. Second action "Skip for now" closes onto Portfolio.
 * - **A crew that has already finished it** — one signing in on a second device, or after the host sent it
 *   through again — gets "Open Markets", the same place the flow's own last card sends a crew. Until
 *   2026-09-18 this branch said "Start the walkthrough" and armed a Portfolio card that had been deleted,
 *   so it only closed the sheet. Second action "Done" closes onto Portfolio.
 */
import { useNavigate } from 'react-router-dom';
import { DEFAULT_TICK_INTERVAL_MS } from '@deca/shared';
import { Briefcase, Clock, Compass } from 'lucide-react';
import { Sheet } from '../components/ios/Sheet';
import { Button } from '../components/ios/Button';
import { Crest } from '../components/ios/Crest';
import type { RoutedSheetProps } from '../shell/useSheet';
import { useShellGame } from '../shell/ShellData';
import { useWelcome } from '../shell/useWelcome';
import { crewInitials } from '../shell/device';
import { formatMoney } from '../lib/format';
import { MOBILE, fill } from '../shell/copy';
import { INTRO } from '../components/learn/introCopy';
import { introComplete, INTRO_PATH } from '../components/learn/introFlow';

const ICONS = [Briefcase, Clock, Compass];
const MARKETS_PATH = '/markets';

export default function WelcomeSheet({ open, onClose, onClosed }: RoutedSheetProps) {
  const { team, game } = useShellGame();
  const welcome = useWelcome();
  const navigate = useNavigate();
  const introDone = introComplete(team);
  const crew = team?.name ?? '';
  const values = {
    crew,
    startingCash: game ? formatMoney(game.startingCapital, { symbol: game.currency.symbol }) : '—',
    tickSeconds: Math.round((game?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS) / 1000),
  };

  /** "Skip for now" / "Done", and every other way out: answered, and closed where the crew already is. */
  const dismiss = () => {
    welcome.markSeen();
    onClose();
  };

  /**
   * The primary action. It must NOT be `onClose()` followed by `navigate(...)`. AppShell opens this sheet by
   * PUSHING `?sheet=welcome`, so `onClose()` is `navigate(-1)` — and `history.back()` is asynchronous. The
   * push would be queued first and the pending pop would then undo it, dropping the crew back on Portfolio
   * with nothing opened (and, for a new crew, its first order refused with `intro_required` and no way back
   * in except Learn). Replacing the sheet's own history entry has no such race: the sheet leaves the URL,
   * the destination opens, and Back still goes to Portfolio. `welcomeIntro.test.tsx` pins the shape.
   */
  const primary = () => {
    welcome.markSeen();
    navigate(introDone ? MARKETS_PATH : INTRO_PATH, { replace: true });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && dismiss()}
      onClosed={onClosed}
      title={fill(MOBILE.welcome.title, values)}
      headerLayout="hidden"
      detents="large"
      className="bx-welcome-sheet"
      footer={
        <div className="bx-sheet-footer">
          <Button variant="filled" size="large" fullWidth onClick={primary}>
            {introDone ? MOBILE.welcome.explore : INTRO.title}
          </Button>
          <Button variant="plain" size="large" fullWidth onClick={dismiss}>
            {introDone ? MOBILE.done : MOBILE.welcome.skip}
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
