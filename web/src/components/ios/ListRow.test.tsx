import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { InsetGroupedList } from './InsetGroupedList';
import { ActionRow, DestructiveRow, DisclosureRow, ExplainRow, KeyValueRow, StockRow } from './ListRow';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

describe('InsetGroupedList', () => {
  it('is a section labelled by its h2 header with a list of rows and a footer description', () => {
    render(
      <InsetGroupedList header="Key stats" footer="Prices update every 30 seconds">
        <KeyValueRow label="Fee" value="0.10%" />
      </InsetGroupedList>,
    );
    const section = screen.getByRole('region', { name: 'Key stats' });
    expect(within(section).getByRole('heading', { level: 2, name: 'Key stats' })).toBeInTheDocument();
    expect(within(section).getByRole('list')).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
    expect(section).toHaveAccessibleDescription('Prices update every 30 seconds');
  });

  it('renders a trailing header action outside the heading', () => {
    render(
      <MemoryRouter future={FUTURE}>
        <InsetGroupedList header="Positions" headerAction={<a href="/portfolio/positions">See all 7</a>}>
          <KeyValueRow label="Cash" value="Ð248,349.55" />
        </InsetGroupedList>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Positions' })).not.toContainElement(screen.getByRole('link', { name: 'See all 7' }));
  });
});

describe('StockRow', () => {
  it('is one link with a combined spoken label and decorative crest, sparkline and triangle', () => {
    const { container } = render(
      <MemoryRouter future={FUTURE}>
        <ul>
          <StockRow
            to="/markets/company/KRKN"
            ticker="KRKN"
            name="Kraken Shipping Lines"
            sector="Shipping & Salvage"
            priceText="Ð84.12"
            priceSpoken="84.12 doubloons"
            change={0.0231}
            changeContext="this session"
            sparkline={<svg data-testid="spark" />}
          />
        </ul>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Kraken Shipping Lines, KRKN, 84.12 doubloons, up 2.31 percent this session' });
    expect(link).toHaveAttribute('href', '/markets/company/KRKN');
    expect(within(link).getByText('KRKN')).toBeInTheDocument();
    expect(within(link).getByText('+2.31%')).toBeInTheDocument();
    expect(screen.getByTestId('spark').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('.ios-crest')).toHaveAttribute('aria-hidden', 'true');
    expect(within(link).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('KeyValueRow and ExplainRow', () => {
  it('keeps the info button outside any link and shows the value', () => {
    render(
      <ul>
        <KeyValueRow label="Fee" info={<button type="button" aria-label="What is Fee (trading fee)?" />} value="Ð42.06" />
      </ul>,
    );
    expect(screen.getByText('Ð42.06')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'What is Fee (trading fee)?' })).toBeInTheDocument();
  });

  it('shows value, everyday sentence and average line without colour judgement', () => {
    const { container } = render(
      <ul>
        <ExplainRow
          label="Price vs. profit (P/E)"
          info={<button type="button" aria-label="What is Price vs. profit (price-to-earnings ratio)?" />}
          explained={{
            valueText: '17.8',
            sentence: 'You pay Ð17.80 for every Ð1 of yearly profit.',
            averageText: 'Rest of Shipping & Salvage: 22.1',
          }}
        />
      </ul>,
    );
    expect(container.querySelector('.ios-explain__label')).toHaveTextContent('Price vs. profit (P/E)');
    // The "?" is glued to the label's last word, so a wrapped label never leaves it alone on a line.
    const end = container.querySelector('.ios-row__label-end');
    expect(end).toHaveTextContent('(P/E)');
    expect(end?.querySelector('button')).toHaveAccessibleName('What is Price vs. profit (price-to-earnings ratio)?');
    expect(screen.getByText('17.8')).toBeInTheDocument();
    expect(screen.getByText('You pay Ð17.80 for every Ð1 of yearly profit.')).toBeInTheDocument();
    expect(screen.getByText('Rest of Shipping & Salvage: 22.1')).toBeInTheDocument();
    expect(container.querySelector('[class*="gain"], [class*="loss"]')).toBeNull();
  });
});

describe('DisclosureRow, ActionRow, DestructiveRow', () => {
  it('navigates with a hidden chevron and a decorative icon tile', () => {
    const { container } = render(
      <MemoryRouter future={FUTURE}>
        <ul>
          <DisclosureRow to="/learn/guide" icon={BookOpen} title="How the game works" subtitle="Cash, ticks and sessions" />
        </ul>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /How the game works/ });
    expect(link).toHaveAttribute('href', '/learn/guide');
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));
    expect(container.querySelector('.ios-row__chevron')).not.toBeNull();
  });

  it('has no chevron when the row does not navigate', () => {
    const { container } = render(
      <ul>
        <DisclosureRow title="Version" detail="2.0" />
      </ul>,
    );
    expect(container.querySelector('.ios-row__chevron')).toBeNull();
  });

  it('renders action rows as buttons', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onSignOut = vi.fn();
    render(
      <ul>
        <ActionRow onClick={onClear}>Clear recent searches</ActionRow>
        <DestructiveRow onClick={onSignOut}>Sign out</DestructiveRow>
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: 'Clear recent searches' }));
    screen.getByRole('button', { name: 'Sign out' }).focus();
    await user.keyboard('{Enter}');
    expect(onClear).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveAttribute('data-tone', 'destructive');
  });
});
