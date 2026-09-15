/**
 * Walkthrough state (MOBILE §7.2, §6.4): 'new' = the Welcome sheet is still pending, 'active' = the 3-step card
 * shows on Portfolio, 'hidden' = skipped or dismissed (never shown automatically again; Learn › How to play and
 * Account › How to play reopen it). Stored per crew in localStorage.
 */
export const WALKTHROUGH_STEPS = 3;

export type WalkthroughStatus = 'new' | 'active' | 'hidden';
export interface WalkthroughState {
  status: WalkthroughStatus;
  step: number;
}

export type WalkthroughAction =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'hide' }
  | { type: 'show' }
  | { type: 'restore'; state: WalkthroughState };

export const INITIAL_WALKTHROUGH: WalkthroughState = { status: 'new', step: 0 };

const clampStep = (n: number) => Math.min(WALKTHROUGH_STEPS - 1, Math.max(0, Math.trunc(n)));

export function walkthroughReducer(state: WalkthroughState, action: WalkthroughAction): WalkthroughState {
  switch (action.type) {
    case 'start':
    case 'show':
      return { status: 'active', step: 0 };
    case 'next':
      return state.status === 'active' ? { ...state, step: clampStep(state.step + 1) } : state;
    case 'back':
      return state.status === 'active' ? { ...state, step: clampStep(state.step - 1) } : state;
    case 'hide':
      return { ...state, status: 'hidden' };
    case 'restore':
      return { status: action.state.status, step: clampStep(action.state.step) };
    default:
      return state;
  }
}

export const walkthroughKey = (teamId: string) => `bx.walkthrough.${teamId}`;

export function parseWalkthrough(raw: string | null): WalkthroughState {
  if (!raw) return INITIAL_WALKTHROUGH;
  try {
    const value: unknown = JSON.parse(raw);
    // An older build stored a plain "dismissed" flag.
    if (value === 'dismissed') return { status: 'hidden', step: 0 };
    if (value && typeof value === 'object') {
      const { status, step } = value as { status?: unknown; step?: unknown };
      if ((status === 'new' || status === 'active' || status === 'hidden') && typeof step === 'number' && Number.isFinite(step)) {
        return { status, step: clampStep(step) };
      }
    }
  } catch {
    // Corrupt value: start over.
  }
  return INITIAL_WALKTHROUGH;
}
