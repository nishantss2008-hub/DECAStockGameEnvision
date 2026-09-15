/**
 * Navigation model (MOBILE §6.1, §6.2, §6.6): the five crew tabs, the five host tabs, which tab owns a path,
 * per-tab memory in sessionStorage, and what a tab press does (§5.1 behaviour). Pure; icons live in icons.ts.
 */
import type { Role } from '@deca/shared';
import { withoutSheet } from './sheetParams';

export type TabId = 'portfolio' | 'markets' | 'news' | 'standings' | 'learn';
export type HostTabId = 'control' | 'crews' | 'market' | 'news' | 'tape';

export interface NavItem<Id extends string = string> {
  id: Id;
  label: string;
  to: string;
}

export const CREW_TABS: readonly NavItem<TabId>[] = [
  { id: 'portfolio', label: 'Portfolio', to: '/portfolio' },
  { id: 'markets', label: 'Markets', to: '/markets' },
  { id: 'news', label: 'News', to: '/news' },
  { id: 'standings', label: 'Standings', to: '/standings' },
  { id: 'learn', label: 'Learn', to: '/learn' },
];

export const HOST_TABS: readonly NavItem<HostTabId>[] = [
  { id: 'control', label: 'Control', to: '/admin' },
  { id: 'crews', label: 'Crews', to: '/admin/crews' },
  { id: 'market', label: 'Market', to: '/admin/market' },
  { id: 'news', label: 'News', to: '/admin/news' },
  { id: 'tape', label: 'Tape', to: '/admin/tape' },
];

export function navItemsFor(role: Role | null): readonly NavItem[] {
  if (role === 'team') return CREW_TABS;
  if (role === 'admin') return HOST_TABS;
  return [];
}

const within = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

export function tabIdForPath(pathname: string): TabId | null {
  return CREW_TABS.find((t) => within(pathname, t.to))?.id ?? null;
}

export function hostTabIdForPath(pathname: string): HostTabId | null {
  if (!within(pathname, '/admin')) return null;
  const nested = HOST_TABS.slice(1).find((t) => within(pathname, t.to));
  return nested?.id ?? 'control';
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

export function isTabRoot(pathname: string): boolean {
  const p = trimSlash(pathname);
  return CREW_TABS.some((t) => t.to === p);
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const TAB_MEMORY_PREFIX = 'bx.tab.';

export interface PathParts {
  pathname: string;
  search: string;
  hash: string;
}

/** Stores the current path for its tab (sheet params dropped: a restored stack never reopens a sheet). */
export function rememberTabPath(storage: StorageLike, loc: PathParts): void {
  const id = tabIdForPath(loc.pathname);
  if (!id) return;
  try {
    storage.setItem(`${TAB_MEMORY_PREFIX}${id}`, `${loc.pathname}${withoutSheet(loc.search)}${loc.hash}`);
  } catch {
    // Private mode or blocked storage: tabs just open at their roots.
  }
}

export function recallTabPath(storage: StorageLike, id: TabId): string | null {
  let value: string | null = null;
  try {
    value = storage.getItem(`${TAB_MEMORY_PREFIX}${id}`);
  } catch {
    return null;
  }
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  const pathname = value.split(/[?#]/, 1)[0] ?? '';
  return tabIdForPath(pathname) === id ? value : null;
}

export type TabPress = { kind: 'navigate'; to: string } | { kind: 'scrollTop' };

/** Different tab → its remembered stack; active tab on a pushed screen → root; active tab at root → scroll to top. */
export function tabPressTarget({ tab, pathname, remembered }: { tab: NavItem; pathname: string; remembered: string | null }): TabPress {
  if (within(pathname, tab.to)) {
    return trimSlash(pathname) === tab.to ? { kind: 'scrollTop' } : { kind: 'navigate', to: tab.to };
  }
  return { kind: 'navigate', to: remembered ?? tab.to };
}
