import { afterEach, describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

type Range = '1H' | '6H' | '24H' | 'All';
const OPTIONS: SegmentedOption<Range>[] = [
  { value: '1H', label: '1H' },
  { value: '6H', label: '6H' },
  { value: '24H', label: '24H', disabled: true },
  { value: 'All', label: 'All' },
];

function Harness({ onChange }: { onChange?: (v: Range) => void }) {
  const [value, setValue] = useState<Range>('1H');
  return (
    <SegmentedControl
      ariaLabel="Chart range"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('exposes a labelled radiogroup of radios with the selected one checked', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Chart range' });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(screen.getByRole('radio', { name: '1H' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '6H' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '24H' })).toBeDisabled();
  });

  it('keeps one tab stop on the selected segment', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '1H' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '6H' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection and focus with arrow keys, skipping disabled segments and wrapping', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: '1H' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '6H' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '6H' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: '1H' })).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['6H', 'All', '1H', 'All']);
  });

  it('jumps with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: '1H' })).toBeChecked();
  });

  it('selects on click but never selects a disabled segment', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByText('6H'));
    expect(screen.getByRole('radio', { name: '6H' })).toBeChecked();
    await user.click(screen.getByText('24H'));
    expect(screen.getByRole('radio', { name: '24H' })).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('SegmentedControl at large text sizes (MOBILE §3.5)', () => {
  type View = 'basics' | 'price' | 'value' | 'health' | 'analysts';
  const VIEWS: SegmentedOption<View>[] = [
    { value: 'basics', label: 'Basics' },
    { value: 'price', label: 'Price' },
    { value: 'value', label: 'Value' },
    { value: 'health', label: 'Health' },
    { value: 'analysts', label: 'Analysts' },
  ];

  function ViewHarness({ onChange }: { onChange?: (v: View) => void }) {
    const [value, setValue] = useState<View>('basics');
    return (
      <SegmentedControl
        ariaLabel="Company list view"
        menuLabel="View"
        options={VIEWS}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-large-text');
  });

  it('keeps segments at default sizes', () => {
    render(<ViewHarness />);
    expect(screen.getByRole('radiogroup', { name: 'Company list view' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View: Basics' })).toBeNull();
  });

  it('becomes a "View: Basics" menu button with checked radio items when the root text is large', async () => {
    document.documentElement.setAttribute('data-large-text', '');
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewHarness onChange={onChange} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'View: Basics' });
    expect(trigger).toHaveTextContent('View: Basics');
    await user.click(trigger);
    await screen.findByRole('menu');
    expect(screen.getByRole('menuitemradio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Health' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('health');
    await waitFor(() => expect(screen.getByRole('button', { name: 'View: Health' })).toBeInTheDocument());
  });

  it('switches live when the shell toggles html[data-large-text]', async () => {
    render(<ViewHarness />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    act(() => document.documentElement.setAttribute('data-large-text', ''));
    await waitFor(() => expect(screen.getByRole('button', { name: 'View: Basics' })).toBeInTheDocument());
  });
});
