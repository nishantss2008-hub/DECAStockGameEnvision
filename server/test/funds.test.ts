/**
 * Tradeable funds (spec 2026-09-16 §1–§2): three baskets of the 15 companies.
 *
 * A fund is NOT an independent security. It has no idiosyncratic volatility, no GARCH
 * state, no hidden q and no news of its own: every number it shows comes from what it
 * holds. These tests pin that down end to end —
 *
 *   1  instrument model: a fund is a tradeable thing beside a company (store, snapshot, history)
 *   2  trading a fund moves its constituents pro-rata, and nothing else
 *   3  no arbitrage in either direction, fund vs components vs a split order
 *   4  diversification is real: broad fund < sector fund < the average company
 *   5  ADV, the per-crew interval cap (no evasion through a fund) and price protection
 *   6  hidden quality is the weighted average of the constituents'
 *   7  position limits: sector funds normally, the broad fund exempt
 *   8  weights and holdings are public; q and the averaged quality are not, until 'ended'
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mean, standardDeviation } from 'simple-statistics';
import {
  EDGE_SPREAD,
  FUND_OPEN_PRICE,
  GAME_LENGTH_OPTIONS_MS,
  MODEL,
  deriveClock,
  fundConstituentShares,
  fundQuote,
  fundValueWeights,
  impactLambda,
  intervalShareCap,
  isFund,
  positionLimitFor,
  type Company,
  type Fund,
  type Instrument,
} from '@deca/shared';
import { GameEngine, setRealtimeHub } from '../src/engine/loop';
import {
  companyStep,
  derive,
  effectiveQuality,
  initialState,
  marketStep,
  surpriseFor,
  type ModelCompany,
} from '../src/engine/model';
import { buildSchedule, jumpsAtTick } from '../src/engine/news';
import { generateMarket } from '../src/seed/generateMarket';
import { BROAD_FUND_ID, FUND_DEFS } from '../src/seed/funds';
import { ROSTER } from '../src/seed/roster';
import { researchGrade } from '../src/engine/loopHelpers';
import { finalizeLeaderboard, recomputeLeaderboard, resetLeaderboardCache } from '../src/services/leaderboard';
import { executeOrder, TradeError } from '../src/services/trading';
import { buildSnapshot, publicFund } from '../src/realtime/snapshot';
import { useStore, type Store } from '../src/store';
import { MemoryStore, seedMarketInto } from './helpers/memoryStore';

const SEED = 'funds-test-seed';
const T0 = Date.UTC(2026, 8, 16, 12, 0, 0);
const SHORT = GAME_LENGTH_OPTIONS_MS[0]!;

const store = new MemoryStore();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  useStore(store as unknown as Store);
});
afterAll(() => {
  vi.useRealTimers();
  useStore(null);
});
afterEach(() => {
  setRealtimeHub(null);
});

async function newMarket(seed = SEED, cash = 5_000_000_000_000): Promise<GameEngine> {
  store.reset();
  resetLeaderboardCache();
  setRealtimeHub(null);
  vi.setSystemTime(T0);
  seedMarketInto(store, seed, { gameLengthMs: SHORT, maxPositionPct: 1, feeBps: 10, startingCapital: cash });
  const e = new GameEngine(store);
  await e.load();
  store.tx(() => {
    store.crews.create({ id: 'alpha', name: 'ALPHA', passwordHash: 'x', startingCapital: cash, createdAt: Date.now() });
  });
  await e.startGame();
  // The crew has met the market (design §6): the intro gate is not what these tests are about.
  store.crews.update('alpha', { cashBalance: cash, totalValue: cash, sessionOpenValue: cash, introCompletedAt: T0 });
  return e;
}

let orderSeq = 0;
async function order(e: GameEngine, side: 'buy' | 'sell', id: string, quantity: number, quotedPrice?: number) {
  return executeOrder(e, 'alpha', { companyId: id, side, quantity, clientOrderId: `o${orderSeq++}`, ...(quotedPrice ? { quotedPrice } : {}) });
}

const cashOf = (): number => store.crews.get('alpha')!.cashBalance;
const fundRow = (id: string): Fund => store.funds.get(id)!;
const shipsFund = (): Fund => store.funds.all().find((f) => f.style === 'sector' && f.sector === 'Shipping & Salvage')!;
const armsFund = (): Fund => store.funds.all().find((f) => f.style === 'sector' && f.sector === 'Naval Arms')!;

// ─── 1. Instrument model ──────────────────────────────────────────────────────

describe('1. instrument model', () => {
  it('defines exactly three funds with 3–5 character tickers that no company uses', () => {
    expect(FUND_DEFS).toHaveLength(3);
    const companyTickers = new Set(ROSTER.map((r) => r.ticker));
    for (const f of FUND_DEFS) {
      expect(f.ticker).toMatch(/^[A-Z]{3,5}$/);
      expect(companyTickers.has(f.ticker)).toBe(false);
    }
    expect(new Set(FUND_DEFS.map((f) => f.ticker)).size).toBe(3);
    expect(FUND_DEFS.filter((f) => f.style === 'broad')).toHaveLength(1);
    expect(FUND_DEFS.filter((f) => f.style === 'sector').map((f) => f.sector).sort()).toEqual([
      'Naval Arms',
      'Shipping & Salvage',
    ]);
  });

  it('holds the whole roster (broad) or one sector of three (sector), weights summing to 1', () => {
    const { funds } = generateMarket(SEED);
    const broad = funds.find((f) => f.fund.id === BROAD_FUND_ID)!.fund;
    expect(broad.holdings).toHaveLength(ROSTER.length);
    expect(broad.holdings.map((h) => h.companyId).sort()).toEqual(ROSTER.map((r) => r.id).sort());
    for (const g of funds) {
      const sum = g.fund.holdings.reduce((a, h) => a + h.weight, 0);
      expect(sum).toBeCloseTo(1, 12);
      if (g.fund.style === 'sector') {
        expect(g.fund.holdings).toHaveLength(3);
        for (const h of g.fund.holdings) {
          expect(ROSTER.find((r) => r.id === h.companyId)!.sector).toBe(g.fund.sector);
        }
      }
    }
  });

  it('opens at exactly Ð100.00 through the divisor, every fund equal weight', () => {
    const { companies, funds } = generateMarket(SEED);
    const priceOf = (id: string) => companies.find((c) => c.company.id === id)!.startPriceCents;
    for (const g of funds) {
      expect(g.fund.startPrice).toBe(FUND_OPEN_PRICE);
      expect(g.fund.currentPrice).toBe(FUND_OPEN_PRICE);
      expect(fundQuote(g.fund, priceOf)).toBeCloseTo(FUND_OPEN_PRICE, 6);
      // Deliberately equal weight, broad fund included — see `holdingsFor` for why not cap weight.
      const value = fundValueWeights(g.fund, priceOf);
      const share = 1 / (g.fund.style === 'sector' ? 3 : ROSTER.length);
      for (const v of value) expect(v.weight).toBeCloseTo(share, 10);
    }
  });

  it('is deterministic from the seed and differs between seeds', () => {
    expect(generateMarket(SEED).funds).toEqual(generateMarket(SEED).funds);
    expect(generateMarket('other-seed').funds).not.toEqual(generateMarket(SEED).funds);
  });

  it('narrows a company or a fund through the Instrument union', () => {
    const { companies, funds } = generateMarket(SEED);
    const list: Instrument[] = [companies[0]!.company, funds[0]!.fund];
    expect(list.filter(isFund).map((f) => f.ticker)).toEqual([funds[0]!.fund.ticker]);
    const c: Company = list.filter((i): i is Company => !isFund(i))[0]!;
    expect(c.sector).toBeTruthy();
  });

  it('appears in the market snapshot and in price history like a company does', async () => {
    const e = await newMarket();
    const snap = buildSnapshot({ role: 'team', teamId: 'alpha' });
    expect(snap.funds.map((f) => f.ticker).sort()).toEqual(FUND_DEFS.map((f) => f.ticker).sort());
    expect(store.history.range(BROAD_FUND_ID, 0, 0)).toEqual([{ tick: 0, price: FUND_OPEN_PRICE, volume: 0 }]);
    await tickTo(e, 3);
    const points = store.history.range(BROAD_FUND_ID, 0, 3);
    expect(points.map((p) => p.tick)).toEqual([0, 1, 2, 3]);
    expect(points.every((p) => p.price > 0)).toBe(true);
    expect(store.funds.get(BROAD_FUND_ID)!.currentPrice).toBe(points.at(-1)!.price);
    expect(e.getPrice(BROAD_FUND_ID)).toBe(points.at(-1)!.price);
  });
});

async function tickTo(e: GameEngine, t: number): Promise<void> {
  const now = e.state.startAt! + t * e.state.tickIntervalMs;
  vi.setSystemTime(now);
  await e.tickOnce(now);
}

// ─── 2. Trading a fund moves its constituents ─────────────────────────────────

describe('2. trading a fund moves its constituents', () => {
  it('splits the order pro-rata by weight and leaves no impact term on the fund itself', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    const before = Object.fromEntries(ships.holdings.map((h) => [h.companyId, e.getPrice(h.companyId)]));
    const qty = 20_000;
    await order(e, 'buy', ships.id, qty);

    // The engine keeps a price state per COMPANY only: a fund has no v/m/f/h of its own.
    const engineRow = store.engine.get()!;
    expect(Object.keys(engineRow.companies)).not.toContain(ships.id);

    // Each constituent carries its own share of the demand, pro-rata by w_i × notional.
    const wanted = fundConstituentShares(ships, qty);
    for (const w of wanted) {
      const state = engineRow.companies[w.companyId]!;
      // f is only banked into the price at the next tick; the reservation holds it as pending flow.
      expect(state.f).toBe(0);
    }
    await tickTo(e, 1);
    const after = store.engine.get()!;
    for (const w of wanted) {
      const lambda = impactLambda(store.secrets.get(w.companyId)!.beta, store.secrets.get(w.companyId)!.sharesOutstanding);
      // f = decay·(0 + λ·Q) for exactly this constituent's share of the order.
      expect(after.companies[w.companyId]!.f).toBeCloseTo(
        Math.exp((-Math.LN2 / MODEL.mispriceHalfLife) / e.state.totalTicks) * lambda * w.shares,
        12,
      );
    }
    // The fund's quote is the basket of the moved constituent prices, nothing else.
    expect(e.getPrice(ships.id)).toBe(Math.max(1, Math.round(fundQuote(ships, (id) => e.getPrice(id)))));
    expect(Object.values(before).some((p, i) => p !== e.getPrice(ships.holdings[i]!.companyId))).toBe(true);
  });

  it('records the traded fund shares as fund volume and the constituent shares as company volume', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    await order(e, 'buy', ships.id, 10_000);
    await tickTo(e, 1);
    expect(store.history.range(ships.id, 1, 1)[0]!.volume).toBe(10_000);
    for (const w of fundConstituentShares(ships, 10_000)) {
      expect(store.history.range(w.companyId, 1, 1)[0]!.volume).toBe(Math.round(w.shares));
    }
  });
});

// ─── 3. No arbitrage, both directions ─────────────────────────────────────────

/** Cash spent by `fn` on a fresh market built from the same seed. */
async function spend(fn: (e: GameEngine) => Promise<void>): Promise<number> {
  const e = await newMarket();
  const before = cashOf();
  await fn(e);
  return before - cashOf();
}

describe('3. no arbitrage', () => {
  const QTY = 12_000;

  it('buying the fund costs what buying its constituents costs, within rounding', async () => {
    const template = shipsFund;
    const viaFund = await spend(async (e) => {
      await order(e, 'buy', template().id, QTY);
    });
    const viaComponents = await spend(async (e) => {
      for (const w of fundConstituentShares(template(), QTY)) await order(e, 'buy', w.companyId, Math.round(w.shares));
    });
    const half = await spend(async (e) => {
      await order(e, 'buy', template().id, QTY / 2);
      for (const w of fundConstituentShares(template(), QTY / 2)) await order(e, 'buy', w.companyId, Math.round(w.shares));
    });
    expect(Math.abs(viaFund - viaComponents) / viaFund).toBeLessThan(1e-3);
    expect(Math.abs(half - viaFund) / viaFund).toBeLessThan(1e-3);
    expect(Math.abs(half - viaComponents) / viaComponents).toBeLessThan(1e-3);
  });

  it('selling the fund pays what selling its constituents pays, within rounding', async () => {
    /** Cash RECEIVED by the sell, after the same position was built and a price update passed. */
    async function proceeds(build: (e: GameEngine) => Promise<void>, sell: (e: GameEngine) => Promise<void>): Promise<number> {
      const e = await newMarket();
      await build(e);
      await tickTo(e, 1);
      const before = cashOf();
      await sell(e);
      return cashOf() - before;
    }
    const parts = () => fundConstituentShares(shipsFund(), QTY).map((w) => ({ ...w, shares: Math.round(w.shares) }));

    const viaFund = await proceeds(
      async (e) => void (await order(e, 'buy', shipsFund().id, QTY)),
      async (e) => void (await order(e, 'sell', shipsFund().id, QTY)),
    );
    const viaComponents = await proceeds(
      async (e) => {
        for (const w of parts()) await order(e, 'buy', w.companyId, w.shares);
      },
      async (e) => {
        for (const w of parts()) await order(e, 'sell', w.companyId, w.shares);
      },
    );
    expect(viaFund).toBeGreaterThan(0);
    expect(Math.abs(viaFund - viaComponents) / viaFund).toBeLessThan(1e-3);
  });

  it('a fund round trip inside one price update loses fees and impact and never gains', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    const before = cashOf();
    const buy = await order(e, 'buy', ships.id, QTY);
    const sell = await order(e, 'sell', ships.id, QTY);
    const loss = before - cashOf();
    expect(loss).toBeGreaterThan(0);
    // Path-exact impact breaks even inside an interval, so the whole loss is the two fees.
    expect(loss).toBeCloseTo(buy.fee + sell.fee, -1);
    expect(store.holdings.get('alpha', ships.id)).toBeNull();
  });
});

// ─── 4. Diversification is real ───────────────────────────────────────────────

describe('4. diversification', () => {
  /** Realized whole-game vol of every company and every fund, from the pure model. */
  function volsFor(seed: string): { companies: number[]; funds: Record<string, number> } {
    const clock = deriveClock(SHORT);
    const d = derive(clock, EDGE_SPREAD.normal);
    const market = generateMarket(seed);
    const cos: ModelCompany[] = market.companies.map((g) => ({
      id: g.company.id,
      qEff: effectiveQuality(g.quality.q, surpriseFor(seed, g.company.id)),
      beta: g.company.beta,
      idioVol: g.idioVol,
      sharesOutstanding: g.company.sharesOutstanding,
      lambda: impactLambda(g.company.beta, g.company.sharesOutstanding),
    }));
    const byTick = jumpsAtTick(
      buildSchedule(seed, clock, market.companies.map((g) => ({ ...cos.find((c) => c.id === g.company.id)!, name: g.company.name, ticker: g.company.ticker, sector: g.company.sector })), d),
    );
    const st = new Map(market.companies.map((g) => [g.company.id, initialState(g.startPriceCents)]));
    const mk = { hM: 1 };
    const price: Record<string, number> = {};
    for (const g of market.companies) price[g.company.id] = g.startPriceCents;
    const rets: Record<string, number[]> = {};
    for (const g of market.companies) rets[g.company.id] = [];
    for (const g of market.funds) rets[g.fund.id] = [];
    let prevFund = Object.fromEntries(market.funds.map((g) => [g.fund.id, fundQuote(g.fund, (id) => price[id]!)]));
    for (let t = 1; t <= clock.totalTicks; t++) {
      const rM = marketStep(seed, t, mk, d);
      const evs = byTick.get(t) ?? [];
      for (const c of cos) {
        const jump = evs.reduce((a, ev) => a + (ev.jumps[c.id] ?? 0), 0);
        const prev = price[c.id]!;
        const next = companyStep(seed, t, c, st.get(c.id)!, rM, jump, 0, d);
        price[c.id] = next;
        rets[c.id]!.push(Math.log(next / prev));
      }
      for (const g of market.funds) {
        const next = fundQuote(g.fund, (id) => price[id]!);
        rets[g.fund.id]!.push(Math.log(next / prevFund[g.fund.id]!));
        prevFund[g.fund.id] = next;
      }
    }
    const n = clock.totalTicks;
    const vol = (r: number[]) => standardDeviation(r) * Math.sqrt(n);
    return {
      companies: market.companies.map((g) => vol(rets[g.company.id]!)),
      funds: Object.fromEntries(market.funds.map((g) => [g.fund.id, vol(rets[g.fund.id]!)])),
    };
  }

  it('broad fund < either sector fund < the average single company, over many seeds', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `div-${i}`);
    const rows = seeds.map(volsFor);
    const broad = mean(rows.map((r) => r.funds[BROAD_FUND_ID]!));
    const sectorIds = FUND_DEFS.filter((f) => f.style === 'sector').map((f) => f.id);
    const sectors = sectorIds.map((id) => mean(rows.map((r) => r.funds[id]!)));
    const single = mean(rows.map((r) => mean(r.companies)));

    // MEASURED over 300 games (150 seeds × 10 min + 150 × 30 min), realized whole-game vol:
    //   broad FLEET 0.2045 · ARMS 0.2577 · SHIPS 0.2768 · average single company 0.3736.
    //   (Cap-weighted FLEET measured 0.2245 before the 2026-09-16 switch to equal weights.)
    expect(broad).toBeLessThan(0.26);
    for (const s of sectors) {
      expect(broad).toBeLessThan(s);
      expect(s).toBeLessThan(single);
    }

    // Per seed, and not only on average: every fund is calmer than the average company, always.
    for (const r of rows) {
      expect(r.funds[BROAD_FUND_ID]!).toBeLessThan(mean(r.companies));
      for (const id of sectorIds) expect(r.funds[id]!).toBeLessThan(mean(r.companies));
    }

    // The pedagogical claim holds in EVERY seed now that the broad fund is equal weight: measured
    // 300/300 games for "broad < both sector funds" (cap weighting managed only 85.3%), and 99.3%
    // for "broad < the calmest SINGLE company" — the remaining 0.7% is a seed whose quietest
    // company happens to be quieter than the market itself, which is not a claim we make.
    const broadUnderBoth = rows.filter((r) => sectorIds.every((id) => r.funds[BROAD_FUND_ID]! < r.funds[id]!)).length / rows.length;
    expect(broadUnderBoth).toBe(1);
    // eslint-disable-next-line no-console
    console.log(
      'fund vol:',
      JSON.stringify({ broad: +broad.toFixed(4), sectors: sectors.map((s) => +s.toFixed(4)), avgCompany: +single.toFixed(4), broadUnderBoth }),
    );
  });
});

// ─── 5. ADV, interval cap, price protection ───────────────────────────────────

describe('5. ADV, interval cap and price protection', () => {
  it("a fund's ADV is the weighted sum of its constituents'", () => {
    const { companies, funds } = generateMarket(SEED);
    const advOf = (id: string) => companies.find((c) => c.company.id === id)!.company.adv;
    const priceOf = (id: string) => companies.find((c) => c.company.id === id)!.startPriceCents;
    for (const g of funds) {
      const value = fundValueWeights(g.fund, priceOf);
      const perUnit = fundConstituentShares(g.fund, 1);
      const expected = value.reduce(
        (a, v) => a + v.weight * (advOf(v.companyId) / perUnit.find((p) => p.companyId === v.companyId)!.shares),
        0,
      );
      expect(g.fund.adv).toBe(Math.round(expected));
    }
  });

  it('caps a fund order at the tightest constituent 1-ADV interval cap', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    const perUnit = fundConstituentShares(ships, 1);
    const capUnits = Math.min(
      ...perUnit.map((p) => intervalShareCap(store.companies.get(p.companyId)!.sharesOutstanding) / p.shares),
    );
    await expect(order(e, 'buy', ships.id, Math.ceil(capUnits) + 1_000)).rejects.toThrow(TradeError);
    await expect(order(e, 'buy', ships.id, Math.floor(capUnits))).resolves.toBeTruthy();
  });

  it('a crew cannot evade its per-company interval cap by routing through a fund', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    const tightest = fundConstituentShares(ships, 1)
      .map((p) => ({ ...p, cap: intervalShareCap(store.companies.get(p.companyId)!.sharesOutstanding) }))
      .sort((a, b) => a.cap / a.shares - b.cap / b.shares)[0]!;
    // Use the whole per-company cap directly, then try to buy more of it through the fund.
    await order(e, 'buy', tightest.companyId, tightest.cap);
    await expect(order(e, 'buy', ships.id, Math.ceil(1 / tightest.shares))).rejects.toThrow(/price update/);
    // The cap resets with the price update, exactly as it does for a company.
    await tickTo(e, 1);
    await expect(order(e, 'buy', ships.id, 1_000)).resolves.toBeTruthy();
  });

  it('closes the exploit in the other direction too: fund first, then the company', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    const tightest = fundConstituentShares(ships, 1)
      .map((p) => ({ ...p, cap: intervalShareCap(store.companies.get(p.companyId)!.sharesOutstanding) }))
      .sort((a, b) => a.cap / a.shares - b.cap / b.shares)[0]!;
    // Spend half the company's cap through the fund first.
    const units = Math.floor(tightest.cap / tightest.shares / 2);
    await order(e, 'buy', ships.id, units);
    const usedInCompany = units * tightest.shares;
    const left = Math.floor(tightest.cap - usedInCompany);
    expect(left).toBeGreaterThan(0);
    // Only the remainder is still available DIRECTLY: the fund's shares counted against the cap.
    await expect(order(e, 'buy', tightest.companyId, left + 10)).rejects.toThrow(/price update/);
    await expect(order(e, 'buy', tightest.companyId, left)).resolves.toBeTruthy();
  });

  it('price protection measures the fund against its constituents, not a stored quote', async () => {
    const e = await newMarket();
    const ships = shipsFund();
    const quoted = e.getPrice(ships.id);
    await expect(order(e, 'buy', ships.id, 10, Math.round(quoted * 1.01))).resolves.toBeTruthy();
    await expect(order(e, 'buy', ships.id, 10, Math.round(quoted * 1.05))).rejects.toThrow(/moved/);
    // The compared price is recomputed from live constituent prices every time.
    await tickTo(e, 1);
    expect(e.getPrice(ships.id)).toBe(Math.max(1, Math.round(fundQuote(shipsFund(), (id) => e.getPrice(id)))));
  });
});

// ─── 6. Hidden quality ────────────────────────────────────────────────────────

describe('6. hidden quality', () => {
  it("is the weighted average of the constituents' q", () => {
    const { companies, funds } = generateMarket(SEED);
    const qOf = (id: string) => companies.find((c) => c.company.id === id)!.quality.q;
    const priceOf = (id: string) => companies.find((c) => c.company.id === id)!.startPriceCents;
    for (const g of funds) {
      const expected = fundValueWeights(g.fund, priceOf).reduce((a, v) => a + v.weight * qOf(v.companyId), 0);
      expect(g.secret.q).toBeCloseTo(expected, 12);
    }
  });

  it('scores a broad-fund-only crew on the fund quality, not on a company', async () => {
    const e = await newMarket();
    await order(e, 'buy', BROAD_FUND_ID, 50_000);
    await tickTo(e, 1);
    recomputeLeaderboard(store, e, 1);
    const stats = store.crewStats.get('alpha');
    expect(stats.weight).toBeGreaterThan(0);
    expect(stats.exposure / stats.weight).toBeCloseTo(e.qualityOf(BROAD_FUND_ID), 9);
  });

  it('scores the broad fund as EXACTLY the market average — "did not pick", every seed', () => {
    const scores = Array.from({ length: 40 }, (_, i) => {
      const m = generateMarket(`grade-${i}`);
      return m.funds.find((f) => f.fund.id === BROAD_FUND_ID)!.secret.q;
    });
    const companyQ = Array.from({ length: 40 }, (_, i) => generateMarket(`grade-${i}`).companies.map((g) => Math.abs(g.quality.q))).flat();

    // The roster's measured q is rank-symmetric, so an EQUAL-weighted average of all 15 is 0 —
    // exactly, in every seed. Buying the whole market is therefore a grade C every time: it can
    // neither win nor lose the research score. Picking one company is a real bet (mean |q| 0.50).
    // Measured over 300 seeds: mean 0.0000, sd 0.0000, |q| max 0.0000, grades C 100%.
    // (Cap weighting gave +0.14 / sd 0.17 and graded B in 37% of seeds — that is why it is gone.)
    for (const q of scores) expect(q).toBeCloseTo(0, 10);
    expect(researchGrade(mean(scores))).toBe('C');
    expect(mean(companyQ)).toBeGreaterThan(0.4);
    // eslint-disable-next-line no-console
    console.log('broad fund q:', JSON.stringify({ mean: +mean(scores).toFixed(6), sd: +standardDeviation(scores).toFixed(6), absMax: +Math.max(...scores.map(Math.abs)).toFixed(6) }));
  });
});

// ─── 7. Position limits ───────────────────────────────────────────────────────

describe('7. position limits', () => {
  it('applies the host limit to a sector fund and exempts the broad fund', async () => {
    const e = await newMarket(SEED, 100_000_000);
    await e.applySettings({ maxPositionPct: 0.25 }).catch(() => undefined); // live game: settings are locked
    store.game.set({ ...store.game.get()!, maxPositionPct: 0.25 });
    e.state.maxPositionPct = 0.25;

    const ships = shipsFund();
    const overLimit = Math.ceil((0.5 * 100_000_000) / e.getPrice(ships.id));
    await expect(order(e, 'buy', ships.id, overLimit)).rejects.toThrow(/limit/);
    const broadOverLimit = Math.ceil((0.5 * 100_000_000) / e.getPrice(BROAD_FUND_ID));
    await expect(order(e, 'buy', BROAD_FUND_ID, broadOverLimit)).resolves.toBeTruthy();
  });

  it('states the exemption once, where a reader will find it', () => {
    expect(positionLimitFor(fundRow(BROAD_FUND_ID), 0.25)).toBe(1);
    expect(positionLimitFor(shipsFund(), 0.25)).toBe(0.25);
    expect(positionLimitFor(armsFund(), 0.25)).toBe(0.25);
    expect(positionLimitFor(store.companies.get(ROSTER[0]!.id)!, 0.25)).toBe(0.25);
    expect(FUND_DEFS.filter((f) => f.positionLimitExempt).map((f) => f.id)).toEqual([BROAD_FUND_ID]);
  });
});

// ─── 8. Nothing hidden leaks ──────────────────────────────────────────────────

describe('8. nothing hidden leaks', () => {
  it('publishes weights and constituents but never q or the averaged quality before the end', async () => {
    const e = await newMarket();
    const snap = buildSnapshot({ role: 'team', teamId: 'alpha' });
    const broad = snap.funds.find((f) => f.id === BROAD_FUND_ID)!;
    expect(broad.holdings).toHaveLength(15);
    expect(broad.holdings.every((h) => h.weight > 0 && h.ticker)).toBe(true);
    expect(broad.divisor).toBeGreaterThan(0);
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain('"reveal"');
    for (const key of ['qEff', 'surprise', 'pillars']) expect(serialized).not.toContain(`"${key}"`);
    expect(publicFund(fundRow(BROAD_FUND_ID), 'live').reveal).toBeUndefined();

    await tickTo(e, 2);
    await e.endGame();
    const ended = buildSnapshot({ role: 'team', teamId: 'alpha' });
    const endedBroad = ended.funds.find((f) => f.id === BROAD_FUND_ID)!;
    expect(endedBroad.reveal).toBeDefined();
    expect(endedBroad.reveal!.q).toBeCloseTo(e.qualityOf(BROAD_FUND_ID), 9);
  });

  it('keeps a fund secret out of the funds table itself', async () => {
    await newMarket();
    expect(JSON.stringify(store.funds.all())).not.toContain('"q"');
    expect(store.fundSecrets.get(BROAD_FUND_ID)!.q).toBeTypeOf('number');
  });
});

// ─── Final standings still work with funds held ───────────────────────────────

describe('final standings with a fund holding', () => {
  it('values a fund at its closing basket and grades the crew on the fund quality', async () => {
    const e = await newMarket();
    await order(e, 'buy', armsFund().id, 5_000);
    await tickTo(e, 2);
    await e.endGame();
    const final = finalizeLeaderboard(store, e).final!;
    const entry = final.entries.find((x) => x.teamId === 'alpha')!;
    expect(entry.heldAnyShares).toBe(true);
    expect(entry.researchScore).toBeCloseTo(e.qualityOf(armsFund().id), 6);
    expect(e.closePrice(armsFund().id)).toBeGreaterThan(0);
  });
});
