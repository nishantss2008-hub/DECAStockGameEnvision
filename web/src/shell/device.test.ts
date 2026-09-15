import { describe, expect, it } from 'vitest';
import { applySolidBars, crewInitials, homeScreenPlatform, layoutFor, readSolidBars, SOLID_BARS_KEY } from './device';

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('Solid bars', () => {
  it('stores "1" under bx.solidBars (the key the index.html head script reads) and sets the attribute', () => {
    const s = storage();
    const attrs = new Map<string, string>();
    const root = { setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
    applySolidBars(true, root, s);
    expect(SOLID_BARS_KEY).toBe('bx.solidBars');
    expect(s.data.get('bx.solidBars')).toBe('1');
    expect(attrs.has('data-solid-bars')).toBe(true);
    expect(readSolidBars(s)).toBe(true);
    applySolidBars(false, root, s);
    expect(attrs.has('data-solid-bars')).toBe(false);
    expect(readSolidBars(s)).toBe(false);
  });
});

describe('homeScreenPlatform', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0, 'other'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile', 5, 'android'],
    ['Mozilla/5.0 (X11; CrOS x86_64 15917.71.0) AppleWebKit/537.36 Chrome/128', 0, 'chromebook'],
  ] as const)('%s', (ua, touch, expected) => {
    expect(homeScreenPlatform(ua, touch)).toBe(expected);
  });
});

describe('layoutFor (MOBILE §4.5)', () => {
  it.each([
    [393, 852, 'phone'],
    [375, 667, 'phone'],
    [743, 1000, 'phone'],
    [852, 393, 'rail'],
    [667, 375, 'rail'],
    [932, 430, 'rail'],
    [744, 1133, 'split'],
    [820, 1180, 'split'],
    [1366, 650, 'split'],
    [744, 500, 'rail'],
    [700, 800, 'phone'],
  ] as const)('%i×%i → %s', (width, height, expected) => {
    expect(layoutFor({ width, height })).toBe(expected);
  });
});

describe('crewInitials', () => {
  it.each([
    ['Saltwind Traders', 'ST'],
    ["Anne's Revenge", 'AR'],
    ['kraken', 'KR'],
    ['  the black pearl crew ', 'TB'],
    ['', '?'],
  ])('%s → %s', (name, expected) => {
    expect(crewInitials(name)).toBe(expected);
  });
});
