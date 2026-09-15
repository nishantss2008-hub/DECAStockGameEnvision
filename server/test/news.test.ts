import { describe, it, expect } from 'vitest';
import { deriveClock, HOUR_MS, SECTORS } from '@deca/shared';
import { derive } from '../src/engine/model';
import { buildSchedule, hostEvent } from '../src/engine/news';
// NewsCompany carries `qEff` (the plan's sample data named this field `q`, which the interface does not have).
const companies = Array.from({ length: 25 }, (_, i) => ({ id: `c${i}`, name: `Company ${i}`, ticker: `C${i}`, sector: 'Naval Arms', qEff: -1 + 2 * (i + 0.5) / 25, beta: 1 }));
describe('news schedule', () => {
  const clock = deriveClock(48 * HOUR_MS); const d = derive(clock, 0.3);
  it('is deterministic and sorted', () => {
    const a = buildSchedule('n', clock, companies, d); const b = buildSchedule('n', clock, companies, d);
    expect(a).toEqual(b); expect(a.map((e) => e.tick)).toEqual([...a.map((e) => e.tick)].sort((x, y) => x - y));
  });
  it('averages about K company events and caps jump size', () => {
    let n = 0; let maxAbs = 0;
    for (let s = 0; s < 20; s++) for (const e of buildSchedule(`s${s}`, clock, companies, d)) if (e.source === 'scheduled') { n++; for (const j of Object.values(e.jumps)) maxAbs = Math.max(maxAbs, Math.abs(Math.exp(j) - 1)); }
    expect(n / (20 * 25)).toBeGreaterThan(d.K * 0.8); expect(n / (20 * 25)).toBeLessThan(d.K * 1.2);
    expect(maxAbs).toBeLessThanOrEqual(0.25 + 1e-9);
  });
  it('good news is more likely for higher quality', () => {
    let upHi = 0, totHi = 0, upLo = 0, totLo = 0;
    for (let s = 0; s < 40; s++) for (const e of buildSchedule(`q${s}`, clock, companies, d)) {
      if (e.source !== 'scheduled') continue; const q = companies.find((c) => c.id === e.companyIds[0])!.qEff;
      if (q > 0.6) { totHi++; if (e.sentiment === 'bullish') upHi++; } if (q < -0.6) { totLo++; if (e.sentiment === 'bullish') upLo++; }
    }
    expect(upHi / totHi).toBeGreaterThan(0.65); expect(upLo / totLo).toBeLessThan(0.35);
  });
  it('macro events hit every company with beta-scaled jumps', () => {
    const macro = buildSchedule('m', clock, companies, d).filter((e) => e.source === 'macro');
    expect(macro.length).toBeGreaterThanOrEqual(1); expect(macro.length).toBeLessThanOrEqual(2);
    expect(macro[0]!.companyIds.length).toBe(25);
  });
  it('host events convert magnitude to a log jump', () => {
    const e = hostEvent(10, companies, { companyIds: ['c1'], type: 'merger', magnitude: 0.1, headline: 'H', body: '' });
    expect(e.jumps.c1).toBeCloseTo(Math.log(1.1), 12); expect(e.sentiment).toBe('bullish'); expect(e.source).toBe('host');
  });
  it('types company news by size relative to the typical jump (every game length)', () => {
    for (const hours of [1, 4, 48]) {
      const c = deriveClock(hours * HOUR_MS); const dd = derive(c, 0.3); let n = 0;
      for (let s = 0; s < 5; s++) for (const e of buildSchedule(`rel${s}`, c, companies, dd)) {
        if (e.source !== 'scheduled') continue; n++;
        const j = e.jumps[e.companyIds[0]!]!; const size = e.sentiment === 'bullish' ? Math.expm1(j) : -Math.expm1(j);
        const allowed = size < 0.8 * dd.jumpMean ? ['earnings'] : size < 1.4 * dd.jumpMean ? ['management', 'regulatory']
          : e.sentiment === 'bullish' ? ['merger', 'discovery'] : ['scandal', 'storm'];
        expect(allowed, `${hours}h size ${size} vs jumpMean ${dd.jumpMean}`).toContain(e.type);
      }
      expect(n).toBeGreaterThan(0);
    }
  });
  it('at 1h, 12h and 48h earnings is 45–65% of company news and each large type is at least 5%', () => {
    // Theory (S ~ Exp(s), cap 0.25 > 1.4·s for every K): small 1 − e^−0.8 = 55.1%, medium e^−0.8 − e^−1.4 = 20.3%,
    // large e^−1.4 = 24.7%, so each of merger/discovery/scandal/storm is ~6.2% (about 5 SE above 5% with ~10,000 events).
    for (const hours of [1, 12, 48]) {
      const c = deriveClock(hours * HOUR_MS); const dd = derive(c, 0.3); const seeds = Math.ceil(10_000 / (25 * dd.K));
      const counts: Record<string, number> = {}; let n = 0;
      for (let s = 0; s < seeds; s++) for (const e of buildSchedule(`mix${s}`, c, companies, dd)) {
        if (e.source !== 'scheduled') continue; n++; counts[e.type] = (counts[e.type] ?? 0) + 1;
      }
      const share = (...types: string[]) => types.reduce((a, t) => a + (counts[t] ?? 0), 0) / n;
      expect(n, `${hours}h events`).toBeGreaterThan(8_000);
      expect(share('earnings'), `${hours}h earnings`).toBeGreaterThanOrEqual(0.45); expect(share('earnings'), `${hours}h earnings`).toBeLessThanOrEqual(0.65);
      for (const t of ['merger', 'discovery', 'scandal', 'storm']) expect(share(t), `${hours}h ${t}`).toBeGreaterThanOrEqual(0.05);
      expect(share('management', 'regulatory'), `${hours}h medium`).toBeGreaterThan(0.15);
    }
  });
  it('body is "{name} ({ticker}) — {sentence}." and no headline or body names any sector', () => {
    const mixed = companies.map((c, i) => ({ ...c, sector: SECTORS[i % SECTORS.length]! }));
    let n = 0;
    for (const hours of [1, 48]) for (let s = 0; s < 4; s++) {
      const c = deriveClock(hours * HOUR_MS);
      for (const e of buildSchedule(`body${s}`, c, mixed, derive(c, 0.3))) {
        for (const sector of SECTORS) expect(e.headline + ' ' + e.body, sector).not.toContain(sector);
        if (e.source !== 'scheduled') continue; n++;
        const co = mixed.find((x) => x.id === e.companyIds[0])!;
        expect(e.body.startsWith(`${co.name} (${co.ticker}) — `)).toBe(true);
        expect(e.body.endsWith('.')).toBe(true); expect(e.body.endsWith('..')).toBe(false);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
  it('headlines contain no alcohol words', () => {
    for (const e of buildSchedule('w', clock, companies, d)) expect(/rum|grog|ale|beer|wine|tavern|drunk/i.test(e.headline + e.body.replace(/Company \d+/g, ''))).toBe(false);
  });
});
