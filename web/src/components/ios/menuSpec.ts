/**
 * Menu data shape and the MOBILE §5.10 rules it must follow.
 * Kept free of React rendering so the rules are unit-tested.
 */
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export interface MenuItemSpec {
  id: string;
  label: string;
  /** lucide icon; a group uses icons on all of its items or on none. */
  icon?: ComponentType<LucideProps>;
  /** Destructive items come last and use `--destructive-strong` (text on glass). */
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuGroupSpec {
  /** Optional group label (e.g. "Sort by"); labels the group for screen readers. */
  label?: string;
  items: MenuItemSpec[];
  /** When set, the group is a single-choice list (`menuitemradio`) and this is the checked item id. */
  value?: string;
  onValueChange?: (id: string) => void;
}

export const MAX_MENU_GROUPS = 3;

/** Returns human-readable rule violations; an empty array means the menu is valid. */
export function menuProblems(groups: MenuGroupSpec[]): string[] {
  const problems: string[] = [];
  if (groups.length > MAX_MENU_GROUPS) problems.push(`A menu has at most ${MAX_MENU_GROUPS} groups.`);

  const flat = groups.flatMap((g) => g.items);
  const firstDestructive = flat.findIndex((item) => item.destructive);
  if (firstDestructive >= 0 && flat.slice(firstDestructive).some((item) => !item.destructive)) {
    problems.push('Destructive items must come last.');
  }

  groups.forEach((group, index) => {
    const n = index + 1;
    if (group.items.length === 0) {
      problems.push(`Group ${n} is empty.`);
      return;
    }
    const withIcon = group.items.filter((item) => item.icon).length;
    if (withIcon > 0 && withIcon < group.items.length) problems.push(`Group ${n} mixes items with and without icons.`);
    if (group.value !== undefined && !group.items.some((item) => item.id === group.value)) {
      problems.push(`Group ${n} value "${group.value}" matches no item.`);
    }
  });
  return problems;
}
