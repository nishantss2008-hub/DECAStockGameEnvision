import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ellipsis, Star } from 'lucide-react';
import { LargeTitleNavBar, NavBarButton, NavBarButtonGroup, StatusLine } from './LargeTitleNavBar';

type Callback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;

function stubIntersectionObserver() {
  const instances: { callback: Callback; options?: IntersectionObserverInit; targets: Element[] }[] = [];
  class FakeObserver {
    targets: Element[] = [];
    constructor(public callback: Callback, public options?: IntersectionObserverInit) {
      instances.push(this);
    }
    observe(el: Element) {
      this.targets.push(el);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return instances;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LargeTitleNavBar', () => {
  it('renders the large title as the one h1 and hides the inline title from screen readers', () => {
    render(<LargeTitleNavBar title="Markets" subtitle="Open · 37:17:42" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Markets' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    const inline = screen.getByText('Open · 37:17:42').closest('[aria-hidden="true"]');
    expect(inline).not.toBeNull();
  });

  it('names the back button after the previous screen and calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<LargeTitleNavBar title="KRKN" back={{ label: 'Markets', onBack }} />);
    const back = screen.getByRole('button', { name: 'Back to Markets' });
    expect(back).not.toHaveTextContent('Back');
    await user.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders trailing bar buttons with accessible names', () => {
    render(<LargeTitleNavBar title="KRKN" trailing={<NavBarButton label="More options" icon={Ellipsis} />} />);
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('collapses when the sentinel under the large title scrolls under the bar', () => {
    const observers = stubIntersectionObserver();
    const onCollapsedChange = vi.fn();
    const { container } = render(<LargeTitleNavBar title="Portfolio" onCollapsedChange={onCollapsedChange} />);
    const root = container.querySelector('.ios-navbar');
    expect(root).not.toHaveAttribute('data-collapsed');
    const observer = observers.at(-1)!;
    expect(observer.targets).toHaveLength(1);
    expect(observer.options?.rootMargin).toMatch(/^-\d+px 0px 0px 0px$/);

    act(() => observer.callback([{ isIntersecting: false, boundingClientRect: { top: -20 } as DOMRectReadOnly }]));
    expect(root).toHaveAttribute('data-collapsed', 'true');
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);

    act(() => observer.callback([{ isIntersecting: true, boundingClientRect: { top: 150 } as DOMRectReadOnly }]));
    expect(root).not.toHaveAttribute('data-collapsed');
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it('can be forced collapsed for previews, ignoring the scroll observer', () => {
    const observers = stubIntersectionObserver();
    const { container } = render(
      <LargeTitleNavBar
        title="KRKN"
        collapsed
        subtitle="Ð84.12 · +2.31%"
        trailing={<NavBarButton label="More options" icon={Ellipsis} />}
      />,
    );
    const root = container.querySelector('.ios-navbar');
    expect(root).toHaveAttribute('data-collapsed', 'true');
    expect(container.querySelector('.ios-navbar__bar')).toHaveClass('glass');
    // Bar buttons drop their own glass while the bar is glass (no glass on glass).
    expect(screen.getByRole('button', { name: 'More options' })).not.toHaveClass('glass');
    act(() => observers.at(-1)?.callback([{ isIntersecting: true, boundingClientRect: { top: 150 } as DOMRectReadOnly }]));
    expect(root).toHaveAttribute('data-collapsed', 'true');
  });

  it('puts grouped trailing buttons in one glass capsule while expanded and plain circles when collapsed (MOBILE §5.2)', () => {
    const trailing = (
      <NavBarButtonGroup>
        <NavBarButton label="Add KRKN to watchlist" icon={Star} />
        <NavBarButton label="More options" icon={Ellipsis} />
      </NavBarButtonGroup>
    );
    const { container, rerender } = render(<LargeTitleNavBar title="Kraken Shipping Lines" collapsed={false} trailing={trailing} />);
    const capsule = container.querySelector('.ios-navbar-capsule');
    expect(capsule).toHaveClass('glass');
    expect(capsule).toContainElement(screen.getByRole('button', { name: 'More options' }));
    // One blur layer for both buttons: the buttons inside the capsule are not glass themselves.
    expect(screen.getByRole('button', { name: 'Add KRKN to watchlist' })).not.toHaveClass('glass');
    expect(screen.getByRole('button', { name: 'More options' })).not.toHaveClass('glass');
    // An ungrouped leading Back button keeps its own glass circle.
    rerender(<LargeTitleNavBar title="Kraken Shipping Lines" collapsed={false} back={{ label: 'Markets', onBack: vi.fn() }} trailing={trailing} />);
    expect(screen.getByRole('button', { name: 'Back to Markets' })).toHaveClass('glass');

    rerender(<LargeTitleNavBar title="Kraken Shipping Lines" collapsed back={{ label: 'Markets', onBack: vi.fn() }} trailing={trailing} />);
    expect(container.querySelector('.ios-navbar-capsule')).not.toHaveClass('glass');
    expect(container.querySelectorAll('.glass')).toHaveLength(1); // only the bar strip
  });

  it('shows a pinned search in the bar only while collapsed', () => {
    const observers = stubIntersectionObserver();
    render(<LargeTitleNavBar title="Markets" pinnedSearch={<input aria-label="Search companies and funds" />} />);
    expect(screen.queryByRole('textbox', { name: 'Search companies and funds' })).toBeNull();
    act(() => observers.at(-1)!.callback([{ isIntersecting: false, boundingClientRect: { top: -5 } as DOMRectReadOnly }]));
    expect(screen.getByRole('textbox', { name: 'Search companies and funds' })).toBeInTheDocument();
  });

  it('renders the status line slot as a button that opens the market status sheet', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <LargeTitleNavBar
        title="Portfolio"
        statusLine={
          <StatusLine tone="open" onPress={onPress}>
            Market open · 37:17:42 left · Session 2 of 8
          </StatusLine>
        }
      />,
    );
    const status = screen.getByRole('button', { name: 'Market open · 37:17:42 left · Session 2 of 8' });
    expect(status).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(status);
    expect(onPress).toHaveBeenCalledOnce();
  });
});
