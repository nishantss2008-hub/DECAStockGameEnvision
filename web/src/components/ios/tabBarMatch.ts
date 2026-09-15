/**
 * Pure helpers for TabBar (MOBILE §5.1): which tab owns the current path,
 * the count badge text, and the accessible name that includes the badge.
 */

export interface TabBadge {
  count: number;
  /** Spoken description added to the tab name, e.g. "new news about your holdings" (MOBILE §10). */
  label: string;
}

function normalise(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? '';
  const trimmed = bare.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Index of the tab whose path is the longest segment-prefix of `pathname`, or -1. */
export function activeTabIndex(items: ReadonlyArray<{ to: string }>, pathname: string): number {
  const path = normalise(pathname);
  let best = -1;
  let bestLength = -1;
  items.forEach((item, index) => {
    const root = normalise(item.to);
    const matches = path === root || (root !== '/' && path.startsWith(`${root}/`));
    if (matches && root.length > bestLength) {
      best = index;
      bestLength = root.length;
    }
  });
  return best;
}

/** Text inside the count badge, or null when no badge should render. */
export function badgeText(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

export function tabAccessibleName(item: { label: string; badge?: TabBadge }): string {
  if (item.badge && badgeText(item.badge.count) !== null) return `${item.label}, ${item.badge.label}`;
  return item.label;
}
