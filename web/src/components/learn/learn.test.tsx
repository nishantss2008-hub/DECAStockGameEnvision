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
  it('opens closed: seven topic groups, no term rows, so Learn is one screen not 4,528px of letters', () => {
    wrap(<GlossaryBrowser query="" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Glossary' })).toBeInTheDocument();
    const toggles = screen.getAllByRole('button', { expanded: false });
    // Each topic is a heading (still navigable by heading, as the letters were) wrapped around its toggle.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'The basics19 terms',
      'Profit14 terms',
      'Growth4 terms',
      'Financial health7 terms',
      'Value7 terms',
      'Trading16 terms',
      'This game6 terms',
    ]);
    expect(toggles).toHaveLength(7);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(within(toggles[4]!).getByText('7 terms')).toBeInTheDocument();
  });

  it('opens a group in place and shows its terms, each linking to its term page', async () => {
    wrap(<GlossaryBrowser query="" />);
    const value = screen.getByRole('button', { name: /^Value/ });
    await userEvent.click(value);
    expect(value).toHaveAttribute('aria-expanded', 'true');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
    const pe = links.find((a) => a.getAttribute('href') === '/learn/glossary/peRatio')!;
    expect(within(pe).getByText('Price vs. profit')).toBeInTheDocument();
    expect(within(pe).getByText('P/E ratio')).toBeInTheDocument();
    // The panel the toggle controls is the list of terms.
    expect(document.getElementById(value.getAttribute('aria-controls')!)).toContainElement(pe);
    await userEvent.click(value);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('keeps every term one search away, including terms in groups that are closed', () => {
    const { rerender } = wrap(<GlossaryBrowser query="" />);
    for (const entry of GLOSSARY_LIST) {
      rerender(
        <MemoryRouter>
          <GlossaryBrowser query={entry.label} />
        </MemoryRouter>,
      );
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      expect(hrefs, entry.id).toContain(`/learn/glossary/${entry.id}`);
    }
    // Ranking is untouched: a term from a closed group still comes first.
    rerender(
      <MemoryRouter>
        <GlossaryBrowser query="P/E ratio" />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/learn/glossary/peRatio');
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
    // It leads the chapter list.
    const chapters = within(screen.getByRole('region', { name: 'Guide' })).getAllByRole('link');
    expect(chapters[0]).toBe(row);
  });

  it('sends a student looking for help to the intro, never to the Portfolio walkthrough that no longer renders', async () => {
    wrap(<LearnPage />);
    const chapters = within(screen.getByRole('region', { name: 'Guide' }));
    // The "How to play" row armed the Portfolio walkthrough card; card, row and COPY §5 are all gone.
    expect(chapters.queryByText('How to play')).toBeNull();
    expect(chapters.queryAllByRole('button')).toHaveLength(0);
    for (const link of chapters.getAllByRole('link')) expect(link.getAttribute('href')).not.toBe('/portfolio');
    await userEvent.click(chapters.getByRole('link', { name: new RegExp(INTRO.learnRow) }));
    expect(screen.getByTestId('loc').textContent).toBe(INTRO_PATH);
  });
});
