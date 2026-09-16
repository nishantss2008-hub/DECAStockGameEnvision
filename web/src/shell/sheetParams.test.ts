import { describe, expect, it } from 'vitest';
import { PAGE_OWNED_SHEETS, parseSheet, withSheet, withoutSheet } from './sheetParams';

describe('parseSheet', () => {
  it.each([
    ['?sheet=trade&ticker=KRKN&side=buy', { kind: 'trade', ticker: 'KRKN', side: 'buy' }],
    ['?sheet=trade&ticker=krkn&side=sell', { kind: 'trade', ticker: 'KRKN', side: 'sell' }],
    ['?sheet=trade', { kind: 'trade', ticker: null, side: 'buy' }],
    ['?sheet=trade&ticker=<script>&side=short', { kind: 'trade', ticker: null, side: 'buy' }],
    ['?sheet=term&id=peRatio', { kind: 'term', id: 'peRatio' }],
    ['?sheet=account', { kind: 'account' }],
    ['?sheet=crew&id=saltwind-traders', { kind: 'crew', id: 'saltwind-traders' }],
    ['?sheet=status', { kind: 'status' }],
    ['?sheet=welcome&view=price', { kind: 'welcome' }],
    ['?sheet=help&set=markets-basics', { kind: 'help', set: 'markets-basics' }],
    ['?sheet=help&set=statements-cashflow', { kind: 'help', set: 'statements-cashflow' }],
    ['?sheet=help&set=company-analyst', { kind: 'help', set: 'company-analyst' }],
    ['?sheet=stat&id=peRatio', { kind: 'stat', id: 'peRatio' }],
    ['?sheet=stat&id=sessionRange', { kind: 'stat', id: 'sessionRange' }],
  ])('%s', (search, expected) => {
    expect(parseSheet(search)).toEqual(expected);
  });

  it.each([
    [''],
    ['?view=price'],
    ['?sheet='],
    ['?sheet=nope'],
    ['?sheet=term'],
    ['?sheet=term&id=a%20b'],
    ['?sheet=crew'],
    ['?sheet=stat'],
    ['?sheet=stat&id=pe ratio'],
    ['?sheet=help&set=everything'],
    ['?sheet=ACCOUNT'],
  ])('%s is not a sheet', (search) => {
    expect(parseSheet(search)).toBeNull();
  });

  it('accepts URLSearchParams too', () => {
    expect(parseSheet(new URLSearchParams('sheet=status'))).toEqual({ kind: 'status' });
  });
});

describe('withSheet / withoutSheet', () => {
  it('keeps page params and replaces any previous sheet params', () => {
    const next = withSheet('?view=price&sheet=term&id=peRatio', { kind: 'trade', ticker: 'KRKN', side: 'sell' });
    expect(new URLSearchParams(next).get('view')).toBe('price');
    expect(parseSheet(next)).toEqual({ kind: 'trade', ticker: 'KRKN', side: 'sell' });
    expect(new URLSearchParams(next).has('id')).toBe(false);
  });

  it('round-trips every kind', () => {
    const reqs = [
      { kind: 'trade', ticker: null, side: 'buy' },
      { kind: 'term', id: 'tick' },
      { kind: 'account' },
      { kind: 'crew', id: 'x' },
      { kind: 'status' },
      { kind: 'welcome' },
      { kind: 'help', set: 'positions' },
      { kind: 'stat', id: 'marketCap' },
    ] as const;
    for (const r of reqs) expect(parseSheet(withSheet('', r))).toEqual(r);
  });

  it('names the sheets a page renders itself, because their content needs the page data', () => {
    expect([...PAGE_OWNED_SHEETS].sort()).toEqual(['help', 'stat']);
  });

  it('removes only sheet params', () => {
    expect(withoutSheet('?filter=buys&sheet=trade&ticker=KRKN&side=buy&step=preview')).toBe('?filter=buys');
    expect(withoutSheet('?sheet=account')).toBe('');
  });
});
