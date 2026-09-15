import type { CSSProperties } from 'react';
import { crestLetters, crestMetrics } from './crestStyle';
import { cx } from './iosCx';
import { medallionSpec, ordinal } from './ornamentGeometry';
import './Crest.css';
import './Medallion.css';

export interface MedallionProps {
  /** Final rank. 1–3 are gold, silver and bronze; lower ranks get a plain hull disc. */
  rank: number;
  /** Crew initials for the centred crest (host-set, max 2 letters). */
  initials: string;
  /** Diameter override in px; the crest scales with it. Default 96 (1st) or 80 (2nd, 3rd). */
  size?: number;
  /** Rank below the metal as Title 3, e.g. "1st" (never on the metal). Default true. */
  showRank?: boolean;
  className?: string;
}

/**
 * Medallion (MOBILE §5.22): a metal disc (radial gradient, 3px inner ring at 25% black) with the
 * crew crest centred, and the rank written underneath. The disc is decoration; the rank is text.
 * The crew name must be adjacent (the Podium puts it under each step).
 */
export function Medallion({ rank, initials, size, showRank = true, className }: MedallionProps) {
  const spec = medallionSpec(rank);
  const diameter = size ?? spec.diameter;
  const crestSize = Math.round((diameter * spec.crestSize) / spec.diameter);
  const { fontSize, ring } = crestMetrics(crestSize);
  const discStyle = { '--medal-size': `${diameter}px` } as CSSProperties;
  const crestStyle = {
    '--crest-size': `${crestSize}px`,
    '--crest-font': `${fontSize}px`,
    '--crest-ring': `${ring}px`,
  } as CSSProperties;

  return (
    <span className={cx('medallion', className)} data-metal={spec.metal}>
      <span className="medallion__disc" style={discStyle} aria-hidden="true">
        <span className="ios-crest medallion__crest" style={crestStyle}>
          {crestLetters({ initials })}
        </span>
      </span>
      {showRank && <span className="medallion__rank ios-num">{ordinal(rank)}</span>}
    </span>
  );
}
