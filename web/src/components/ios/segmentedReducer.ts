/**
 * Pure keyboard-navigation logic for SegmentedControl (MOBILE §5.6).
 *
 * Arrow keys move the selection (radio-group behaviour, wrapping around and
 * skipping disabled segments); Home and End jump to the first and last
 * enabled segment. The component turns the resulting index into onChange().
 */

export interface SegmentedState {
  /** Selected segment index, or -1 when the value matches no segment. */
  selected: number;
  /** One entry per segment; true when that segment cannot be chosen. */
  disabled: readonly boolean[];
}

export type SegmentedAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'select'; index: number };

function firstEnabled(disabled: readonly boolean[]): number {
  return disabled.findIndex((d) => !d);
}

function lastEnabled(disabled: readonly boolean[]): number {
  for (let i = disabled.length - 1; i >= 0; i -= 1) if (!disabled[i]) return i;
  return -1;
}

function stepFrom(state: SegmentedState, delta: 1 | -1): number {
  const { selected, disabled } = state;
  const count = disabled.length;
  if (count === 0) return selected;
  if (selected < 0 || selected >= count) {
    return delta === 1 ? firstEnabled(disabled) : lastEnabled(disabled);
  }
  for (let hop = 1; hop < count; hop += 1) {
    const i = (((selected + delta * hop) % count) + count) % count;
    if (!disabled[i]) return i;
  }
  return selected;
}

export function segmentedReducer(state: SegmentedState, action: SegmentedAction): SegmentedState {
  let next: number;
  switch (action.type) {
    case 'next':
      next = stepFrom(state, 1);
      break;
    case 'prev':
      next = stepFrom(state, -1);
      break;
    case 'first':
      next = firstEnabled(state.disabled);
      break;
    case 'last':
      next = lastEnabled(state.disabled);
      break;
    case 'select': {
      const { index } = action;
      const valid = Number.isInteger(index) && index >= 0 && index < state.disabled.length && !state.disabled[index];
      next = valid ? index : state.selected;
      break;
    }
  }
  if (next < 0 || next === state.selected) return state;
  return { ...state, selected: next };
}

/** Maps a KeyboardEvent.key to a reducer action (null for keys the control does not handle). */
export function keyToSegmentedAction(key: string, dir: 'ltr' | 'rtl' = 'ltr'): SegmentedAction | null {
  switch (key) {
    case 'ArrowRight':
      return { type: dir === 'rtl' ? 'prev' : 'next' };
    case 'ArrowLeft':
      return { type: dir === 'rtl' ? 'next' : 'prev' };
    case 'ArrowDown':
      return { type: 'next' };
    case 'ArrowUp':
      return { type: 'prev' };
    case 'Home':
      return { type: 'first' };
    case 'End':
      return { type: 'last' };
    default:
      return null;
  }
}

/**
 * MOBILE §3.5: at large text sizes (root ≥23px) a SegmentedControl with more than 3 segments
 * becomes a menu button ("View: Basics ▾"), because five narrow segments cannot hold 17–31px labels.
 */
export const SEGMENTED_MAX_AT_LARGE_TEXT = 3;

export function segmentedPresentation(count: number, largeText: boolean): 'segments' | 'menu' {
  return largeText && count > SEGMENTED_MAX_AT_LARGE_TEXT ? 'menu' : 'segments';
}

/** Visible text (and accessible name) of the large-text menu button: "View: Basics". */
export function segmentedMenuButtonText(prefix: string, selectedLabel: string): string {
  return `${prefix}: ${selectedLabel}`;
}
