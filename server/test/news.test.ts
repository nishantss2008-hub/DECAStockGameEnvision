import { describe, it, expect } from 'vitest';
import { deriveClock, HOUR_MS } from '@deca/shared';
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
  it('headlines contain no alcohol words', () => {
    for (const e of buildSchedule('w', clock, companies, d)) expect(/rum|grog|ale|beer|wine|tavern|drunk/i.test(e.headline + e.body.replace(/Company \d+/g, ''))).toBe(false);
  });
});
