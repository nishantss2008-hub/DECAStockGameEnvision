/**
 * Host password without a new market (DEPLOY.md, RUNBOOK.md):
 *   - on boot, a set ADMIN_PASSWORD is hashed into `meta.admin_password_hash`, logging only a fixed line
 *   - `npm run set-host-password` does the same from ADMIN_PASSWORD or a hidden prompt
 *   - a real change bumps `meta.admin_token_version`, which signs every host session out at once
 * Runs against an in-memory SQLite store: no emulator, network or credentials.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password';
import {
  ADMIN_TOKEN_VERSION_KEY,
  HOST_PASSWORD_LOG,
  adminTokenVersion,
  applyAdminPasswordFromEnv,
  bumpAdminTokenVersion,
  hostPasswordHash,
  setHostPassword,
} from '../src/services/hostPassword';
import { ADMIN_PASSWORD_KEY } from '../src/services/market';
import { resolveHostPassword } from '../src/seed/hostPasswordInput';
import { openStore, useStore, type Store } from '../src/store';

const SECRET = 'Harbor-Lantern-Seven-42';
let store: Store;

beforeEach(() => {
  store = openStore(':memory:');
  useStore(store);
});

afterEach(() => {
  vi.restoreAllMocks();
  useStore(null);
  store.close();
});

describe('setHostPassword', () => {
  it('upserts the hashed host login, signs the old host sessions out, and is a no-op when the password already matches', async () => {
    expect(hostPasswordHash()).toBeNull();
    expect(adminTokenVersion()).toBe(1);

    expect(await setHostPassword(SECRET)).toBe('set');
    const stored = hostPasswordHash()!;
    expect(verifyPassword(SECRET, stored)).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(adminTokenVersion()).toBe(2);

    expect(await setHostPassword(SECRET)).toBe('unchanged');
    expect(hostPasswordHash()).toBe(stored);
    expect(adminTokenVersion()).toBe(2); // an unchanged password keeps existing host sessions

    // Replaces a password set by the seed.
    store.meta.set(ADMIN_PASSWORD_KEY, hashPassword('old-one'));
    expect(await setHostPassword('new-one!')).toBe('set');
    expect(verifyPassword('new-one!', hostPasswordHash()!)).toBe(true);
    expect(adminTokenVersion()).toBe(3);
  });

  it('refuses a password shorter than 4 characters (the crew password rule) and writes nothing', async () => {
    await expect(setHostPassword('abc')).rejects.toThrow(/at least 4 characters/);
    await expect(setHostPassword('x'.repeat(101))).rejects.toThrow(/100 characters or fewer/);
    expect(hostPasswordHash()).toBeNull();
    expect(adminTokenVersion()).toBe(1);
  });

  it('bumps the host session generation on demand', () => {
    expect(bumpAdminTokenVersion()).toBe(2);
    expect(bumpAdminTokenVersion()).toBe(3);
    expect(store.meta.get(ADMIN_TOKEN_VERSION_KEY)).toBe('3');
  });
});

describe('applyAdminPasswordFromEnv (server boot)', () => {
  it('does nothing when ADMIN_PASSWORD is unset', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    expect(await applyAdminPasswordFromEnv('', log)).toBe(false);
    expect(hostPasswordHash()).toBeNull();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('sets the password and logs only the fixed line, never the value', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(await applyAdminPasswordFromEnv(SECRET, log)).toBe(true);
    expect(verifyPassword(SECRET, hostPasswordHash()!)).toBe(true);
    expect(log.info.mock.calls).toEqual([[HOST_PASSWORD_LOG]]);
    expect(HOST_PASSWORD_LOG).toBe('host password set from ADMIN_PASSWORD');
    // Unchanged on the next boot: same single line, and host sessions survive the restart.
    const version = adminTokenVersion();
    expect(await applyAdminPasswordFromEnv(SECRET, log)).toBe(true);
    expect(log.info.mock.calls).toEqual([[HOST_PASSWORD_LOG], [HOST_PASSWORD_LOG]]);
    expect(adminTokenVersion()).toBe(version);
    const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, ...consoleSpies.map((s) => s.mock.calls)]);
    expect(everything).not.toContain(SECRET);
  });

  it('a too-short ADMIN_PASSWORD is skipped with a warning that does not include it, and the server still boots', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    expect(await applyAdminPasswordFromEnv('ab1', log)).toBe(false);
    expect(hostPasswordHash()).toBeNull();
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
