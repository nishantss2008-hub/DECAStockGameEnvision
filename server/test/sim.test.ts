import { describe, it, expect } from 'vitest';
import { TOTAL_TICKS, ENGINE_PARAMS } from '@deca/shared';
import { Prng, deriveSeed } from '../src/lib/prng';
import { generateIntrinsicPath, companySigma } from '../src/engine/intrinsic';
import { stepPrice } from '../src/engine/engine';
import type { Archetype } from '@deca/shared';

/** Headless simulation of a single company's realized price across the game,
 *  with seeded noise and no order flow / news (the deterministic baseline). */
function simulate(seed: string, id: string, archetype: Archetype, startCents: number, ticks: number): number[] {
  const path = generateIntrinsicPath(seed, id, archetype, ticks);
  const sigma = companySigma(seed, id, archetype, ENGINE_PARAMS.sigmaBase);
  let p = startCents;
  const series = [p];
  for (let t = 1; t <= ticks; t++) {
    const rng = new Prng(deriveSeed(seed, `noise:${id}:${t}`));
    p = stepPrice({
      prevCents: p,
      intrinsicCents: Math.round(startCents * (path[t] ?? 1)),
      sigma,
      flowImpact: 0,
      newsJumpFrac: 0,
      rng,
    });
    series.push(p);
  }
  return series;
}

const ret = (series: number[], start: number) => series[series.length - 1]! / start - 1;

describe('full-game simulation', () => {
  const SEED = 'sim-seed';
  const START = 10_000;
  const N = 12;

  it('rewards research: compounders beat decliners on average over 48h', () => {
    let comp = 0;
    let dec = 0;
    for (let i = 0; i < N; i++) {
      comp += ret(simulate(SEED, `comp${i}`, 'compounder', START, TOTAL_TICKS), START);
      dec += ret(simulate(SEED, `dec${i}`, 'decliner', START, TOTAL_TICKS), START);
    }
    const meanComp = comp / N;
    const meanDec = dec / N;
    expect(meanComp).toBeGreaterThan(meanDec);
    expect(meanComp).toBeGreaterThan(0);
    expect(meanDec).toBeLessThan(0);
  });

  it('keeps prices positive and short-run returns near-unpredictable (low autocorrelation)', () => {
    const series = simulate(SEED, 'x', 'steady', START, 3000);
    expect(Math.min(...series)).toBeGreaterThan(0);

    const rets: number[] = [];
    for (let i = 1; i < series.length; i++) rets.push((series[i]! - series[i - 1]!) / series[i - 1]!);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    let num = 0;
    let den = 0;
    for (let i = 1; i < rets.length; i++) num += (rets[i]! - mean) * (rets[i - 1]! - mean);
    for (let i = 0; i < rets.length; i++) den += (rets[i]! - mean) ** 2;
    const acf1 = num / den;
    expect(Math.abs(acf1)).toBeLessThan(0.3); // unpredictable tick-to-tick
  });
});
