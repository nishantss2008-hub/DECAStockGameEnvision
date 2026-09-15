import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet, type SheetProps } from './Sheet';

type HarnessProps = Partial<Omit<SheetProps, 'open' | 'onOpenChange' | 'children'>> & {
  onChange?: SheetProps['onOpenChange'];
};

function Harness({ onChange, ...props }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        What is Price vs. profit (P/E ratio)?
      </button>
      <a href="#behind">Link behind the sheet</a>
      <Sheet
        title="Price vs. profit"
        {...props}
        open={open}
        onOpenChange={(next, reason) => {
          onChange?.(next, reason);
          setOpen(next);
        }}
      >
        <p>The share price divided by yearly profit per share.</p>
        <button type="button">First inside</button>
        <button type="button">Last inside</button>
      </Sheet>
    </div>
  );
}

let appRoot: HTMLDivElement;
beforeEach(() => {
  appRoot = document.createElement('div');
  appRoot.id = 'root';
  document.body.appendChild(appRoot);
});
afterEach(() => {
  appRoot.remove();
});

async function openSheet(props: HarnessProps = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />, { container: appRoot });
  const trigger = screen.getByRole('button', { name: /What is Price vs\. profit/ });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Price vs. profit' });
  return { user, trigger, dialog };
}

describe('Sheet', () => {
  it('opens as a labelled modal dialog', async () => {
    const { dialog } = await openSheet({ detents: 'fit', scrim: 'info', headerLayout: 'leading', subtitle: 'P/E ratio' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-detents', 'fit');
    expect(screen.getByText('P/E ratio')).toBeInTheDocument();
  });

  it('moves focus to the title on open', async () => {
    await openSheet();
    const title = screen.getByRole('heading', { name: 'Price vs. profit' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAttribute('tabindex', '-1');
  });

  it('makes everything behind the scrim inert while open, and restores it on close', async () => {
    const { user, dialog } = await openSheet();
    await waitFor(() => expect(appRoot).toHaveAttribute('inert'));
    expect(dialog.closest('[inert]')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(appRoot).not.toHaveAttribute('inert'));
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const onChange = vi.fn();
    const { user, trigger } = await openSheet({ onChange });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Price vs. profit' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith(false, 'escape');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes from the labelled Close button and returns focus to the trigger', async () => {
    const onChange = vi.fn();
    const onClosed = vi.fn();
    const { user, trigger } = await openSheet({ onChange, onClosed });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith(false, 'close-button');
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('traps Tab focus inside the sheet', async () => {
    const { user, dialog } = await openSheet();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Price vs. profit' })).toHaveFocus());
    const visited = new Set<string>();
    // Base UI's focus guards redirect focus asynchronously, so wait after each Tab.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      visited.add(document.activeElement?.textContent || document.activeElement?.getAttribute('aria-label') || '');
    }
    expect(visited).toEqual(new Set(['First inside', 'Last inside', 'Close']));
    await user.tab({ shift: true });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(appRoot.contains(document.activeElement)).toBe(false);
  });

  it('keeps a dirty sheet open when onDismissRequest says no', async () => {
    const onDismissRequest = vi.fn(() => false);
    const onChange = vi.fn();
    const { user, dialog } = await openSheet({ onDismissRequest, onChange });
    await user.keyboard('{Escape}');
    expect(onDismissRequest).toHaveBeenCalledWith('escape');
    expect(onChange).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('cannot be dismissed while not dismissible (order placing)', async () => {
    const { user, dialog } = await openSheet({ dismissible: false, showClose: false });
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
  });

  it('keeps the title for screen readers when the header is hidden', async () => {
    const { dialog } = await openSheet({ headerLayout: 'hidden' });
    expect(dialog).toHaveAccessibleName('Price vs. profit');
  });

  it('shows a grabber button that cycles large ↔ medium only when content is taller than medium', async () => {
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? 600 : 0;
    });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(852);
    try {
      const { dialog, user } = await openSheet({ detents: 'fit', scrim: 'info', headerLayout: 'leading' });
      const grabber = await screen.findByRole('button', { name: 'Resize sheet' });
      expect(grabber).toHaveAttribute('aria-expanded', 'true');
      expect(dialog).toHaveAttribute('data-layout', 'attached');
      await user.click(grabber);
      expect(grabber).toHaveAttribute('aria-expanded', 'false');
      expect(dialog).toHaveAttribute('data-layout', 'inset');
    } finally {
      offsetHeight.mockRestore();
    }
  });

  it('has no grabber when the content fits in the medium detent', async () => {
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? 300 : 0;
    });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(852);
    try {
      const { dialog } = await openSheet({ detents: 'fit', scrim: 'info', headerLayout: 'leading' });
      expect(screen.queryByRole('button', { name: 'Resize sheet' })).not.toBeInTheDocument();
      expect(dialog).toHaveAttribute('data-layout', 'inset');
    } finally {
      offsetHeight.mockRestore();
    }
  });

  it('supports keyboard-aware sheets with text fields', async () => {
    const { dialog } = await openSheet({ keyboardAware: true });
    expect(dialog).toHaveAttribute('data-detents', 'large');
  });

  it('renders a pinned footer and a Back button in the leading slot', async () => {
    await openSheet({
      leading: <button type="button">Back to Entry</button>,
      footer: <button type="button">Preview order</button>,
    });
    expect(screen.getByRole('button', { name: 'Back to Entry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview order' })).toBeInTheDocument();
  });
});
