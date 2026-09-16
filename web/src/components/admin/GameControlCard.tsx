/**
 * Control hero (MOBILE §7.17 items 2–3): time left, tick progress bar, session, engine heartbeat from /health,
 * then the phase's primary action (Start / Pause trading / Resume trading) and End game… (typed END).
 * Every action restates its consequence in an alert (COPY §11 control).
 */
import { useState } from 'react';
import type { GameState } from '@deca/shared';
import { Button } from '../ios/Button';
import { Alert } from '../ios/Alert';
import { apiPost } from '../../lib/api';
import { useCountdown } from '../../hooks/useCountdown';
import { sessionInfo } from '../../lib/gameTime';
import { fill, PHASES } from '../../shell/copy';
import { formatNumber } from '../../lib/format';
import { heartbeat, heartbeatLine, tickProgress } from './adminFormat';
import { controlActions, trackPrimaryLabel, type ControlAction } from './hostLogic';
import { HOST_PHONE, HOST_SETTINGS } from './hostCopy';
import { HostInfo } from './HostUi';
import { useHealth, useHostAction } from './useHostData';

type GameAction = Exclude<ControlAction, 'newGame'>;

const ALERTS: Record<GameAction, { title: string; body: string; button: string }> = HOST_SETTINGS.control;

export function GameControlCard({ game, onNewGame }: { game: GameState; onNewGame: () => void }) {
  const { label: timeLeft } = useCountdown(game);
  const { health, receivedAt, failed } = useHealth();
  const { run, pending } = useHostAction();
  const [confirm, setConfirm] = useState<GameAction | null>(null);
  const [lastConfirm, setLastConfirm] = useState<GameAction>('pause');

  const totalTicks = health?.totalTicks ?? game.totalTicks;
  const tick = health?.tick ?? game.currentTick;
  const progress = tickProgress(tick, totalTicks);
  const session = sessionInfo(tick, game.sessionTicks || Math.max(1, Math.round(totalTicks / 8)));
  const now = Date.now();
  const serverNowEst = health && receivedAt ? health.serverTime + (now - receivedAt) : now;
  const beat = failed
    ? { tone: 'bad' as const, label: HOST_SETTINGS.control.heartbeat.bad }
    : heartbeat({ phase: health?.phase ?? game.phase, tickIntervalMs: game.tickIntervalMs, lastTickAt: health?.lastTickAt ?? game.lastTickAt }, serverNowEst);
  const lastTickAt = health?.lastTickAt ?? game.lastTickAt;
  const beatText = heartbeatLine(beat, lastTickAt !== null && !failed ? serverNowEst - lastTickAt : null, health?.ticksBehind ?? 0);

  const { primary, secondary } = controlActions(game.phase);
  const openConfirm = (a: GameAction) => {
    setLastConfirm(a);
    setConfirm(a);
  };
  const perform = async (a: GameAction) => {
    setConfirm(null);
    await run(a, () => apiPost(`/api/admin/game/${a}`));
  };
  const alert = ALERTS[confirm ?? lastConfirm];
  const clockText = game.phase === 'ended' ? PHASES.ended.pill : fill(PHASES.countdown, { timeLeft });

  return (
    <section className="bx-host-card bx-host-hero" aria-labelledby="bx-host-hero-title">
      <h2 id="bx-host-hero-title" className="ios-sr-only">
        {HOST_PHONE.gameControl}
      </h2>
      <p className="bx-host-hero__clock">
        <span className="t-large-title t-emph num" aria-live="off">
          {clockText}
        </span>
        <HostInfo termId="timeLeft" />
      </p>
      {game.phase === 'paused' && <p className="t-footnote bx-host-muted">{PHASES.countdownPaused}</p>}
      <div className="bx-host-hero__row">
        <p className="t-subhead num">{progress.text}</p>
        <HostInfo termId="tick" />
      </div>
      <div
        className="bx-host-progress"
        role="progressbar"
        aria-label={HOST_PHONE.gameControl}
        aria-valuemin={0}
        aria-valuemax={totalTicks}
        aria-valuenow={tick}
        aria-valuetext={progress.text}
      >
        <span style={{ width: `${(progress.fraction * 100).toFixed(2)}%` }} />
      </div>
      <div className="bx-host-hero__row">
        <p className="t-subhead">{fill(HOST_PHONE.sessionOf, { session: formatNumber(session.session) })}</p>
        <HostInfo termId="session" />
      </div>
      <div className="bx-host-hero__row">
        <p className="t-footnote bx-host-beat" data-tone={beat.tone}>
          <span className="bx-host-beat__dot" aria-hidden="true" />
          {beatText}
        </p>
        <HostInfo termId="heartbeat" />
        {health && health.ticksBehind > 0 && <HostInfo termId="ticksBehind" />}
      </div>

      <div className="bx-host-actions">
        {primary && (
          <Button
            variant="filled"
            size="large"
            fullWidth
            loading={pending === primary}
            onClick={() => (primary === 'newGame' ? onNewGame() : openConfirm(primary))}
          >
            {trackPrimaryLabel(primary)}
          </Button>
        )}
        {secondary === 'end' && (
          <Button variant="tinted" tone="destructive" size="large" fullWidth loading={pending === 'end'} onClick={() => openConfirm('end')}>
            {HOST_PHONE.endGame}
          </Button>
        )}
      </div>

      <Alert
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={alert.title}
        message={alert.body}
        cancelLabel={HOST_SETTINGS.newGame.cancel}
        confirmLabel={alert.button}
        destructive={lastConfirm === 'end'}
        confirmWord={lastConfirm === 'end' ? 'END' : undefined}
        confirmWordLabel={lastConfirm === 'end' ? HOST_PHONE.typeEnd : undefined}
        onConfirm={() => void perform(lastConfirm)}
      />
    </section>
  );
}
