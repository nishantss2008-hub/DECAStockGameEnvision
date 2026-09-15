/**
 * A small, dependency-free CSS reader for the theme tests (tokens, contrast, base, motion).
 *
 * It understands exactly what the theme files use: plain style rules, selector lists, `@media`
 * and `@supports` blocks (nested), comments, strings and parenthesised values. Other at-rules
 * (`@keyframes`, `@font-face`, `@import`) are skipped. The cascade helpers apply rules in source
 * order and ignore specificity, which is how tokens.css and base.css are written (overrides come
 * later in the file). The app never imports this module; only tests do.
 */

export interface Condition {
  readonly type: 'media' | 'supports';
  readonly query: string;
}

export interface StyleRule {
  readonly selectors: readonly string[];
  readonly conditions: readonly Condition[];
  readonly declarations: Readonly<Record<string, string>>;
}

/** The user agent a rule set is evaluated for. Defaults: light, no preferences, 393x852 phone. */
export interface StyleEnvironment {
  readonly colorScheme?: 'light' | 'dark';
  readonly contrast?: 'no-preference' | 'more' | 'less' | 'custom';
  readonly reducedTransparency?: boolean;
  readonly reducedMotion?: boolean;
  readonly forcedColors?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly pointer?: 'coarse' | 'fine' | 'none';
  readonly hover?: boolean;
  readonly displayMode?: 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui';
  /** Receives the raw `@supports` condition text. Defaults to "nothing is supported". */
  readonly supports?: (condition: string) => boolean;
}

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']' };

/** Index just past a quoted string that starts at `start`. */
function skipString(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1;
  return i + 1;
}

/** First index in [from, to) holding one of `stops`, outside strings and brackets; -1 if none. */
function scanTo(src: string, from: number, to: number, stops: readonly string[]): number {
  const stack: string[] = [];
  let i = from;
  while (i < to) {
    const ch = src[i] ?? '';
    if (ch === '"' || ch === "'") {
      i = skipString(src, i);
      continue;
    }
    const close = OPEN_TO_CLOSE[ch];
    if (close) stack.push(close);
    else if (stack.length > 0 && ch === stack[stack.length - 1]) stack.pop();
    else if (stack.length === 0 && stops.includes(ch)) return i;
    i += 1;
  }
  return -1;
}

/** Index of the `}` matching the `{` at `open`. */
function matchingBrace(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipString(src, i);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error(`Unbalanced braces after index ${open}`);
}

function stripComments(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i);
      out += css.slice(i, end);
      i = end;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      out += ' ';
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Split at top-level occurrences of `separator` (outside strings and brackets). */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const at = scanTo(text, start, text.length, [separator]);
    if (at === -1) break;
    parts.push(text.slice(start, at));
    start = at + 1;
  }
  parts.push(text.slice(start));
  return parts;
}

function parseDeclarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of splitTopLevel(body, ';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1) continue;
    const property = chunk.slice(0, colon).trim();
    if (!property) continue;
    out[property] = squash(chunk.slice(colon + 1));
  }
  return out;
}

function parseRules(src: string, from: number, to: number, conditions: readonly Condition[], out: StyleRule[]): void {
  let i = from;
  while (i < to) {
    const stop = scanTo(src, i, to, ['{', ';']);
    if (stop === -1) return;
    const prelude = squash(src.slice(i, stop));
    if (src[stop] === ';') {
      i = stop + 1;
      continue;
    }
    const close = matchingBrace(src, stop);
    const atRule = /^@([a-z-]+)\s*(.*)$/i.exec(prelude);
    if (atRule) {
      const name = (atRule[1] ?? '').toLowerCase();
      if (name === 'media' || name === 'supports') {
        parseRules(src, stop + 1, close, [...conditions, { type: name, query: atRule[2] ?? '' }], out);
      }
    } else if (prelude) {
      out.push({
        selectors: splitTopLevel(prelude, ',').map(squash),
        conditions,
        declarations: parseDeclarations(src.slice(stop + 1, close)),
      });
    }
    i = close + 1;
  }
}

export function parseStylesheet(css: string): StyleRule[] {
  const src = stripComments(css);
  const rules: StyleRule[] = [];
  parseRules(src, 0, src.length, [], rules);
  return rules;
}

function lengthPx(value: string): number {
  const m = /^(-?[\d.]+)(px|em|rem)$/.exec(value.trim());
  if (!m) throw new Error(`Unsupported media length: ${value}`);
  const n = Number(m[1]);
  return m[2] === 'px' ? n : n * 16;
}

function mediaFeature(name: string, value: string | undefined, env: StyleEnvironment): boolean {
  const width = env.width ?? 393;
  const height = env.height ?? 852;
  switch (name) {
    case 'prefers-color-scheme':
      return value === (env.colorScheme ?? 'light');
    case 'prefers-contrast': {
      const contrast = env.contrast ?? 'no-preference';
      return value === undefined ? contrast !== 'no-preference' : value === contrast;
    }
    case 'prefers-reduced-transparency':
      return (value ?? 'reduce') === 'reduce' ? env.reducedTransparency === true : env.reducedTransparency !== true;
    case 'prefers-reduced-motion':
      return (value ?? 'reduce') === 'reduce' ? env.reducedMotion === true : env.reducedMotion !== true;
    case 'forced-colors':
      return (value ?? 'active') === 'active' ? env.forcedColors === true : env.forcedColors !== true;
    case 'min-width':
      return width >= lengthPx(value ?? '');
    case 'max-width':
      return width <= lengthPx(value ?? '');
    case 'min-height':
      return height >= lengthPx(value ?? '');
    case 'max-height':
      return height <= lengthPx(value ?? '');
    case 'orientation':
      return value === (width > height ? 'landscape' : 'portrait');
    case 'pointer':
    case 'any-pointer':
      return value === (env.pointer ?? 'coarse');
    case 'hover':
    case 'any-hover':
      return (value ?? 'hover') === 'hover' ? env.hover === true : env.hover !== true;
    case 'display-mode':
      return value === (env.displayMode ?? 'browser');
    default:
      throw new Error(`Unsupported media feature: ${name}`);
  }
}

function matchesSingleQuery(query: string, env: StyleEnvironment): boolean {
  let text = query.trim();
  let negate = false;
  if (/^not\s/i.test(text)) {
    negate = true;
    text = text.replace(/^not\s+/i, '');
  }
  text = text.replace(/^only\s+/i, '');
  const result = text.split(/\s+and\s+/i).every((part) => {
    const p = part.trim().toLowerCase();
    if (p === 'all' || p === 'screen') return true;
    if (p === 'print') return false;
    const m = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+?))?\s*\)$/.exec(p);
    if (!m) throw new Error(`Unsupported media query: ${query}`);
    return mediaFeature(m[1] ?? '', m[2], env);
  });
  return negate ? !result : result;
}

export function mediaMatches(query: string, env: StyleEnvironment = {}): boolean {
  return splitTopLevel(query, ',').some((q) => matchesSingleQuery(q, env));
}

function conditionsMatch(rule: StyleRule, env: StyleEnvironment): boolean {
  return rule.conditions.every((c) =>
    c.type === 'media' ? mediaMatches(c.query, env) : (env.supports ?? (() => false))(c.query),
  );
}

/**
 * Cascaded declarations for one element that matches every selector in `matches`
 * (exact selector strings as written in the file), in source order.
 */
export function declarationsFor(
  rules: readonly StyleRule[],
  env: StyleEnvironment,
  matches: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!rule.selectors.some((s) => matches.includes(s))) continue;
    if (!conditionsMatch(rule, env)) continue;
    Object.assign(out, rule.declarations);
  }
  return out;
}

/**
 * Custom properties of the last element in `chain`. Each entry is the selector an element on the
 * path from the root matches (for example `[':root', '.dark']`); custom properties inherit.
 */
export function customProperties(
  rules: readonly StyleRule[],
  env: StyleEnvironment,
  chain: readonly string[] = [':root'],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const selector of chain) {
    const own = declarationsFor(rules, env, selector === ':root' ? [':root', 'html'] : [selector]);
    for (const [property, value] of Object.entries(own)) {
      if (property.startsWith('--')) out[property] = value;
    }
  }
  return out;
}

/** Custom property names referenced through `var()` in a value, in order of appearance. */
export function referencedCustomProperties(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? '');
}

/** An sRGB colour: 0-255 channels and 0-1 alpha. */
export type Rgba = readonly [r: number, g: number, b: number, a: number];

/** Parse `#rgb`, `#rrggbb`, `rgb()` and `rgba()` (comma or space syntax). Throws on anything else. */
export function parseColor(value: string): Rgba {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1] ?? '';
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
    const channel = (i: number): number => parseInt(full.slice(i, i + 2), 16);
    return [channel(0), channel(2), channel(4), 1];
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/i.exec(text);
  if (fn) {
    const parts = (fn[1] ?? '').split(/\s*[,/]\s*|\s+/).filter(Boolean).map(Number);
    if ((parts.length === 3 || parts.length === 4) && parts.every((n) => Number.isFinite(n))) {
      const [r = 0, g = 0, b = 0, a = 1] = parts;
      return [r, g, b, a];
    }
  }
  throw new Error(`Unsupported colour: ${value}`);
}
