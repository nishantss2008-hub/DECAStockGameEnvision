import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PositionSummary } from './PositionSummary';

const DOUBLOONS = { symbol: 'Ð', name: 'Doubloons' };
// BRIEF §7 KRKN position and account.
const props = {
  ticker: 'KRKN',
  quote: { price: 8412, sessionOpen: 8222 },
  accountValue: 108_421_955,
  cash: 24_834_955,
  currency: DOUBLOONS,
};

describe('PositionSummary', () => {
  it('shows the six figures as a labelled description list', () => {
    render(<PositionSummary {...props} holding={{ shares: 3000, avgCost: 7350 }} />);
    const section = screen.getByRole('region', { name: 'Your position' });
    const terms = within(section).getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Shares owned', 'Current value', 'Avg. price paid', 'Total gain/loss', 'Session change', 'Share of account']);
    const values = within(section).getAllByRole('definition');
    expect(values[0]).toHaveTextContent('3,000');
    expect(values[1]).toHaveTextContent('Ð252,360.00');
    expect(values[2]).toHaveTextContent('Ð73.50');
    expect(values[3]).toHaveTextContent('+Ð31,860.00 (+14.45%)');
    expect(values[4]).toHaveTextContent('+Ð5,700.00');
    expect(values[5]).toHaveTextContent('23.3%');
    expect(within(values[1]!).getByText('252,360.00 doubloons')).toHaveClass('ios-sr-only');
    expect(within(values[3]!).getByText('up 31,860.00 doubloons, up 14.45 percent')).toBeInTheDocument();
  });

  it('always shows cash available to trade, with its InfoTip', () => {
    render(
      <PositionSummary
        {...props}
        holding={{ shares: 3000, avgCost: 7350 }}
        renderInfoTip={(id) => <button type="button">{`What is ${id}?`}</button>}
      />,
    );
    expect(screen.getByText('Ð248,349.55')).toBeInTheDocument();
    for (const id of ['stock', 'invested', 'avgCost', 'totalGain', 'sessionChange', 'pctOfAccount', 'cashAvailable']) {
      expect(screen.getByRole('button', { name: `What is ${id}?` })).toBeInTheDocument();
    }
  });

  it('says the crew owns none when there is no holding, and still shows cash', () => {
    render(<PositionSummary {...props} holding={null} />);
    expect(screen.getByText("You don't own any KRKN yet")).toBeInTheDocument();
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
    expect(screen.getByText('248,349.55 doubloons')).toBeInTheDocument();
  });

  it('keeps the cash "?" on the same line as the amount, so it never wraps alone at large text', () => {
    render(
      <PositionSummary
        {...props}
        holding={null}
        renderInfoTip={(id) => <button type="button">{`What is ${id}?`}</button>}
      />,
    );
    const amount = screen.getByText('Ð248,349.55');
    const tip = screen.getByRole('button', { name: 'What is cashAvailable?' });
    const glue = amount.closest('.position-summary__glue');
    expect(glue).not.toBeNull();
    expect(glue).toContainElement(tip);
  });
});
