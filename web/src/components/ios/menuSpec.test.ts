import { describe, it, expect } from 'vitest';
import { menuProblems, type MenuGroupSpec } from './menuSpec';

const Icon = () => null;
const noop = () => {};

describe('menuProblems (MOBILE §5.10 rules)', () => {
  it('accepts a sort menu and a row long-press menu', () => {
    const sort: MenuGroupSpec[] = [
      {
        label: 'Sort by',
        value: 'value',
        onValueChange: noop,
        items: [
          { id: 'value', label: 'Value', onSelect: noop },
          { id: 'gain', label: 'Total gain %', onSelect: noop },
        ],
      },
    ];
    expect(menuProblems(sort)).toEqual([]);
    const row: MenuGroupSpec[] = [
      { items: [{ id: 'buy', label: 'Buy', icon: Icon, onSelect: noop }, { id: 'sell', label: 'Sell', icon: Icon, onSelect: noop }] },
      { items: [{ id: 'view', label: 'View company', icon: Icon, onSelect: noop }] },
    ];
    expect(menuProblems(row)).toEqual([]);
  });

  it('allows at most 3 groups', () => {
    const g: MenuGroupSpec = { items: [{ id: 'a', label: 'A', onSelect: noop }] };
    expect(menuProblems([g, g, g])).toEqual([]);
    expect(menuProblems([g, g, g, g])).toContain('A menu has at most 3 groups.');
  });

  it('wants icons on every item in a group or on none', () => {
    const mixed: MenuGroupSpec[] = [
      { items: [{ id: 'a', label: 'A', icon: Icon, onSelect: noop }, { id: 'b', label: 'B', onSelect: noop }] },
    ];
    expect(menuProblems(mixed)).toContain('Group 1 mixes items with and without icons.');
  });

  it('puts destructive items last', () => {
    const early: MenuGroupSpec[] = [
      { items: [{ id: 'x', label: 'Remove', destructive: true, onSelect: noop }, { id: 'a', label: 'A', onSelect: noop }] },
    ];
    expect(menuProblems(early)).toContain('Destructive items must come last.');
    const late: MenuGroupSpec[] = [
      { items: [{ id: 'a', label: 'A', onSelect: noop }] },
      { items: [{ id: 'x', label: 'Remove', destructive: true, onSelect: noop }] },
    ];
    expect(menuProblems(late)).toEqual([]);
  });

  it('rejects empty groups and a selected value that matches no item', () => {
    expect(menuProblems([{ items: [] }])).toContain('Group 1 is empty.');
    expect(
      menuProblems([{ value: 'zzz', onValueChange: noop, items: [{ id: 'a', label: 'A', onSelect: noop }] }]),
    ).toContain('Group 1 value "zzz" matches no item.');
  });
});
