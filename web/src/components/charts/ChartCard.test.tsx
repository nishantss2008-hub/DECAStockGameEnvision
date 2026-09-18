import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { deriveClock, rangeTabs } from '@deca/shared';
import { ChartCard, type ChartScrubPoint } from './ChartCard';
import { chartSummary, moneyFormatters, seriesStats } from './scrub';

const DOUBLOONS = { symbol: 'Ð', name: 'Doubloons' };
const money = moneyFormatters(DOUBLOONS);
const formatters = { ...money, formatX: (tick: number) => `tick ${tick}` };
// KRKN session: opens Ð82.22, dips to Ð81.90, peaks at Ð84.60, last Ð84.12.
const prices = [8222, 8190, 8300, 8460, 8412];
const points = prices.map((y, i) => ({ x: 1280 + i, y }));
const summary = chartSummary('session', seriesStats(points, 8222)!);
const ranges = rangeTabs(deriveClock(48 * 3_600_000)); // 1H 6H 24H All, 120 ticks per hour

function renderCard(props: Partial<Parameters<typeof ChartCard>[0]> = {}) {
  return render(
    <ChartCard
      label="KRKN price"
      points={points}
      summary={summary}
      formatters={formatters}
      reference={{ y: 8222, label: 'Session open' }}
      {...props}
    />,
  );
}

describe('ChartCard', () => {
  it('shows the summary sentence and describes the slider with the spoken version', () => {
    renderCard();
    expect(screen.getByText('Up 2.31% this session')).toBeInTheDocument();
    // The session range is not in the sentence: the range bar under the plot labels both ends (2026-09-17).
    expect(screen.queryByText(/Range/)).toBeNull();
    const slider = screen.getByRole('slider', { name: 'KRKN price' });
    expect(slider).toHaveAccessibleDescription('Up 2.31 percent this session');
    expect(slider).toHaveAttribute('aria-valuetext', 'tick 1284, 84.12 doubloons');
    expect(screen.getByText('Session open')).toBeInTheDocument();
  });

  it('keeps the summary for screen readers only when the page already prints it (summaryVisible)', () => {
    const { container } = renderCard({ summaryVisible: false });
    expect(container.querySelector('.chart-card__summary')).toBeNull();
    // Still spoken, and still what describes the slider — nothing became unreachable.
    const sr = container.querySelector('.ios-sr-only');
    expect(sr).toHaveTextContent('Up 2.31 percent this session');
    expect(screen.getByRole('slider')).toHaveAccessibleDescription('Up 2.31 percent this session');
  });

  it('draws the line in the gain colour when the last value is at or above the reference', () => {
    const { container } = renderCard();
    expect(container.querySelector('svg')).toHaveAttribute('data-trend', 'up');
    const { container: down } = renderCard({ reference: { y: 9000, label: 'Starting cash' } });
    expect(down.querySelector('svg')).toHaveAttribute('data-trend', 'down');
  });

  it('scrubs one point at a time with the arrow keys and restores on blur', async () => {
    const user = userEvent.setup();
    const onScrub = vi.fn<(p: ChartScrubPoint | null) => void>();
    renderCard({ onScrub });
    const slider = screen.getByRole('slider');
    slider.focus();

    await user.keyboard('{ArrowLeft}');
    expect(slider).toHaveAttribute('aria-valuetext', 'tick 1283, 84.60 doubloons');
    expect(onScrub).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: 3, x: 1283, y: 8460, yText: 'Ð84.60', xText: 'tick 1283' }),
    );
    // Floating value label.
    expect(screen.getByText('Ð84.60')).toBeInTheDocument();

    await user.keyboard('{Home}');
    expect(onScrub).toHaveBeenLastCalledWith(expect.objectContaining({ index: 0, y: 8222 }));
    await user.keyboard('{End}');
    expect(onScrub).toHaveBeenLastCalledWith(expect.objectContaining({ index: 4, y: 8412 }));

    fireEvent.blur(slider);
    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('Ð84.12')).not.toBeInTheDocument();
  });

  it('follows assistive-technology adjustments of the native slider and clears on Escape', () => {
    const onScrub = vi.fn();
    renderCard({ onScrub });
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '1' } });
    expect(onScrub).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1, y: 8190 }));
    fireEvent.keyDown(slider, { key: 'Escape' });
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('scrubs on a horizontal touch drag but not on a vertical one', () => {
    const onScrub = vi.fn();
    const { container } = renderCard({ onScrub });
    const plot = container.querySelector('.chart-card__plot') as HTMLElement;
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 280, height: 220, right: 280, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });

    fireEvent.pointerDown(plot, { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 100 });
    fireEvent.pointerMove(plot, { pointerId: 1, pointerType: 'touch', clientX: 202, clientY: 130 });
    expect(onScrub).not.toHaveBeenCalled();
    fireEvent.pointerUp(plot, { pointerId: 1, pointerType: 'touch', clientX: 202, clientY: 130 });

    fireEvent.pointerDown(plot, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    fireEvent.pointerMove(plot, { pointerId: 2, pointerType: 'touch', clientX: 10, clientY: 102 });
    expect(onScrub).toHaveBeenLastCalledWith(expect.objectContaining({ index: 0 }));
    fireEvent.pointerMove(plot, { pointerId: 2, pointerType: 'touch', clientX: 280, clientY: 102 });
    expect(onScrub).toHaveBeenLastCalledWith(expect.objectContaining({ index: 4 }));
    fireEvent.pointerUp(plot, { pointerId: 2, pointerType: 'touch', clientX: 280, clientY: 102 });
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('switches ranges with the shared rangeTabs and names the slider with the spoken range', async () => {
    const user = userEvent.setup();
    const long = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 10_000 + i }));
    function Harness() {
      const [range, setRange] = useState('all');
      return (
        <ChartCard
          label="Account value"
          points={long}
          summary="Up 3.99% since the game began"
          formatters={formatters}
          ranges={ranges}
          range={range}
          onRangeChange={setRange}
        />
      );
    }
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Chart range' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['1h', '6h', '24h', 'all']);
    expect(screen.getByRole('slider', { name: 'Account value, All' })).toHaveAttribute('max', '399');

    await user.click(within(group).getByText('1H'));
    const slider = screen.getByRole('slider', { name: 'Account value, 1 hour' });
    expect(slider).toHaveAttribute('max', '120');
    expect(slider).toHaveAttribute('aria-valuetext', 'tick 399, 103.99 doubloons');
  });

  it('shows the not-enough-history state without a slider', () => {
    renderCard({ points: points.slice(0, 1), summary: '' });
    expect(screen.getByText('Not enough price history yet')).toBeInTheDocument();
    expect(screen.getByText('The chart fills in as prices update.')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('marks the card busy with a hidden loading title while loading', () => {
    const { container } = renderCard({ loading: true });
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading prices…')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('notes a stopped clock while paused', () => {
    renderCard({ paused: true });
    expect(screen.getByText('Clock stopped while paused')).toBeInTheDocument();
  });
});
