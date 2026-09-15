import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SignedChange } from './SignedChange';
import { StockBarSubtitle, StockHeader, type StockHeaderProps } from './StockHeader';

const DOUBLOONS = { symbol: 'Ð', name: 'Doubloons' };

// BRIEF §7 KRKN: Ð84.12, session open Ð82.22, +2.31%, tick 1,284 at 14:02:30.
const krkn: StockHeaderProps = {
  name: 'Kraken Shipping Lines',
  ticker: 'KRKN',
  sector: 'Shipping & Salvage',
  price: 8412,
  sessionOpen: 8222,
  sessionChange: 0.0231,
  tick: 1284,
  timeText: '14:02:30',
  currency: DOUBLOONS,
};

describe('SignedChange', () => {
  it('shows sign, caret and colour direction, and speaks words instead of symbols', () => {
    const { container } = render(<SignedChange value={190} kind="money" pct={0.0231} suffix="this session" currency={DOUBLOONS} />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('data-direction', 'up');
    expect(root.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelector('[aria-hidden="true"]')).toHaveTextContent('+Ð1.90 (+2.31%)this session');
    expect(screen.getByText('up 1.90 doubloons, up 2.31 percent this session')).toHaveClass('ios-sr-only');
  });

  it('uses the true minus, drops the caret when flat, and accepts an srLabel', () => {
    const { container, rerender } = render(<SignedChange value={-0.0346} kind="pct" />);
    expect(container.textContent).toContain('−3.46%');
    rerender(<SignedChange value={0} kind="pct" srLabel="no change since you bought" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText('no change since you bought')).toBeInTheDocument();
  });

  it('inherits the text colour on glass with tone="plain"', () => {
    const { container } = render(<SignedChange value={0.02} kind="pct" tone="plain" />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'plain');
  });
});

describe('StockHeader', () => {
  it('renders the MOBILE §5.14 lines with one spoken price sentence', () => {
    render(<StockHeader {...krkn} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Kraken Shipping Lines' })).toBeInTheDocument();
    expect(screen.getByText('KRKN · Shipping & Salvage')).toBeInTheDocument();
    expect(screen.getByText('Ð84.12')).toBeInTheDocument();
    expect(screen.getByText('Kraken Shipping Lines, 84.12 doubloons, up 2.31 percent this session')).toHaveClass('ios-sr-only');
    expect(screen.getByText('As of tick 1,284 · 14:02:30')).toBeInTheDocument();
  });

  it('places the InfoTip buttons for session change and tick', () => {
    render(<StockHeader {...krkn} renderInfoTip={(id) => <button type="button">{`What is ${id}?`}</button>} />);
    expect(screen.getByRole('button', { name: 'What is sessionChange?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What is tick?' })).toBeInTheDocument();
  });

  it('swaps the price and change lines for the scrubbed point', () => {
    const { container } = render(<StockHeader {...krkn} scrub={{ price: 8406, timeText: '14:01:30', tick: 1282 }} />);
    expect(screen.getByText('Ð84.06')).toBeInTheDocument();
    expect(screen.getByText('14:01:30 · tick 1,282')).toBeInTheDocument();
    expect(container.querySelector('.stock-header__asof')).toHaveAttribute('data-hidden');
  });

  it('flashes a new price for 300ms and never replays the flash after a scrub ends', () => {
    vi.useFakeTimers();
    try {
      const scrub = { price: 8406, timeText: '14:01:30', tick: 1282 };
      const { container, rerender } = render(<StockHeader {...krkn} />);
      const price = () => container.querySelector('.stock-header__price')!;
      expect(price()).not.toHaveAttribute('data-flash');

      rerender(<StockHeader {...krkn} price={8420} />);
      expect(price()).toHaveAttribute('data-flash', 'up');
      act(() => vi.advanceTimersByTime(300));
      expect(price()).not.toHaveAttribute('data-flash');

      // A scrub that starts mid-flash cancels it; releasing the scrub shows no flash.
      rerender(<StockHeader {...krkn} price={8401} />);
      expect(price()).toHaveAttribute('data-flash', 'down');
      rerender(<StockHeader {...krkn} price={8401} scrub={scrub} />);
      rerender(<StockHeader {...krkn} price={8401} />);
      expect(price()).not.toHaveAttribute('data-flash');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('StockBarSubtitle', () => {
  it('writes "Ð84.12 · +2.31%" with a caret and hides it from assistive tech', () => {
    const { container } = render(<StockBarSubtitle price={8412} sessionChange={0.0231} currency={DOUBLOONS} />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveTextContent('Ð84.12 · +2.31%');
    expect(root.querySelector('svg')).not.toBeNull();
  });
});
