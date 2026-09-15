/**
 * Split-view sidebar (MOBILE §4.5, ≥744×501): 280px solid --bg-2 column with the same five sections, a Trade
 * button and the crew row (opens Account). Host variant: host tabs plus Audit.
 */
import type { MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeftRight, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../components/ios/Button';
import { Crest } from '../components/ios/Crest';
import type { NavItem } from './nav';
import { crewInitials } from './device';
import { MOBILE, SHELL } from './copy';

export interface SidebarProps {
  items: readonly (NavItem & { icon: LucideIcon })[];
  label: string;
  isActive: (item: NavItem) => boolean;
  onItemClick: (item: NavItem, event: MouseEvent<HTMLAnchorElement>) => void;
  onTrade?: () => void;
  crew?: { name: string; onOpen: () => void } | null;
  host?: boolean;
}

export function Sidebar({ items, label, isActive, onItemClick, onTrade, crew, host }: SidebarProps) {
  return (
    <nav className="bx-sidebar" aria-label={label}>
      <p className="bx-sidebar__brand font-brand" aria-hidden="true">
        Buccaneer Exchange
      </p>
      <ul role="list" className="bx-sidebar__list">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <li key={item.id}>
              <NavLink
                to={item.to}
                className="bx-sidebar__link"
                aria-current={active ? 'page' : undefined}
                data-active={active || undefined}
                onClick={(e) => onItemClick(item, e)}
              >
                <Icon size={22} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
        {host && (
          <li>
            <NavLink to="/admin/audit" className="bx-sidebar__link">
              <ClipboardList size={22} aria-hidden="true" />
              <span>Audit</span>
            </NavLink>
          </li>
        )}
      </ul>
      {onTrade && (
        <div className="bx-sidebar__trade">
          <Button variant="filled" size="medium" fullWidth icon={ArrowLeftRight} onClick={onTrade} aria-haspopup="dialog">
            {MOBILE.trade}
          </Button>
        </div>
      )}
      {crew && (
        <button type="button" className="bx-sidebar__crew" onClick={crew.onOpen} aria-haspopup="dialog">
          <Crest initials={crewInitials(crew.name)} size={36} />
          <span className="bx-sidebar__crew-text">
            <span className="t-headline">{crew.name}</span>
            <span className="t-footnote">{SHELL.account}</span>
          </span>
        </button>
      )}
    </nav>
  );
}
