/**
 * End-to-end check of the Explain + compare comparison (COPY §3.2) against real generated markets.
 *
 * This lives in the server suite because it is the only place that can RUN `generateMarket`; the
 * web workspace does not depend on the server package, so it reaches the other way, importing the
 * pure `web/src/lib/compare.ts` (no DOM, no React) the way `introCopy.sync.test.ts` reaches into
 * `server/src/seed/roster.ts`.
 *
 * What it guards: with five sectors of exactly three, a sector MEDIAN is the middle company — very
 * often the one being read — so a third of all stats used to show a "Sector average" identical to
 * the company's own number, which teaches a student nothing. The comparison is now the company's
 * peers with itself excluded.
 */
import { describe, expect, it } from 'vitest';
import type { Company, Fundamentals } from '@deca/shared';
import { generateMarket } from '../src/seed/generateMarket';
import { isNotMeaningful, METRIC_IDS, metricValue, peerComparisons, type MetricId } from '../../web/src/lib/compare';

const SEEDS = Array.from({ length: 40 }, (_, i) => `compare-${i}`);

interface Market {
  companies: Record<string, Company>;
  fundamentals: Record<string, Fundamentals>;
  list: Company[];
}

function market(seed: string): Market {
  const generated = generateMarket(seed);
  const companies: Record<string, Company> = {};
  const fundamentals: Record<string, Fundamentals> = {};
  for (const g of generated.companies) {
    companies[g.company.id] = g.company as unknown as Company;
    fundamentals[g.company.id] = g.fundamentals as unknown as Fundamentals;
  }
  return { companies, fundamentals, list: Object.values(companies) };
}

/** Every usable value of `id` among the OTHER companies, recomputed independently of compare.ts. */
function peerValues(m: Market, self: Company, id: MetricId, sameSectorOnly: boolean): number[] {
  const out: number[] = [];
  for (const other of m.list) {
    if (other.id === self.id) continue;
    if (sameSectorOnly && other.sector !== self.sector) continue;
    const v = metricValue(id, m.fundamentals[other.id]!, other);
    if (v === null || isNotMeaningful(id, v)) continue;
    out.push(v);
  }
  return out;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

describe('peer comparisons over generated markets', () => {
  it('never shows a company its own number: no comparison equals the value it sits under', () => {
    const offenders: string[] = [];
    let pairs = 0;
    for (const seed of SEEDS) {
      const m = market(seed);
      const compare = peerComparisons(m.fundamentals, m.companies);
      for (const c of m.list) {
        const f = m.fundamentals[c.id]!;
        for (const id of METRIC_IDS) {
          const own = metricValue(id, f, c);
          if (own === null || isNotMeaningful(id, own)) continue;
          const peers = compare(id, c);
          if (peers.value === null) continue;
          pairs++;
          // A company may genuinely sit exactly midway between its two peers; that is a true fact
          // about the market, not the comparison echoing the company back at itself. Anything else
          // (and any exact tie where the company is NOT the midpoint) is the bug this test guards.
          const pool = peerValues(m, c, id, peers.scope === 'sector');
          const midpoint = pool.length === 2 && own === (pool[0]! + pool[1]!) / 2;
          if (peers.value === own && !midpoint) offenders.push(`${seed} ${c.ticker} ${id}`);
        }
      }
    }
    expect(pairs).toBeGreaterThan(10_000);
    expect(offenders).toEqual([]);
  });

  it('is the median of the OTHER companies in the sector, and moves when only a peer moves', () => {
    const m = market('compare-peers');
    const compare = peerComparisons(m.fundamentals, m.companies);
    for (const c of m.list) {
      for (const id of METRIC_IDS) {
        const sector = peerValues(m, c, id, true);
        const expected = sector.length > 0 ? { scope: 'sector', value: median(sector), count: sector.length } : null;
        const rest = peerValues(m, c, id, false);
        expect(compare(id, c)).toEqual({
          sector: c.sector,
          ...(expected ?? { scope: 'market', value: median(rest), count: rest.length }),
        });
      }
    }

    // Changing only the company's own fundamentals cannot change what it is compared against.
    const [first] = m.list;
    const nudged = { ...m.fundamentals, [first!.id]: { ...m.fundamentals[first!.id]!, netMargin: 0.99, debtToEquity: 9.9 } };
    const after = peerComparisons(nudged, m.companies);
    for (const id of ['netMargin', 'debtToEquity'] as const) expect(after(id, first!)).toEqual(compare(id, first!));
  });

  it('rate of "comparison equals the company\'s own value" stays near zero', () => {
    let pairs = 0;
    let equal = 0;
    for (const seed of SEEDS) {
      const m = market(seed);
      const compare = peerComparisons(m.fundamentals, m.companies);
      for (const c of m.list) {
        const f = m.fundamentals[c.id]!;
        for (const id of METRIC_IDS) {
          const own = metricValue(id, f, c);
          if (own === null || isNotMeaningful(id, own)) continue;
          pairs++;
          if (compare(id, c).value === own) equal++;
        }
      }
    }
    // The self-including sector median sat at ~33%. What is left is arithmetic coincidence, almost
    // all of it on beta, which the engine stores to 2 decimals (measured 0.12% over 200 seeds).
    expect(equal / pairs).toBeLessThan(0.01);
  });
});
