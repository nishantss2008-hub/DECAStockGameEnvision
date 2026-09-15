import { useId, type ReactNode } from 'react';
import { cx } from './iosCx';
import './InsetGroupedList.css';

export interface InsetGroupedListProps {
  /** Section header text; rendered as a real heading. */
  header?: ReactNode;
  /** prominent: Headline in --label (content) · plain: Footnote in --label-2 (forms, settings). */
  headerVariant?: 'prominent' | 'plain';
  /** Trailing header action, e.g. a "See all 7" link. Rendered outside the heading. */
  headerAction?: ReactNode;
  /** Footnote under the card; also the section's accessible description. */
  footer?: ReactNode;
  /** Rows (<ListRow>, <StockRow>, …) — each renders its own <li>. */
  children: ReactNode;
  /** Name for a headerless section. */
  'aria-label'?: string;
  headingLevel?: 2 | 3;
  /** page: --cell rows on the grouped background · sheet: --elevated-cell rows inside a sheet. */
  surface?: 'page' | 'sheet';
  id?: string;
  className?: string;
}

/**
 * InsetGroupedList (MOBILE §5.4): optional header → rounded card of rows →
 * optional footer. The page container supplies the side margins.
 */
export function InsetGroupedList({
  header,
  headerVariant = 'prominent',
  headerAction,
  footer,
  children,
  'aria-label': ariaLabel,
  headingLevel = 2,
  surface = 'page',
  id,
  className,
}: InsetGroupedListProps) {
  const uid = useId();
  const headerId = `${uid}-header`;
  const footerId = `${uid}-footer`;
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const hasHeader = header !== undefined && header !== null;

  return (
    <section
      id={id}
      className={cx('ios-list', hasHeader && 'ios-list--has-header', className)}
      data-surface={surface}
      aria-labelledby={hasHeader ? headerId : undefined}
      aria-label={hasHeader ? undefined : ariaLabel}
      aria-describedby={footer ? footerId : undefined}
    >
      {hasHeader && (
        <div className="ios-list__header" data-variant={headerVariant}>
          <Heading id={headerId} className="ios-list__title">
            {header}
          </Heading>
          {headerAction && <div className="ios-list__action">{headerAction}</div>}
        </div>
      )}
      <ul className="ios-list__card" role="list">
        {children}
      </ul>
      {footer && (
        <div id={footerId} className="ios-list__footer">
          {footer}
        </div>
      )}
    </section>
  );
}
