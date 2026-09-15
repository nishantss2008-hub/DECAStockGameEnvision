import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChangePill, CountBadge, StatusDot, TagPill, YouPill } from './Pill';
import { Crest } from './Crest';

describe('ChangePill', () => {
  it('shows sign, triangle and text visually and reads a plain sentence', () => {
    const { container } = render(<ChangePill value={0.0231} />);
    const pill = container.querySelector('.ios-pill')!;
    expect(pill).toHaveAttribute('data-direction', 'up');
    expect(screen.getByText('+2.31%').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('up 2.31 percent')).toBeInTheDocument();
    expect(pill.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses a true minus for losses and no triangle when flat', () => {
    const { container, rerender } = render(<ChangePill value={-0.0346} />);
    expect(screen.getByText('−3.46%')).toBeInTheDocument();
    expect(screen.getByText('down 3.46 percent')).toBeInTheDocument();
    rerender(<ChangePill value={0} />);
    expect(screen.getByText('0.00%')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('Badges and pills', () => {
  it('renders tag and you pills as text', () => {
    render(
      <>
        <TagPill>Earnings</TagPill>
        <YouPill>You</YouPill>
      </>,
    );
    expect(screen.getByText('Earnings')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('caps count badges, speaks a label and hides at zero', () => {
    const { container, rerender } = render(<CountBadge count={140} label="140 new" />);
    expect(screen.getByText('99+')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('140 new')).toBeInTheDocument();
    rerender(<CountBadge count={0} label="0 new" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps status dots decorative', () => {
    const { container } = render(<StatusDot tone="open" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Crest', () => {
  it('is decorative, shows two letters and uses the sector fill', () => {
    const { container } = render(<Crest ticker="KRKN" sector="Shipping & Salvage" size={44} />);
    const crest = container.querySelector('.ios-crest') as HTMLElement;
    expect(crest).toHaveAttribute('aria-hidden', 'true');
    expect(crest).toHaveTextContent('KR');
    expect(crest.style.getPropertyValue('--crest-fill')).toBe('#2F6F68');
    expect(crest.style.getPropertyValue('--crest-size')).toBe('44px');
  });

  it('uses the hull fill and initials for crews', () => {
    const { container } = render(<Crest initials="sw" />);
    const crest = container.querySelector('.ios-crest') as HTMLElement;
    expect(crest).toHaveTextContent('SW');
    expect(crest.style.getPropertyValue('--crest-fill')).toBe('#232A26');
  });
});
