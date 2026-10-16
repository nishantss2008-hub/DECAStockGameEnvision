/**
 * Company profiles: every roster company has a complete business profile, and the per-game story
 * (leadership record, strategy) follows the PUBLIC profitability / growth / safety ranks.
 */
import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/seed/roster';
import { PROFILES, companyStory } from '../src/seed/profiles';
import { generateMarket } from '../src/seed/generateMarket';
import { Prng } from '../src/lib/prng';

describe('company profiles', () => {
  it('covers every roster company with every field filled in', () => {
    for (const e of ROSTER) {
      const p = PROFILES[e.id];
      expect(p, e.id).toBeDefined();
      for (const k of ['whatTheyDo', 'customers', 'businessModel', 'valueProposition', 'competitiveEdge'] as const) {
        expect(p![k].length, `${e.id}.${k}`).toBeGreaterThan(20);
      }
      expect(p!.products.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('ships the profile, strategy and a four-person leadership team in every generated market', () => {
    for (const g of generateMarket('profile-seed').companies) {
      expect(g.fundamentals.profile).toEqual(PROFILES[g.company.id]);
      expect(g.fundamentals.strategy).toBeTruthy();
      expect(g.fundamentals.management.map((m) => m.role)).toEqual([
        'Chief Executive Officer',
        'Chief Financial Officer',
        'Chief Operating Officer',
        'Chief Strategy Officer',
      ]);
      expect(new Set(g.fundamentals.management.map((m) => m.name)).size).toBe(4);
    }
  });

  it('writes a strong record for strong public numbers and a weak one for weak numbers', () => {
    let n = 0;
    const names = () => `Name ${n++}`;
    const strong = companyStory(new Prng(1), { prof: 1.2, grow: 1.1, safe: 1.0, netIncome: 1 }, names);
    const weak = companyStory(new Prng(1), { prof: -1.2, grow: -1.1, safe: -1.0, netIncome: 1 }, names);
    expect(strong.strategy).toMatch(/Expanding|Growing/);
    expect(weak.strategy).toMatch(/Shrinking|win back/);
    expect(weak.management[1]!.bio).toMatch(/borrowed|thin/i);
    const losing = companyStory(new Prng(1), { prof: 0, grow: 0, safe: 0, netIncome: -5 }, names);
    expect(losing.management[0]!.tenureYears).toBe(1);
    expect(losing.management[0]!.bio).toMatch(/losing money/);
  });
});
