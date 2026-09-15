/**
 * "Sails up" market-open moment (MOBILE §6.3, §8.2): 1.2s full-screen hull card when the phase changes to live
 * while the app is open. Skipped under reduced motion, over an open sheet or a focused field; never takes focus;
 * a tap dismisses it. The phase banner and status line carry the change for assistive tech.
 */
import { useEffect, useRef, useState } from 'react';
import type { Phase } from '@deca/shared';
import { CompassRose } from '../components/ios/CompassRose';
import { useShellGame } from './ShellData';
import { useSheet } from './useSheet';
import { shouldShowSailsUp } from './marketStatus';
import { PHASES } from './copy';

const DURATION_MS = 1200;

function fieldFocused(): boolean {
  const el = document.activeElement;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable));
}

export function SailsUp() {
  const { game } = useShellGame();
  const { sheet } = useSheet();
  const prev = useRef<Phase | undefined>(undefined);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const phase = game?.phase;
    if (phase === undefined) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (shouldShowSailsUp({ prevPhase: prev.current, phase, reducedMotion, sheetOpen: Boolean(sheet), fieldFocused: fieldFocused() })) {
      setVisible(true);
    }
    prev.current = phase;
    // Only phase changes matter; a sheet opening later must not replay the moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.phase]);

  useEffect(() => {
    if (!visible) return undefined;
    const id = setTimeout(() => setVisible(false), DURATION_MS);
    return () => clearTimeout(id);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="bx-sails-up" aria-hidden="true" onClick={() => setVisible(false)}>
      <CompassRose size={96} className="bx-sails-up__rose" />
      <p className="bx-sails-up__title">{PHASES.live.pill}</p>
      <p className="bx-sails-up__flavor">{PHASES.live.flavor}</p>
    </div>
  );
}
