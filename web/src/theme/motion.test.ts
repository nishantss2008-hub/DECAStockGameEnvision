import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customProperties, declarationsFor, parseStylesheet } from './cssTokens';
import {
  DURATION_MS,
  EASING,
  GESTURE,
  MOTION_MOMENTS,
  REDUCED_MOTION_QUERY,
  easingFor,
  motionFor,
  prefersReducedMotion,
  scrollBehavior,
  supportsLinearEasing,
  type MotionMoment,
} from './motion';

const rules = parseStylesheet(readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8'));
const tokens = customProperties(rules, {});

const numbersIn = (easing: string) =>
  (/^linear\((.*)\)$/.exec(easing)?.[1] ?? '').split(',').map((n) => Number(n.trim()));

describe('motion tokens (MOBILE §8.1)', () => {
  it('uses the sampled spring curves exactly', () => {
    expect(EASING.spring).toBe(
      'linear(0, 0.06, 0.186, 0.329, 0.466, 0.584, 0.682, 0.76, 0.821, 0.868, 0.903, 0.929, 0.949, 0.963, 0.973, 0.981, 1)',
    );
    expect(EASING.snappy).toBe(
      'linear(0, 0.062, 0.198, 0.356, 0.509, 0.642, 0.75, 0.833, 0.895, 0.938, 0.967, 0.985, 0.996, 1.003, 1.005, 1.006, 1)',
    );
    expect(EASING.bouncy).toBe(
      'linear(0, 0.059, 0.197, 0.366, 0.535, 0.685, 0.808, 0.902, 0.968, 1.01, 1.034, 1.044, 1.046, 1.041, 1.034, 1.027, 1.019, 1.012, 1.007, 1.003, 1)',
    );
    expect(EASING.fallback).toBe('cubic-bezier(.2, .8, .2, 1)');
  });

  it('starts every curve at 0 and settles at 1; only snappy and bouncy overshoot', () => {
    for (const name of ['spring', 'snappy', 'bouncy'] as const) {
      const points = numbersIn(EASING[name]);
      expect(points[0]).toBe(0);
      expect(points[points.length - 1]).toBe(1);
    }
    expect(Math.max(...numbersIn(EASING.spring))).toBe(1);
    expect(Math.max(...numbersIn(EASING.snappy))).toBeGreaterThan(1);
    expect(Math.max(...numbersIn(EASING.bouncy))).toBeGreaterThan(1.04);
  });

  it('has the documented durations', () => {
    expect(DURATION_MS).toEqual({ press: 100, release: 250, fade: 150, flash: 300, snappy: 400, spring: 500, bouncy: 600 });
  });

  it('matches the CSS custom properties in tokens.css', () => {
    expect(tokens['--ease-spring']).toBe(EASING.spring);
    expect(tokens['--ease-snappy']).toBe(EASING.snappy);
    expect(tokens['--ease-bouncy']).toBe(EASING.bouncy);
    expect(tokens['--ease-fallback']).toBe(EASING.fallback);
    for (const [name, ms] of Object.entries(DURATION_MS)) expect(tokens[`--dur-${name}`], name).toBe(`${ms}ms`);
  });

  it('falls back to the cubic-bezier curve where linear() easing is unsupported', () => {
    const unsupported = customProperties(rules, { supports: (q) => q.startsWith('not') });
    for (const name of ['spring', 'snappy', 'bouncy']) expect(unsupported[`--ease-${name}`]).toBe('var(--ease-fallback)');
    const supported = customProperties(rules, { supports: (q) => !q.startsWith('not') });
    expect(supported['--ease-spring']).toBe(EASING.spring);
    expect(declarationsFor(rules, {}, [':root'])['--ease-fallback']).toBe(EASING.fallback);
  });

  it('exposes the MOBILE §8.3 gesture thresholds', () => {
    expect(GESTURE).toEqual({ longPressMs: 500, longPressMoveTolerancePx: 10, scrubThresholdPx: 6 });
  });
});

describe('easingFor', () => {
  it('returns the curve, or the fallback when linear() is unsupported', () => {
    expect(easingFor('snappy', true)).toBe(EASING.snappy);
    expect(easingFor('snappy', false)).toBe(EASING.fallback);
    expect(easingFor('linear', false)).toBe('linear');
  });
});

describe('motionFor (MOBILE §8.2)', () => {
  type Row = [MotionMoment, string, number, string, string, number];
  // moment, effect, duration, easing | reduced effect, reduced duration
  const TABLE: Row[] = [
    ['push', 'slide', 500, EASING.spring, 'fade', 150],
    ['tabSwitch', 'none', 0, 'linear', 'none', 0],
    ['sheet', 'slide', 500, EASING.spring, 'fade', 150],
    ['menu', 'scale-fade', 400, EASING.snappy, 'fade', 150],
    ['largeTitle', 'fade', 150, 'linear', 'fade', 150],
    ['segmentThumb', 'slide', 400, EASING.snappy, 'none', 0],
    ['buttonPress', 'scale', 100, 'linear', 'color', 100],
    ['priceTick', 'flash', 300, 'linear', 'none', 0],
    ['ticketStep', 'slide-fade', 250, EASING.spring, 'fade', 150],
    ['sealStamp', 'scale-fade', 250, EASING.snappy, 'fade', 150],
    ['sailsUp', 'ceremony', 1200, 'linear', 'none', 0],
    ['podium', 'rise', 600, EASING.bouncy, 'fade', 150],
    ['skeleton', 'shimmer', 1200, 'linear', 'none', 0],
    ['toast', 'slide', 400, EASING.snappy, 'fade', 150],
    ['resultsPage', 'slide-fade', 250, EASING.spring, 'fade', 150],
    ['infoTipExpand', 'expand', 200, EASING.spring, 'none', 0],
  ];

  it('covers every moment in the table', () => {
    expect([...MOTION_MOMENTS].sort()).toEqual(TABLE.map(([m]) => m).sort());
  });

  it.each(TABLE)('%s: %s %ims, reduced motion: %s', (moment, effect, duration, easing, reducedEffect, reducedDuration) => {
    expect(motionFor(moment)).toMatchObject({ effect, durationMs: duration, easing });
    const reduced = motionFor(moment, { reducedMotion: true });
    expect(reduced).toMatchObject({ effect: reducedEffect, durationMs: reducedDuration });
    expect(reduced.distancePx).toBe(0);
    expect(reduced.iterations).toBe(1);
    expect(reduced.staggerMs).toBe(0);
    if (reducedEffect !== 'color') expect(reduced.easing).toBe('linear');
  });

  it('keeps the extra parameters for full motion', () => {
    expect(motionFor('ticketStep').distancePx).toBe(24);
    expect(motionFor('resultsPage').distancePx).toBe(24);
    expect(motionFor('podium').staggerMs).toBe(80);
    expect(motionFor('skeleton').iterations).toBe(Infinity);
    expect(motionFor('buttonPress')).toMatchObject({ scale: 0.97, releaseMs: 250 });
    expect(motionFor('sealStamp').scale).toBe(1.15);
    expect(motionFor('menu').scale).toBe(0.9);
    expect(motionFor('sailsUp').rotateDeg).toBe(30);
  });

  it('uses the fallback curve when linear() easing is unsupported', () => {
    expect(motionFor('sheet', { linearEasing: false }).easing).toBe(EASING.fallback);
    expect(motionFor('priceTick', { linearEasing: false }).easing).toBe('linear');
  });
});

describe('runtime helpers', () => {
  it('reads prefers-reduced-motion through matchMedia', () => {
    const seen: string[] = [];
    const matchMedia = (query: string) => {
      seen.push(query);
      return { matches: true };
    };
    expect(prefersReducedMotion(matchMedia)).toBe(true);
    expect(seen).toEqual([REDUCED_MOTION_QUERY]);
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it('assumes full motion when matchMedia is unavailable (node, old browsers)', () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('detects linear() easing support through CSS.supports', () => {
    expect(supportsLinearEasing((property, value) => property === 'transition-timing-function' && value === 'linear(0, 1)')).toBe(true);
    expect(supportsLinearEasing(() => false)).toBe(false);
    expect(supportsLinearEasing(undefined)).toBe(false);
  });

  it('scrolls instantly under reduced motion', () => {
    expect(scrollBehavior(false)).toBe('smooth');
    expect(scrollBehavior(true)).toBe('auto');
  });
});
