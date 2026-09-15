import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert, alertButtonsStacked, type AlertProps } from './Alert';
import { ActionSheet } from './ActionSheet';

type AlertHarnessProps = Partial<Omit<AlertProps, 'open' | 'onOpenChange'>>;

function AlertHarness(props: AlertHarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        End game…
      </button>
      <Alert
        title="End the game now?"
        message="Trading stops for every crew and the final standings are locked."
        cancelLabel="Cancel"
        confirmLabel="End game"
        destructive
        onConfirm={() => setOpen(false)}
        {...props}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}

let appRoot: HTMLDivElement;
beforeEach(() => {
  appRoot = document.createElement('div');
  appRoot.id = 'root';
  document.body.appendChild(appRoot);
});
afterEach(() => appRoot.remove());

async function openAlert(props: AlertHarnessProps = {}) {
  const user = userEvent.setup();
  render(<AlertHarness {...props} />, { container: appRoot });
  const trigger = screen.getByRole('button', { name: 'End game…' });
  await user.click(trigger);
  const dialog = await screen.findByRole('alertdialog', { name: 'End the game now?' });
  return { user, trigger, dialog };
}

describe('Alert', () => {
  it('is a labelled and described alert dialog', async () => {
    const { dialog } = await openAlert();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Trading stops for every crew and the final standings are locked.');
  });

  it('focuses Cancel first', async () => {
    await openAlert();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('Escape cancels and returns focus to the trigger', async () => {
    const onConfirm = vi.fn();
    const { user, trigger } = await openAlert({ onConfirm });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Cancel closes and returns focus to the trigger', async () => {
    const { user, trigger } = await openAlert();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('makes the page inert while open', async () => {
    const { user } = await openAlert();
    await waitFor(() => expect(appRoot).toHaveAttribute('inert'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(appRoot).not.toHaveAttribute('inert'));
  });

  it('typed confirmation focuses the field and keeps End game disabled until it reads END', async () => {
    const onConfirm = vi.fn();
    const { user } = await openAlert({ onConfirm, confirmWord: 'END', confirmWordLabel: 'Type END to confirm' });
    const field = screen.getByRole('textbox', { name: 'Type END to confirm' });
    await waitFor(() => expect(field).toHaveFocus());

    const confirm = screen.getByRole('button', { name: 'End game' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(field, 'end');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await user.clear(field);
    await user.type(field, 'END');
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('traps focus between its controls', async () => {
    const { user, dialog } = await openAlert();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    }
  });
});

describe('alertButtonsStacked', () => {
  it('stacks the buttons when either label is longer than 12 characters', () => {
    expect(alertButtonsStacked('Cancel', 'End game')).toBe(false);
    expect(alertButtonsStacked('Cancel', 'Twelve chars')).toBe(false);
    expect(alertButtonsStacked('Cancel', 'Reset password')).toBe(true);
    expect(alertButtonsStacked('Keep the crew', 'Remove')).toBe(true);
  });
});

describe('ActionSheet', () => {
  function SheetHarness({ onDiscard }: { onDiscard: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Close ticket
        </button>
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title="Discard this order?"
          cancelLabel="Keep editing"
          actions={[{ id: 'discard', label: 'Discard order', destructive: true, onSelect: onDiscard }]}
        />
      </div>
    );
  }

  it('focuses the least destructive option, runs actions and returns focus', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(<SheetHarness onDiscard={onDiscard} />, { container: appRoot });
    const trigger = screen.getByRole('button', { name: 'Close ticket' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Discard this order?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    await waitFor(() => expect(appRoot).toHaveAttribute('inert'));

    await user.click(screen.getByRole('button', { name: 'Discard order' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Escape is the same as Keep editing', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(<SheetHarness onDiscard={onDiscard} />, { container: appRoot });
    await user.click(screen.getByRole('button', { name: 'Close ticket' }));
    await screen.findByRole('dialog', { name: 'Discard this order?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
