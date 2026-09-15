import type { CSSProperties } from 'react';
import { Medallion } from './Medallion';
import { SignedChange } from './SignedChange';
import { cx } from './iosCx';
import { podiumOrder, podiumStepHeight } from './ornamentGeometry';
import './iosShared.css';
import './Podium.css';

export interface PodiumEntry {
  id: string;
  rank: 1 | 2 | 3;
  /** Crew name, e.g. "Queen Anne's Revenue". */
  name: string;
  /** Crest initials, e.g. "QA". */
  initials: string;
  /** Final account value for the eye, e.g. "Ð1,187,420.66". */
  valueText: string;
  /** Same value for VoiceOver, e.g. "1,187,420.66 doubloons". Defaults to `valueText`. */
  valueSpoken?: string;
  /** Total return as a signed fraction (0.1874 = +18.74%). */
  change?: number;
}

export interface PodiumProps {
  /** Up to three entries; rendered and read in rank order 1-2-3, drawn 2-1-3. */
  entries: readonly PodiumEntry[];
  /** Accessible name of the list, e.g. "Top three crews". */
  label: string;
  /** Steps rise 600ms with an 80ms stagger; a 150ms fade under reduced motion (MOBILE §8.2). */
  animate?: boolean;
  className?: string;
}

/**
 * Podium (MOBILE §5.22, §7.13 page 1): three hull steps of 96 / 72 / 56px with a brass top rule,
 * a Medallion on each and the crew name and value underneath. Hull screens only. The DOM and
 * reading order is 1st, 2nd, 3rd; CSS `order` draws them 2nd, 1st, 3rd.
 */
export function Podium({ entries, label, animate = false, className }: PodiumProps) {
  const places = [...entries].sort((a, b) => a.rank - b.rank).slice(0, 3);
  return (
    <ol className={cx('podium', animate && 'podium--animate', className)} role="list" aria-label={label}>
      {places.map((entry) => {
        const style = {
          '--podium-order': podiumOrder(entry.rank),
          '--podium-step': `${podiumStepHeight(entry.rank)}px`,
          '--podium-i': 3 - entry.rank,
        } as CSSProperties;
        return (
          <li key={entry.id} className="podium__place" data-rank={entry.rank} style={style}>
            <Medallion rank={entry.rank} initials={entry.initials} className="podium__medal motion-safe" />
            <span className="podium__step motion-safe" aria-hidden="true" />
            <span className="podium__caption motion-safe">
              <span className="podium__name">{entry.name}</span>
              <span className="podium__value ios-num">
                <span aria-hidden="true">{entry.valueText}</span>
                <span className="ios-sr-only">{entry.valueSpoken ?? entry.valueText}</span>
              </span>
              {entry.change !== undefined && (
                <SignedChange className="podium__change" value={entry.change} kind="pct" />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
