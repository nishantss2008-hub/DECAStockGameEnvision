import type { CSSProperties } from 'react';
import type { Sector } from '@deca/shared';
import { crestFill, crestLetters, crestMetrics, type CrestSize } from './crestStyle';
import './Crest.css';

export interface CrestProps {
  /** Company crest: first two letters of the ticker. */
  ticker?: string;
  /** Crew crest: host-set initials (wins over `ticker`). */
  initials?: string;
  /** Sector colour; omit for crews (hull fill). */
  sector?: Sector;
  size?: CrestSize;
  className?: string;
}

/**
 * Crest monogram roundel (MOBILE §5.21). Always decorative: the company or
 * crew name must be adjacent, so the crest is hidden from assistive tech.
 */
export function Crest({ ticker, initials, sector, size = 36, className }: CrestProps) {
  const { fontSize, ring } = crestMetrics(size);
  const style = {
    '--crest-size': `${size}px`,
    '--crest-fill': crestFill(initials ? undefined : sector),
    '--crest-font': `${fontSize}px`,
    '--crest-ring': `${ring}px`,
  } as CSSProperties;
  return (
    <span className={className ? `ios-crest ${className}` : 'ios-crest'} style={style} aria-hidden="true">
      {crestLetters({ ticker, initials })}
    </span>
  );
}
