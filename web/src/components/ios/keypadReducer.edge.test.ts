/**
 * Keypad reducer edge cases: values set from outside the keys (chips, fix buttons, paste,
 * dictation) must respect the same digit limits as typing.
 */
import { describe, it, expect } from 'vitest';
import { KEYPAD_LIMITS, initialKeypadState, keypadDisplay, keypadReducer, keypadValue } from './keypadReducer';

const MAX_SHARES = 10 ** KEYPAD_LIMITS.sharesMaxDigits - 1;
const MAX_CENTS = (10 ** KEYPAD_LIMITS.amountMaxIntegerDigits - 1) * 100 + 99;

describe('keypadReducer: set actions respect the digit limits', () => {
  it('caps a pasted share count at the largest typeable value', () => {
    const s = keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: 12_345_678_901 });
    expect(s.text).toHaveLength(KEYPAD_LIMITS.sharesMaxDigits);
    expect(keypadValue(s)).toBe(MAX_SHARES);
  });

  it('never stores exponent text for enormous share counts', () => {
    const s = keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: 1e21 });
    expect(s.text).toMatch(/^\d+$/);
    expect(keypadValue(s)).toBe(MAX_SHARES);
    expect(keypadDisplay(s)).toBe('999,999,999');
  });

  it('caps a pasted amount at the largest typeable value', () => {
    const s = keypadReducer(initialKeypadState('amount'), { type: 'setCents', cents: 1e25 });
    expect(s.text).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(keypadValue(s)).toBe(MAX_CENTS);
  });

  it('treats an amount that rounds to zero cents as empty, not "0"', () => {
    expect(keypadReducer(initialKeypadState('amount'), { type: 'setCents', cents: 0.4 }).text).toBe('');
    expect(keypadReducer(initialKeypadState('amount'), { type: 'setCents', cents: -0 }).text).toBe('');
    expect(keypadReducer(initialKeypadState('amount'), { type: 'setCents', cents: 0.6 }).text).toBe('0.01');
  });

  it('ignores infinite share counts', () => {
    expect(keypadReducer(initialKeypadState('shares'), { type: 'setShares', shares: Number.POSITIVE_INFINITY }).text).toBe('');
  });
});
