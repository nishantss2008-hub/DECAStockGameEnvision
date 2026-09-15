/**
 * useWalkthrough(): the crew's walkthrough state (walkthrough.ts), stored in localStorage `bx.walkthrough.{teamId}`.
 * The provider lives in AppShell (keyed by teamId, so a different crew on the same device reads its own state), so the Welcome sheet, the Portfolio card, Learn and Account share one state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { INITIAL_WALKTHROUGH, WALKTHROUGH_STEPS, parseWalkthrough, walkthroughKey, walkthroughReducer, type WalkthroughState } from './walkthrough';

export interface WalkthroughApi {
  /** The 3-step card is visible. */
  open: boolean;
  /** 0-based step. */
  step: number;
  steps: number;
  /** First sign-in: the Welcome sheet has not been answered yet. */
  welcomePending: boolean;
  state: WalkthroughState;
  start: () => void;
  /** Reopen at step 1 (Learn › How to play, Account › How to play). */
  show: () => void;
  dismiss: () => void;
  next: () => void;
  back: () => void;
  restore: (state: WalkthroughState) => void;
}

const Ctx = createContext<WalkthroughApi | null>(null);

function read(teamId: string | null): WalkthroughState {
  if (!teamId) return INITIAL_WALKTHROUGH;
  try {
    return parseWalkthrough(localStorage.getItem(walkthroughKey(teamId)));
  } catch {
    return INITIAL_WALKTHROUGH;
  }
}

export function WalkthroughProvider({ teamId, children }: { teamId: string | null; children: ReactNode }) {
  const [state, dispatch] = useReducer(walkthroughReducer, teamId, read);

  useEffect(() => {
    if (!teamId) return;
    try {
      localStorage.setItem(walkthroughKey(teamId), JSON.stringify(state));
    } catch {
      // Storage blocked: the walkthrough still works for this visit.
    }
  }, [teamId, state]);

  const start = useCallback(() => dispatch({ type: 'start' }), []);
  const show = useCallback(() => dispatch({ type: 'show' }), []);
  const dismiss = useCallback(() => dispatch({ type: 'hide' }), []);
  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const restore = useCallback((s: WalkthroughState) => dispatch({ type: 'restore', state: s }), []);

  const value = useMemo<WalkthroughApi>(
    () => ({
      open: state.status === 'active',
      step: state.step,
      steps: WALKTHROUGH_STEPS,
      welcomePending: state.status === 'new',
      state,
      start,
      show,
      dismiss,
      next,
      back,
      restore,
    }),
    [state, start, show, dismiss, next, back, restore],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const noop = () => {};
const FALLBACK: WalkthroughApi = {
  open: false,
  step: 0,
  steps: WALKTHROUGH_STEPS,
  welcomePending: false,
  state: { status: 'hidden', step: 0 },
  start: noop,
  show: noop,
  dismiss: noop,
  next: noop,
  back: noop,
  restore: noop,
};

export function useWalkthrough(): WalkthroughApi {
  return useContext(Ctx) ?? FALLBACK;
}
