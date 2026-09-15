import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AllocationBar } from './AllocationBar';
import { RangeBar } from './RangeBar';
import { ScatterChart } from './ScatterChart';
import { Sparkline } from './Sparkline';
import { moneyFormatters } from './scrub';

const money = moneyFormatters({ symbol: 'Ð', name: 'Doubloons' });

describe('Sparkline', () => {
  it('is decorative and picks the trend colour from the last value vs the reference', () => {
    const { container, rerender } = render(<Sparkline values={[8222, 8190, 8460, 8412]} reference={8222} />);
    const svg = () => container.querySelector('svg')!;
    expect(svg()).toHaveAttribute('aria-hidden', 'true');
    expect(svg()).toHaveAttribute('data-trend', 'up');
    expect(svg().querySelector('.sparkline__reference')).not.toBeNull();
    rerender(<Sparkline values={[3218, 3107]} />);
    expect(svg()).toHaveAttribute('data-trend', 'down');
    rerender(<Sparkline values={[5]} tone="gain" />);
    expect(svg()).toHaveAttribute('data-trend', 'up');
    expect(svg().querySelector('path')!.getAttribute('d')).toBe('M0,10L48,10');
  });
});

describe('RangeBar', () => {
  it('is one image with a spoken range and places the marker proportionally', () => {
    const { container } = render(
      <RangeBar low={8190} high={8460} value={8325} formatter={money.formatY} spokenFormatter={money.spokenY} label="Session range" valueLabel="Price" />,
    );
    expect(
      screen.getByRole('img', { name: 'Session range: 81.90 doubloons to 84.60 doubloons. Price: 83.25 doubloons.' }),
    ).toBeInTheDocument();
    expect((container.querySelector('.range-bar__track') as HTMLElement).style.getPropertyValue('--range-pos')).toBe('0.5');
    expect(screen.getByText('Ð81.90')).toBeInTheDocument();
    expect(screen.getByText('Ð84.60')).toBeInTheDocument();
  });
});

describe('AllocationBar', () => {
  it('hides the bar and lists every slice with its percentage in order', () => {
    const { container } = render(
      <AllocationBar
        legendLabel="Where your money is"
        items={[
          { id: 'krkn', label: 'KRKN', value: 25_236_000, sector: 'Shipping & Salvage' },
          { id: 'salt', label: 'SALT', value: 4_553_000, sector: 'Shipping & Salvage' },
          { id: 'cash', label: 'Cash', value: 24_834_955, kind: 'cash' },
        ]}
      />,
    );
    expect(container.querySelector('.allocation-bar__bar')).toHaveAttribute('aria-hidden', 'true');
    const list = screen.getByRole('list', { name: 'Where your money is' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['KRKN46.2%', 'SALT8.3%', 'Cash45.5%']);
  });

  it('renders nothing without value', () => {
    const { container } = render(<AllocationBar items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ScatterChart', () => {
  const points = [
    { id: 'krkn', x: 84, y: 0.196, label: 'KRKN', highlight: true },
    { id: 'lvth', x: 40, y: 0.31, label: 'LVTH' },
    { id: 'crsd', x: 81, y: -0.18, label: 'CRSD', highlight: true },
    { id: 'pryl', x: 74, y: 0.12, label: 'PRYL' },
  ];

  it('is an image with a summary, uses shapes for holdings vs others, and keeps real text for legend and caption', () => {
    const { container } = render(
      <ScatterChart
        points={points}
        xLabel="Health score (0–100)"
        yLabel="Actual return"
        xDomain={[0, 100]}
        formatX={(x) => String(x)}
        formatY={(y) => `${Math.round(y * 100)}%`}
        trend={{ label: 'Typical return' }}
        callouts={[
          { pointId: 'lvth', text: 'Luckiest: LVTH' },
          { pointId: 'crsd', text: 'Unluckiest: CRSD' },
        ]}
        legend={{ highlighted: "Your crew's holdings", others: 'Other companies' }}
        summary="Healthier companies tended to return more. Luckiest: LVTH. Unluckiest: CRSD."
        caption="Each dot is one company."
      />,
    );
    expect(screen.getByRole('img', { name: 'Healthier companies tended to return more. Luckiest: LVTH. Unluckiest: CRSD.' })).toBeInTheDocument();
    expect(container.querySelectorAll('path.scatter-chart__mark--highlight[data-point]')).toHaveLength(2);
    expect(container.querySelectorAll('circle.scatter-chart__mark[data-point]')).toHaveLength(2);
    expect(container.querySelector('line.scatter-chart__trend')).not.toBeNull();
    expect(screen.getByText("Your crew's holdings")).toBeInTheDocument();
    expect(screen.getByText('Each dot is one company.').tagName).toBe('FIGCAPTION');
    expect(screen.getByText('Luckiest: LVTH')).toHaveAttribute('aria-hidden', 'true');
  });
});
