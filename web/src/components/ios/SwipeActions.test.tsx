import { describe, it, expect, vi } from 'vitest';
import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CircleMinus, CirclePlus } from 'lucide-react';
import { SwipeActions } from './SwipeActions';

function setup() {
  const onBuy = vi.fn();
  const onSell = vi.fn();
  const onOpenCompany = vi.fn();
  render(
    <ul>
      <li>
        <SwipeActions
          menuLabel="Actions for KRKN"
          actions={[
            { id: 'sell', label: 'Sell', icon: CircleMinus, tone: 'sell', onSelect: onSell },
            { id: 'buy', label: 'Buy', icon: CirclePlus, tone: 'buy', onSelect: onBuy },
          ]}
        >
          <a
            href="/portfolio/company/KRKN"
            onClick={(e) => {
              e.preventDefault();
              onOpenCompany();
            }}
          >
            Kraken Shipping Lines, KRKN, 252,360 doubloons
          </a>
        </SwipeActions>
      </li>
    </ul>,
  );
  const link = screen.getByRole('link', { name: /Kraken Shipping Lines/ });
  const content = link.parentElement as HTMLElement;
  const row = content.parentElement as HTMLElement;
  return { onBuy, onSell, onOpenCompany, link, content, row };
}

function drag(el: HTMLElement, points: Array<[number, number]>) {
  const [first, ...rest] = points;
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: 'touch', button: 0, clientX: first![0], clientY: first![1] });
  for (const [x, y] of rest) fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y });
  const last = points[points.length - 1]!;
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: 'touch', clientX: last[0], clientY: last[1] });
}

describe('SwipeActions', () => {
  it('stops the browser dragging the row link, so a mouse or trackpad swipe is not cancelled', () => {
    const { content, link } = setup();
    const event = createEvent.dragStart(link);
    fireEvent(link, event);
    expect(event.defaultPrevented).toBe(true);
    expect(content).toHaveClass('ios-swipe__content');
  });

  it('hides the swipe buttons from screen readers and the Tab order', () => {
    const { row } = setup();
    const actions = row.querySelector('.ios-swipe__actions') as HTMLElement;
    expect(actions).toHaveAttribute('aria-hidden', 'true');
    for (const b of Array.from(actions.querySelectorAll('button'))) expect(b).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('button', { name: 'Buy' })).not.toBeInTheDocument();
  });

  it('swiping past half the actions snaps open; the swipe is not a tap', async () => {
    const { content, row, onOpenCompany } = setup();
    drag(content, [
      [300, 20],
      [280, 21],
      [200, 22],
    ]);
    await waitFor(() => expect(row).toHaveAttribute('data-open'));
    expect(content.style.transform).toBe('translateX(-152px)');
    fireEvent.click(content.querySelector('a')!);
    expect(onOpenCompany).not.toHaveBeenCalled();
  });

  it('stays open after the click a mouse or trackpad fires at the end of the swipe; the next tap closes it', async () => {
    const { content, row, onOpenCompany } = setup();
    drag(content, [
      [300, 20],
      [280, 21],
      [150, 22],
    ]);
    await waitFor(() => expect(row).toHaveAttribute('data-open'));
    fireEvent.click(content.querySelector('a')!);
    expect(row).toHaveAttribute('data-open');
    fireEvent.click(content.querySelector('a')!);
    await waitFor(() => expect(row).not.toHaveAttribute('data-open'));
    expect(onOpenCompany).not.toHaveBeenCalled();
  });

  it('on touch (no click after the swipe) the next tap on the open row closes it', async () => {
    const { content, row, onOpenCompany } = setup();
    drag(content, [
      [300, 20],
      [280, 21],
      [150, 22],
    ]);
    await waitFor(() => expect(row).toHaveAttribute('data-open'));
    drag(content, [[200, 22]]);
    fireEvent.click(content.querySelector('a')!);
    await waitFor(() => expect(row).not.toHaveAttribute('data-open'));
    expect(onOpenCompany).not.toHaveBeenCalled();
  });

  it('a short swipe closes again', async () => {
    const { content, row } = setup();
    drag(content, [
      [300, 20],
      [285, 20],
      [260, 20],
    ]);
    await waitFor(() => expect(row).not.toHaveAttribute('data-open'));
    expect(content.style.transform).toBe('');
  });

  it('leaves vertical drags to scrolling', () => {
    const { content, row } = setup();
    drag(content, [
      [300, 20],
      [296, 60],
      [200, 120],
    ]);
    expect(row).not.toHaveAttribute('data-open');
    expect(content.style.transform).toBe('');
  });

  it('an open action opens the trade flow and closes the row', async () => {
    const { content, row, onBuy } = setup();
    drag(content, [
      [300, 20],
      [280, 20],
      [120, 20],
    ]);
    await waitFor(() => expect(row).toHaveAttribute('data-open'));
    fireEvent.click(row.querySelector('[data-tone="buy"]')!);
    expect(onBuy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(row).not.toHaveAttribute('data-open'));
  });

  it('a long press opens the same actions as a menu', async () => {
    vi.useFakeTimers();
    try {
      const { content, onSell, onOpenCompany } = setup();
      fireEvent.pointerDown(content, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 100, clientY: 20 });
      fireEvent.pointerMove(content, { pointerId: 2, pointerType: 'touch', clientX: 104, clientY: 23 });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.pointerUp(content, { pointerId: 2, pointerType: 'touch', clientX: 104, clientY: 23 });
      vi.useRealTimers();
      const menu = await screen.findByRole('menu', { name: 'Actions for KRKN' });
      expect(menu).toBeInTheDocument();
      fireEvent.click(content.querySelector('a')!);
      expect(onOpenCompany).not.toHaveBeenCalled();
      await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Sell' }));
      expect(onSell).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moving more than 10px cancels the long press', () => {
    vi.useFakeTimers();
    try {
      const { content } = setup();
      fireEvent.pointerDown(content, { pointerId: 3, pointerType: 'touch', button: 0, clientX: 100, clientY: 20 });
      fireEvent.pointerMove(content, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 40 });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the context-menu key or right-click opens the menu (keyboard and mouse alternative)', async () => {
    const { link } = setup();
    fireEvent.contextMenu(link);
    expect(await screen.findByRole('menu', { name: 'Actions for KRKN' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Sell', 'Buy']);
  });
});
