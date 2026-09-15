/**
 * Pure input reducer for the Trade sheet amount keypad (MOBILE §5.16, §7.10).
 *
 * The amount is kept as the text the student typed, so partial input such as
 * "5000." survives between key presses. Two modes:
 * - `shares`: whole numbers only, no decimal key.
 * - `amount` (the "Doubloons" segment): one decimal point, at most 2 decimals.
 *
 * Values leave the reducer as integers: a share count, or INTEGER CENTS for amounts
 * (Global Constraints: money is integer cents everywhere).
 */

export type KeypadMode = 'shares' | 'amount';

export interface KeypadState {
  mode: KeypadMode;
  /** Digits as typed, with at most one "." in amount mode. Empty string = nothing typed. */
  text: string;
}

export type KeypadAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'setMode'; mode: KeypadMode }
  | { type: 'setShares'; shares: number }
  | { type: 'setCents'; cents: number };

export const KEYPAD_LIMITS = {
  /** 999,999,999 shares is far above any crew position (the largest company has 242M shares). */
  sharesMaxDigits: 9,
  /** Ð999,999,999 is far above any crew's cash (starting cash is Ð1,000,000.00). */
  amountMaxIntegerDigits: 9,
  amountMaxDecimals: 2,
} as const;

export function initialKeypadState(mode: KeypadMode): KeypadState {
  return { mode, text: '' };
}

const DIGIT = /^[0-9]$/;

function appendDigit(state: KeypadState, digit: string): KeypadState {
  if (!DIGIT.test(digit)) return state;
  const { text, mode } = state;
  const dot = text.indexOf('.');

  if (dot >= 0) {
    // amount mode, typing decimals
    if (text.length - dot - 1 >= KEYPAD_LIMITS.amountMaxDecimals) return state;
    return { mode, text: text + digit };
  }

  // whole-number part: never keep a leading zero
  if (text === '0') return digit === '0' ? state : { mode, text: digit };
  const max = mode === 'shares' ? KEYPAD_LIMITS.sharesMaxDigits : KEYPAD_LIMITS.amountMaxIntegerDigits;
  if (text.length >= max) return state;
  return { mode, text: text + digit };
}

/** Largest values the keys can type; set actions (chips, fix buttons, paste) are capped to them. */
const MAX_SHARES = 10 ** KEYPAD_LIMITS.sharesMaxDigits - 1;
const MAX_CENTS = (10 ** KEYPAD_LIMITS.amountMaxIntegerDigits - 1) * 100 + (10 ** KEYPAD_LIMITS.amountMaxDecimals - 1);

function centsToText(cents: number): string {
  // Round first, so a fraction of a cent reads as empty rather than "0"; cap so the text never
  // exceeds the digit limits or turns into exponent notation.
  const rounded = Number.isFinite(cents) ? Math.min(Math.round(cents), MAX_CENTS) : 0;
  if (rounded <= 0) return '';
  const whole = Math.floor(rounded / 100);
  const frac = rounded % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  switch (action.type) {
    case 'digit':
      return appendDigit(state, action.digit);
    case 'decimal': {
      if (state.mode !== 'amount' || state.text.includes('.')) return state;
      return { mode: state.mode, text: (state.text === '' ? '0' : state.text) + '.' };
    }
    case 'backspace': {
      if (state.text === '') return state;
      const next = state.text.slice(0, -1);
      return { mode: state.mode, text: next === '0' ? '' : next };
    }
    case 'clear':
      return state.text === '' ? state : { mode: state.mode, text: '' };
    case 'setMode':
      return action.mode === state.mode ? state : { mode: action.mode, text: '' };
    case 'setShares': {
      if (state.mode !== 'shares') return state;
      const n = Number.isFinite(action.shares) ? Math.min(Math.floor(action.shares), MAX_SHARES) : 0;
      return { mode: state.mode, text: n > 0 ? String(n) : '' };
    }
    case 'setCents':
      if (state.mode !== 'amount') return state;
      return { mode: state.mode, text: centsToText(action.cents) };
    default:
      return state;
  }
}

/** Share count (shares mode) or integer cents (amount mode). Empty input is 0. */
export function keypadValue(state: KeypadState): number {
  if (state.text === '') return 0;
  const [whole = '', frac = ''] = state.text.split('.');
  const wholeNum = whole === '' ? 0 : Number.parseInt(whole, 10);
  if (state.mode === 'shares') return wholeNum;
  const cents = frac === '' ? 0 : Number.parseInt(frac.padEnd(2, '0').slice(0, 2), 10);
  return wholeNum * 100 + cents;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** On-screen amount: "3,000" or "Ð5,000." (typed decimals are kept as typed). */
export function keypadDisplay(state: KeypadState, symbol = 'Ð'): string {
  const [whole = '', frac] = state.text.split('.');
  const grouped = groupThousands(whole === '' ? '0' : whole);
  if (state.mode === 'shares') return grouped;
  return `${symbol}${grouped}${frac === undefined ? '' : `.${frac}`}`;
}

/**
 * Screen-reader text. Spells the unit because VoiceOver may read "Ð" as "Eth" (MOBILE §10):
 * "3,000 shares", "5,000.50 doubloons".
 */
export function keypadSpoken(state: KeypadState, currencyWord = 'doubloons'): string {
  const value = keypadValue(state);
  if (state.mode === 'shares') return `${groupThousands(String(value))} ${value === 1 ? 'share' : 'shares'}`;
  const whole = groupThousands(String(Math.floor(value / 100)));
  const cents = value % 100;
  return `${cents === 0 ? whole : `${whole}.${String(cents).padStart(2, '0')}`} ${currencyWord}`;
}

/** Hardware keyboard support for the amount field (Chromebooks, iPad keyboards). */
export function keypadActionForKey(key: string): KeypadAction | null {
  if (DIGIT.test(key)) return { type: 'digit', digit: key };
  if (key === '.' || key === ',' || key === 'Decimal') return { type: 'decimal' };
  if (key === 'Backspace' || key === 'Delete') return { type: 'backspace' };
  return null;
}
