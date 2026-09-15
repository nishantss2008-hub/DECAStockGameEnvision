import { describe, it, expect } from 'vitest';
import { GLOSSARY, NEWS_EXPLAIN, glossarySearch } from './glossary';
import { NEWS_TYPES } from '@deca/shared';
const REQUIRED = ['stock','price','marketCap','sector','index','volume','beta','analystRating','priceTarget','voyageRange','sessionChange','revenue','netIncome','netMargin','grossMargin','operatingMargin','eps','roe','roa','ebitda','revenueGrowth','industryGrowth','tam','debtToEquity','currentRatio','totalDebt','cash','equity','totalAssets','totalLiabilities','operatingCashFlow','capex','freeCashFlow','peRatio','forwardPe','psRatio','pbRatio','evToEbitda','dividendYield','payoutRatio','marketOrder','fee','priceImpact','avgCost','costBasis','totalGain','realizedGain','unrealizedGain','positionLimit','diversification','cashAvailable','tick','session','quality','news','researchEdge'];
describe('glossary', () => {
  it('has every required term with all explanation lines', () => {
    for (const id of REQUIRED) {
      const e = GLOSSARY[id]; expect(e, id).toBeDefined();
      for (const k of ['label', 'term', 'whatItIs', 'whyItMatters', 'usuallyGoodWhen'] as const) expect(e![k].length, `${id}.${k}`).toBeGreaterThan(8);
    }
  });
  it('keeps sentences short and plain', () => {
    for (const e of Object.values(GLOSSARY)) for (const t of [e.whatItIs, e.whyItMatters, e.usuallyGoodWhen]) {
      expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(32);
      expect(/\b(rum|grog|beer|wine|ale)\b|black pearl|sparrow|barbossa/i.test(t)).toBe(false);
    }
  });
  it('explains every news type both ways and searches', () => {
    for (const t of NEWS_TYPES) { expect(NEWS_EXPLAIN[t].bullish.length).toBeGreaterThan(10); expect(NEWS_EXPLAIN[t].bearish.length).toBeGreaterThan(10); }
    expect(glossarySearch('p/e').map((e) => e.id)).toContain('peRatio');
    expect(glossarySearch('debt').map((e) => e.id)).toContain('debtToEquity');
  });
});
