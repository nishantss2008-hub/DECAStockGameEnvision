/**
 * Structure of web/src/theme/tokens.css against docs/design/MOBILE.md:
 * §2.2 semantic colours, §2.3 increased contrast, §2.4 glass, §2.6 (the two dark lists stay
 * identical), §3.2/§3.3 type, §4.2 margins and radii, §4.3 chrome, §4.6 z-order.
 * Contrast ratios live in contrast.test.ts; motion tokens in motion.test.ts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  customProperties,
  declarationsFor,
  parseColor,
  parseStylesheet,
  referencedCustomProperties,
  type StyleEnvironment,
} from './cssTokens';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const rules = parseStylesheet(css);

const tokens = (env: StyleEnvironment, chain: readonly string[] = [':root']) => customProperties(rules, env, chain);

/** MOBILE §2.2: [role, LIGHT, DARK]. */
const SEMANTIC_COLOURS: ReadonlyArray<readonly [string, string, string]> = [
  ['--bg-grouped', '#E6E3D9', '#0B0D0C'],
  ['--bg', '#F8F6F0', '#0B0D0C'],
  ['--bg-2', '#EFECE3', '#1A1F1C'],
  ['--cell', '#F8F6F0', '#1A1F1C'],
  ['--elevated', '#EFECE3', '#1A1F1C'],
  ['--elevated-cell', '#F8F6F0', '#232A26'],
  ['--label', '#161816', '#E4E8E2'],
  ['--label-2', '#454A45', '#9FB0A8'],
  ['--label-3', '#5F645C', '#8A9A93'],
  ['--label-4', 'rgba(22,24,22,.22)', 'rgba(228,232,226,.20)'],
  ['--separator', '#D9D4C6', '#34403A'],
  ['--control-off', '#857F70', '#6E7C75'],
  ['--fill', 'rgba(69,64,48,.10)', 'rgba(159,176,168,.16)'],
  ['--fill-on-glass', 'rgba(69,64,48,.10)', 'rgba(0,0,0,.25)'],
  ['--fill-2', 'rgba(69,64,48,.06)', 'rgba(159,176,168,.10)'],
  ['--tint', '#735B2A', '#DDBE72'],
  ['--tint-strong', '#5A4720', '#DDBE72'],
  ['--destructive-strong', '#862B1F', '#EE9A89'],
  ['--tint-soft', 'rgba(184,149,74,.18)', 'rgba(221,190,114,.16)'],
  ['--platter', 'rgba(184,149,74,.22)', 'rgba(221,190,114,.16)'],
  ['--prominent', '#1A1F1C', '#DDBE72'],
  ['--on-prominent', '#DDBE72', '#111412'],
  ['--accent', '#2F6F68', '#5FA39A'],
  ['--accent-dot', '#5FA39A', '#5FA39A'],
  ['--gain', '#1B7150', '#7FD3B0'],
  ['--loss', '#A63A2B', '#EE9A89'],
  ['--gain-fill', '#DFEEE6', '#173B2D'],
  ['--loss-fill', '#F3E0DB', '#43231E'],
  ['--on-side', '#F8F6F0', '#0B0D0C'],
  ['--destructive', '#A63A2B', '#EE9A89'],
  ['--seal-crimson', '#8E1F1A', '#8E1F1A'],
  ['--seal-brass', '#B8954A', '#B8954A'],
  ['--seal-highlight', '#DDBE72', '#DDBE72'],
  ['--segment-thumb', '#1A1F1C', '#9FB0A8'],
  ['--on-segment-thumb', '#DDBE72', '#0B0D0C'],
  ['--glass', 'rgba(248,246,240,.85)', 'rgba(17,20,18,.85)'],
  ['--glass-solid', '#F8F6F0', '#111412'],
  ['--scrim', 'rgba(0,0,0,.35)', 'rgba(0,0,0,.55)'],
  ['--scrim-info', 'rgba(0,0,0,.20)', 'rgba(0,0,0,.35)'],
  ['--focus', '#2F6F68', '#5FA39A'],
  ['--chart-baseline', '#80683A', '#B8954A'],
];

/** MOBILE §2.3: [role, LIGHT, DARK] under prefers-contrast: more. */
const INCREASED_CONTRAST: ReadonlyArray<readonly [string, string, string]> = [
  ['--control-off', '#6B6558', '#8A9A93'],
  ['--tint-strong', '#5A4720', '#EDD493'],
  ['--label-2', '#33372F', '#C4D0CA'],
  ['--label-3', '#454A45', '#A9B7B0'],
  ['--tint', '#5A4720', '#EDD493'],
  ['--accent', '#1F5751', '#8CCBC1'],
  ['--focus', '#1F5751', '#8CCBC1'],
  ['--gain', '#0F5A3E', '#A3E6C8'],
  ['--loss', '#862B1F', '#F7B8AA'],
  ['--destructive', '#862B1F', '#F7B8AA'],
  ['--separator', '#BFB8A6', '#4A5A52'],
];

const sameColour = (actual: string | undefined, expected: string) => {
  expect(actual, `expected ${expected}`).toBeDefined();
  expect(parseColor(actual ?? '')).toEqual(parseColor(expected));
};

const DARK_CHAINS: ReadonlyArray<readonly [string, StyleEnvironment, readonly string[]]> = [
  ['system dark (media query)', { colorScheme: 'dark' }, [':root']],
  ['.dark in light system mode', {}, [':root', '.dark']],
  ['.hull in light system mode', {}, [':root', '.hull']],
  ['.dark in dark system mode', { colorScheme: 'dark' }, [':root', '.dark']],
];

describe('tokens.css semantic colours (MOBILE §2.2)', () => {
  it.each(SEMANTIC_COLOURS)('%s has its light value', (role, light) => {
    sameColour(tokens({})[role], light);
  });

  it.each(DARK_CHAINS)('every role has its dark value: %s', (_name, env, chain) => {
    const t = tokens(env, chain);
    for (const [role, , dark] of SEMANTIC_COLOURS) sameColour(t[role], dark);
  });

  it('keeps the two dark lists identical (media query copy and .dark/.hull copy)', () => {
    const media = tokens({ colorScheme: 'dark' });
    for (const [, env, chain] of DARK_CHAINS) expect(tokens(env, chain)).toEqual(media);
  });

  it('declares the colour schemes the lists are written for', () => {
    expect(declarationsFor(rules, {}, [':root'])['color-scheme']).toBe('light dark');
    expect(declarationsFor(rules, {}, ['.dark'])['color-scheme']).toBe('dark');
    expect(declarationsFor(rules, {}, ['.hull'])['color-scheme']).toBe('dark');
  });

  it('paints hull screens on the hull colour with the sea-glass glow', () => {
    const background = declarationsFor(rules, {}, ['.hull']).background ?? '';
    expect(background).toMatch(/radial-gradient\(.*rgba\(95,\s*163,\s*154,\s*\.18\).*\)/);
    expect(background.trim().endsWith('#111412')).toBe(true);
  });

  it('keeps float shadow and glass edge values per appearance (§2.4)', () => {
    expect(tokens({})['--float-shadow']).toBe('0 8px 24px rgba(22,24,22,.12)');
    expect(tokens({ colorScheme: 'dark' })['--float-shadow']).toBe('0 8px 24px rgba(0,0,0,.45)');
    expect(tokens({})['--glass-edge']).toBe('inset 0 0 0 .5px rgba(255,255,255,.55),0 0 0 .5px rgba(22,24,22,.10)');
    expect(tokens({ colorScheme: 'dark' })['--glass-edge']).toBe(
      'inset 0 0 0 .5px rgba(228,232,226,.10),0 0 0 .5px rgba(0,0,0,.60)',
    );
  });
});

describe('tokens.css increased contrast (MOBILE §2.3)', () => {
  it.each(INCREASED_CONTRAST)('%s has its light increased-contrast value', (role, light) => {
    sameColour(tokens({ contrast: 'more' })[role], light);
  });

  it.each(DARK_CHAINS)('every role has its dark increased-contrast value: %s', (_name, env, chain) => {
    const t = tokens({ ...env, contrast: 'more' }, chain);
    for (const [role, , dark] of INCREASED_CONTRAST) sameColour(t[role], dark);
  });

  it('keeps the dark increased-contrast copies identical', () => {
    const media = tokens({ colorScheme: 'dark', contrast: 'more' });
    for (const [, env, chain] of DARK_CHAINS) expect(tokens({ ...env, contrast: 'more' }, chain)).toEqual(media);
  });

  it('leaves every other role at its standard value', () => {
    const changed = new Set(INCREASED_CONTRAST.map(([role]) => role).concat('--destructive-strong'));
    for (const env of [{}, { colorScheme: 'dark' as const }]) {
      const standard = tokens(env);
      const more = tokens({ ...env, contrast: 'more' });
      for (const [role, value] of Object.entries(standard)) {
        if (!changed.has(role)) expect(more[role], role).toBe(value);
      }
    }
  });
});

describe('tokens.css glass (MOBILE §2.4)', () => {
  const backdrop = (q: string) => q.includes('backdrop-filter');
  const glass = (env: StyleEnvironment, solidBars = false) =>
    declarationsFor(rules, env, solidBars ? ['.glass', 'html[data-solid-bars] .glass'] : ['.glass']);

  it('is solid when backdrop-filter is unsupported', () => {
    const d = glass({});
    expect(d.background).toBe('var(--glass-solid)');
    expect(d['backdrop-filter']).toBeUndefined();
    expect(d['box-shadow']).toBe('var(--glass-edge), var(--float-shadow)');
  });

  it('is an 85% tint with a 20px blur, prefixed for Safari, when backdrop-filter is supported', () => {
    const d = glass({ supports: backdrop });
    expect(d.background).toBe('var(--glass)');
    expect(d['backdrop-filter']).toBe('blur(20px) saturate(160%)');
    expect(d['-webkit-backdrop-filter']).toBe('blur(20px) saturate(160%)');
    expect(parseColor(tokens({})['--glass'] ?? '')[3]).toBe(0.85);
    expect(parseColor(tokens({ colorScheme: 'dark' })['--glass'] ?? '')[3]).toBe(0.85);
  });

  it.each<[string, StyleEnvironment, boolean]>([
    ['prefers-reduced-transparency: reduce', { supports: backdrop, reducedTransparency: true }, false],
    ['prefers-contrast: more', { supports: backdrop, contrast: 'more' }, false],
    ['the Solid bars setting', { supports: backdrop }, true],
  ])('goes opaque under %s', (_name, env, solidBars) => {
    const d = glass(env, solidBars);
    expect(d.background).toBe('var(--glass-solid)');
    expect(d['backdrop-filter']).toBe('none');
    expect(d['-webkit-backdrop-filter']).toBe('none');
  });

  it('draws a 1px control-off edge on opaque glass under increased contrast', () => {
    expect(glass({ supports: backdrop, contrast: 'more' })['box-shadow']).toBe('inset 0 0 0 1px var(--control-off)');
  });
});

describe('tokens.css non-colour tokens', () => {
  it('uses the MOBILE §3.2 font stacks', () => {
    const t = tokens({});
    expect(t['--font-ui']).toBe(
      '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    );
    expect(t['--font-mono']).toBe('ui-monospace, Menlo, Consolas, "Roboto Mono", monospace');
    expect(t['--font-brand']).toBe('"Cinzel Decorative", Georgia, "Times New Roman", serif');
  });

  it.each([
    ['--t-large-title', 'clamp(31px, 2rem, 60px)', '41 / 34'],
    ['--t-title-1', 'clamp(25px, 1.647rem, 58px)', '34 / 28'],
    ['--t-title-2', 'clamp(19px, 1.294rem, 56px)', '28 / 22'],
    ['--t-title-3', 'clamp(17px, 1.176rem, 55px)', '25 / 20'],
    ['--t-headline', '1rem', '22 / 17'],
    ['--t-body', '1rem', '22 / 17'],
    ['--t-callout', '.941rem', '21 / 16'],
    ['--t-subhead', '.882rem', '20 / 15'],
    ['--t-footnote', 'max(12px, .765rem)', '18 / 13'],
    ['--t-caption-1', 'max(11px, .706rem)', '16 / 12'],
    ['--t-caption-2', 'max(11px, .647rem)', '13 / 11'],
    ['--t-amount', 'clamp(40px, 2.824rem, 64px)', '56 / 48'],
  ])('%s follows the MOBILE §3.3 Dynamic Type scale', (token, size, leading) => {
    const t = tokens({});
    expect(t[token]).toBe(size);
    expect(t[token.replace('--t-', '--lh-')]).toBe(`calc(${leading})`);
  });

  it('sets 16px margins, 20px from 420px wide (MOBILE §4.2)', () => {
    expect(tokens({ width: 393 })['--margin']).toBe('16px');
    expect(tokens({ width: 375 })['--margin']).toBe('16px');
    expect(tokens({ width: 420 })['--margin']).toBe('20px');
    expect(tokens({ width: 440 })['--margin']).toBe('20px');
  });

  it('uses the MOBILE §4.2 radii and spacing steps', () => {
    expect(tokens({})).toMatchObject({
      '--r-card': '24px',
      '--r-inner': '16px',
      '--r-tile': '8px',
      '--r-sheet-medium': '32px',
      '--r-sheet-large': '24px',
      '--r-alert': '28px',
    });
    const steps = Object.entries(tokens({}))
      .filter(([k]) => /^--space-\d+$/.test(k))
      .map(([, v]) => v);
    expect(steps).toEqual(['2px', '4px', '8px', '12px', '16px', '20px', '24px', '32px', '44px']);
  });

  it('keeps the MOBILE §4.6 z-order', () => {
    const t = tokens({});
    const order = ['--z-content', '--z-sticky', '--z-topbar', '--z-floating', '--z-tabbar', '--z-toast', '--z-scrim', '--z-sheet', '--z-scrim-over-sheet', '--z-alert'];
    expect(order.map((k) => t[k])).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '75', '80']);
  });

  it('derives fixed chrome from safe areas (MOBILE §4.3, §9.4)', () => {
    const t = tokens({});
    expect(t['--tabbar-height']).toBe('62px');
    expect(t['--tabbar-bottom']).toBe('max(8px, env(safe-area-inset-bottom, 0px) - 12px)');
    expect(t['--content-bottom']).toBe('calc(var(--tabbar-height) + var(--tabbar-bottom) + 16px)');
    expect(t['--content-bottom-actions']).toBe('calc(var(--content-bottom) + 66px)');
    expect(t['--gutter-left']).toBe('max(var(--margin), env(safe-area-inset-left, 0px))');
    expect(t['--gutter-right']).toBe('max(var(--margin), env(safe-area-inset-right, 0px))');
    expect(t['--sheet-max-height']).toBe('calc(100dvh - env(safe-area-inset-top, 0px) - 8px)');
    expect(t['--kb']).toBe('0px');
    expect(t['--vv-top']).toBe('0px');
  });

  it('only references custom properties that it defines', () => {
    const defined = new Set(Object.keys(tokens({})));
    for (const rule of rules) {
      for (const value of Object.values(rule.declarations)) {
        for (const name of referencedCustomProperties(value)) expect(defined.has(name), name).toBe(true);
      }
    }
  });

  it('loads no web fonts and names no film or brand marks', () => {
    expect(css).not.toMatch(/@import|fonts\.googleapis|@font-face/);
    expect(css).not.toMatch(/black pearl|sparrow|barbossa|caribbean/i);
  });
});
