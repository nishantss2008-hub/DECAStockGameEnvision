/**
 * web/src/theme/base.css against the MOBILE.md checklists: §3.2–§3.5 type, §4.3 chrome,
 * §8.2 reduced motion, §9.4 base CSS, §10 focus and screen-reader utilities.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  customProperties,
  declarationsFor,
  parseStylesheet,
  referencedCustomProperties,
  type StyleEnvironment,
} from './cssTokens';

const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
const baseCss = read('./base.css');
const rules = parseStylesheet(baseCss);
const tokenRules = parseStylesheet(read('./tokens.css'));

const decl = (selector: string, env: StyleEnvironment = {}) => declarationsFor(rules, env, [selector]);

describe('root and Dynamic Type (MOBILE §3.5)', () => {
  it('sizes the root at 17px, stops text inflation and removes the tap flash', () => {
    expect(decl('html')).toMatchObject({
      'font-size': '106.25%',
      '-webkit-text-size-adjust': '100%',
      'text-size-adjust': '100%',
      '-webkit-tap-highlight-color': 'transparent',
      'background-color': 'var(--bg-grouped)',
      'overscroll-behavior-y': 'contain',
      'accent-color': 'var(--tint)',
    });
  });

  it('follows the iOS Text Size setting only on iOS', () => {
    const iosOnly = '(font: -apple-system-body) and (-webkit-touch-callout: none)';
    expect(decl('html', { supports: (q) => q === iosOnly })).toMatchObject({
      font: '-apple-system-body',
      'font-family': 'var(--font-ui)',
    });
    expect(decl('html').font).toBeUndefined();
  });

  it('sets the system font, body style and explicit backgrounds on body', () => {
    expect(decl('body')).toMatchObject({
      'font-family': 'var(--font-ui)',
      'font-size': 'var(--t-body)',
      'line-height': 'var(--lh-body)',
      'letter-spacing': 'normal',
      color: 'var(--label)',
      'background-color': 'var(--bg-grouped)',
      'overscroll-behavior-y': 'contain',
    });
  });

  it('paints hull routes on the hull colour', () => {
    expect(decl('html[data-hull]')).toMatchObject({ 'background-color': '#111412', 'color-scheme': 'dark' });
  });
});

describe('Dynamic Type classes (MOBILE §3.3)', () => {
  it.each([
    ['large-title', '400', '700'],
    ['title-1', '400', '700'],
    ['title-2', '400', '700'],
    ['title-3', '400', '600'],
    ['headline', '600', '600'],
    ['body', '400', '600'],
    ['callout', '400', '600'],
    ['subhead', '400', '600'],
    ['footnote', '400', '600'],
    ['caption-1', '400', '600'],
    ['caption-2', '400', '600'],
    ['amount', '600', '600'],
  ])('.t-%s uses its size and leading tokens, weight %s (emphasized %s)', (name, weight, emphasized) => {
    expect(decl(`.t-${name}`)).toMatchObject({
      'font-size': `var(--t-${name})`,
      'line-height': `var(--lh-${name})`,
      'font-weight': weight,
      '--t-emphasized': emphasized,
    });
  });

  it('emphasizes with the weight each style defines', () => {
    expect(decl('.t-emph')['font-weight']).toBe('var(--t-emphasized, 600)');
    const order = rules.map((r) => r.selectors.join(','));
    expect(order.indexOf('.t-emph')).toBeGreaterThan(order.indexOf('.t-amount'));
  });

  it('uses tabular lining numerals for numbers (MOBILE §3.4)', () => {
    expect(decl('.num')['font-variant-numeric']).toBe('tabular-nums lining-nums');
  });

  it('offers mono and brand font utilities; the brand face never wraps', () => {
    expect(decl('.font-mono')['font-family']).toBe('var(--font-mono)');
    expect(decl('.font-brand')).toMatchObject({ 'font-family': 'var(--font-brand)', 'font-weight': '700', 'white-space': 'nowrap' });
  });
});

describe('base CSS checklist (MOBILE §9.4)', () => {
  it('never lets iOS zoom into a focused field', () => {
    for (const el of ['input', 'select', 'textarea']) expect(decl(el)['font-size']).toBe('max(16px, 1rem)');
  });

  it('uses the secondary label colour for placeholders', () => {
    expect(declarationsFor(rules, {}, ['::placeholder'])).toMatchObject({ color: 'var(--label-2)', opacity: '1' });
  });

  it('removes double-tap zoom delay on controls without disabling pinch zoom', () => {
    const rule = rules.find((r) => r.declarations['touch-action'] === 'manipulation');
    expect(rule?.selectors.join(',')).toMatch(/button/);
    expect(baseCss).not.toMatch(/touch-action:\s*none/);
  });

  it('has 100dvh app frame and 100svh page shell', () => {
    expect(decl('.app-frame')['min-height']).toBe('100dvh');
    expect(decl('.page-shell')['min-height']).toBe('100svh');
  });

  it.each([
    ['.safe-top', 'padding-top', 'env(safe-area-inset-top, 0px)'],
    ['.safe-right', 'padding-right', 'env(safe-area-inset-right, 0px)'],
    ['.safe-bottom', 'padding-bottom', 'env(safe-area-inset-bottom, 0px)'],
    ['.safe-left', 'padding-left', 'env(safe-area-inset-left, 0px)'],
    ['.gutter-x', 'padding-left', 'var(--gutter-left)'],
    ['.gutter-x', 'padding-right', 'var(--gutter-right)'],
    ['.clear-tabbar', 'padding-bottom', 'var(--content-bottom)'],
  ])('%s sets %s from the safe area', (selector, property, value) => {
    expect(decl(selector)[property]).toBe(value);
  });

  it('contains overscroll and suppresses the long-press callout where asked', () => {
    expect(decl('.overscroll-contain')['overscroll-behavior']).toBe('contain');
    expect(decl('.no-callout')).toMatchObject({
      '-webkit-touch-callout': 'none',
      '-webkit-user-select': 'none',
      'user-select': 'none',
    });
  });

  it('removes closed overlays from layout', () => {
    expect(decl('[hidden]').display).toBe('none !important');
  });

  it('keeps list semantics for role="list" while removing bullets', () => {
    expect(declarationsFor(rules, {}, [':where(ul, ol)[role="list"]'])).toMatchObject({ 'list-style': 'none', padding: '0' });
  });
});

describe('accessibility (MOBILE §10)', () => {
  it('draws a 2px focus ring with a 2px offset on every keyboard-focused element', () => {
    expect(decl(':focus-visible')).toMatchObject({ outline: '2px solid var(--focus)', 'outline-offset': '2px' });
    expect(decl('.focus-inset:focus-visible')['outline-offset']).toBe('-2px');
  });

  it('thickens the ring under increased contrast and uses the system colour in forced colours', () => {
    expect(decl(':focus-visible', { contrast: 'more' })['outline-width']).toBe('3px');
    expect(decl(':focus-visible', { forcedColors: true })['outline-color']).toBe('Highlight');
  });

  it('never removes an outline without a replacement', () => {
    for (const rule of rules) {
      const outline = rule.declarations.outline ?? rule.declarations['outline-style'];
      expect(outline === 'none' || outline === '0', rule.selectors.join(',')).toBe(false);
    }
  });

  it('hides .sr-only content visually but not from assistive technology', () => {
    expect(decl('.sr-only')).toMatchObject({
      position: 'absolute !important',
      width: '1px !important',
      height: '1px !important',
      overflow: 'hidden !important',
      'clip-path': 'inset(50%) !important',
      'white-space': 'nowrap !important',
    });
    expect(decl('.sr-only')).not.toHaveProperty('display');
    expect(decl('.sr-only')).not.toHaveProperty('visibility');
  });

  it('shows .sr-only-focusable when it receives focus (skip links)', () => {
    const shown = declarationsFor(rules, {}, ['.sr-only-focusable:focus']);
    expect(shown).toMatchObject({ position: 'static !important', width: 'auto !important', 'clip-path': 'none !important' });
  });
});

describe('reduced motion (MOBILE §8.2)', () => {
  const reduced: StyleEnvironment = { reducedMotion: true };
  const universal = '*:not(.motion-safe)';

  it('does nothing when motion is allowed', () => {
    expect(decl(universal)).toEqual({});
    expect(decl('html')['scroll-behavior']).toBeUndefined();
  });

  it('scrolls instantly', () => {
    expect(decl('html', reduced)['scroll-behavior']).toBe('auto !important');
  });

  it('finishes CSS animations at once, keeping their end state, and stops loops', () => {
    expect(decl(universal, reduced)).toMatchObject({
      'animation-duration': '1ms !important',
      'animation-delay': '0ms !important',
      'animation-iteration-count': '1 !important',
    });
    const rule = rules.find((r) => r.selectors.includes(universal));
    expect(rule?.selectors).toEqual([universal, `${universal}::before`, `${universal}::after`]);
  });

  it('keeps colour, opacity and brightness fades but drops movement, resizing and backdrop blur transitions', () => {
    const property = decl(universal, reduced)['transition-property'] ?? '';
    const kept = property.replace(' !important', '').split(',').map((p) => p.trim());
    // `filter` stays: pressed buttons darken with filter: brightness() (MOBILE §5.7, "colour change only").
    expect(kept).toEqual(expect.arrayContaining(['opacity', 'color', 'background-color', 'filter']));
    for (const moving of ['all', 'transform', 'translate', 'scale', 'rotate', 'top', 'left', 'right', 'bottom', 'inset', 'width', 'height', 'backdrop-filter', '-webkit-backdrop-filter']) {
      expect(kept).not.toContain(moving);
    }
  });

  it('turns page transitions into a 150ms cross-fade unless the browser animated its own swipe', () => {
    expect(declarationsFor(rules, reduced, [':root:not([data-nav="ua"])::view-transition-old(*)']).animation).toBe(
      'bx-fade-out var(--dur-fade) linear both !important',
    );
    expect(declarationsFor(rules, reduced, [':root:not([data-nav="ua"])::view-transition-new(*)']).animation).toBe(
      'bx-fade-in var(--dur-fade) linear both !important',
    );
    expect(declarationsFor(rules, reduced, ['::view-transition-group(*)'])['animation-duration']).toBe('0ms !important');
    expect(baseCss).toMatch(/@keyframes bx-fade-in\s*\{\s*from\s*\{\s*opacity:\s*0;?\s*\}\s*\}/);
    expect(baseCss).toMatch(/@keyframes bx-fade-out\s*\{\s*to\s*\{\s*opacity:\s*0;?\s*\}\s*\}/);
  });
});

describe('hygiene', () => {
  it('only references custom properties defined in tokens.css or base.css', () => {
    const defined = new Set([
      ...Object.keys(customProperties(tokenRules, {})),
      ...rules.flatMap((r) => Object.keys(r.declarations).filter((k) => k.startsWith('--'))),
    ]);
    for (const rule of rules) {
      for (const value of Object.values(rule.declarations)) {
        for (const name of referencedCustomProperties(value)) expect(defined.has(name), `${rule.selectors.join(',')} uses ${name}`).toBe(true);
      }
    }
  });

  it('loads no web fonts and never disables zoom', () => {
    expect(baseCss).not.toMatch(/@import|fonts\.googleapis|@font-face|maximum-scale|user-scalable/);
  });
});
