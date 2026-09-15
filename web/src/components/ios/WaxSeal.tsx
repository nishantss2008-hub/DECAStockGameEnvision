import { CompassRoseGlyph } from './CompassRose';
import { cx } from './iosCx';
import { sealPath } from './ornamentGeometry';
import './WaxSeal.css';

/** Lobed outline, computed once (deterministic, MOBILE §5.23: 14 irregular lobes). */
const SEAL = sealPath(0, 0, 47);

export interface WaxSealProps {
  /**
   * `brass` (#C9982F, monogram #4A3509): the order-filled seal. `crimson` (#8E1F1A): reserved for
   * game over ("Voyage complete") and destructive moments (plan Global Constraints).
   */
  tone?: 'brass' | 'crimson';
  /** 64 (order filled) or 120 (Voyage complete), MOBILE §5.23. */
  size?: number;
  /** Letters pressed into the wax, e.g. "BX". Omitted: the embossed original compass rose. */
  monogram?: string;
  /** Stamp in: scale 1.15 → 1 + fade over 250ms; fade only under reduced motion (MOBILE §8.2). */
  animate?: boolean;
  className?: string;
}

/**
 * WaxSeal (MOBILE §5.23): a 14-lobe irregular wax disc with an inner ring, an embossed compass
 * rose (or monogram) and a brass rim highlight. Ornament only: it never carries data and is
 * always hidden from assistive tech; the heading beside it ("Order filled") says what happened.
 */
export function WaxSeal({ tone = 'brass', size = 64, monogram, animate = false, className }: WaxSealProps) {
  return (
    <svg
      className={cx('wax-seal', animate && 'wax-seal--stamp motion-safe', className)}
      data-tone={tone}
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path className="wax-seal__shadow" d={SEAL} transform="translate(1.2 2)" />
      <path className="wax-seal__body" d={SEAL} />
      <path className="wax-seal__rim" d={SEAL} />
      <circle className="wax-seal__ring" r={34} strokeWidth={2.2} />
      <circle className="wax-seal__ring" r={29.5} strokeWidth={1.1} strokeDasharray="0.1 3.2" strokeLinecap="round" />
      <path className="wax-seal__gloss" d="M-31 -21 A38 38 0 0 1 4 -38" strokeWidth={3} strokeLinecap="round" />
      {monogram ? (
        <g className="wax-seal__monogram" textAnchor="middle">
          <text className="wax-seal__monogram-shadow" x={0.9} y={10}>
            {monogram.slice(0, 2).toUpperCase()}
          </text>
          <text className="wax-seal__monogram-face" x={0} y={9}>
            {monogram.slice(0, 2).toUpperCase()}
          </text>
        </g>
      ) : (
        <g className="wax-seal__emboss">
          <g transform="translate(0.8 1) scale(0.56)" className="wax-seal__emboss-shadow">
            <CompassRoseGlyph />
          </g>
          <g transform="scale(0.56)" className="wax-seal__emboss-face">
            <CompassRoseGlyph />
          </g>
        </g>
      )}
    </svg>
  );
}
