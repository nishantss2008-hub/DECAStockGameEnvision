import { describe, it, expect, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowUpDown, CircleMinus, CirclePlus } from 'lucide-react';
import { Menu } from './Menu';

describe('Menu', () => {
  it('opens from its trigger, runs the chosen item and returns focus', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onFive = vi.fn();
    render(
      <Menu
        trigger={
          <button type="button" aria-label="More options">
            <ArrowUpDown aria-hidden="true" />
          </button>
        }
        groups={[
          { items: [{ id: 'five', label: 'Read a company in 5 questions', onSelect: onFive }] },
          { items: [{ id: 'remove', label: 'Remove from watchlist', destructive: true, onSelect: onRemove }] },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'More options' });
    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByRole('menuitem', { name: 'Remove from watchlist' })).toHaveAttribute('data-destructive');
    expect(menu.className).toContain('glass');

    await user.click(screen.getByRole('menuitem', { name: 'Remove from watchlist' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onFive).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('shows single-choice groups as checked radio items', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Menu
        trigger={<button type="button">Sort</button>}
        groups={[
          {
            label: 'Sort by',
            value: 'value',
            onValueChange,
            items: [
              { id: 'value', label: 'Value', onSelect: () => {} },
              { id: 'gain', label: 'Total gain %', onSelect: () => {} },
            ],
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await screen.findByRole('menu');
    expect(screen.getByRole('menuitemradio', { name: 'Value' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Total gain %' })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('menuitemradio', { name: 'Total gain %' }));
    expect(onValueChange).toHaveBeenCalledWith('gain');
  });

  it('opens anchored to a row without a trigger and closes on Escape', async () => {
    const user = userEvent.setup();
    const onBuy = vi.fn();
    function Row() {
      const ref = useRef<HTMLDivElement>(null);
      const [open, setOpen] = useState(true);
      return (
        <div ref={ref}>
          KRKN
          <Menu
            open={open}
            onOpenChange={setOpen}
            anchor={ref}
            label="Actions for KRKN"
            groups={[
              {
                items: [
                  { id: 'buy', label: 'Buy', icon: CirclePlus, onSelect: onBuy },
                  { id: 'sell', label: 'Sell', icon: CircleMinus, onSelect: () => {} },
                ],
              },
            ]}
          />
        </div>
      );
    }
    render(<Row />);
    const menu = await screen.findByRole('menu', { name: 'Actions for KRKN' });
    expect(menu.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(onBuy).not.toHaveBeenCalled();
  });
});
