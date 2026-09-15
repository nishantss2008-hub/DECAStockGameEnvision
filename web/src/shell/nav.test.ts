import { describe, expect, it } from 'vitest';
import {
  CREW_TABS,
  HOST_TABS,
  hostTabIdForPath,
  isTabRoot,
  navItemsFor,
  recallTabPath,
  rememberTabPath,
  tabIdForPath,
  tabPressTarget,
} from './nav';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('nav', () => {
  it('crew tabs are exactly the five MOBILE §6.1 tabs, in order', () => {
    expect(navItemsFor('team').map((n) => n.label)).toEqual(['Portfolio', 'Markets', 'News', 'Standings', 'Learn']);
    expect(CREW_TABS.map((n) => n.to)).toEqual(['/portfolio', '/markets', '/news', '/standings', '/learn']);
  });

  it('host tabs are exactly the five MOBILE §6.6 tabs, in order', () => {
    expect(navItemsFor('admin').map((n) => n.label)).toEqual(['Control', 'Crews', 'Market', 'News', 'Tape']);
    expect(HOST_TABS.map((n) => n.to)).toEqual(['/admin', '/admin/crews', '/admin/market', '/admin/news', '/admin/tape']);
  });

  it('no role has no tabs', () => {
    expect(navItemsFor(null)).toEqual([]);
  });

  it('maps pushed screens (including the shared Company page) to the tab that opened them', () => {
    expect(tabIdForPath('/portfolio')).toBe('portfolio');
    expect(tabIdForPath('/portfolio/activity/BX-7Q2F9K')).toBe('portfolio');
    expect(tabIdForPath('/news/company/KRKN/financials')).toBe('news');
    expect(tabIdForPath('/learn/glossary/peRatio')).toBe('learn');
    expect(tabIdForPath('/standings/results')).toBe('standings');
    expect(tabIdForPath('/marketsx')).toBeNull();
    expect(tabIdForPath('/admin')).toBeNull();
  });

  it('host paths map to host tabs; Audit lives under Control', () => {
    expect(hostTabIdForPath('/admin')).toBe('control');
    expect(hostTabIdForPath('/admin/audit')).toBe('control');
    expect(hostTabIdForPath('/admin/news')).toBe('news');
    expect(hostTabIdForPath('/portfolio')).toBeNull();
  });

  it('knows tab roots', () => {
    expect(isTabRoot('/markets')).toBe(true);
    expect(isTabRoot('/markets/')).toBe(true);
    expect(isTabRoot('/markets/sector/tech')).toBe(false);
  });
});

describe('tab memory (sessionStorage)', () => {
  it('remembers the last path per tab without sheet params', () => {
    const s = memoryStorage();
    rememberTabPath(s, { pathname: '/markets/company/KRKN', search: '?sheet=trade&ticker=KRKN&side=buy&view=price', hash: '#analysts' });
    expect(recallTabPath(s, 'markets')).toBe('/markets/company/KRKN?view=price#analysts');
    expect(recallTabPath(s, 'news')).toBeNull();
  });

  it('ignores paths outside the tabs and survives a throwing storage', () => {
    const s = memoryStorage();
    rememberTabPath(s, { pathname: '/admin', search: '', hash: '' });
    expect(s.data.size).toBe(0);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberTabPath(broken, { pathname: '/news', search: '', hash: '' })).not.toThrow();
    expect(recallTabPath(broken, 'news')).toBeNull();
  });

  it('rejects a remembered value that belongs to another tab', () => {
    const s = memoryStorage();
    s.setItem('bx.tab.news', '/markets/company/KRKN');
    expect(recallTabPath(s, 'news')).toBeNull();
    s.setItem('bx.tab.news', '//evil.example/news');
    expect(recallTabPath(s, 'news')).toBeNull();
  });

  it('tab press: other tab → remembered stack; active pushed → root; active root → scroll to top', () => {
    const markets = CREW_TABS[1]!;
    expect(tabPressTarget({ tab: markets, pathname: '/portfolio', remembered: '/markets/sector/tech' })).toEqual({ kind: 'navigate', to: '/markets/sector/tech' });
    expect(tabPressTarget({ tab: markets, pathname: '/portfolio', remembered: null })).toEqual({ kind: 'navigate', to: '/markets' });
    expect(tabPressTarget({ tab: markets, pathname: '/markets/company/KRKN', remembered: '/markets/company/KRKN' })).toEqual({ kind: 'navigate', to: '/markets' });
    expect(tabPressTarget({ tab: markets, pathname: '/markets', remembered: '/markets/company/KRKN' })).toEqual({ kind: 'scrollTop' });
  });
});
