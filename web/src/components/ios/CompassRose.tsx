import type { CSSProperties } from 'react';
import { cx } from './iosCx';
import { ringTicks, roseArms } from './ornamentGeometry';
import './CompassRose.css';

// Geometry in a 100×100 box centred on 0,0 (original design: 4 cardinal and 4 intercardinal
// kite points, 32 ring ticks, a dotted inner ring). Computed once; the ornament never changes.
const CARDINAL = roseArms(0, 0, 44, 7, 4, 0);
const INTERCARDINAL = roseArms(0, 0, 29, 4.5, 4, 45);
const TICKS = ringTicks(0, 0, 40, 46, 32);

/**
 * The rose as an SVG `<g>` in a 100-unit box centred on 0,0, for reuse inside other ornaments
 * (the WaxSeal emboss). Colours come from `--rose-light`, `--rose-dark` and `--rose-line`.
 */
export function CompassRoseGlyph({ className }: { className?: string }) {
  return (
    <g className={cx('compass-rose-glyph', className)}>
      <circle className="compass-rose-glyph__line" r={46} strokeWidth={1.2} />
      <circle className="compass-rose-glyph__line" r={40} strokeWidth={0.8} />
      <circle className="compass-rose-glyph__line" r={22} strokeWidth={0.7} strokeDasharray="0.8 1.6" />
      <path className="compass-rose-glyph__line" d={TICKS} strokeWidth={0.9} strokeLinecap="round" />
      {INTERCARDINAL.map((arm, i) => (
        <g key={`i${i}`}>
          <path className="compass-rose-glyph__light" d={arm.light} />
          <path className="compass-rose-glyph__dark" d={arm.dark} />
        </g>
      ))}
      {CARDINAL.map((arm, i) => (
        <g key={`c${i}`}>
          <path className="compass-rose-glyph__light" d={arm.light} />
          <path className="compass-rose-glyph__dark" d={arm.dark} />
        </g>
      ))}
      <circle className="compass-rose-glyph__hub" r={3} strokeWidth={0.8} />
    </g>
  );
}

export interface CompassRoseProps {
  /** Rendered size in px (56 on the Sign in lockup, 44 in empty states). */
  size?: number;
  /** Rotate 360° every 2s (loader). Always static under reduced motion (MOBILE §5.19). */
  spin?: boolean;
  /** `brass`: gold engraving for hull screens. `current`: follows the text colour (ledger empty states). */
  tone?: 'brass' | 'current';
  className?: string;
  style?: CSSProperties;
}

/** CompassRose ornament (spec §10 ornaments). Decorative: always `aria-hidden`. */
export function CompassRose({ size = 56, spin = false, tone = 'brass', className, style }: CompassRoseProps) {
  return (
    <svg
      className={cx('compass-rose', spin && 'compass-rose--spin', className)}
      data-tone={tone}
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <CompassRoseGlyph />
    </svg>
  );
}

export interface CompassLoaderProps {
  /** COPY §12 `loading.*.title`, e.g. "Loading prices…". Always visible, so the static rose still says what is happening. */
  label?: string;
  /** Optional COPY §12 `loading.*.flavor`, e.g. "Reading the winds". */
  flavor?: string;
  size?: number;
  className?: string;
}

/**
 * Hull-screen loader (MOBILE §5.19, spec `Loader`): a compass rose turning once every 2s over
 * its loading title. Under reduced motion the rose is static and the text carries the state.
 * The container is `aria-busy`; nothing is announced live (live regions are reserved for
 * order results and phase changes).
 */
export function CompassLoader({ label = 'Loading…', flavor, size = 56, className }: CompassLoaderProps) {
  return (
    <div className={cx('compass-loader', className)} aria-busy="true">
      <CompassRose size={size} spin />
      <p className="compass-loader__label">{label}</p>
      {flavor && <p className="compass-loader__flavor">{flavor}</p>}
    </div>
  );
}
