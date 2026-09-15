import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { useLargeText } from './largeText';
import { Menu } from './Menu';
import {
  keyToSegmentedAction,
  segmentedMenuButtonText,
  segmentedPresentation,
  segmentedReducer,
} from './segmentedReducer';
import { cx } from './iosCx';
import './SegmentedControl.css';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Text only, never icons + text (MOBILE §5.6). */
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the radiogroup, e.g. "Chart range". */
  ariaLabel: string;
  /** regular 32px, large 36px (Buy | Sell in the ticket). */
  size?: 'regular' | 'large';
  /** Radio group name; generated when omitted. */
  name?: string;
  /**
   * Word before the selection on the large-text menu button, e.g. "View" → "View: Basics"
   * (MOBILE §3.5). Defaults to `ariaLabel`. Only used when there are more than 3 segments.
   */
  menuLabel?: string;
  className?: string;
}

/**
 * SegmentedControl (MOBILE §5.6): a fieldset radiogroup of visually hidden
 * native radios with a sliding thumb. Arrow keys, Home and End go through
 * `segmentedReducer`, which wraps and skips disabled segments; only the
 * selected segment is a tab stop.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'regular',
  name,
  menuLabel,
  className,
}: SegmentedControlProps<T>) {
  const largeText = useLargeText();
  const generatedName = useId();
  const groupName = name ?? `seg-${generatedName}`;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const disabled = options.map((o) => Boolean(o.disabled));
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : disabled.indexOf(false);

  const choose = (index: number, focus: boolean) => {
    const next = segmentedReducer({ selected, disabled }, { type: 'select', index });
    if (focus) inputs.current[next.selected]?.focus();
    const option = options[next.selected];
    if (next.selected !== selected && option) onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const dir = typeof window !== 'undefined' && window.getComputedStyle(event.currentTarget).direction === 'rtl' ? 'rtl' : 'ltr';
    const action = keyToSegmentedAction(event.key, dir);
    if (!action) return;
    event.preventDefault();
    const next = segmentedReducer({ selected, disabled }, action);
    choose(next.selected, true);
  };

  const style = {
    '--seg-count': options.length,
    '--seg-index': Math.max(selected, 0),
  } as CSSProperties;

  if (segmentedPresentation(options.length, largeText) === 'menu') {
    const current = options[selected];
    const text = segmentedMenuButtonText(menuLabel ?? ariaLabel, current?.label ?? '');
    return (
      <div className={cx('ios-seg', 'ios-seg--menu', className)}>
        <Menu
          side="bottom"
          align="start"
          trigger={
            <Button variant="gray" size="medium" icon={ChevronDown} iconPosition="end">
              {text}
            </Button>
          }
          groups={[
            {
              label: ariaLabel,
              value: current?.value,
              items: options.map((option) => ({
                id: option.value,
                label: option.label,
                disabled: option.disabled,
                onSelect: () => {
                  if (option.value !== value && !option.disabled) onChange(option.value);
                },
              })),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <fieldset
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('ios-seg', size === 'large' && 'ios-seg--large', className)}
      onKeyDown={onKeyDown}
    >
      <div className="ios-seg__track" style={style}>
        {selected >= 0 && <span className="ios-seg__thumb" aria-hidden="true" />}
        {options.map((option, index) => (
          <label
            key={option.value}
            className="ios-seg__segment"
            data-selected={index === selected || undefined}
            data-disabled={option.disabled || undefined}
          >
            <input
              ref={(node) => {
                inputs.current[index] = node;
              }}
              className="ios-seg__input"
              type="radio"
              name={groupName}
              value={option.value}
              checked={index === selected}
              disabled={option.disabled}
              tabIndex={index === tabStop ? 0 : -1}
              onChange={() => choose(index, false)}
            />
            <span className="ios-seg__label">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
