import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lightTokenRule } from './kitLightTokens';

const tokensCss = readFileSync(fileURLToPath(new URL('../theme/tokens.css', import.meta.url)), 'utf8');

describe('gallery light token rule', () => {
  it('re-declares the light colour tokens from tokens.css under a class', () => {
    const rule = lightTokenRule(tokensCss, '.kit-light');
    expect(rule.startsWith('.kit-light{color-scheme:light;')).toBe(true);
    expect(rule).toContain('--bg-grouped:#E6E3D9;');
    expect(rule).toContain('--label:#161816;');
    expect(rule).toContain('--tint-strong:#5A4720;');
    expect(rule).toContain('--glass:rgba(248,246,240,.85);');
    // Layout tokens are not appearance tokens and must keep following the viewport.
    expect(rule).not.toContain('--margin');
    expect(rule).not.toContain('--t-body');
  });
});
