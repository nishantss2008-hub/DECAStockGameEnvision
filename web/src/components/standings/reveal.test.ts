import { describe, it, expect } from 'vitest';
import { movement, revealRows } from './reveal';
describe('reveal', () => {
  it('movement from prevRank', () => {
    expect(movement({ rank: 3, prevRank: 5 } as any)).toEqual({ dir: 'up', by: 2 });
    expect(movement({ rank: 3, prevRank: 3 } as any)).toEqual({ dir: 'flat', by: 0 });
  });
  it('rows sorted by quality with drivers', () => {
    const mk = (id: string, quality: number) => ({ id, ticker: id, name: id, reveal: { quality, q: 0, grade: 'A', pillars: { prof: 1, grow: -1, safe: 0.5, val: 0 }, fairValue: 1, expectedReturn: 0.1, actualReturn: 0.2, luck: 0.1, label: 'compounder' } } as any);
    const rows = revealRows([mk('a', -1), mk('b', 1)]);
    expect(rows.map((r) => r.companyId)).toEqual(['b', 'a']); expect(rows[0]!.drivers.length).toBeGreaterThan(0);
  });
});
