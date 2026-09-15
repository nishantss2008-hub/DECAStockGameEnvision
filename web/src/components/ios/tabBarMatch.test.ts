import { describe, it, expect } from 'vitest';
import { activeTabIndex, badgeText, tabAccessibleName } from './tabBarMatch';

const tabs = [
  { to: '/portfolio' },
  { to: '/markets' },
  { to: '/news' },
  { to: '/standings' },
  { to: '/learn' },
];

describe('activeTabIndex', () => {
  it('matches the tab root and every pushed screen under it', () => {
    expect(activeTabIndex(tabs, '/portfolio')).toBe(0);
    expect(activeTabIndex(tabs, '/markets/company/KRKN')).toBe(1);
    expect(activeTabIndex(tabs, '/learn/glossary/peRatio')).toBe(4);
  });

  it('ignores a trailing slash, search and hash', () => {
    expect(activeTabIndex(tabs, '/news/')).toBe(2);
    expect(activeTabIndex(tabs, '/markets?view=value#companies')).toBe(1);
  });

  it('does not match a path that only shares a prefix', () => {
    expect(activeTabIndex(tabs, '/newsroom')).toBe(-1);
    expect(activeTabIndex(tabs, '/')).toBe(-1);
  });

  it('prefers the longest matching tab path', () => {
    const host = [{ to: '/admin' }, { to: '/admin/crews' }];
    expect(activeTabIndex(host, '/admin/crews/7')).toBe(1);
    expect(activeTabIndex(host, '/admin/audit')).toBe(0);
  });
});

describe('badgeText', () => {
  it('shows counts up to 99 and caps above', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(140)).toBe('99+');
  });

  it('hides the badge for zero, negatives and missing counts', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-2)).toBeNull();
    expect(badgeText(undefined)).toBeNull();
  });
});

describe('tabAccessibleName', () => {
  it('uses the label alone without a badge', () => {
    expect(tabAccessibleName({ label: 'News' })).toBe('News');
    expect(tabAccessibleName({ label: 'News', badge: { count: 0, label: 'new news about your holdings' } })).toBe('News');
  });

  it('adds the badge description when the badge shows', () => {
    expect(tabAccessibleName({ label: 'News', badge: { count: 3, label: 'new news about your holdings' } })).toBe(
      'News, new news about your holdings',
    );
  });
});
