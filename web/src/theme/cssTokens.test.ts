import { describe, expect, it } from 'vitest';
import {
  customProperties,
  declarationsFor,
  mediaMatches,
  parseColor,
  parseStylesheet,
  referencedCustomProperties,
} from './cssTokens';

describe('parseStylesheet', () => {
  it('reads top-level rules, selector lists and declarations', () => {
    const rules = parseStylesheet(`
      /* a comment { with braces } */
      :root { --a: #fff; --b: rgba(1, 2, 3, .5); }
      .dark, .hull { color-scheme: dark; --a:#000 }
    `);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ selectors: [':root'], conditions: [] });
    expect(rules[0]?.declarations).toEqual({ '--a': '#fff', '--b': 'rgba(1, 2, 3, .5)' });
    expect(rules[1]?.selectors).toEqual(['.dark', '.hull']);
    expect(rules[1]?.declarations).toEqual({ 'color-scheme': 'dark', '--a': '#000' });
  });

  it('records nested @media and @supports conditions in order', () => {
    const rules = parseStylesheet(`
      @media (prefers-color-scheme: dark) { :root { --a: 1; } }
      @supports (backdrop-filter: blur(1px)) { @media (min-width: 420px) { .glass { --b: 2; } } }
    `);
    expect(rules[0]?.conditions).toEqual([{ type: 'media', query: '(prefers-color-scheme: dark)' }]);
    expect(rules[1]?.conditions).toEqual([
      { type: 'supports', query: '(backdrop-filter: blur(1px))' },
      { type: 'media', query: '(min-width: 420px)' },
    ]);
  });

  it('keeps semicolons and commas that sit inside parentheses or strings', () => {
    const rules = parseStylesheet(`
      .x { background: url("data:image/svg+xml;utf8,<svg/>"); content: "a;b}"; --e: linear(0, 0.5, 1); }
    `);
    expect(rules[0]?.declarations).toEqual({
      background: 'url("data:image/svg+xml;utf8,<svg/>")',
      content: '"a;b}"',
      '--e': 'linear(0, 0.5, 1)',
    });
  });

  it('splits selector lists only at top-level commas and skips other at-rules', () => {
    const rules = parseStylesheet(`
      @import url(x.css);
      @keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }
      :is(a, b) > c, d { color: red }
    `);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selectors).toEqual([':is(a, b) > c', 'd']);
  });

  it('collapses whitespace inside values and keeps !important', () => {
    const rules = parseStylesheet(`.x { transition-duration:\n   1ms   !important }`);
    expect(rules[0]?.declarations['transition-duration']).toBe('1ms !important');
  });
});

describe('mediaMatches', () => {
  it('evaluates user-preference features against the environment', () => {
    expect(mediaMatches('(prefers-color-scheme: dark)', { colorScheme: 'dark' })).toBe(true);
    expect(mediaMatches('(prefers-color-scheme: dark)', {})).toBe(false);
    expect(mediaMatches('(prefers-contrast: more)', { contrast: 'more' })).toBe(true);
    expect(mediaMatches('(prefers-reduced-transparency: reduce)', { reducedTransparency: true })).toBe(true);
    expect(mediaMatches('(prefers-reduced-motion: reduce)', {})).toBe(false);
    expect(mediaMatches('(forced-colors: active)', { forcedColors: true })).toBe(true);
  });

  it('treats commas as OR and "and" as AND', () => {
    const q = '(prefers-contrast: more), (prefers-reduced-transparency: reduce)';
    expect(mediaMatches(q, { reducedTransparency: true })).toBe(true);
    expect(mediaMatches(q, {})).toBe(false);
    const both = '(prefers-contrast: more) and (prefers-color-scheme: dark)';
    expect(mediaMatches(both, { contrast: 'more' })).toBe(false);
    expect(mediaMatches(both, { contrast: 'more', colorScheme: 'dark' })).toBe(true);
  });

  it('evaluates size and orientation features against a 393x852 default viewport', () => {
    expect(mediaMatches('(min-width: 420px)', {})).toBe(false);
    expect(mediaMatches('(min-width: 420px)', { width: 440 })).toBe(true);
    expect(mediaMatches('(orientation: landscape) and (max-height: 500px)', { width: 852, height: 393 })).toBe(true);
    expect(mediaMatches('not (prefers-reduced-motion: reduce)', {})).toBe(true);
  });

  it('throws on features it cannot evaluate, so tests never pass by accident', () => {
    expect(() => mediaMatches('(scripting: enabled)', {})).toThrow(/Unsupported media feature/);
  });
});

describe('cascade helpers', () => {
  const rules = parseStylesheet(`
    :root { --a: light; --b: base; }
    @media (prefers-color-scheme: dark) { :root { --a: dark; } }
    .dark { --a: class-dark; }
    @media (prefers-contrast: more) { .dark { --b: ic; } }
    .glass { background: solid; }
    @supports (backdrop-filter: blur(1px)) { .glass { background: see-through; } }
    html[data-solid-bars] .glass { background: solid-again; }
  `);

  it('resolves custom properties with inheritance down a selector chain', () => {
    expect(customProperties(rules, {})).toEqual({ '--a': 'light', '--b': 'base' });
    expect(customProperties(rules, { colorScheme: 'dark' })).toEqual({ '--a': 'dark', '--b': 'base' });
    expect(customProperties(rules, {}, [':root', '.dark'])).toEqual({ '--a': 'class-dark', '--b': 'base' });
    expect(customProperties(rules, { contrast: 'more' }, [':root', '.dark'])).toEqual({ '--a': 'class-dark', '--b': 'ic' });
  });

  it('cascades normal declarations for an element in source order', () => {
    expect(declarationsFor(rules, {}, ['.glass']).background).toBe('solid');
    const supports = (q: string) => q.includes('backdrop-filter');
    expect(declarationsFor(rules, { supports }, ['.glass']).background).toBe('see-through');
    expect(declarationsFor(rules, { supports }, ['.glass', 'html[data-solid-bars] .glass']).background).toBe('solid-again');
  });

  it('lists custom properties referenced through var()', () => {
    expect(referencedCustomProperties('calc(var(--a) + var(--b, 2px)) max(var(--c), 1px)')).toEqual(['--a', '--b', '--c']);
  });
});

describe('parseColor', () => {
  it('reads 6- and 3-digit hex as opaque RGBA', () => {
    expect(parseColor('#E6E3D9')).toEqual([230, 227, 217, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
  });

  it('reads rgb() and rgba() with leading-dot alphas and loose spacing', () => {
    expect(parseColor('rgba(69,64,48,.10)')).toEqual([69, 64, 48, 0.1]);
    expect(parseColor('rgba( 0, 0, 0, 0.55 )')).toEqual([0, 0, 0, 0.55]);
    expect(parseColor('rgb(17 20 18)')).toEqual([17, 20, 18, 1]);
    expect(parseColor('rgb(17 20 18 / .85)')).toEqual([17, 20, 18, 0.85]);
  });

  it('throws on anything else, so an unresolved var() never passes silently', () => {
    expect(() => parseColor('var(--label)')).toThrow(/Unsupported colour/);
    expect(() => parseColor('#12345')).toThrow(/Unsupported colour/);
  });
});
