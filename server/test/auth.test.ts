/**
 * Session tokens (auth/sessions.ts): signing, verification, expiry and instant revocation.
 *
 * These run against a real `:memory:` store, so the token-version checks exercise the same rows a
 * password reset and a crew removal write.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, useStore, type Store } from '../src/store';
import {
  SESSION_TTL_MS,
  currentTokenVersion,
  issueToken,
  resetSessionSecretCache,
  sessionSecret,
  verifyToken,
} from '../src/auth/sessions';
import { adminTokenVersion, bumpAdminTokenVersion } from '../src/services/hostPassword';

let store: Store;

function crew(id = 'saltwind'): void {
  store.crews.create({ id, name: id, passwordHash: 'unused-here', startingCapital: 100_000 });
}

/** A crew token carrying the crew's current version. */
function crewToken(id = 'saltwind'): string {
  return issueToken({ role: 'team', teamId: id, tokenVersion: currentTokenVersion('team', id) }).token;
}

function adminToken(): string {
  return issueToken({ role: 'admin', tokenVersion: currentTokenVersion('admin') }).token;
}

beforeEach(() => {
  store = openStore(':memory:');
  useStore(store);
  resetSessionSecretCache();
});

afterEach(() => {
  useStore(null);
  store.close();
  resetSessionSecretCache();
});

describe('the signing secret', () => {
  it('is generated once and kept in meta', () => {
    const first = sessionSecret();
    expect(first.length).toBeGreaterThan(30);
    expect(store.meta.get('session_secret')).toBe(first);
    resetSessionSecretCache();
    expect(sessionSecret()).toBe(first);
  });

  it('differs between databases, so a token from one does not verify against another', () => {
    crew();
    const token = crewToken();
    const other = openStore(':memory:');
    useStore(other);
    resetSessionSecretCache();
    other.crews.create({ id: 'saltwind', name: 'saltwind', passwordHash: 'x', startingCapital: 1 });
    expect(verifyToken(token)).toBeNull();
    other.close();
  });
});

describe('issue and verify', () => {
  it('round-trips a crew session', () => {
    crew();
    const { token, expiresAt } = issueToken({ role: 'team', teamId: 'saltwind', tokenVersion: 1 });
    expect(expiresAt).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 2000);
    expect(verifyToken(token)).toEqual({ role: 'team', teamId: 'saltwind', tokenVersion: 1 });
  });

  it('round-trips a host session with no crew', () => {
    const subject = verifyToken(adminToken());
    expect(subject?.role).toBe('admin');
    expect(subject?.teamId).toBeUndefined();
  });

  it('refuses a token past its expiry', () => {
    crew();
    const token = crewToken();
    expect(verifyToken(token, Date.now() + SESSION_TTL_MS + 1000)).toBeNull();
    expect(verifyToken(token, Date.now() + SESSION_TTL_MS - 1000)).not.toBeNull();
  });

  it('refuses anything that is not three signed parts', () => {
    for (const bad of ['', 'x', 'a.b', 'a.b.c', `${crewToken()}.extra`]) expect(verifyToken(bad)).toBeNull();
  });

  it('refuses a payload edited after signing', () => {
    crew();
    crew('blackfin');
    const [header, body, signature] = crewToken('saltwind').split('.') as [string, string, string];
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    payload.teamId = 'blackfin';
    const forged = `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`;
    expect(verifyToken(forged)).toBeNull();
  });

  it('refuses an unsigned "alg: none" token', () => {
    crew();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ role: 'admin', tv: 1, iat: 0, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url');
    expect(verifyToken(`${header}.${body}.`)).toBeNull();
  });
});

describe('revocation', () => {
  it('kills every token a crew holds when its version is bumped', () => {
    crew();
    const token = crewToken();
    expect(verifyToken(token)).not.toBeNull();
    store.crews.bumpTokenVersion('saltwind');
    expect(verifyToken(token)).toBeNull();
    // A fresh sign-in works immediately.
    expect(verifyToken(crewToken())).not.toBeNull();
  });

  it('kills a removed crew’s token', () => {
    crew();
    const token = crewToken();
    store.crews.remove('saltwind');
    expect(verifyToken(token)).toBeNull();
  });

  it('never accepts a token for a crew that never existed', () => {
    expect(verifyToken(crewToken('ghost'))).toBeNull();
  });

  it('kills the host’s token when the host password changes', () => {
    const token = adminToken();
    expect(verifyToken(token)).not.toBeNull();
    const next = bumpAdminTokenVersion();
    expect(next).toBe(adminTokenVersion());
    expect(verifyToken(token)).toBeNull();
    expect(verifyToken(adminToken())).not.toBeNull();
  });
});
