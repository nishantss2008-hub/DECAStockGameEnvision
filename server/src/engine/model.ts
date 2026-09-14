/**
 * Pure per-tick price model (spec §5, v2.1). No I/O.
 *
 * Quality-tilted single-index jump-diffusion in log space:
 *   - Sharpe single-index market factor with GARCH(1,1) variance
 *   - exact GBM idiosyncratic diffusion with per-company GARCH(1,1) variance
 *   - Kou-signed Poisson news jumps (scheduled up front in news.ts)
 *   - optional exact OU mispricing (off by default: MODEL.mispriceSd = 0)
 *   - linear transient impact with exponential resilience (Obizhaeva–Wang),
 *     arbitrage-free because impact is linear (Gatheral 2010)
 *
 * One game = one simulated trading year, so every MODEL figure is per game and
 * only per-tick sizes change with the game length. All randomness comes from
 * `Prng(deriveSeed(seed, label))` with labels `mkt:${t}` and `co:${id}:${t}`
 * (z then zO), so fair value v and GARCH h never depend on player flow; only
 * the impact term f does.
 */

import { MODEL, clamp, estFillPrice, type GameClock } from '@deca/shared';
import { Prng, deriveSeed } from '../lib/prng';

export interface ModelCompany {
  id: string;
  qEff: number;
  beta: number;
  idioVol: number;
  sharesOutstanding: number;
  /** impactLambda(beta, sharesOutstanding): log impact per net share. */
  lambda: number;
}

/** v = ln(fair value cents); m = OU mispricing (0 while mispriceSd = 0); f = transient impact; h = GARCH variance ratio. */
export interface CompanyState {
  v: number;
  m: number;
  f: number;
  h: number;
}

export interface MarketState {
  hM: number;
}

export interface Derived {
  dt: number;
  /** Expected scheduled news events per company per game. */
  K: number;
  phi: number;
  alpha: number;
  beta: number;
  /** Per-tick decay for impact (and OU): half-life = MODEL.mispriceHalfLife of the game. */
  decay: number;
  ouSd: number;
  /** Mean s of the (untruncated) exponential jump size. */
  jumpMean: number;
  /** E[min(Exp(s), maxJump)]. */
  truncMean: number;
  spread: number;
  /** Diffusion clamp: tickMoveSds·√dt. */
  moveCap: number;
}

/** Scheduled news events per company for a game of `hours`: clamp(round(1.5·√hours), 2, 12). */
function jumpsPerCompany(hours: number): number {
  return clamp(Math.round(1.5 * Math.sqrt(hours)), 2, 12);
}

export function derive(clock: GameClock, spread: number): Derived {
  const dt = 1 / clock.totalTicks;
  const c = -Math.log(MODEL.garchPersistDay) * MODEL.tradingDaysPerGame;
  const a = MODEL.garchAlphaDay * Math.sqrt(MODEL.tradingDaysPerGame);
  const phi = Math.exp(-c * dt);
  const alpha = Math.min(0.3, a * Math.sqrt(dt));
  const beta = phi - alpha;
  const kap = Math.LN2 / MODEL.mispriceHalfLife;
  const decay = Math.exp(-kap * dt);
  const ouSd = MODEL.mispriceSd * Math.sqrt(1 - decay * decay);
  const K = jumpsPerCompany(clock.hours);
  const jumpMean = Math.sqrt(MODEL.jumpVarPerGame / (2 * K));
  const truncMean = jumpMean * (1 - Math.exp(-MODEL.maxJump / jumpMean));
  const moveCap = MODEL.tickMoveSds * Math.sqrt(dt);
  return { dt, K, phi, alpha, beta, decay, ouSd, jumpMean, truncMean, spread, moveCap };
}

/** GARCH(1,1) variance-ratio update with unit long-run mean, clamped to [garchHMin, garchHMax]. */
export function garchStep(h: number, z: number, d: Derived): number {
  return clamp(1 - d.phi + d.alpha * z * z * h + d.beta * h, MODEL.garchHMin, MODEL.garchHMax);
}

/** Probability a scheduled news jump is good news. */
export function upProbability(qEff: number): number {
  return 0.5 + MODEL.jumpUpBias * qEff;
}

/**
 * Per-game log drift from quality, net of the expected signed jump size, so the
 * expected log return from quality is spread·qEff for any K.
 */
export function drift(c: ModelCompany, d: Derived): number {
  return d.spread * c.qEff - d.K * (2 * upProbability(c.qEff) - 1) * d.truncMean;
}

/** Market factor log return for tick t. Mutates mk.hM. */
export function marketStep(seed: string, t: number, mk: MarketState, d: Derived): number {
  const zM = new Prng(deriveSeed(seed, `mkt:${t}`)).gauss();
  const rM = MODEL.mktDrift * d.dt + MODEL.mktVol * Math.sqrt(mk.hM * d.dt) * zM;
  mk.hM = garchStep(mk.hM, zM, d);
  return rM;
}

/**
 * Advances one company by tick t. Mutates `s` and returns the price in cents.
 * `jump` is the summed log jump of news firing at t (it gaps past the clamp);
 * `netShares` is the signed player flow traded during the interval.
 */
export function companyStep(
  seed: string,
  t: number,
  c: ModelCompany,
  s: CompanyState,
  rM: number,
  jump: number,
  netShares: number,
  d: Derived,
): number {
  const r = new Prng(deriveSeed(seed, `co:${c.id}:${t}`));
  const z = r.gauss();
  const zO = r.gauss(); // always drawn so the stream layout never depends on the OU switch
  const dv = clamp(
    drift(c, d) * d.dt + c.beta * rM + c.idioVol * Math.sqrt(s.h * d.dt) * z,
    -d.moveCap,
    d.moveCap,
  );
  s.v += dv + jump;
  s.h = garchStep(s.h, z, d);
  if (d.ouSd > 0) s.m = s.m * d.decay + d.ouSd * zO;
  s.f = d.decay * (s.f + c.lambda * netShares); // decay AFTER adding flow: kernel decay^|j−k| is positive definite
  return Math.max(1, Math.round(Math.exp(s.v + s.m + s.f)));
}

export function initialState(startPriceCents: number): CompanyState {
  return { v: Math.log(startPriceCents), m: 0, f: 0, h: 1 };
}

/** Idiosyncratic vol per game: idioVolBase − idioVolQuality·q ± U(idioVolJitter), seeded `vol:${id}`. */
export function idioVolFor(seed: string, id: string, q: number): number {
  const jitter = new Prng(deriveSeed(seed, `vol:${id}`)).range(-MODEL.idioVolJitter, MODEL.idioVolJitter);
  return MODEL.idioVolBase - MODEL.idioVolQuality * q + jitter;
}

/** Hidden surprise ξ ~ U[−1, 1], seeded `surprise:${id}`. */
export function surpriseFor(seed: string, id: string): number {
  return new Prng(deriveSeed(seed, `surprise:${id}`)).range(-1, 1);
}

export function effectiveQuality(q: number, surprise: number, weight: number = MODEL.surpriseWeight): number {
  return weight * q + (1 - weight) * surprise;
}

/**
 * Path-exact average fill in UNROUNDED cents for a signed order σ when p signed
 * shares already traded this interval: exp(v+m+f)·e^{λp}·expm1(λσ)/(λσ).
 * Splitting an order costs exactly the same as one order. Equals exp(v+m+f+λp) when σ = 0.
 * Delegates to the shared estFillPrice so the server fill and the shared estimate are
 * one formula and agree bit for bit for the same unrounded last price.
 */
export function fillPriceExact(s: CompanyState, lambda: number, pendingNet: number, signedQty: number): number {
  return estFillPrice(signedQty < 0 ? 'sell' : 'buy', Math.exp(s.v + s.m + s.f), lambda, Math.abs(signedQty), pendingNet);
}

/** Closing mark in cents: max(1, round(exp(v+m))). Excludes impact, like a closing auction. */
export function closePrice(s: CompanyState): number {
  return Math.max(1, Math.round(Math.exp(s.v + s.m)));
}
