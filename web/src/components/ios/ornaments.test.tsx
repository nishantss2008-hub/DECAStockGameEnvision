import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CompassLoader, CompassRose } from './CompassRose';
import { Medallion } from './Medallion';
import { Podium } from './Podium';
import { WaxSeal } from './WaxSeal';

describe('WaxSeal', () => {
  it('is decorative, brass by default, and sized for the order-filled moment', () => {
    const { container } = render(<WaxSeal />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-tone', 'brass');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg.querySelector('.wax-seal__emboss')).not.toBeNull();
  });

  it('supports the crimson 120px game-over seal, a monogram and the stamp animation', () => {
    const { container } = render(<WaxSeal tone="crimson" size={120} monogram="bx" animate />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('data-tone', 'crimson');
    expect(svg).toHaveAttribute('width', '120');
    expect(svg).toHaveClass('wax-seal--stamp', 'motion-safe');
    expect(svg.querySelector('.wax-seal__monogram-face')).toHaveTextContent('BX');
    expect(svg.querySelector('.wax-seal__emboss')).toBeNull();
  });
});

describe('CompassRose and CompassLoader', () => {
  it('draws a decorative rose that only spins when asked', () => {
    const { container } = render(<CompassRose size={44} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveClass('compass-rose--spin');
    expect(svg.querySelectorAll('.compass-rose-glyph__light')).toHaveLength(8);
  });

  it('keeps the loading words visible next to a spinning rose and marks the area busy', () => {
    const { container } = render(<CompassLoader label="Loading prices…" flavor="Reading the winds" />);
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('svg')).toHaveClass('compass-rose--spin');
    expect(screen.getByText('Loading prices…')).toBeVisible();
    expect(screen.getByText('Reading the winds')).toBeInTheDocument();
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});

describe('Medallion', () => {
  it('uses the metal and size for the rank, with the rank as text below the metal', () => {
    const { container } = render(<Medallion rank={1} initials="qa" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('data-metal', 'gold');
    const disc = root.querySelector('.medallion__disc') as HTMLElement;
    expect(disc).toHaveAttribute('aria-hidden', 'true');
    expect(disc.style.getPropertyValue('--medal-size')).toBe('96px');
    expect(disc).toHaveTextContent('QA');
    expect((root.querySelector('.ios-crest') as HTMLElement).style.getPropertyValue('--crest-size')).toBe('64px');
    expect(screen.getByText('1st')).not.toHaveAttribute('aria-hidden');
  });

  it('draws silver and bronze at 80px with a 52px crest', () => {
    const { container } = render(<Medallion rank={3} initials="SW" />);
    expect(container.firstElementChild).toHaveAttribute('data-metal', 'bronze');
    expect((container.querySelector('.ios-crest') as HTMLElement).style.getPropertyValue('--crest-size')).toBe('52px');
    expect(screen.getByText('3rd')).toBeInTheDocument();
  });
});

describe('Podium', () => {
  const entries = [
    { id: 'salt', rank: 3 as const, name: 'Saltwind Traders', initials: 'SW', valueText: 'Ð1,104,630.18', valueSpoken: '1,104,630.18 doubloons', change: 0.1046 },
    { id: 'qar', rank: 1 as const, name: "Queen Anne's Revenue", initials: 'QA', valueText: 'Ð1,187,420.66', valueSpoken: '1,187,420.66 doubloons', change: 0.1874 },
    { id: 'tort', rank: 2 as const, name: 'Tortuga Capital', initials: 'TC', valueText: 'Ð1,142,905.30', valueSpoken: '1,142,905.30 doubloons', change: 0.1429 },
  ];

  it('reads 1st, 2nd, 3rd in the DOM but draws 2-1-3', () => {
    render(<Podium entries={entries} label="Top three crews" />);
    const list = screen.getByRole('list', { name: 'Top three crews' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-rank'))).toEqual(['1', '2', '3']);
    expect(items.map((li) => li.style.getPropertyValue('--podium-order'))).toEqual(['2', '1', '3']);
    expect(items.map((li) => li.style.getPropertyValue('--podium-step'))).toEqual(['96px', '72px', '56px']);
  });

  it('gives each place its rank, crew name, spoken value and return', () => {
    render(<Podium entries={entries} label="Top three crews" animate />);
    const [first] = screen.getAllByRole('listitem');
    expect(within(first!).getByText('1st')).toBeInTheDocument();
    expect(within(first!).getByText("Queen Anne's Revenue")).toBeInTheDocument();
    expect(within(first!).getByText('1,187,420.66 doubloons')).toHaveClass('ios-sr-only');
    expect(within(first!).getByText('up 18.74 percent')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveClass('podium--animate');
  });
});
