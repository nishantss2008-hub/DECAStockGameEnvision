import type { CSSProperties, MouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { activeTabIndex, badgeText, tabAccessibleName, type TabBadge } from './tabBarMatch';
import { cx } from './iosCx';
import './TabBar.css';

export interface TabBarItem {
  id: string;
  /** Plain tab label (COPY-TBD mobile.tabs), e.g. "Portfolio". */
  label: string;
  /** Tab root path, e.g. "/markets". Pushed screens under it keep the tab selected. */
  to: string;
  icon: LucideIcon;
  /** Count badge (News only, MOBILE §5.1) with the words screen readers add to the name. */
  badge?: TabBadge;
}

export interface TabItemClickInfo {
  /** True when the tapped tab already owns the current path (pop to root / scroll to top). */
  active: boolean;
  event: MouseEvent<HTMLAnchorElement>;
}

export interface TabBarProps {
  items: readonly TabBarItem[];
  /** Landmark name. Student app "Main"; the host bar can pass its own. */
  label?: string;
  /**
   * auto: floating capsule on phones, 72px leading rail in short landscape
   * (`orientation: landscape` and `max-height: 500px`, MOBILE §4.5).
   */
  layout?: 'auto' | 'bar' | 'rail';
  /** Override the router location (tests, previews). */
  pathname?: string;
  /** Lets the shell restore the tab's remembered stack, pop to root or scroll to top. Call event.preventDefault() to stop navigation. */
  onItemClick?: (item: TabBarItem, info: TabItemClickInfo) => void;
  className?: string;
}

/**
 * Glass TabBar (MOBILE §5.1). Always visible with labels: it never minimises on
 * scroll; it hides only while a text field has focus on touch devices (CSS).
 * Mount it as a sibling of the route outlet so its backdrop-filter works.
 */
export function TabBar(props: TabBarProps) {
  const location = useLocation();
  return <TabBarView {...props} pathname={props.pathname ?? location.pathname} />;
}

function TabBarView({ items, label = 'Main', layout = 'auto', pathname = '/', onItemClick, className }: TabBarProps) {
  const active = activeTabIndex(items, pathname);
  const style = { '--tab-count': items.length, '--tab-index': Math.max(active, 0) } as CSSProperties;

  return (
    <nav aria-label={label} className={cx('ios-tabbar', 'glass', className)} data-layout={layout} style={style}>
      {active >= 0 && <span className="ios-tabbar__platter" aria-hidden="true" />}
      <ul className="ios-tabbar__list" role="list">
        {items.map((item, index) => {
          const selected = index === active;
          const Icon = item.icon;
          const count = badgeText(item.badge?.count);
          return (
            <li key={item.id} className="ios-tabbar__item">
              <Link
                to={item.to}
                className="ios-tabbar__link"
                aria-current={selected ? 'page' : undefined}
                aria-label={tabAccessibleName(item)}
                data-selected={selected || undefined}
                onClick={(event) => onItemClick?.(item, { active: selected, event })}
              >
                <span className="ios-tabbar__icon">
                  <Icon size={24} strokeWidth={selected ? 2.25 : 1.75} aria-hidden="true" />
                  {count !== null && (
                    <span className="ios-tabbar__badge" aria-hidden="true">
                      {count}
                    </span>
                  )}
                </span>
                <span className="ios-tabbar__label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
