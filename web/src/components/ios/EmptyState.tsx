/**
 * EmptyState (MOBILE §5.18): centred in its card or screen.
 *
 * 44px icon (`--label-3`) · Title 3 semibold title · Subhead body (max 280px) · optional medium
 * Tinted button · optional Footnote flavor. Copy comes from COPY §12 `empty.*`, e.g. positions:
 * "No positions yet" + "Open Markets".
 *
 * `variant="hull"` (results not open yet): hull card, gold title, flavor "The fog hasn't lifted."
 * Pass the compass ornament as `art` there; a lucide Compass is the fallback.
 */
import type { ComponentType, ReactNode } from 'react';
import { Compass, type LucideProps } from 'lucide-react';
import { Button } from './Button';
import './EmptyState.css';

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  icon?: ComponentType<LucideProps>;
  /** Custom decorative art (e.g. the CompassRose ornament); rendered `aria-hidden`. */
  art?: ReactNode;
  action?: { label: string; onClick: () => void };
  flavor?: string;
  variant?: 'default' | 'hull';
  /** Title heading level; 2 for a whole screen, 3 inside a titled section. */
  headingLevel?: 2 | 3;
  className?: string;
}

export function EmptyState({
  title,
  body,
  icon,
  art,
  action,
  flavor,
  variant = 'default',
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Icon = icon ?? (variant === 'hull' ? Compass : null);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div
      className={['ios-empty', variant === 'hull' ? 'hull' : null, className].filter(Boolean).join(' ')}
      data-variant={variant}
    >
      {art ? (
        <div className="ios-empty__art" aria-hidden="true">
          {art}
        </div>
      ) : Icon ? (
        <Icon className="ios-empty__icon" size={44} strokeWidth={1.75} aria-hidden="true" />
      ) : null}
      <Heading className="ios-empty__title">{title}</Heading>
      {body ? <p className="ios-empty__body">{body}</p> : null}
      {action ? (
        <Button variant="tinted" size="medium" onClick={action.onClick} className="ios-empty__action">
          {action.label}
        </Button>
      ) : null}
      {flavor ? <p className="ios-empty__flavor">{flavor}</p> : null}
    </div>
  );
}
