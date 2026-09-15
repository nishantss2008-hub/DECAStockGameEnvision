import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle, supportsNativeSwitch } from './Toggle';
import { ToggleRow } from './ListRow';

describe('supportsNativeSwitch', () => {
  it('detects the switch property on the input prototype', () => {
    expect(supportsNativeSwitch({ switch: false })).toBe(true);
    expect(supportsNativeSwitch({})).toBe(false);
    expect(supportsNativeSwitch(undefined)).toBe(false);
  });
});

describe('Toggle', () => {
  it('is a native checkbox with the switch attribute and a switch role fallback', () => {
    render(<Toggle aria-label="Solid bars" checked={false} onChange={() => {}} />);
    const toggle = screen.getByRole('switch', { name: 'Solid bars' });
    expect(toggle.tagName).toBe('INPUT');
    expect(toggle).toHaveAttribute('type', 'checkbox');
    expect(toggle).toHaveAttribute('switch');
    expect(document.documentElement).toHaveAttribute('data-no-native-switch');
  });

  it('toggles with Space and reports the new state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <Toggle
          aria-label="Solid bars"
          checked={on}
          onChange={(next) => {
            setOn(next);
            onChange(next);
          }}
        />
      );
    }
    render(<Harness />);
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('switch', { name: 'Solid bars' })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});

describe('ToggleRow', () => {
  it('names the switch with the row title and toggles when the title is tapped', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [on, setOn] = useState(true);
      return <ToggleRow title="Solid bars" checked={on} onChange={setOn} />;
    }
    render(
      <ul>
        <Harness />
      </ul>,
    );
    const toggle = screen.getByRole('switch', { name: 'Solid bars' });
    expect(toggle).toBeChecked();
    await user.click(screen.getByText('Solid bars'));
    expect(toggle).not.toBeChecked();
  });

  it('toggles from the hit area around the switch, but not while disabled (MOBILE §4.4)', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Toggle aria-label="Solid bars" checked={false} onChange={onChange} />);
    const wrapper = container.querySelector('.ios-toggle') as HTMLElement;
    fireEvent.click(wrapper);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true, expect.anything());
    rerender(<Toggle aria-label="Solid bars" checked={false} disabled onChange={onChange} />);
    fireEvent.click(wrapper);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is named by one label only inside ToggleRow (no second, empty label element)', () => {
    render(
      <ul>
        <ToggleRow title="Solid bars" checked={false} onChange={() => {}} />
      </ul>,
    );
    const input = screen.getByRole('switch', { name: 'Solid bars' }) as HTMLInputElement;
    expect(input.labels).toHaveLength(1);
  });
});
