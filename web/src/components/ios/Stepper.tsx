import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { canDecrement, canIncrement, stepperReducer, type StepperState } from './stepperReducer';
import { cx } from './iosCx';
import './Stepper.css';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** e.g. "Decrease shares". */
  decrementLabel: string;
  /** e.g. "Increase shares". */
  incrementLabel: string;
  /** joined: 100×36 capsule (settings, host) · split: 44px circles either side of the value (ticket). */
  variant?: 'joined' | 'split';
  disabled?: boolean;
  /** Optional group name, e.g. "Quantity". */
  groupLabel?: string;
  /** id of the separate value field the buttons change. */
  controls?: string;
  /** Split variant: the amount field rendered between the buttons. */
  children?: ReactNode;
  className?: string;
}

/**
 * Stepper (MOBILE §5.24). The value is a separate field; these buttons only
 * step it. A half at its bound is `aria-disabled` (not `disabled`) so keyboard
 * focus is not dropped the moment the bound is reached. No press-and-hold repeat.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  decrementLabel,
  incrementLabel,
  variant = 'joined',
  disabled = false,
  groupLabel,
  controls,
  children,
  className,
}: StepperProps) {
  const state: StepperState = { value, min, max, step };
  const decOff = disabled || !canDecrement(state);
  const incOff = disabled || !canIncrement(state);
  const iconSize = variant === 'split' ? 20 : 17;

  const act = (type: 'increment' | 'decrement', off: boolean) => {
    if (off) return;
    const next = stepperReducer(state, { type });
    if (next !== state) onChange(next.value);
  };

  const decrement = (
    <button
      type="button"
      className="ios-stepper__button"
      aria-label={decrementLabel}
      aria-controls={controls}
      aria-disabled={decOff || undefined}
      onClick={() => act('decrement', decOff)}
    >
      <Minus size={iconSize} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
  const increment = (
    <button
      type="button"
      className="ios-stepper__button"
      aria-label={incrementLabel}
      aria-controls={controls}
      aria-disabled={incOff || undefined}
      onClick={() => act('increment', incOff)}
    >
      <Plus size={iconSize} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );

  return (
    <div role="group" aria-label={groupLabel} className={cx('ios-stepper', `ios-stepper--${variant}`, className)}>
      {decrement}
      {variant === 'split' ? <div className="ios-stepper__value">{children}</div> : <span className="ios-stepper__separator" aria-hidden="true" />}
      {increment}
    </div>
  );
}
