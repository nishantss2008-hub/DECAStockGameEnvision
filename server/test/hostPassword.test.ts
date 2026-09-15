/**
 * Host password without a new market (DEPLOY.md, RUNBOOK.md):
 *   - on boot, a set ADMIN_PASSWORD is hashed into `_auth/_admin`, logging only a fixed line
 *   - `npm run set-host-password` does the same from ADMIN_PASSWORD or a hidden prompt
 * Firestore is the in-memory fake and Auth is mocked: no emulator, network or credentials.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', async () => {
  const { FakeFirestore } = await import('./helpers/fakeFirestore');
  return {
    db: new FakeFirestore(),
    adminAuth: { revokeRefreshTokens: vi.fn(async (_uid: string) => {}) },
    emulatorMode: true,
    EMULATOR_PROJECT_ID: 'demo-deca',
  };
});

import { adminAuth, db as mockedDb } from '../src/firebase';
import type { FakeFirestore } from './helpers/fakeFirestore';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { HOST_PASSWORD_LOG, applyAdminPasswordFromEnv, setHostPassword } from '../src/services/hostPassword';
import { resolveHostPassword } from '../src/seed/hostPasswordInput';

const db = mockedDb as unknown as FakeFirestore;
const revoke = (adminAuth as unknown as { revokeRefreshTokens: ReturnType<typeof vi.fn> }).revokeRefreshTokens;
const SECRET = 'Harbor-Lantern-Seven-42';

function adminDoc(): Record<string, unknown> | undefined {
  return db.docs.get('_auth/_admin');
}

beforeEach(() => {
  db.reset();
  revoke.mockReset();
  revoke.mockImplementation(async () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setHostPassword', () => {
  it('upserts the hashed host login, signs the old host sessions out, and is a no-op when the password already matches', async () => {
    expect(await setHostPassword(SECRET)).toBe('set');
    const doc = adminDoc()!;
    expect(doc.role).toBe('admin');
    expect(verifyPassword(SECRET, doc.passwordHash as string)).toBe(true);
    expect(JSON.stringify(doc)).not.toContain(SECRET);
    expect(revoke).toHaveBeenCalledWith('admin');

    const writes = db.writes.length;
    revoke.mockClear();
    expect(await setHostPassword(SECRET)).toBe('unchanged');
    expect(db.writes.length).toBe(writes);
    expect(revoke).not.toHaveBeenCalled();

    // Replaces a password set by the seed, keeping any other field on the doc.
    db.docs.set('_auth/_admin', { passwordHash: hashPassword('old-one'), role: 'admin', note: 'kept' });
    expect(await setHostPassword('new-one!')).toBe('set');
    expect(verifyPassword('new-one!', adminDoc()!.passwordHash as string)).toBe(true);
    expect(adminDoc()!.note).toBe('kept');
  });

  it('refuses a password shorter than 4 characters (the crew password rule) and writes nothing', async () => {
    await expect(setHostPassword('abc')).rejects.toThrow(/at least 4 characters/);
    await expect(setHostPassword('x'.repeat(101))).rejects.toThrow(/100 characters or fewer/);
    expect(adminDoc()).toBeUndefined();
  });

  it('a host that never signed in has no Auth user to sign out', async () => {
    revoke.mockRejectedValueOnce(Object.assign(new Error('no user'), { code: 'auth/user-not-found' }));
    await expect(setHostPassword(SECRET)).resolves.toBe('set');
  });
});

describe('applyAdminPasswordFromEnv (server boot)', () => {
  it('does nothing when ADMIN_PASSWORD is unset', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    expect(await applyAdminPasswordFromEnv('', log)).toBe(false);
    expect(adminDoc()).toBeUndefined();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('sets the password and logs only the fixed line, never the value', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(await applyAdminPasswordFromEnv(SECRET, log)).toBe(true);
    expect(verifyPassword(SECRET, adminDoc()!.passwordHash as string)).toBe(true);
    expect(log.info.mock.calls).toEqual([[HOST_PASSWORD_LOG]]);
    expect(HOST_PASSWORD_LOG).toBe('host password set from ADMIN_PASSWORD');
    // Unchanged on the next boot: same single line.
    expect(await applyAdminPasswordFromEnv(SECRET, log)).toBe(true);
    expect(log.info.mock.calls).toEqual([[HOST_PASSWORD_LOG], [HOST_PASSWORD_LOG]]);
    const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, ...consoleSpies.map((s) => s.mock.calls)]);
    expect(everything).not.toContain(SECRET);
  });

  it('a too-short ADMIN_PASSWORD is skipped with a warning that does not include it, and the server still boots', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    expect(await applyAdminPasswordFromEnv('ab1', log)).toBe(false);
    expect(adminDoc()).toBeUndefined();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('ab1');
  });
});

describe('set-host-password input', () => {
  it('uses ADMIN_PASSWORD without prompting', async () => {
    const prompt = vi.fn();
    await expect(resolveHostPassword({ env: SECRET, interactive: false, prompt })).resolves.toBe(SECRET);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('otherwise asks twice in a terminal and needs both answers to match and be long enough', async () => {
    const answers = (...a: string[]) => {
      const prompt = vi.fn(async () => a.shift() ?? '');
      return prompt;
    };
    const ok = answers(SECRET, SECRET);
    await expect(resolveHostPassword({ env: '', interactive: true, prompt: ok })).resolves.toBe(SECRET);
    expect(ok).toHaveBeenCalledTimes(2);
    await expect(resolveHostPassword({ env: '', interactive: true, prompt: answers(SECRET, 'other') })).rejects.toThrow(/didn't match/);
    await expect(resolveHostPassword({ env: '', interactive: true, prompt: answers('abc', 'abc') })).rejects.toThrow(/at least 4 characters/);
  });

  it('without a terminal and without ADMIN_PASSWORD it stops with a plain message', async () => {
    await expect(resolveHostPassword({ env: '', interactive: false, prompt: vi.fn() })).rejects.toThrow(/ADMIN_PASSWORD/);
  });
});
