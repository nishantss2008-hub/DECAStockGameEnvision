import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Keypad, KeypadAmount, useKeypad } from './Keypad';
import type { KeypadMode } from './keypadReducer';

function Ticket({ mode, onSubmit }: { mode: KeypadMode; onSubmit?: () => void }) {
  const [state, dispatch] = useKeypad(mode);
  return (
    <div>
      <KeypadAmount
        state={state}
        onKey={dispatch}
        label={mode === 'shares' ? 'Number of shares' : 'Amount in doubloons'}
        describedBy="helper"
        onSubmit={onSubmit}
      />
      <p id="helper">≈ Ð42,102.06 with fee</p>
      <Keypad mode={mode} onKey={dispatch} />
    </div>
  );
}

describe('Keypad', () => {
  it('enters shares with labelled keys and has no decimal key', async () => {
    const user = userEvent.setup();
    render(<Ticket mode="shares" />);
    const pad = screen.getByRole('group', { name: 'Keypad' });
    expect(within(pad).queryByRole('button', { name: 'Decimal point' })).not.toBeInTheDocument();
    expect(within(pad).getAllByRole('button')).toHaveLength(11);

    for (const k of ['5', '0', '0']) await user.click(within(pad).getByRole('button', { name: k }));
    const field = screen.getByRole('textbox', { name: 'Number of shares' });
    expect(field).toHaveValue('500');
    expect(field).toHaveAttribute('inputmode', 'none');
    expect(field).toHaveAccessibleDescription('≈ Ð42,102.06 with fee');

    await user.click(within(pad).getByRole('button', { name: 'Delete' }));
    expect(field).toHaveValue('50');
  });

  it('enters doubloons with the decimal key and formats them', async () => {
    const user = userEvent.setup();
    render(<Ticket mode="amount" />);
    const pad = screen.getByRole('group', { name: 'Keypad' });
    for (const k of ['5', '0', '0', '0']) await user.click(within(pad).getByRole('button', { name: k }));
    await user.click(within(pad).getByRole('button', { name: 'Decimal point' }));
    await user.click(within(pad).getByRole('button', { name: '5' }));
    expect(screen.getByRole('textbox', { name: 'Amount in doubloons' })).toHaveValue('Ð5,000.5');
  });

  it('accepts a hardware keyboard in the amount field and Enter submits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Ticket mode="amount" onSubmit={onSubmit} />);
    const field = screen.getByRole('textbox', { name: 'Amount in doubloons' });
    await user.click(field);
    await user.keyboard('84.129');
    expect(field).toHaveValue('Ð84.12');
    await user.keyboard('{Backspace}');
    expect(field).toHaveValue('Ð84.1');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('announces the amount with the unit spelled out after typing stops', async () => {
    const user = userEvent.setup();
    render(<Ticket mode="shares" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    const pad = screen.getByRole('group', { name: 'Keypad' });
    await user.click(within(pad).getByRole('button', { name: '3' }));
    for (const k of ['0', '0', '0']) await user.click(within(pad).getByRole('button', { name: k }));
    await waitFor(() => expect(status).toHaveTextContent('3,000 shares'), { timeout: 1500 });
  });
});
