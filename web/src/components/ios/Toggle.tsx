import { forwardRef, useEffect, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { cx } from './iosCx';
import './Toggle.css';

/** True when the browser draws `<input type="checkbox" switch>` natively (Safari 17.4+). */
export function supportsNativeSwitch(inputPrototype: object | undefined): boolean {
  return inputPrototype !== undefined && 'switch' in inputPrototype;
}

const NATIVE_SWITCH = supportsNativeSwitch(typeof HTMLInputElement === 'undefined' ? undefined : HTMLInputElement.prototype);

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'role'> {
  checked: boolean;
  onChange: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Toggle (MOBILE §5.25): a native checkbox with the `switch` attribute. Where
 * the browser has no native switch (Chromium, Firefox, iOS < 17.4) it adds
 * `role="switch"` and sets `html[data-no-native-switch]` so our styled track
 * never fights Safari's own drawing. Name it with a wrapping <label> (ToggleRow)
 * or `aria-label`.
 */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { checked, onChange, className, ...rest },
  ref,
) {
  useEffect(() => {
    if (!NATIVE_SWITCH) document.documentElement.setAttribute('data-no-native-switch', '');
  }, []);

  // React has no typing for the new boolean `switch` attribute; an empty string renders it.
  const switchAttribute = { switch: '' } as Record<string, string>;

  // The wrapper's ::before is a 44px hit area around the 31px switch (MOBILE §4.4). A tap on it
  // (target = the wrapper itself) is passed to the input. Not a <label>: ToggleRow already names the
  // switch with one, and a second label element is poorly supported by assistive tech.
  return (
    <span
      className={cx('ios-toggle', className)}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const input = event.currentTarget.querySelector('input');
        if (input && !input.disabled) input.click();
      }}
    >
      <input
        {...rest}
        {...switchAttribute}
        ref={ref}
        type="checkbox"
        role={NATIVE_SWITCH ? undefined : 'switch'}
        className="ios-toggle__input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked, event)}
      />
      <span className="ios-toggle__thumb" aria-hidden="true" />
    </span>
  );
});
