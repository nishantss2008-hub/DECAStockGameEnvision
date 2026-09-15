/**
 * Keypad amount entry for the Trade sheet (MOBILE §5.16, §7.10).
 *
 * - `Keypad`: 3×4 grid of real buttons (1–9; bottom row "." in Doubloons mode or blank, 0,
 *   Delete). Keys are 48px tall (44px compact on iPhone SE), digits Title 1, pressed = 64px
 *   `--fill` circle behind the digit.
 * - `KeypadAmount`: the amount field. A real `<input inputmode="none">` so hardware keyboards
 *   (Chromebooks, iPad keyboards) type into it while the iOS keyboard never covers the ticket.
 *   The formatted amount is announced politely after 500ms idle, with the unit spelled out.
 * - `useKeypad`: `useReducer` over the pure `keypadReducer`.
 *
 * Steppers and quick chips sit between the two in the ticket and dispatch the same actions
 * (`setShares`, `setCents`).
 */
import { useEffect, useReducer, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Delete } from 'lucide-react';
import {
  initialKeypadState,
  keypadActionForKey,
  keypadDisplay,
  keypadReducer,
  keypadSpoken,
  type KeypadAction,
  type KeypadMode,
  type KeypadState,
} from './keypadReducer';
import { VISUALLY_HIDDEN } from './overlay';
import './Keypad.css';

export type { KeypadAction, KeypadMode, KeypadState } from './keypadReducer';

export function useKeypad(mode: KeypadMode) {
  return useReducer(keypadReducer, mode, initialKeypadState);
}

export interface KeypadProps {
  mode: KeypadMode;
  onKey: (action: KeypadAction) => void;
  /** Group label read by screen readers. */
  label?: string;
  deleteLabel?: string;
  decimalLabel?: string;
  disabled?: boolean;
  /** 44px keys for iPhone SE (§7.10). */
  compact?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function Keypad({
  mode,
  onKey,
  label = 'Keypad',
  deleteLabel = 'Delete',
  decimalLabel = 'Decimal point',
  disabled = false,
  compact = false,
}: KeypadProps) {
  const key = (content: string, action: KeypadAction, ariaLabel?: string) => (
    <button
      key={content}
      type="button"
      className="ios-keypad__key"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onKey(action)}
    >
      <span className="ios-keypad__glyph">{content}</span>
    </button>
  );

  return (
    <div className="ios-keypad" role="group" aria-label={label} data-compact={compact ? '' : undefined}>
      {DIGITS.map((d) => key(d, { type: 'digit', digit: d }))}
      {mode === 'amount' ? (
        key('.', { type: 'decimal' }, decimalLabel)
      ) : (
        <span className="ios-keypad__blank" aria-hidden="true" />
      )}
      {key('0', { type: 'digit', digit: '0' })}
      <button
        type="button"
        className="ios-keypad__key"
        aria-label={deleteLabel}
        disabled={disabled}
        onClick={() => onKey({ type: 'backspace' })}
      >
        <span className="ios-keypad__glyph">
          <Delete size={26} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export const AMOUNT_ANNOUNCE_DELAY_MS = 500;

export interface KeypadAmountProps {
  state: KeypadState;
  onKey: (action: KeypadAction) => void;
  /** Accessible name, e.g. "Number of shares" or "Amount in doubloons". */
  label: string;
  /** Currency symbol shown in Doubloons mode (the host can rename the currency). */
  symbol?: string;
  /** Spoken currency word (VoiceOver may read "Ð" as "Eth"). */
  currencyWord?: string;
  /** id of the helper line, e.g. "≈ Ð42,102.06 with fee". */
  describedBy?: string;
  /** Enter on a hardware keyboard (Preview order). */
  onSubmit?: () => void;
  /** Speak the formatted amount after 500ms idle (MOBILE §5.16). Default true. */
  announce?: boolean;
  disabled?: boolean;
  id?: string;
}

function parseTyped(text: string, mode: KeypadMode): KeypadAction {
  if (mode === 'shares') {
    const digits = text.replace(/[^0-9]/g, '');
    return { type: 'setShares', shares: digits === '' ? 0 : Number.parseInt(digits, 10) };
  }
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [whole = '', frac = ''] = cleaned.split('.');
  const cents = (whole === '' ? 0 : Number.parseInt(whole, 10)) * 100 + (frac === '' ? 0 : Number.parseInt(frac.padEnd(2, '0').slice(0, 2), 10));
  return { type: 'setCents', cents };
}

export function KeypadAmount({
  state,
  onKey,
  label,
  symbol = 'Ð',
  currencyWord = 'doubloons',
  describedBy,
  onSubmit,
  announce = true,
  disabled = false,
  id,
}: KeypadAmountProps) {
  const [spoken, setSpoken] = useState('');
  const first = useRef(true);

  useEffect(() => {
    if (!announce) return undefined;
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(() => setSpoken(keypadSpoken(state, currencyWord)), AMOUNT_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [announce, state, currencyWord]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      if (onSubmit) {
        event.preventDefault();
        onSubmit();
      }
      return;
    }
    const action = keypadActionForKey(event.key);
    if (!action) return;
    event.preventDefault();
    onKey(action);
  };

  // Paste, dictation and autofill arrive as a whole new value.
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onKey(parseTyped(event.target.value, state.mode));
  };

  return (
    <div className="ios-keypad-amount" data-empty={state.text === '' ? '' : undefined}>
      <input
        id={id}
        className="ios-keypad-amount__input"
        type="text"
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        value={keypadDisplay(state, symbol)}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
      />
      {announce ? (
        <span role="status" aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
          {spoken}
        </span>
      ) : null}
    </div>
  );
}
