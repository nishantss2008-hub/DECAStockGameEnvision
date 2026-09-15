import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useSheet, type SheetControls } from './useSheet';

// MemoryRouter, not a data router: jsdom's AbortSignal breaks data-router navigations; useSheet only needs the hooks.
function setup(initial: string) {
  const api: { current: SheetControls | null } = { current: null };
  const nav: { go: NavigateFunction | null; loc: string } = { go: null, loc: '' };
  function Probe() {
    api.current = useSheet();
    nav.go = useNavigate();
    const l = useLocation();
    nav.loc = `${l.pathname}${l.search}${l.hash}`;
    return null;
  }
  render(
    <MemoryRouter initialEntries={['/start', initial]} initialIndex={1}>
      <Probe />
    </MemoryRouter>,
  );
  return { api, router: { navigate: (n: number) => nav.go!(n) }, loc: () => nav.loc };
}

describe('useSheet', () => {
  it('open pushes one entry; Back (and close) pop it', async () => {
    const { api, router, loc } = setup('/markets?view=price#companies');
    act(() => api.current!.open({ kind: 'account' }));
    expect(loc()).toBe('/markets?view=price&sheet=account#companies');
    expect(api.current!.sheet).toEqual({ kind: 'account' });
    act(() => router.navigate(-1));
    expect(loc()).toBe('/markets?view=price#companies');
    act(() => api.current!.open({ kind: 'status' }));
    await act(async () => api.current!.close());
    expect(loc()).toBe('/markets?view=price#companies');
    expect(api.current!.sheet).toBeNull();
  });

  it('steps inside a sheet replace; close still returns to the page', async () => {
    const { api, loc } = setup('/portfolio');
    act(() => api.current!.open({ kind: 'trade', ticker: 'KRKN', side: 'buy' }));
    act(() => api.current!.replace({ kind: 'trade', ticker: 'KRKN', side: 'sell' }));
    expect(loc()).toBe('/portfolio?sheet=trade&ticker=KRKN&side=sell');
    await act(async () => api.current!.close());
    expect(loc()).toBe('/portfolio');
  });

  it('a deep-linked sheet closes by replacing, never leaving the app', async () => {
    const { api, router, loc } = setup('/portfolio?sheet=welcome');
    await act(async () => api.current!.close());
    expect(loc()).toBe('/portfolio');
    act(() => router.navigate(-1));
    expect(loc()).toBe('/start');
  });
});
