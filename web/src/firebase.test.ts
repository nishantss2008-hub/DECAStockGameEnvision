import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * web/src/firebase.ts config selection. The Firebase SDK is mocked, so nothing
 * connects anywhere; each test imports the module fresh with its own env.
 */

const sdk = vi.hoisted(() => ({
  initializeApp: vi.fn((config: Record<string, unknown>) => ({ config })),
  getAuth: vi.fn(() => ({ kind: 'auth' })),
  getFirestore: vi.fn(() => ({ kind: 'db' })),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
}));

vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp }));
vi.mock('firebase/auth', () => ({ getAuth: sdk.getAuth, connectAuthEmulator: sdk.connectAuthEmulator }));
vi.mock('firebase/firestore', () => ({ getFirestore: sdk.getFirestore, connectFirestoreEmulator: sdk.connectFirestoreEmulator }));

const REAL = {
  VITE_FIREBASE_API_KEY: 'real-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'real.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'real-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'real.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-XYZ',
};

function stubAll(values: Partial<Record<keyof typeof REAL | 'VITE_USE_EMULATORS', string>>): void {
  for (const key of [...Object.keys(REAL), 'VITE_USE_EMULATORS']) vi.stubEnv(key, values[key as keyof typeof values] ?? '');
}

async function load() {
  vi.resetModules();
  const mod = await import('./firebase');
  return { mod, config: sdk.initializeApp.mock.calls.at(-1)?.[0] as Record<string, unknown> };
}

beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  sdk.initializeApp.mockClear();
  sdk.connectAuthEmulator.mockClear();
  sdk.connectFirestoreEmulator.mockClear();
});

describe('firebase config', () => {
  it('emulator mode with no Firebase config uses demo-deca and a placeholder apiKey, then connects to the emulators', async () => {
    stubAll({ VITE_USE_EMULATORS: '1' });
    const { mod, config } = await load();
    expect(mod.useEmulators).toBe(true);
    expect(config).toMatchObject({ projectId: 'demo-deca', apiKey: 'demo-api-key' });
    expect(sdk.connectAuthEmulator).toHaveBeenCalledWith(expect.anything(), 'http://127.0.0.1:9099', { disableWarnings: true });
    expect(sdk.connectFirestoreEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 8080);
  });

  it('emulator mode accepts VITE_FIREBASE_PROJECT_ID=demo-deca and never passes the real apiKey, storage, messaging or analytics ids', async () => {
    stubAll({ ...REAL, VITE_USE_EMULATORS: '1', VITE_FIREBASE_PROJECT_ID: 'demo-deca' });
    const { config } = await load();
    expect(config.projectId).toBe('demo-deca');
    expect(config.apiKey).toBe('demo-api-key');
    expect(JSON.stringify(config)).not.toMatch(/real/);
    expect(config).not.toHaveProperty('storageBucket');
    expect(config).not.toHaveProperty('messagingSenderId');
    expect(config).not.toHaveProperty('appId');
    expect(config).not.toHaveProperty('measurementId');
  });

  it('emulator mode replaces a real project id with demo-deca and warns', async () => {
    stubAll({ ...REAL, VITE_USE_EMULATORS: '1' });
    const { config } = await load();
    expect(config.projectId).toBe('demo-deca');
    expect(console.warn).toHaveBeenCalled();
  });

  it('without emulators it uses the configured project and connects to no emulator', async () => {
    stubAll(REAL);
    const { mod, config } = await load();
    expect(mod.useEmulators).toBe(false);
    expect(config).toEqual({
      apiKey: 'real-key',
      authDomain: 'real.firebaseapp.com',
      projectId: 'real-project',
      storageBucket: 'real.appspot.com',
      messagingSenderId: '123',
      appId: '1:123:web:abc',
      measurementId: 'G-XYZ',
    });
    expect(sdk.connectAuthEmulator).not.toHaveBeenCalled();
    expect(sdk.connectFirestoreEmulator).not.toHaveBeenCalled();
  });

  it('a production build ignores VITE_USE_EMULATORS', async () => {
    vi.stubEnv('DEV', false);
    stubAll({ ...REAL, VITE_USE_EMULATORS: '1' });
    const { mod } = await load();
    expect(mod.useEmulators).toBe(false);
    expect(sdk.connectFirestoreEmulator).not.toHaveBeenCalled();
  });
});
