import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/**
 * The emulator guard in src/firebase.ts. Each test imports firebase.ts in a fresh
 * module context (vi.resetModules) so the module-level initialization runs again.
 *
 * The mocked tests replace firebase-admin/app, firestore, auth and node:fs entirely,
 * so no real credential, key file (server/service-account.json) or network is ever touched.
 */

const SERVICE_ACCOUNT_JSON = JSON.stringify({ type: 'service_account', project_id: 'decastockenvision', private_key: 'x', client_email: 'y' });

function mockSdk() {
  const cert = vi.fn(() => ({ kind: 'cert' }));
  const applicationDefault = vi.fn(() => ({ kind: 'adc' }));
  const initializeApp = vi.fn(() => ({}));
  const readFileSync = vi.fn(() => {
    throw new Error('a key file must never be read in this test');
  });
  const existsSync = vi.fn(() => true);
  vi.doMock('firebase-admin/app', () => ({ initializeApp, getApps: () => [], cert, applicationDefault }));
  vi.doMock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(() => ({})) }));
  vi.doMock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({})) }));
  vi.doMock('node:fs', () => ({ readFileSync, existsSync, default: { readFileSync, existsSync } }));
  return { cert, applicationDefault, initializeApp, readFileSync, existsSync };
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Every credential source is present, so a regression would reach for one.
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', SERVICE_ACCOUNT_JSON);
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_FILE', 'service-account.json');
  vi.stubEnv('GCLOUD_PROJECT', '');
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
  vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '');
});

afterEach(() => {
  vi.doUnmock('firebase-admin/app');
  vi.doUnmock('firebase-admin/firestore');
  vi.doUnmock('firebase-admin/auth');
  vi.doUnmock('node:fs');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('firebase emulator guard (mocked SDK, isolated module)', () => {
  it('FIRESTORE_EMULATOR_HOST set: cert() is never called and no key file is read', async () => {
    const sdk = mockSdk();
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');

    const mod = await import('../src/firebase');

    expect(mod.emulatorMode).toBe(true);
    expect(sdk.cert).not.toHaveBeenCalled();
    expect(sdk.applicationDefault).not.toHaveBeenCalled();
    expect(sdk.readFileSync).not.toHaveBeenCalled();
    expect(sdk.existsSync).not.toHaveBeenCalled();
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
    expect(sdk.initializeApp).toHaveBeenCalledWith({ projectId: 'demo-deca' });
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
  });

  it('FIREBASE_AUTH_EMULATOR_HOST alone also skips credentials and pins Firestore to the emulator', async () => {
    const sdk = mockSdk();
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');

    const mod = await import('../src/firebase');

    expect(mod.emulatorMode).toBe(true);
    expect(sdk.cert).not.toHaveBeenCalled();
    expect(sdk.applicationDefault).not.toHaveBeenCalled();
    expect(sdk.readFileSync).not.toHaveBeenCalled();
    expect(sdk.initializeApp).toHaveBeenCalledWith({ projectId: 'demo-deca' });
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080');
  });

  it('control: without emulator variables the mocked cert() IS reached (the spies above can see a regression)', async () => {
    const sdk = mockSdk();

    await import('../src/firebase');

    // FIREBASE_SERVICE_ACCOUNT is inline JSON, so the (mocked) fs is never needed.
    expect(sdk.cert).toHaveBeenCalledTimes(1);
    expect(sdk.readFileSync).not.toHaveBeenCalled();
    expect(sdk.initializeApp).toHaveBeenCalledWith({ credential: { kind: 'cert' }, projectId: 'decastockenvision' });
  });
});

describe('firebase emulator guard (real SDK, no network)', () => {
  it('uses a demo project id only and never loads a service-account credential', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:65535');
    // If the guard ever regressed, cert(JSON.parse(...)) would throw here before any key file is read.
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', 'not-json');

    const mod = await import('../src/firebase');
    const { getApps } = await import('firebase-admin/app');

    expect(mod.emulatorMode).toBe(true);
    const app = getApps()[0]!;
    expect(app.options.projectId).toBe('demo-deca');
    expect(app.options.credential?.constructor.name).not.toBe('ServiceAccountCredential');
    expect(JSON.stringify(app.options)).not.toMatch(/private_key|client_email/);
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
    expect(console.info).toHaveBeenCalledWith('[firebase] emulator mode — service account ignored');
  });
});
