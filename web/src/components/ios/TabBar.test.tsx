import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Briefcase, ChartLine, GraduationCap, Newspaper, Trophy } from 'lucide-react';
import { TabBar, type TabBarItem } from './TabBar';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

const ITEMS: TabBarItem[] = [
  { id: 'portfolio', label: 'Portfolio', to: '/portfolio', icon: Briefcase },
  { id: 'markets', label: 'Markets', to: '/markets', icon: ChartLine },
  { id: 'news', label: 'News', to: '/news', icon: Newspaper, badge: { count: 3, label: 'new news about your holdings' } },
  { id: 'standings', label: 'Standings', to: '/standings', icon: Trophy },
  { id: 'learn', label: 'Learn', to: '/learn', icon: GraduationCap },
];

function renderAt(path: string, props: Partial<Parameters<typeof TabBar>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]} future={FUTURE}>
      <TabBar items={ITEMS} {...props} />
    </MemoryRouter>,
  );
}

describe('TabBar', () => {
  it('is a navigation landmark named Main with five links', () => {
    renderAt('/portfolio');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
  });

  it('marks the tab that owns the current path with aria-current="page"', () => {
    renderAt('/markets/company/KRKN');
    expect(screen.getByRole('link', { name: 'Markets' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Portfolio' })).not.toHaveAttribute('aria-current');
  });

  it('adds the badge description to the accessible name and hides the number from screen readers', () => {
    renderAt('/portfolio');
    const news = screen.getByRole('link', { name: 'News, new news about your holdings' });
    expect(within(news).getByText('3')).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides icons from assistive technology', () => {
    const { container } = renderAt('/portfolio');
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(5);
    svgs.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));
  });

  it('reports whether a tapped tab was already active so the shell can pop to root', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    renderAt('/markets/company/KRKN', { onItemClick });
    await user.click(screen.getByRole('link', { name: 'Markets' }));
    expect(onItemClick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'markets' }), expect.objectContaining({ active: true }));
    await user.click(screen.getByRole('link', { name: 'Learn' }));
    expect(onItemClick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'learn' }), expect.objectContaining({ active: false }));
  });

  it('can be forced into the landscape rail layout', () => {
    renderAt('/portfolio', { layout: 'rail' });
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveAttribute('data-layout', 'rail');
  });
});
