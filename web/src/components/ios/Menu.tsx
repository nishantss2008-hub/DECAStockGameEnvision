/**
 * Menu (MOBILE §5.10): pull-down menus and long-press menus on `@base-ui/react/menu`.
 *
 * Glass panel (radius 28, min width 220), 44px rows, 8px `--fill-2` bars between groups,
 * ≤3 groups, icons on all items of a group or none, destructive items last in
 * `--destructive-strong`. Springs from its trigger (scale .9 → 1); fades under reduced motion.
 *
 * Two ways to open:
 * - `trigger`: a button element rendered as the Menu trigger (Positions sort, Activity filter,
 *   company page More).
 * - controlled `open` + `anchor`: long-press and context-menu menus on rows (SwipeActions).
 *
 * Every menu action must exist elsewhere in the UI too (HIG).
 */
import { Fragment, useEffect, type ReactElement, type RefObject } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import { menuProblems, type MenuGroupSpec, type MenuItemSpec } from './menuSpec';
import './Menu.css';

export type { MenuGroupSpec, MenuItemSpec } from './menuSpec';

export interface MenuProps {
  groups: MenuGroupSpec[];
  /** A `<button>` with an accessible name (e.g. aria-label "Sort positions"). Omit for anchored menus. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element to position against when there is no trigger (the long-pressed row). */
  anchor?: RefObject<Element | null> | Element | null;
  /** Names the menu when it has no trigger, e.g. "Actions for KRKN". */
  label?: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Where focus goes on close when there is no trigger. */
  finalFocus?: RefObject<HTMLElement | null>;
}

function ItemContent({ item, withIcons }: { item: MenuItemSpec; withIcons: boolean }) {
  const Icon = item.icon;
  return (
    <>
      <span className="ios-menu__label">{item.label}</span>
      {withIcons && Icon ? <Icon className="ios-menu__icon" size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
    </>
  );
}

export function Menu({ groups, trigger, open, onOpenChange, anchor, label, side = 'bottom', align = 'end', finalFocus }: MenuProps) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const problems = menuProblems(groups);
    // eslint-disable-next-line no-console
    if (problems.length > 0) console.warn(`Menu: ${problems.join(' ')}`);
  }, [groups]);

  return (
    <BaseMenu.Root open={open} onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}>
      {trigger ? <BaseMenu.Trigger render={trigger} /> : null}
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className="ios-menu-positioner"
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={16}
          anchor={anchor ?? undefined}
        >
          <BaseMenu.Popup className="ios-menu glass" aria-label={trigger ? undefined : label} finalFocus={finalFocus}>
            {groups.map((group, index) => {
              const withIcons = group.items.some((item) => item.icon);
              const separator = index > 0 ? <BaseMenu.Separator className="ios-menu__separator" /> : null;
              const groupLabel = group.label ? (
                <BaseMenu.GroupLabel className="ios-menu__group-label">{group.label}</BaseMenu.GroupLabel>
              ) : null;

              if (group.value !== undefined) {
                return (
                  <Fragment key={group.label ?? `group-${index}`}>
                    {separator}
                    <BaseMenu.RadioGroup
                      className="ios-menu__group"
                      value={group.value}
                      onValueChange={(value) => group.onValueChange?.(String(value))}
                    >
                      {groupLabel}
                      {group.items.map((item) => (
                        <BaseMenu.RadioItem
                          key={item.id}
                          value={item.id}
                          className="ios-menu__item"
                          data-destructive={item.destructive ? '' : undefined}
                          disabled={item.disabled}
                          closeOnClick
                          onClick={() => item.onSelect()}
                        >
                          <span className="ios-menu__check" aria-hidden="true">
                            <BaseMenu.RadioItemIndicator>
                              <Check size={17} strokeWidth={2.25} />
                            </BaseMenu.RadioItemIndicator>
                          </span>
                          <ItemContent item={item} withIcons={withIcons} />
                        </BaseMenu.RadioItem>
                      ))}
                    </BaseMenu.RadioGroup>
                  </Fragment>
                );
              }

              return (
                <Fragment key={group.label ?? `group-${index}`}>
                  {separator}
                  <BaseMenu.Group className="ios-menu__group">
                    {groupLabel}
                    {group.items.map((item) => (
                      <BaseMenu.Item
                        key={item.id}
                        className="ios-menu__item"
                        data-destructive={item.destructive ? '' : undefined}
                        disabled={item.disabled}
                        onClick={() => item.onSelect()}
                      >
                        <ItemContent item={item} withIcons={withIcons} />
                      </BaseMenu.Item>
                    ))}
                  </BaseMenu.Group>
                </Fragment>
              );
            })}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
