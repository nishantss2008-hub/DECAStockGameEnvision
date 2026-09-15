import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Briefcase } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { SkeletonGroup, SkeletonList, SKELETON_DELAY_MS } from './Skeleton';

describe('EmptyState', () => {
  it('shows title, body, flavor and a tinted action', async () => {
    const user = userEvent.setup();
    const onOpenMarkets = vi.fn();
    render(
      <EmptyState
        icon={Briefcase}
        title="No positions yet"
        body="You haven't bought any shares. Research a company, then place a small order to get started."
        action={{ label: 'Open Markets', onClick: onOpenMarkets }}
        flavor="The hold is empty."
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No positions yet' })).toBeInTheDocument();
    expect(screen.getByText('The hold is empty.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Open Markets' });
    expect(button).toHaveAttribute('data-style', 'tinted');
    await user.click(button);
    expect(onOpenMarkets).toHaveBeenCalled();
  });

  it('hull variant uses a decorative compass', () => {
    const { container } = render(
      <EmptyState
        variant="hull"
        headingLevel={3}
        title="The market reveal isn't open yet"
        body="It opens when the game ends. Until then, the health scores stay hidden."
        flavor="The fog hasn't lifted."
      />,
    );
    expect(container.firstElementChild).toHaveClass('hull');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent("The market reveal isn't open yet");
  });
});

describe('Skeleton', () => {
  it('is busy with a spoken loading title and reveals shapes after 150ms', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <SkeletonGroup label="Loading prices…">
          <SkeletonList rows={3} />
        </SkeletonGroup>,
      );
      const group = container.firstElementChild as HTMLElement;
      expect(group).toHaveAttribute('aria-busy', 'true');
      expect(group).toHaveTextContent('Loading prices…');
      expect(group.querySelectorAll('.ios-skeleton')).toHaveLength(0);
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(group.querySelectorAll('.ios-skeleton-row')).toHaveLength(3);
      for (const shape of Array.from(group.querySelectorAll('.ios-skeleton-list'))) {
        expect(shape).toHaveAttribute('aria-hidden', 'true');
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
