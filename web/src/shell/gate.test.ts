import { describe, expect, it } from 'vitest';
import { gateFor, homeFor, safeNext } from './gate';

const loc = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });
const anon = { loading: false, signedIn: false, role: null } as const;
const crew = { loading: false, signedIn: true, role: 'team' } as const;
const host = { loading: false, signedIn: true, role: 'admin' } as const;

describe('gateFor', () => {
  it('waits while the session is restored', () => {
    expect(gateFor('crew', { loading: true, signedIn: false, role: null }, loc('/news'))).toEqual({ kind: 'loading' });
  });

  it('sends signed-out visitors to /login with next', () => {
    expect(gateFor('crew', anon, loc('/markets/company/KRKN', '?sheet=trade'))).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fmarkets%2Fcompany%2FKRKN%3Fsheet%3Dtrade',
    });
    expect(gateFor('crew', anon, loc('/portfolio'))).toEqual({ kind: 'redirect', to: '/login' });
    expect(gateFor('host', anon, loc('/admin/crews'))).toEqual({ kind: 'redirect', to: '/login?next=%2Fadmin%2Fcrews' });
  });

  it('keeps crews out of /admin and hosts out of the crew tabs', () => {
    expect(gateFor('host', crew, loc('/admin'))).toEqual({ kind: 'redirect', to: '/portfolio' });
    expect(gateFor('crew', host, loc('/portfolio'))).toEqual({ kind: 'redirect', to: '/admin' });
    expect(gateFor('crew', crew, loc('/portfolio'))).toEqual({ kind: 'allow' });
    expect(gateFor('host', host, loc('/admin/tape'))).toEqual({ kind: 'allow' });
  });

  it('a signed-in account without a role cannot enter either area', () => {
    const noRole = { loading: false, signedIn: true, role: null } as const;
    expect(gateFor('crew', noRole, loc('/news'))).toEqual({ kind: 'redirect', to: '/login' });
    expect(gateFor('login', noRole, loc('/login'))).toEqual({ kind: 'allow' });
  });

  it('signed-in users leave /login for next (when allowed) or their home', () => {
    expect(gateFor('login', crew, loc('/login', '?next=%2Fnews%2Fn-1'))).toEqual({ kind: 'redirect', to: '/news/n-1' });
    expect(gateFor('login', crew, loc('/login', '?next=%2Fadmin'))).toEqual({ kind: 'redirect', to: '/portfolio' });
    expect(gateFor('login', host, loc('/login', '?next=%2Fnews'))).toEqual({ kind: 'redirect', to: '/admin' });
    expect(gateFor('login', anon, loc('/login'))).toEqual({ kind: 'allow' });
  });
});

describe('safeNext', () => {
  it.each([
    [null, 'team', null],
    ['https://evil.example', 'team', null],
    ['//evil.example/x', 'team', null],
    ['/\\evil', 'team', null],
    ['/login?next=/x', 'team', null],
    ['/markets?view=price#companies', 'team', '/markets?view=price#companies'],
    ['/admin/crews', 'admin', '/admin/crews'],
    ['/administrator', 'team', '/administrator'],
    ['/admin', 'team', null],
    ['/portfolio', 'admin', null],
  ] as const)('%s for %s → %s', (next, role, expected) => {
    expect(safeNext(next, role)).toBe(expected);
  });

  it('homes', () => {
    expect(homeFor('team')).toBe('/portfolio');
    expect(homeFor('admin')).toBe('/admin');
    expect(homeFor(null)).toBe('/login');
  });
});
