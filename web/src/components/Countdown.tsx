/**
 * Countdown — live HH:MM:SS remaining until the game ends.
 *
 * Renders a per-phase label:
 *   - lobby  → 'Lobby' (the voyage hasn't set sail)
 *   - ended  → 'Ended'
 *   - live   → a ticking HH:MM:SS until `endAt`; '00:00:00' once it passes.
 *
 * Drives itself off a 1s interval (a lightweight tick counter, not wall-clock
 * state) so the remaining time stays fresh without leaning on parent renders.
 */

import { useEffect, useState } from 'react';
import type { Phase } from '@deca/shared';
import { classNames } from '../lib/format';

const STYLE_ID = 'countdown-styles';
const CSS = `
.countdown {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  font-family: var(--font-heading);
  font-weight: 600;
  font-size: var(--fs-sm);
  letter-spacing: 0.04em;
  padding: 0.35em 0.7em;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(201, 161, 59, 0.35);
  background: rgba(11, 22, 34, 0.5);
  white-space: nowrap;
}
.countdown__label { color: var(--text-on-deep-muted); font-size: var(--fs-xs); }
.countdown__text { color: var(--gold-200); }
.countdown__dot {
  width: 0.5em;
  height: 0.5em;
  border-radius: 50%;
  background: var(--gold-400);
  box-shadow: 0 0 8px rgba(217, 184, 89, 0.8);
}
.countdown--live { border-color: rgba(84, 189, 134, 0.5); }
.countdown--live .countdown__dot {
  background: var(--gain-400);
  box-shadow: 0 0 8px rgba(84, 189, 134, 0.9);
  animation: countdown-pulse 1.6s ease-in-out infinite;
}
.countdown--lobby .countdown__dot { background: var(--mist-400); box-shadow: none; }
.countdown--lobby .countdown__text { color: var(--mist-300); }
.countdown--ended { border-color: rgba(192, 71, 63, 0.5); }
.countdown--ended .countdown__text { color: var(--loss-300); }
.countdown--idle .countdown__text { color: var(--text-on-deep-muted); }
@keyframes countdown-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .countdown--live .countdown__dot { animation: none; }
}
`;

function useInjectedStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

export interface CountdownProps {
  /** Epoch ms when the game ends, or null while there is no schedule. */
  endAt: number | null;
  /** Current game phase; controls the label shown instead of a clock. */
  phase?: Phase;
  /** Optional leading label, e.g. 'Voyage ends in'. */
  label?: string;
  className?: string;
}

/** Pad a number to two digits. */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Break a positive ms span into HH:MM:SS (hours may exceed 99). */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function Countdown({
  endAt,
  phase,
  label,
  className,
}: CountdownProps) {
  useInjectedStyles();

  // A simple monotonically increasing tick to force a re-render each second.
  const [, setTick] = useState(0);

  const isLive = phase === undefined ? endAt != null : phase === 'live';

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isLive]);

  if (phase === 'lobby') {
    return (
      <span className={classNames('countdown countdown--lobby', className)}>
        <span className="countdown__dot" aria-hidden="true" />
        <span className="countdown__text">Lobby</span>
      </span>
    );
  }

  if (phase === 'ended') {
    return (
      <span className={classNames('countdown countdown--ended', className)}>
        <span className="countdown__text">Ended</span>
      </span>
    );
  }

  if (phase === 'paused') {
    return (
      <span className={classNames('countdown countdown--lobby', className)} title="The voyage is paused">
        <span className="countdown__dot" aria-hidden="true" />
        <span className="countdown__text">Paused</span>
      </span>
    );
  }

  if (endAt == null) {
    return (
      <span className={classNames('countdown countdown--idle', className)}>
        <span className="countdown__text mono">--:--:--</span>
      </span>
    );
  }

  const remaining = endAt - Date.now();
  const expired = remaining <= 0;

  return (
    <span
      className={classNames(
        'countdown',
        expired ? 'countdown--ended' : 'countdown--live',
        className,
      )}
      title="Time remaining in the voyage"
    >
      {label && <span className="countdown__label">{label}</span>}
      <span className="countdown__dot" aria-hidden="true" />
      <span className="countdown__text mono numeric">
        {expired ? 'Ended' : formatRemaining(remaining)}
      </span>
    </span>
  );
}
