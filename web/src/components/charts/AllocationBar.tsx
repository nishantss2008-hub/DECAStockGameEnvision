import type { CSSProperties } from 'react';
import { cx } from '../ios/iosCx';
import { allocationSegments, type AllocationItem } from './allocation';
import '../ios/iosShared.css';
import './AllocationBar.css';

export interface AllocationBarProps {
  /** Holdings in value order, then cash (kind "cash"). Values in integer cents. */
  items: readonly AllocationItem[];
  /** Accessible name of the legend list, e.g. "Where your money is". */
  legendLabel?: string;
  className?: string;
}

/**
 * AllocationBar (MOBILE §5.13, §7.4): 12px stacked capsule of holdings and cash in sector crest
 * colours, with 2px gaps and an in-order two-column legend. Holdings in the same sector share a
 * colour, so the gaps and the legend text — not colour — tell them apart. The bar is decoration;
 * the legend list carries every label and percentage.
 */
export function AllocationBar({ items, legendLabel, className }: AllocationBarProps) {
  const segments = allocationSegments(items);
  if (segments.length === 0) return null;
  return (
    <div className={cx('allocation-bar', className)}>
      <div className="allocation-bar__bar" aria-hidden="true">
        {segments.map((s) => (
          <span
            key={s.id}
            className="allocation-bar__segment"
            data-kind={s.kind ?? 'holding'}
            style={{ '--seg-color': s.color, '--seg-grow': s.fraction } as CSSProperties}
          />
        ))}
      </div>
      <ul className="allocation-bar__legend" role="list" aria-label={legendLabel}>
        {segments.map((s) => (
          <li key={s.id} className="allocation-bar__item">
            <span
              className="allocation-bar__swatch"
              data-kind={s.kind ?? 'holding'}
              style={{ '--seg-color': s.color } as CSSProperties}
              aria-hidden="true"
            />
            <span className="allocation-bar__name">{s.label}</span>
            <span className="allocation-bar__pct ios-num">{s.percentText}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
