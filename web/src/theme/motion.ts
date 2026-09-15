/**
 * Motion tokens for JavaScript (Web Animations, View Transitions, scroll calls, gesture code).
 * Source of truth: docs/design/MOBILE.md §8. The same curves and durations exist as CSS custom
 * properties in tokens.css (`--ease-*`, `--dur-*`); motion.test.ts keeps the two identical.
 *
 * HIG Motion: brief, purposeful, never the only signal. Under Reduce Motion, x/y/z movement becomes
 * a fade (or nothing), springs tighten and blur never animates (§8.2).
 */

/** §8.1 easing curves. `linear()` needs Safari 17.2+ / Chrome 113+; use `easingFor` to fall back. */
export const EASING = {
  /** SwiftUI default spring (response 0.5, damping 1.0), sampled over 500ms. */
  spring: 'linear(0, 0.06, 0.186, 0.329, 0.466, 0.584, 0.682, 0.76, 0.821, 0.868, 0.903, 0.929, 0.949, 0.963, 0.973, 0.981, 1)',
  /** Snappy spring (bounce 0.15), sampled over 400ms. */
  snappy: 'linear(0, 0.062, 0.198, 0.356, 0.509, 0.642, 0.75, 0.833, 0.895, 0.938, 0.967, 0.985, 0.996, 1.003, 1.005, 1.006, 1)',
  /** Bouncy spring (bounce 0.3), sampled over 600ms. Ceremonies only. */
  bouncy: 'linear(0, 0.059, 0.197, 0.366, 0.535, 0.685, 0.808, 0.902, 0.968, 1.01, 1.034, 1.044, 1.046, 1.041, 1.034, 1.027, 1.019, 1.012, 1.007, 1.003, 1)',
  /** Used wherever `linear()` easing is unsupported. */
  fallback: 'cubic-bezier(.2, .8, .2, 1)',
} as const;

export type SpringName = 'spring' | 'snappy' | 'bouncy';

/** §8.1 durations in milliseconds (CSS: `--dur-<name>`). */
export const DURATION_MS = {
  press: 100,
  release: 250,
  fade: 150,
  flash: 300,
  snappy: 400,
  spring: 500,
  bouncy: 600,
} as const;

/** §8.3 gesture thresholds. */
export const GESTURE = {
  /** Long-press opens the row menu after this long... */
  longPressMs: 500,
  /** ...unless the finger moved further than this. */
  longPressMoveTolerancePx: 10,
  /** Chart scrubbing starts after this much horizontal travel (vertical scroll stays native). */
  scrubThresholdPx: 6,
} as const;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The moments in the §8.2 transition table. */
export const MOTION_MOMENTS = [
  'push',
  'tabSwitch',
  'sheet',
  'menu',
  'largeTitle',
  'segmentThumb',
  'buttonPress',
  'priceTick',
  'ticketStep',
  'sealStamp',
  'sailsUp',
  'podium',
  'skeleton',
  'toast',
  'resultsPage',
  'infoTipExpand',
] as const;

export type MotionMoment = (typeof MOTION_MOMENTS)[number];

export type MotionEffect =
  | 'none'
  | 'fade'
  | 'color'
  | 'slide'
  | 'slide-fade'
  | 'scale'
  | 'scale-fade'
  | 'flash'
  | 'rise'
  | 'shimmer'
  | 'expand'
  | 'ceremony';

export interface MotionSpec {
  /** What moves. Under reduced motion this is only ever 'fade', 'color' or 'none'. */
  readonly effect: MotionEffect;
  readonly durationMs: number;
  /** A CSS / Web Animations easing string. */
  readonly easing: string;
  /** Duration of the way back (button and row press release). Equals `durationMs` otherwise. */
  readonly releaseMs: number;
  /** Slide distance for step and page changes. */
  readonly distancePx: number;
  /** Start scale for scale effects, or the pressed scale for buttons; 1 when unused. */
  readonly scale: number;
  /** Rotation for the market-open compass; 0 when unused. */
  readonly rotateDeg: number;
  readonly staggerMs: number;
  /** `Infinity` for loops (skeleton shimmer). */
  readonly iterations: number;
}

export interface MotionOptions {
  /** The user asked the system to reduce motion. */
  readonly reducedMotion?: boolean;
  /** The browser supports `linear()` easing (defaults to true; see `supportsLinearEasing`). */
  readonly linearEasing?: boolean;
}

type Curve = SpringName | 'linear';

interface MomentDefinition {
  readonly full: Partial<Omit<MotionSpec, 'easing'>> & { effect: MotionEffect; durationMs: number; curve: Curve };
  /** Reduced motion: a short fade, a colour change, or nothing at all. */
  readonly reduced: 'fade' | 'color' | 'none';
}

const FADE = DURATION_MS.fade;

/** §8.2, row by row. */
const MOMENTS: Record<MotionMoment, MomentDefinition> = {
  // Push / pop in a tab: new page slides in from the right, old one moves -30% and dims.
  push: { full: { effect: 'slide', durationMs: DURATION_MS.spring, curve: 'spring' }, reduced: 'fade' },
  // Tab switch is instant (iOS behaviour).
  tabSwitch: { full: { effect: 'none', durationMs: 0, curve: 'linear' }, reduced: 'none' },
  // Sheet present / dismiss slides up; under reduced motion detents snap instantly.
  sheet: { full: { effect: 'slide', durationMs: DURATION_MS.spring, curve: 'spring' }, reduced: 'fade' },
  // Menu / action sheet: scale .9 -> 1 and fade from the trigger.
  menu: { full: { effect: 'scale-fade', durationMs: DURATION_MS.snappy, curve: 'snappy', scale: 0.9 }, reduced: 'fade' },
  // Large title -> inline title cross-fade; under reduced motion the bar's glass switches on instantly.
  largeTitle: { full: { effect: 'fade', durationMs: FADE, curve: 'linear' }, reduced: 'fade' },
  // Segmented thumb and tab platter slide.
  segmentThumb: { full: { effect: 'slide', durationMs: DURATION_MS.snappy, curve: 'snappy' }, reduced: 'none' },
  // Button press: scale .97, 100ms in / 250ms out; reduced motion keeps the colour change only.
  buttonPress: {
    full: { effect: 'scale', durationMs: DURATION_MS.press, curve: 'linear', scale: 0.97, releaseMs: DURATION_MS.release },
    reduced: 'color',
  },
  // Price tick: the value's background flash fades out.
  priceTick: { full: { effect: 'flash', durationMs: DURATION_MS.flash, curve: 'linear' }, reduced: 'none' },
  // Ticket step change: cross-slide 24px and fade.
  ticketStep: { full: { effect: 'slide-fade', durationMs: 250, curve: 'spring', distancePx: 24 }, reduced: 'fade' },
  // Order filled seal: stamp from 1.15 to 1 with a fade.
  sealStamp: { full: { effect: 'scale-fade', durationMs: 250, curve: 'snappy', scale: 1.15 }, reduced: 'fade' },
  // "Sails up": compass rotates 30 degrees, title fades in, auto-dismiss. Skipped under reduced motion (banner only).
  sailsUp: { full: { effect: 'ceremony', durationMs: 1200, curve: 'linear', rotateDeg: 30 }, reduced: 'none' },
  // Podium steps rise with an 80ms stagger.
  podium: { full: { effect: 'rise', durationMs: DURATION_MS.bouncy, curve: 'bouncy', staggerMs: 80 }, reduced: 'fade' },
  // Skeleton shimmer sweeps on a loop; static under reduced motion.
  skeleton: { full: { effect: 'shimmer', durationMs: 1200, curve: 'linear', iterations: Infinity }, reduced: 'none' },
  // Toast drops from below the top bar.
  toast: { full: { effect: 'slide', durationMs: DURATION_MS.snappy, curve: 'snappy' }, reduced: 'fade' },
  // Final results page change: slide 24px and fade.
  resultsPage: { full: { effect: 'slide-fade', durationMs: 250, curve: 'spring', distancePx: 24 }, reduced: 'fade' },
  // InfoTip inline expand inside sheets: height grows.
  infoTipExpand: { full: { effect: 'expand', durationMs: 200, curve: 'spring' }, reduced: 'none' },
};

/** The easing string for a curve, falling back to the cubic-bezier where `linear()` is unsupported. */
export function easingFor(curve: Curve, linearEasing = true): string {
  if (curve === 'linear') return 'linear';
  return linearEasing ? EASING[curve] : EASING.fallback;
}

/** How a §8.2 moment should animate for this user and browser. */
export function motionFor(moment: MotionMoment, options: MotionOptions = {}): MotionSpec {
  const { reducedMotion = false, linearEasing = true } = options;
  const definition = MOMENTS[moment];

  if (reducedMotion) {
    const reducedDuration =
      definition.reduced === 'fade' ? FADE : definition.reduced === 'color' ? definition.full.durationMs : 0;
    return {
      effect: definition.reduced,
      durationMs: reducedDuration,
      easing: 'linear',
      releaseMs: definition.reduced === 'color' ? (definition.full.releaseMs ?? reducedDuration) : reducedDuration,
      distancePx: 0,
      scale: 1,
      rotateDeg: 0,
      staggerMs: 0,
      iterations: 1,
    };
  }

  const { curve, ...full } = definition.full;
  return {
    distancePx: 0,
    scale: 1,
    rotateDeg: 0,
    staggerMs: 0,
    iterations: 1,
    releaseMs: full.durationMs,
    ...full,
    easing: easingFor(curve, linearEasing),
  };
}

type MatchMedia = (query: string) => { readonly matches: boolean };
type CssSupports = (property: string, value: string) => boolean;

const globalMatchMedia = (): MatchMedia | undefined =>
  typeof globalThis.matchMedia === 'function' ? (q) => globalThis.matchMedia(q) : undefined;

const globalCssSupports = (): CssSupports | undefined =>
  typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.supports === 'function'
    ? (p, v) => globalThis.CSS.supports(p, v)
    : undefined;

/** True when the user asked to reduce motion. False where matchMedia is unavailable. */
export function prefersReducedMotion(matchMedia: MatchMedia | undefined = globalMatchMedia()): boolean {
  return matchMedia ? matchMedia(REDUCED_MOTION_QUERY).matches : false;
}

/** True when the browser understands `linear()` easing (Safari 17.2+, Chrome 113+). */
export function supportsLinearEasing(supports: CssSupports | undefined = globalCssSupports()): boolean {
  return supports ? supports('transition-timing-function', 'linear(0, 1)') : false;
}

/** `behavior` for scrollTo / scrollIntoView: smooth normally, instant under reduced motion (§8.2). */
export function scrollBehavior(reducedMotion: boolean = prefersReducedMotion()): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth';
}
