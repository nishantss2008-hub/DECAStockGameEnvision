import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GlossaryEntry } from '../../lib/glossary';
import { InfoTipButton } from './InfoTipButton';
import { InfoTipLines, InfoTipSheet } from './InfoTipSheet';

const PE: GlossaryEntry = {
  id: 'peRatio',
  group: 'value',
  label: 'Price vs. profit',
  term: 'P/E ratio',
  whatItIs: 'The share price divided by one year of profit per share.',
  whyItMatters: 'It shows how much you pay for each doubloon of yearly profit.',
  usuallyGoodWhen: 'it is below the sector average, but a very low P/E can mean investors expect trouble.',
  related: ['eps'],
};

function Screen({ onOpenInLearn }: { onOpenInLearn?: (e: GlossaryEntry) => void }) {
  const [termId, setTermId] = useState<string | null>(null);
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <span>Price vs. profit</span>
      <InfoTipButton entry={PE} onClick={() => setTermId(PE.id)} />
      <InfoTipSheet entry={termId ? PE : null} onOpenChange={(o) => !o && setTermId(null)} onOpenInLearn={onOpenInLearn} />
    </MemoryRouter>
  );
}

describe('InfoTipButton', () => {
  it('is a labelled dialog trigger in sheet mode', () => {
    render(<InfoTipButton entry={PE} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'What is Price vs. profit (P/E ratio)?' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).not.toHaveAttribute('aria-expanded');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('stroke-width', '1.75');
  });

  it('is a disclosure in inline mode (inside sheets)', () => {
    render(<InfoTipButton entry={PE} mode="inline" expanded controls="pe-tip" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'What is Price vs. profit (P/E ratio)?' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'pe-tip');
    expect(button).not.toHaveAttribute('aria-haspopup');
  });
});

describe('InfoTipSheet', () => {
  it('opens from "?" with the three explanation blocks and an Open in Learn link', async () => {
    const user = userEvent.setup();
    const onOpenInLearn = vi.fn();
    render(<Screen onOpenInLearn={onOpenInLearn} />);
    await user.click(screen.getByRole('button', { name: /What is Price vs\. profit/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Price vs. profit' });
    expect(dialog).toHaveTextContent('P/E ratio');
    expect(screen.getByRole('heading', { name: 'What it is' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why it matters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Usually a good sign when…' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(PE.usuallyGoodWhen);

    const link = screen.getByRole('link', { name: 'Open in Learn' });
    expect(link).toHaveAttribute('href', '/learn/glossary/peRatio');
    await user.click(link);
    expect(onOpenInLearn).toHaveBeenCalledWith(PE);
  });

  it('returns focus to the "?" button when closed', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    const trigger = screen.getByRole('button', { name: /What is Price vs\. profit/ });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Price vs. profit' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('renders nothing without a term', () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InfoTipSheet entry={null} onOpenChange={() => {}} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('InfoTipLines renders the same text inline', () => {
    render(<InfoTipLines entry={PE} density="inline" id="pe-tip" />);
    expect(screen.getByText(PE.whatItIs)).toBeInTheDocument();
    expect(document.getElementById('pe-tip')).toHaveAttribute('data-density', 'inline');
  });
  it('replaces the sheet entry when "Open in Learn" is pressed, so Back does not reopen the sheet', async () => {
    const user = userEvent.setup();
    function Where() {
      const { pathname, search } = useLocation();
      const navigate = useNavigate();
      return (
        <>
          <output data-testid="where">{pathname + search}</output>
          <button type="button" onClick={() => navigate(-1)}>
            Go back
          </button>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/markets', '/markets?sheet=term&id=peRatio']} initialIndex={1}>
        <Where />
        <InfoTipSheet entry={PE} onOpenChange={() => undefined} replaceOnOpenInLearn />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('link', { name: 'Open in Learn' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/learn/glossary/peRatio');
    await user.click(screen.getByRole('button', { name: 'Go back', hidden: true }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/markets$/));
  });
});
