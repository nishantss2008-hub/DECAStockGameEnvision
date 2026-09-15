/**
 * WCAG 2.2 contrast for every permitted pairing in docs/design/MOBILE.md §2.5, read from the real
 * tokens.css in each appearance: light, dark (system media query), dark (.dark / .hull class) and
 * all three again under prefers-contrast: more. Text needs 4.5:1; non-text boundaries need 3:1.
 *
 * Placement rules (§2.2, §2.4) are part of the contract: only the pairs they permit are required to
 * pass. The forbidden pairs are kept at the bottom so nobody re-introduces them without noticing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customProperties, declarationsFor, parseColor, parseStylesheet, type Rgba, type StyleEnvironment } from './cssTokens';

// ---------------------------------------------------------------------------------------------
// WCAG 2.2 relative luminance and contrast ratio
// https://www.w3.org/TR/WCAG22/#dfn-relative-luminance (sRGB threshold 0.04045, as in §2.5)
// ---------------------------------------------------------------------------------------------
type Rgb = readonly [number, number, number];

const linear = (channel8: number): number => {
  const c = channel8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Source-over compositing onto an opaque base, rounded to 8-bit like a framebuffer (§2.5 script). */
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgb): Rgb => {
  const mix = (top: number, bottom: number) => Math.round(top * a + bottom * (1 - a));
  return [mix(r, br), mix(g, bg), mix(b, bb)];
};

const WCAG_TEXT = 4.5;
const WCAG_NON_TEXT = 3;

describe('WCAG helpers used by this file', () => {
  it('match the WCAG reference points', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 AA boundary colour.
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(over([0, 0, 0, 0.5], [255, 255, 255])).toEqual([128, 128, 128]);
  });
});

// ---------------------------------------------------------------------------------------------
// Appearances, resolved from tokens.css
// ---------------------------------------------------------------------------------------------
const rules = parseStylesheet(readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8'));

interface Appearance {
  readonly name: string;
  readonly env: StyleEnvironment;
  readonly chain: readonly string[];
  readonly mode: 'light' | 'dark';
  readonly increasedContrast: boolean;
}

const APPEARANCES: readonly Appearance[] = [
  { name: 'light', env: {}, chain: [':root'], mode: 'light', increasedContrast: false },
  { name: 'dark (system)', env: { colorScheme: 'dark' }, chain: [':root'], mode: 'dark', increasedContrast: false },
  { name: 'dark (.dark class)', env: {}, chain: [':root', '.dark'], mode: 'dark', increasedContrast: false },
  { name: 'hull (.hull class)', env: {}, chain: [':root', '.hull'], mode: 'dark', increasedContrast: false },
  { name: 'light + increased contrast', env: { contrast: 'more' }, chain: [':root'], mode: 'light', increasedContrast: true },
  { name: 'dark (system) + increased contrast', env: { colorScheme: 'dark', contrast: 'more' }, chain: [':root'], mode: 'dark', increasedContrast: true },
  { name: 'dark (.dark class) + increased contrast', env: { contrast: 'more' }, chain: [':root', '.dark'], mode: 'dark', increasedContrast: true },
];

const palette = (appearance: Appearance) => {
  const t = customProperties(rules, appearance.env, appearance.chain);
  const rgba = (role: string): Rgba => {
    const value = t[role];
    if (value === undefined) throw new Error(`${role} is not defined for ${appearance.name}`);
    return parseColor(value);
  };
  const solid = (role: string): Rgb => {
    const [r, g, b, a] = rgba(role);
    if (a !== 1) throw new Error(`${role} is translucent; composite it onto a surface first`);
    return [r, g, b];
  };
  return { rgba, solid };
};

/** Every opaque surface text can sit on (page, plain, secondary, cell, sheet, row in a sheet). */
const SURFACES = ['--bg-grouped', '--bg', '--bg-2', '--cell', '--elevated', '--elevated-cell'] as const;

/** Text roles allowed on any opaque surface. */
const TEXT_ROLES = ['--label', '--label-2', '--label-3', '--tint', '--tint-strong', '--accent', '--gain', '--loss', '--destructive', '--destructive-strong'] as const;

/** §2.4: the only text roles allowed on glass. */
const GLASS_TEXT_ROLES = ['--label', '--label-2', '--tint-strong', '--destructive-strong'] as const;

/**
 * Content that can scroll under a glass bar. §2.5 uses the opposite appearance's extreme
 * (#111412 under light glass, #F8F6F0 under dark glass); pure black and white are added as
 * stricter worst cases.
 */
const UNDER_GLASS: readonly Rgb[] = [[0, 0, 0], [255, 255, 255], [17, 20, 18], [248, 246, 240]];

interface Pair {
  readonly label: string;
  readonly ratio: number;
  readonly min: number;
}

function permittedPairs(appearance: Appearance): Pair[] {
  const { rgba, solid } = palette(appearance);
  const pairs: Pair[] = [];
  const text = (label: string, fg: Rgb, bg: Rgb) => pairs.push({ label, ratio: contrastRatio(fg, bg), min: WCAG_TEXT });
  const boundary = (label: string, fg: Rgb, bg: Rgb) => pairs.push({ label, ratio: contrastRatio(fg, bg), min: WCAG_NON_TEXT });

  for (const surface of SURFACES) {
    const bg = solid(surface);
    for (const role of TEXT_ROLES) text(`${role} on ${surface}`, solid(role), bg);
    // Tinted buttons, Paused banner, your Standings row: --label, --label-2, --tint-strong only.
    for (const role of ['--label', '--label-2', '--tint-strong']) {
      text(`${role} on --tint-soft over ${surface}`, solid(role), over(rgba('--tint-soft'), bg));
    }
    // Search field, gray buttons, segmented track, stepper: --label or --label-2 only.
    for (const role of ['--label', '--label-2']) text(`${role} on --fill over ${surface}`, solid(role), over(rgba('--fill'), bg));
    boundary(`--control-off vs ${surface}`, solid('--control-off'), bg);
    boundary(`--focus ring vs ${surface}`, solid('--focus'), bg);
    boundary(`--segment-thumb vs --fill track over ${surface}`, solid('--segment-thumb'), over(rgba('--fill'), bg));
  }

  // Pills and filled buttons.
  text('--gain on --gain-fill (change pill)', solid('--gain'), solid('--gain-fill'));
  text('--loss on --loss-fill (change pill, tinted Sell)', solid('--loss'), solid('--loss-fill'));
  text('--on-prominent on --prominent (primary button, You pill, badge)', solid('--on-prominent'), solid('--prominent'));
  text('--on-side on --gain (Buy)', solid('--on-side'), solid('--gain'));
  text('--on-side on --loss (Sell)', solid('--on-side'), solid('--loss'));
  text('--on-segment-thumb on --segment-thumb', solid('--on-segment-thumb'), solid('--segment-thumb'));
  boundary('--chart-baseline vs --cell', solid('--chart-baseline'), solid('--cell'));

  // Glass. Opaque glass (no backdrop-filter, Solid bars, increased contrast) is --glass-solid.
  const glassSurfaces: Array<[string, Rgb]> = [['--glass-solid', solid('--glass-solid')]];
  if (!appearance.increasedContrast) {
    // Increased contrast forces opaque glass (tokens.test.ts), so translucent glass only matters here.
    for (const under of UNDER_GLASS) glassSurfaces.push([`--glass over rgb(${under.join(',')})`, over(rgba('--glass'), under)]);
  }
  for (const [name, glass] of glassSurfaces) {
    for (const role of GLASS_TEXT_ROLES) text(`${role} on ${name}`, solid(role), glass);
    text(`--tint-strong on --platter over ${name} (selected tab)`, solid('--tint-strong'), over(rgba('--platter'), glass));
    for (const role of ['--label', '--label-2']) {
      text(`${role} on --fill-on-glass over ${name} (pinned search)`, solid(role), over(rgba('--fill-on-glass'), glass));
    }
    boundary(`--focus ring vs ${name}`, solid('--focus'), glass);
  }

  // Hull screens (Sign in, ceremonies) sit on #111412 with a sea-glass glow in the top corner.
  if (appearance.chain.includes('.hull')) {
    const background = declarationsFor(rules, appearance.env, ['.hull']).background ?? '';
    const glow = /rgba\([^)]*\)/.exec(background)?.[0];
    const base = /#[0-9a-f]{6}\s*$/i.exec(background)?.[0];
    if (!glow || !base) throw new Error(`Unexpected .hull background: ${background}`);
    const hull = parseColor(base);
    const hullRgb: Rgb = [hull[0], hull[1], hull[2]];
    const glowRgb = over(parseColor(glow), hullRgb);
    for (const role of ['--label', '--label-2', '--label-3']) {
      text(`${role} on hull`, solid(role), hullRgb);
      text(`${role} on hull glow`, solid(role), glowRgb);
    }
    text('--seal-brass gold title on hull', solid('--seal-brass'), hullRgb);
    boundary('--control-off vs hull (sign-in card edge)', solid('--control-off'), hullRgb);
  }
  return pairs;
}

describe.each(APPEARANCES)('permitted pairs meet WCAG in $name', (appearance) => {
  const pairs = permittedPairs(appearance);

  it('checks a meaningful number of pairs', () => {
    expect(pairs.length).toBeGreaterThan(100);
  });

  it.each(pairs)('$label ≥ $min:1', ({ ratio, min }) => {
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

// ---------------------------------------------------------------------------------------------
// The §2.5 output table, recomputed from tokens.css (so the document and the CSS cannot drift)
// ---------------------------------------------------------------------------------------------
const byMode = (mode: 'light' | 'dark'): Appearance => APPEARANCES.find((a) => a.mode === mode && !a.increasedContrast)!;

/** §2.5 script surfaces: "grouped" = --bg-grouped, "cell" = --cell, "2nd" = light --bg-2, dark --elevated-cell. */
function documentedPairs(mode: 'light' | 'dark') {
  const { rgba, solid } = palette(byMode(mode));
  const cell = solid('--cell');
  const grouped = solid('--bg-grouped');
  const second = solid(mode === 'light' ? '--bg-2' : '--elevated-cell');
  const worstUnder: Rgb = mode === 'light' ? [17, 20, 18] : [248, 246, 240];
  const glass = over(rgba('--glass'), worstUnder);
  const r = contrastRatio;
  return {
    table: {
      'label on cell': r(solid('--label'), cell),
      'label on grouped': r(solid('--label'), grouped),
      'label on 2nd': r(solid('--label'), second),
      'label-2 on cell': r(solid('--label-2'), cell),
      'label-2 on grouped': r(solid('--label-2'), grouped),
      'label-2 on 2nd': r(solid('--label-2'), second),
      'label-3 on cell': r(solid('--label-3'), cell),
      'label-3 on grouped': r(solid('--label-3'), grouped),
      'label-3 on 2nd': r(solid('--label-3'), second),
      'tint on cell': r(solid('--tint'), cell),
      'tint on grouped': r(solid('--tint'), grouped),
      'tint on 2nd': r(solid('--tint'), second),
      'tint-strong on cell': r(solid('--tint-strong'), cell),
      'tint-strong on grouped': r(solid('--tint-strong'), grouped),
      'tint-strong on 2nd': r(solid('--tint-strong'), second),
      'accent on cell': r(solid('--accent'), cell),
      'accent on grouped': r(solid('--accent'), grouped),
      'accent on 2nd': r(solid('--accent'), second),
      'gain on cell': r(solid('--gain'), cell),
      'gain on grouped': r(solid('--gain'), grouped),
      'gain on 2nd': r(solid('--gain'), second),
      'loss on cell': r(solid('--loss'), cell),
      'loss on grouped': r(solid('--loss'), grouped),
      'loss on 2nd': r(solid('--loss'), second),
      'gain on gain-fill': r(solid('--gain'), solid('--gain-fill')),
      'loss on loss-fill': r(solid('--loss'), solid('--loss-fill')),
      'on-prominent on prominent': r(solid('--on-prominent'), solid('--prominent')),
      'Buy label on gain': r(solid('--on-side'), solid('--gain')),
      'Sell label on loss': r(solid('--on-side'), solid('--loss')),
      'tint-strong on tint-soft (cell)': r(solid('--tint-strong'), over(rgba('--tint-soft'), cell)),
      'tint-strong on tint-soft (grouped)': r(solid('--tint-strong'), over(rgba('--tint-soft'), grouped)),
      'label-2 on fill (grouped)': r(solid('--label-2'), over(rgba('--fill'), grouped)),
      'label-2 on fill (elevated cell)': r(solid('--label-2'), over(rgba('--fill'), solid('--elevated-cell'))),
      'label on glass': r(solid('--label'), glass),
      'label-2 on glass': r(solid('--label-2'), glass),
      'tint-strong on platter': r(solid('--tint-strong'), over(rgba('--platter'), glass)),
      'tint-strong on glass': r(solid('--tint-strong'), glass),
      'destructive-strong on glass': r(solid('--destructive-strong'), glass),
      'label-2 on fill-on-glass': r(solid('--label-2'), over(rgba('--fill-on-glass'), glass)),
      'control-off vs cell': r(solid('--control-off'), cell),
      'control-off vs grouped': r(solid('--control-off'), grouped),
      'control-off vs 2nd': r(solid('--control-off'), second),
      'control-off vs hull': r(solid('--control-off'), [17, 20, 18]),
      'focus vs cell': r(solid('--focus'), cell),
      'focus vs glass': r(solid('--focus'), glass),
    },
    forbidden: {
      'label-3 on fill over grouped': r(solid('--label-3'), over(rgba('--fill'), grouped)),
      'label-3 on fill over 2nd': r(solid('--label-3'), over(rgba('--fill'), second)),
      'gain on fill over grouped': r(solid('--gain'), over(rgba('--fill'), grouped)),
      'tint on tint-soft over grouped': r(solid('--tint'), over(rgba('--tint-soft'), grouped)),
      'label-3 on glass': r(solid('--label-3'), glass),
      'accent on glass': r(solid('--accent'), glass),
      'tint on glass': r(solid('--tint'), glass),
      'loss on glass': r(solid('--loss'), glass),
      'label-2 on plain fill inside glass': r(solid('--label-2'), over(rgba('--fill'), glass)),
      'label-2 TagPill on a tint-soft row': r(solid('--label-2'), over(rgba('--fill'), over(rgba('--tint-soft'), second))),
    },
  };
}

/** MOBILE §2.5 "Output" table: [pair, LIGHT, DARK]. */
const DOCUMENTED: ReadonlyArray<readonly [string, number, number]> = [
  ['label on cell', 16.52, 13.48], ['label on grouped', 13.9, 15.73], ['label on 2nd', 15.11, 11.84],
  ['label-2 on cell', 8.38, 7.36], ['label-2 on grouped', 7.05, 8.59], ['label-2 on 2nd', 7.67, 6.47],
  ['label-3 on cell', 5.61, 5.67], ['label-3 on grouped', 4.72, 6.61], ['label-3 on 2nd', 5.13, 4.98],
  ['tint on cell', 5.96, 9.3], ['tint on grouped', 5.02, 10.85], ['tint on 2nd', 5.46, 8.17],
  ['tint-strong on cell', 8.24, 9.3], ['tint-strong on grouped', 6.94, 10.85], ['tint-strong on 2nd', 7.54, 8.17],
  ['accent on cell', 5.41, 5.72], ['accent on grouped', 4.55, 6.68], ['accent on 2nd', 4.95, 5.03],
  ['gain on cell', 5.51, 9.43], ['gain on grouped', 4.64, 11.0], ['gain on 2nd', 5.04, 8.28],
  ['loss on cell', 5.96, 7.65], ['loss on grouped', 5.01, 8.93], ['loss on 2nd', 5.45, 6.72],
  ['gain on gain-fill', 4.97, 6.97], ['loss on loss-fill', 5.06, 6.42],
  ['on-prominent on prominent', 9.3, 10.31],
  ['Buy label on gain', 5.51, 11.0], ['Sell label on loss', 5.96, 8.93],
  ['tint-strong on tint-soft (cell)', 7.09, 6.59], ['tint-strong on tint-soft (grouped)', 6.1, 8.08],
  ['label-2 on fill (grouped)', 6.04, 6.66], ['label-2 on fill (elevated cell)', 7.12, 4.78],
  ['label on glass', 12.03, 9.84], ['label-2 on glass', 6.1, 5.37],
  ['tint-strong on platter', 5.25, 4.8], ['tint-strong on glass', 6.0, 6.79],
  ['destructive-strong on glass', 5.95, 5.59], ['label-2 on fill-on-glass', 5.25, 6.46],
  ['control-off vs cell', 3.69, 3.82], ['control-off vs grouped', 3.11, 4.46], ['control-off vs 2nd', 3.38, 3.36],
  ['control-off vs hull', 4.65, 4.24],
  ['focus vs cell', 5.41, 5.72], ['focus vs glass', 3.94, 4.18],
];

/** MOBILE §2.5 forbidden rows: [pair, LIGHT, DARK]. Each fails 4.5:1 in at least one appearance. */
const FORBIDDEN: ReadonlyArray<readonly [string, number, number]> = [
  ['label-3 on fill over grouped', 4.04, 5.13],
  ['label-3 on fill over 2nd', 4.38, 3.68],
  ['gain on fill over grouped', 3.98, 8.53],
  ['tint on tint-soft over grouped', 4.41, 8.08],
  ['label-3 on glass', 4.08, 4.14],
  ['accent on glass', 3.94, 4.18],
  ['tint on glass', 4.34, 6.79],
  ['loss on glass', 4.34, 5.59],
  ['label-2 on plain fill inside glass', 5.25, 3.99],
  ['label-2 TagPill on a tint-soft row', 5.68, 3.43],
];

describe('MOBILE §2.5 table matches tokens.css', () => {
  const light = documentedPairs('light');
  const dark = documentedPairs('dark');

  it.each(DOCUMENTED)('%s ≈ %f light / %f dark', (pair, lightRatio, darkRatio) => {
    expect(light.table[pair as keyof typeof light.table]).toBeCloseTo(lightRatio, 1);
    expect(dark.table[pair as keyof typeof dark.table]).toBeCloseTo(darkRatio, 1);
  });

  it.each(FORBIDDEN)('forbidden: %s ≈ %f light / %f dark, and fails in at least one appearance', (pair, lightRatio, darkRatio) => {
    const l = light.forbidden[pair as keyof typeof light.forbidden];
    const d = dark.forbidden[pair as keyof typeof dark.forbidden];
    expect(l).toBeCloseTo(lightRatio, 1);
    expect(d).toBeCloseTo(darkRatio, 1);
    expect(Math.min(l, d)).toBeLessThan(WCAG_TEXT);
  });
});
