import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stepper } from './Stepper';

function Harness({ initial = 1, min = 0, max = 3, onChange }: { initial?: number; min?: number; max?: number; onChange?: (v: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Stepper
        value={value}
        min={min}
        max={max}
        decrementLabel="Decrease shares"
        incrementLabel="Increase shares"
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('Stepper', () => {
  it('labels both buttons and steps the value', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Increase shares' }));
    expect(screen.getByTestId('value')).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Decrease shares' }));
    await user.click(screen.getByRole('button', { name: 'Decrease shares' }));
    expect(screen.getByTestId('value')).toHaveTextContent('0');
  });

  it('marks the half at a bound as disabled but keeps it focusable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={0} onChange={onChange} />);
    const dec = screen.getByRole('button', { name: 'Decrease shares' });
    expect(dec).toHaveAttribute('aria-disabled', 'true');
    expect(dec).not.toBeDisabled();
    await user.tab();
    expect(dec).toHaveFocus();
    await user.click(dec);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works from the keyboard and keeps focus when a bound is reached', async () => {
    const user = userEvent.setup();
    render(<Harness initial={2} />);
    const inc = screen.getByRole('button', { name: 'Increase shares' });
    inc.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('3');
    expect(inc).toHaveAttribute('aria-disabled', 'true');
    expect(inc).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByTestId('value')).toHaveTextContent('3');
  });

  it('renders the split variant around the value field', () => {
    render(
      <Stepper variant="split" value={5} onChange={() => {}} decrementLabel="Decrease shares" incrementLabel="Increase shares">
        <input aria-label="Shares" defaultValue="5" />
      </Stepper>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Decrease shares', 'Increase shares']);
    expect(screen.getByRole('textbox', { name: 'Shares' })).toBeInTheDocument();
  });
});
