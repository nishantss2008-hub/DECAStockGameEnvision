/**
 * Pure clamp/step logic for Stepper (MOBILE §5.24): ±1 share or ±Ð100 in the
 * ticket, whole numbers in host settings. No press-and-hold repeat.
 */

export interface StepperState {
  value: number;
  min: number;
  /** Use Number.POSITIVE_INFINITY for no upper bound. */
  max: number;
  step: number;
}

export type StepperAction = { type: 'increment' } | { type: 'decrement' } | { type: 'set'; value: number };

function safeStep(step: number): number {
  return Number.isFinite(step) && step > 0 ? step : 1;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const exp = /e-(\d+)$/.exec(text);
  if (exp) return Number(exp[1]);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Clamps into [min, max] and strips floating-point noise to the step's precision. */
export function clampStep(value: number, min: number, max: number, step = 1): number {
  if (Number.isNaN(value)) return min;
  const bounded = Math.min(max, Math.max(min, value));
  if (!Number.isFinite(bounded)) return bounded;
  const digits = decimalsOf(safeStep(step));
  const factor = 10 ** digits;
  return Math.round(bounded * factor) / factor;
}

export function stepperReducer(state: StepperState, action: StepperAction): StepperState {
  const step = safeStep(state.step);
  let next: number;
  switch (action.type) {
    case 'increment':
      next = clampStep(state.value + step, state.min, state.max, step);
      break;
    case 'decrement':
      next = clampStep(state.value - step, state.min, state.max, step);
      break;
    case 'set':
      next = Number.isNaN(action.value) ? state.value : clampStep(action.value, state.min, state.max, step);
      break;
  }
  return next === state.value ? state : { ...state, value: next };
}

export function canDecrement(state: StepperState): boolean {
  return state.value > state.min;
}

export function canIncrement(state: StepperState): boolean {
  return state.value < state.max;
}
