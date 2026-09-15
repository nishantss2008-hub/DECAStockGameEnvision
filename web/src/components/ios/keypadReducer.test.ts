import { describe, it, expect } from 'vitest';
import {
  KEYPAD_LIMITS,
  initialKeypadState,
  keypadActionForKey,
  keypadDisplay,
  keypadReducer,
  keypadSpoken,
  keypadValue,
  type KeypadAction,
  type KeypadMode,
  type KeypadState,
} from './keypadReducer';

function press(mode: KeypadMode, ...actions: KeypadAction[]): KeypadState {
  return actions.reduce(keypadReducer, initialKeypadState(mode));
}
const d = (digit: string): KeypadAction => ({ type: 'digit', digit });
const typeText = (mode: KeypadMode, text: string): KeypadState =>
  press(mode, ...[...text].map((ch) => (ch === '.' ? ({ type: 'decimal' } as const) : d(ch))));

describe('keypadReducer: shares mode', () => {
  it('builds whole numbers digit by digit', () => {
    const s = typeText('shares', '500');
    expect(s.text).toBe('500');
    expect(keypadValue(s)).toBe(500);
    expect(keypadDisplay(s)).toBe('500');
  });

  it('never keeps a leading zero', () => {
    expect(typeText('shares', '0').text).toBe('0');
    expect(typeText('shares', '05').text).toBe('5');
    expect(typeText('shares', '000').text).toBe('0');
  });

  it('ignores the decimal key', () => {
    const s = typeText('shares', '12.5');
    expect(s.text).toBe('125');
    const before = typeText('shares', '12');
    expect(keypadReducer(before, { type: 'decimal' })).toBe(before);
  });

  it('stops at the maximum number of digits', () => {
    const full = typeText('shares', '9'.repeat(KEYPAD_LIMITS.sharesMaxDigits));
    expect(full.text).toHaveLength(KEYPAD_LIMITS.sharesMaxDigits);
    expect(keypadReducer(full, d('9'))).toBe(full);
  });

  it('groups thousands in the display and spells the unit for screen readers', () => {
    const s = typeText('shares', '3000');
    expect(keypadDisplay(s)).toBe('3,000');
    expect(keypadSpoken(s)).toBe('3,000 shares');
    expect(keypadSpoken(typeText('shares', '1'))).toBe('1 share');
  });

  it('shows 0 when empty', () => {
    const s = initialKeypadState('shares');
    expect(keypadDisplay(s)).toBe('0');
    expect(keypadValue(s)).toBe(0);
  });

  it('ignores anything that is not a single digit', () => {
    const s = typeText('shares', '4');
    expect(keypadReducer(s, d('x'))).toBe(s);
    expect(keypadReducer(s, d('12'))).toBe(s);
  });
});

describe('keypadReducer: doubloons (amount) mode', () => {
  it('accepts one decimal point and up to two decimals', () => {
    const s = typeText('amount', '4963.089');
    expect(s.text).toBe('4963.08');
    expect(keypadValue(s)).toBe(496_308);
    const twoPoints = typeText('amount', '5.0.1');
    expect(twoPoints.text).toBe('5.01');
  });

  it('starts with 0. when the decimal key comes first', () => {
    const s = typeText('amount', '.5');
    expect(s.text).toBe('0.5');
    expect(keypadValue(s)).toBe(50);
  });

  it('keeps a zero before the decimal point', () => {
    expect(typeText('amount', '0.05').text).toBe('0.05');
    expect(keypadValue(typeText('amount', '0.05'))).toBe(5);
  });

  it('caps the whole-number part but still allows decimals', () => {
    const full = typeText('amount', '9'.repeat(KEYPAD_LIMITS.amountMaxIntegerDigits));
    expect(keypadReducer(full, d('1'))).toBe(full);
    const withCents = keypadReducer(keypadReducer(full, { type: 'decimal' }), d('5'));
    expect(withCents.text).toBe(`${'9'.repeat(KEYPAD_LIMITS.amountMaxIntegerDigits)}.5`);
  });

  it('formats with the currency symbol and keeps typed decimals', () => {
    expect(keypadDisplay(typeText('amount', '5000'), 'Ð')).toBe('Ð5,000');
    expect(keypadDisplay(typeText('amount', '5000.'), 'Ð')).toBe('Ð5,000.');
    expect(keypadDisplay(typeText('amount', '5000.5'), 'Ð')).toBe('Ð5,000.5');
    expect(keypadDisplay(initialKeypadState('amount'), 'Ð')).toBe('Ð0');
    expect(keypadDisplay(typeText('amount', '12'), 'P$')).toBe('P$12');
  });

  it('spells the currency word for screen readers instead of the symbol', () => {
    expect(keypadSpoken(typeText('amount', '5000'))).toBe('5,000 doubloons');
    expect(keypadSpoken(typeText('amount', '5000.5'), 'pieces of eight')).toBe('5,000.50 pieces of eight');
  });

  it('converts to integer cents without floating point drift', () => {
    expect(keypadValue(typeText('amount', '0.29'))).toBe(29);
    expect(keypadValue(typeText('amount', '1.1'))).toBe(110);
    expect(keypadValue(typeText('amount', '84.12'))).toBe(8412);
  });
});

describe('keypadReducer: backspace, clear and set', () => {
  it('removes the last character', () => {
    expect(keypadReducer(typeText('shares', '500'), { type: 'backspace' }).text).toBe('50');
    expect(keypadReducer(typeText('amount', '12.34'), { type: 'backspace' }).text).toBe('12.3');
    expect(keypadReducer(typeText('amount', '12.'), { type: 'backspace' }).text).toBe('12');
  });

  it('empties the field instead of leaving a lone zero', () => {
    expect(keypadReducer(typeText('amount', '0.'), { type: 'backspace' }).text).toBe('');
    expect(keypadReducer(typeText('shares', '7'), { type: 'backspace' }).text).toBe('');
  });

  it('does nothing on an empty field', () => {
    const empty = initialKeypadState('shares');
    expect(keypadReducer(empty, { type: 'backspace' })).toBe(empty);
  });

  it('clears', () => {
    expect(keypadReducer(typeText('amount', '99.5'), { type: 'clear' }).text).toBe('');
  });

  it('switching mode clears the amount', () => {
    const s = keypadReducer(typeText('shares', '500'), { type: 'setMode', mode: 'amount' });
    expect(s).toEqual({ mode: 'amount', text: '' });
    const same = typeText('shares', '5');
    expect(keypadReducer(same, { type: 'setMode', mode: 'shares' })).toBe(same);
  });

  it('sets whole shares from chips and fix buttons', () => {
    expect(keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: 2949 }).text).toBe('2949');
    expect(keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: 12.9 }).text).toBe('12');
    expect(keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: 0 }).text).toBe('');
    expect(keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: -4 }).text).toBe('');
  });

  it('sets an amount from integer cents', () => {
    const set = (cents: number) => keypadReducer(initialKeypadState('amount'), { type: 'setCents', cents }).text;
    expect(set(500_000)).toBe('5000');
    expect(set(496_308)).toBe('4963.08');
    expect(set(496_310)).toBe('4963.10');
    expect(set(5)).toBe('0.05');
    expect(set(0)).toBe('');
    expect(set(Number.NaN)).toBe('');
  });

  it('set actions in the wrong mode switch nothing and are ignored', () => {
    const shares = typeText('shares', '10');
    expect(keypadReducer(shares, { type: 'setCents', cents: 100 })).toBe(shares);
    const amount = typeText('amount', '10');
    expect(keypadReducer(amount, { type: 'setShares', shares: 3 })).toBe(amount);
  });
});

describe('keypadActionForKey (hardware keyboards)', () => {
  it('maps digits, decimal separators and delete keys', () => {
    expect(keypadActionForKey('7')).toEqual({ type: 'digit', digit: '7' });
    expect(keypadActionForKey('.')).toEqual({ type: 'decimal' });
    expect(keypadActionForKey(',')).toEqual({ type: 'decimal' });
    expect(keypadActionForKey('Backspace')).toEqual({ type: 'backspace' });
    expect(keypadActionForKey('Delete')).toEqual({ type: 'backspace' });
  });

  it('ignores other keys so Tab, arrows and Enter keep working', () => {
    for (const key of ['Tab', 'ArrowLeft', 'Enter', 'a', 'Shift', ' ']) expect(keypadActionForKey(key)).toBeNull();
  });
});
