/**
 * Device-level helpers: Solid bars (per device, applied before first paint by index.html), the Add to Home Screen
 * platform, the §4.5 layout for a viewport, and crew monogram letters.
 */
export const SOLID_BARS_KEY = 'bx.solidBars';
export const SOLID_BARS_ATTR = 'data-solid-bars';

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readSolidBars(storage: Pick<KeyValueStore, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(SOLID_BARS_KEY) === '1';
  } catch {
    return false;
  }
}

export function applySolidBars(
  on: boolean,
  root: { setAttribute(k: string, v: string): void; removeAttribute(k: string): void },
  storage: KeyValueStore | null | undefined,
): void {
  if (on) root.setAttribute(SOLID_BARS_ATTR, '');
  else root.removeAttribute(SOLID_BARS_ATTR);
  try {
    if (on) storage?.setItem(SOLID_BARS_KEY, '1');
    else storage?.removeItem(SOLID_BARS_KEY);
  } catch {
    // Storage blocked: the switch still works for this visit.
  }
}

export type HomeScreenPlatform = 'ios' | 'android' | 'chromebook' | 'other';

export function homeScreenPlatform(userAgent: string, maxTouchPoints: number): HomeScreenPlatform {
  if (/CrOS/.test(userAgent)) return 'chromebook';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  // iPadOS reports a Mac user agent; only touch tells them apart.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'other';
}

export type ShellLayout = 'phone' | 'rail' | 'split';

export const RAIL_QUERY = '(orientation: landscape) and (max-height: 500px)';
export const SPLIT_QUERY = '(min-width: 744px) and (min-height: 501px)';

export function layoutFor({ width, height }: { width: number; height: number }): ShellLayout {
  if (width > height && height <= 500) return 'rail';
  if (width >= 744 && height >= 501) return 'split';
  return 'phone';
}

export function crewInitials(name: string): string {
  const words = name.replace(/['\u2019]/g, '').trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}
