import { describe, it, expect } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLOSSARY_LIST } from '../../lib/glossary';
import { GlossaryBrowser } from './GlossaryBrowser';
import { TermChips } from './FiveQuestionsChapter';
import { TermInfo } from './TermInfo';
import { INTRO } from './introCopy';
import { INTRO_PATH } from './introFlow';
import LearnPage from '../../pages/learn/LearnPage';

function Where() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

const wrap = (ui: React.ReactNode, at = '/learn') =>
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
      <Where />
    </MemoryRouter>,
  );

describe('GlossaryBrowser', () => {
  it('lists every term in letter sections, each linking to its term page', () => {
    wrap(<GlossaryBrowser query="" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Glossary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'A' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(GLOSSARY_LIST.length);
    const pe = links.find((a) => a.getAttribute('href') === '/learn/glossary/peRatio')!;
    expect(within(pe).getByText('Price vs. profit')).toBeInTheDocument();
    expect(within(pe).getByText('P/E ratio')).toBeInTheDocument();
  });

  it('shows ranked results for a query, and the COPY empty state when nothing matches', () => {
    const { rerender } = wrap(<GlossaryBrowser query="pe ratio" />);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/learn/glossary/peRatio');
    rerender(
      <MemoryRouter>
        <GlossaryBrowser query="zzzz" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'No terms match “zzzz”' })).toBeInTheDocument();
    expect(screen.getByText('Try a simpler word, like profit or debt.')).toBeInTheDocument();
  });
});

describe('"?" explanations open the InfoTip sheet through the URL', () => {
  it('TermInfo pushes ?sheet=term&id=…', async () => {
    wrap(<TermInfo id="fee" />, '/learn/basics');
    await userEvent.click(screen.getByRole('button', { name: 'What is Trading fee (commission)?' }));
    expect(screen.getByTestId('loc').textContent).toBe('/learn/basics?sheet=term&id=fee');
  });

  it('TermChips are named like the "?" and open the sheet', async () => {
    wrap(<TermChips ids={['netMargin', 'unknownId']} />, '/learn/five-questions');
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(chips[0]!);
    expect(screen.getByTestId('loc').textContent).toBe('/learn/five-questions?sheet=term&id=netMargin');
  });
});

describe('Learn chapters', () => {
  it('replays "Meet the market" from the top of the chapter card (design 2026-09-16 §6)', () => {
    wrap(<LearnPage />);
    const row = screen.getByRole('link', { name: new RegExp(INTRO.learnRow) });
    expect(row).toHaveAttribute('href', INTRO_PATH);
    expect(within(row).getByText(INTRO.learnSubtitle)).toBeInTheDocument();
    // It leads the chapter list, ahead of How to play.
    const chapters = within(screen.getByRole('region', { name: 'Guide' })).getAllByRole('link');
    expect(chapters[0]).toBe(row);
  });
});
