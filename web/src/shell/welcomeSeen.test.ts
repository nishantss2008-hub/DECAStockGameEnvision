/**
 * The Welcome sheet's "seen" flag, and the walkthrough key it inherits (MOBILE §7.2).
 *
 * The walkthrough state was deleted on 2026-09-18, but its localStorage key is still on students'
 * phones. What these pin is that a returning crew is neither welcomed twice nor broken by the
 * leftover, and that the leftover does not survive the visit.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { legacySeen, legacyWalkthroughKey, markWelcomeSeen, migrateWelcomeSeen, readWelcomeSeen, welcomeKey } from './welcomeSeen';

const TEAM = 'saltwind-traders';

function memoryStore(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/** Storage that throws on every access, the way Safari does with site data blocked. */
const blocked = new Proxy({} as Storage, {
  get() {
    throw new Error('blocked');
  },
});

describe('keys', () => {
  it('are per crew, and the old one is still spelled the way phones hold it', () => {
    expect(welcomeKey(TEAM)).toBe('bx.welcome.saltwind-traders');
    expect(legacyWalkthroughKey(TEAM)).toBe('bx.walkthrough.saltwind-traders');
  });
});

describe('legacySeen', () => {
  it.each([
    ['nothing stored', null, false],
    ['status new: the sheet was never answered', '{"status":"new","step":0}', false],
    ['status hidden: skipped or finished', '{"status":"hidden","step":1}', true],
    ['status active: the walkthrough was running, so the sheet was answered', '{"status":"active","step":2}', true],
    ['the oldest build\'s bare flag', '"dismissed"', true],
    ['a status no build ever wrote', '{"status":"dismissed","step":0}', true],
    ['not JSON at all', 'not json', true],
  ] as const)('%s', (_name, raw, expected) => {
    expect(legacySeen(raw)).toBe(expected);
  });
});

describe('readWelcomeSeen', () => {
  it('is false for a crew this device has never welcomed', () => {
    expect(readWelcomeSeen(memoryStore(), TEAM)).toBe(false);
  });

  it('is true once the sheet has been answered', () => {
    expect(readWelcomeSeen(memoryStore({ [welcomeKey(TEAM)]: '1' }), TEAM)).toBe(true);
  });

  it('reads a returning crew out of the walkthrough key', () => {
    expect(readWelcomeSeen(memoryStore({ [legacyWalkthroughKey(TEAM)]: '{"status":"hidden","step":0}' }), TEAM)).toBe(true);
  });

  it('still welcomes a crew whose walkthrough key says the sheet was never answered', () => {
    expect(readWelcomeSeen(memoryStore({ [legacyWalkthroughKey(TEAM)]: '{"status":"new","step":0}' }), TEAM)).toBe(false);
  });

  it('is keyed by crew, so a second crew on one device gets its own welcome', () => {
    const store = memoryStore({ [welcomeKey(TEAM)]: '1' });
    expect(readWelcomeSeen(store, 'black-pearl')).toBe(false);
  });

  it('answers rather than throwing when storage is blocked', () => {
    expect(readWelcomeSeen(blocked, TEAM)).toBe(false);
  });

  it('never writes', () => {
    const store = memoryStore({ [legacyWalkthroughKey(TEAM)]: '"dismissed"' });
    readWelcomeSeen(store, TEAM);
    expect(store.getItem(legacyWalkthroughKey(TEAM))).toBe('"dismissed"');
    expect(store.getItem(welcomeKey(TEAM))).toBeNull();
  });
});

describe('markWelcomeSeen', () => {
  let store: Storage;
  beforeEach(() => {
    store = memoryStore({ [legacyWalkthroughKey(TEAM)]: '{"status":"new","step":0}' });
  });

  it('records the answer and clears the walkthrough leftover', () => {
    markWelcomeSeen(store, TEAM);
    expect(readWelcomeSeen(store, TEAM)).toBe(true);
    expect(store.getItem(legacyWalkthroughKey(TEAM))).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    expect(() => markWelcomeSeen(blocked, TEAM)).not.toThrow();
  });
});

describe('migrateWelcomeSeen', () => {
  it('carries a returning crew across and drops the old key', () => {
    const store = memoryStore({ [legacyWalkthroughKey(TEAM)]: '{"status":"hidden","step":2}' });
    migrateWelcomeSeen(store, TEAM);
    expect(store.getItem(welcomeKey(TEAM))).toBe('1');
    expect(store.getItem(legacyWalkthroughKey(TEAM))).toBeNull();
  });

  it('drops the old key without claiming a brand-new crew was welcomed', () => {
    const store = memoryStore({ [legacyWalkthroughKey(TEAM)]: '{"status":"new","step":0}' });
    migrateWelcomeSeen(store, TEAM);
    expect(store.getItem(welcomeKey(TEAM))).toBeNull();
    expect(store.getItem(legacyWalkthroughKey(TEAM))).toBeNull();
    expect(readWelcomeSeen(store, TEAM)).toBe(false);
  });

  it('touches nothing when there is no leftover, and never throws', () => {
    const store = memoryStore();
    migrateWelcomeSeen(store, TEAM);
    expect(store.length).toBe(0);
    expect(() => migrateWelcomeSeen(blocked, TEAM)).not.toThrow();
  });
});
