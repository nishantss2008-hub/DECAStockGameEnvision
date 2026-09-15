import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from './Button';

describe('Button', () => {
  it('defaults to type="button" and the filled large prominent style', () => {
    render(<Button>Preview order</Button>);
    const button = screen.getByRole('button', { name: 'Preview order' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-style', 'prominent');
    expect(button).toHaveAttribute('data-size', 'large');
  });

  it('activates from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Done</Button>);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('stays focusable when disabled but ignores activation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Preview order
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Preview order' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('never submits a form while disabled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled>
          Sign in
        </Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the loading label, sets aria-busy and ignores clicks while loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Placing order…" onClick={onClick}>
        Place order
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Placing order…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('maps variant and tone to MOBILE styles and hides icons', () => {
    const { container } = render(
      <>
        <Button variant="tinted" tone="sell" size="medium">
          Sell
        </Button>
        <Button variant="gray" size="small" icon={ArrowLeftRight}>
          Trade
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Sell' })).toHaveAttribute('data-style', 'tinted-sell');
    expect(screen.getByRole('button', { name: 'Trade' })).toHaveAttribute('data-size', 'small');
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));
  });
});
