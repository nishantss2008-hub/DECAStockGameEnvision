/**
 * Pure, seeded market generator (spec §4): latent quality → internally consistent
 * fundamentals → MEASURED quality score.
 *
 * 1. Latent quality ql is Latin-hypercube stratified across the roster (label `q`),
 *    so every game spans the full range while each company's place stays random.
 * 2. Each fundamental item draws x = 0.8·ql + 0.6·e (one-factor Gaussian copula,
 *    labels `item:${k}:${id}`) and maps it to a field by quantile within sector
 *    ranges from `research.json`.
 * 3. Accounting identities hold by construction (TA = E + TL, GP = Rev − COGS,
 *    FCF = OCF − capex, marketCap = price·shares, P/E = marketCap/NI, …).
 * 4. Valuation carries a realistic price of quality: cheapness c = −0.32·ql + 0.95·v
 *    (label `value:${id}`), P/E = PEref·e^(−0.35c); loss-makers are valued on sales.
 * 5. The score s and engine input q are MEASURED from the generated statements with
 *    `computeQualityScores`, so reading the statements well gives the full edge.
 * 6. The analyst view is a noisy, optimistic hint of s and never feeds the score.
 *
 * All money is integer cents of Ð. No I/O and no Math.random.
 */

import {
  MODEL,
  clamp,
  computeQualityScores,
  invNormCdf,
  normCdf,
  type Company,
  type FinancialPeriod,
  type Fundamentals,
  type ManagementMember,
  type QualityInput,
  type QualityResult,
  type Sector,
  type SectorRefs,
} from '@deca/shared';
import { Prng, deriveSeed } from '../lib/prng';
import { idioVolFor } from '../engine/model';
import { ROSTER, type RosterEntry } from './roster';
import researchRaw from './research.json';

export interface GeneratedCompany {
  company: Company;
  fundamentals: Fundamentals;
  quality: QualityResult;
  idioVol: number;
  startPriceCents: number;
}

export interface GeneratedMarket {
  seed: string;
  companies: GeneratedCompany[];
}

interface SectorProfile {
  sector: string;
  peLow: number;
  peHigh: number;
  psLow: number;
  psHigh: number;
  netMarginLow: number;
  netMarginHigh: number;
  revGrowthLow: number;
  revGrowthHigh: number;
  divYield: number;
  evEbitda: number;
}
interface ResearchConfig {
  analystRatings: string[];
  sectorProfiles: SectorProfile[];
}
const research = researchRaw as unknown as ResearchConfig;

const FALLBACK_PROFILE: Omit<SectorProfile, 'sector'> = {
  peLow: 15,
  peHigh: 25,
  psLow: 1.5,
  psHigh: 3.5,
  netMarginLow: 0.06,
  netMarginHigh: 0.12,
  revGrowthLow: 0.02,
  revGrowthHigh: 0.08,
  divYield: 0.015,
  evEbitda: 14,
};

function profileFor(sector: Sector): SectorProfile {
  return research.sectorProfiles.find((p) => p.sector === sector) ?? { sector, ...FALLBACK_PROFILE };
}

/** Sector valuation references for the VAL pillar: pe and ps are range midpoints. */
export function sectorRefs(): Record<string, SectorRefs> {
  const out: Record<string, SectorRefs> = {};
  for (const p of research.sectorProfiles) {
    out[p.sector] = { pe: (p.peLow + p.peHigh) / 2, evEbitda: p.evEbitda, ps: (p.psLow + p.psHigh) / 2 };
  }
  return out;
}

// ─── Tunables (spec §4 and the generator research notes) ─────────────────────

/** One-factor copula loadings: x = LOAD_Q·ql + LOAD_E·e. */
const LOAD_Q = 0.8;
const LOAD_E = 0.6;
/**
 * Payout is public and not a score item, so it loads only weakly on latent quality
 * (a hint weaker than the analyst view). The level is anchored to the sector dividend yield.
 */
const PAYOUT_Q = 0.35;
const PAYOUT_MAX = 0.9;
const MAX_DIVIDEND_YIELD = 0.08;
/** Loss-makers trade on sales at this fraction of the sector's low P/S (times the cheapness multiple). */
const LOSS_SALES_FACTOR = 0.2;
/** |net margin| floor: keeps EPS away from 0 and P/E inside the sector bounds (spec §4.5). */
const MIN_ABS_NET_MARGIN = 0.005;
/** Cheapness latent c = −0.32·ql + 0.95·v; P/E = PEref·e^(−0.35c). */
const VALUE_Q = -0.32;
const VALUE_V = 0.95;
const VALUE_SLOPE = 0.35;
/** Analyst view: z = 0.5·s + 0.87·n; target = price·(1 + 0.12 + 0.10·z). */
const ANALYST_S = 0.5;
const ANALYST_N = 0.87;
const ANALYST_OPTIMISM = 0.12;
const ANALYST_SLOPE = 0.1;
const TAX_RATE = 0.21;
const INTEREST_RATE = 0.06;
const REVENUE_MIN = 5e10; // Ð500M in cents
const REVENUE_MAX = 1.5e12; // Ð15B in cents
const PRICE_TARGET_MIN = 2_000; // Ð20
const PRICE_TARGET_MAX = 40_000; // Ð400
const START_PRICE_MIN = 1_200; // Ð12
const START_PRICE_MAX = 52_000; // Ð520
/** Safety bounds only: EPS = price/PE does not depend on the share count, and price·shares stays far below 2^53. */
const SHARES_MIN = 1e6;
const SHARES_MAX = 5e9;
const PERIODS = ['FY2022', 'FY2023', 'FY2024', 'FY2025'] as const;
const HEAVY_DEBT_DE = 1.8;
const THIN_CASH_CURRENT_RATIO = 0.9;

/** Sector cyclicality added to beta (±0.15). */
const CYCLICALITY: Record<Sector, number> = {
  'Shipping & Salvage': 0.1,
  'Rum & Provisions': -0.1,
  'Naval Arms': 0,
  'Cartography & Navigation': 0.05,
  'Treasure Banking': 0.1,
  'Cursed Relics': 0.15,
  'Tortuga Hospitality': 0.1,
  'Parrot & Livestock': 0,
  'Maps & Instruments': -0.05,
  'Letters of Marque (Insurance)': -0.15,
};

// ─── Flavor text (no alcohol words, no film names) ───────────────────────────

const FIRST_NAMES = [
  'Eleanor', 'Josiah', 'Constance', 'Tobias', 'Margaret', 'Samuel', 'Charlotte', 'Thomas',
  'Abigail', 'Nathaniel', 'Hester', 'Ezekiel', 'Prudence', 'Benedict', 'Isabel', 'Silas',
  'Beatrice', 'Cornelius', 'Harriet', 'Jonas', 'Lydia', 'Matthias', 'Rosalind', 'Edmund',
] as const;
const LAST_NAMES = [
  'Marlowe', 'Ashby', 'Wren', 'Blackwood', 'Carrow', 'Dunmore', 'Fairweather', 'Greaves',
  'Hallett', 'Ingram', 'Lockwood', 'Northcott', 'Pembroke', 'Radcliffe', 'Stanhope', 'Thornbury',
  'Whitlock', 'Yardley', 'Colbourne', 'Penhallow', 'Treloar', 'Holloway', 'Kingsley', 'Merriwether',
] as const;

const ROLES: { role: string; bios: readonly string[] }[] = [
  {
    role: 'Chief Executive Officer',
    bios: [
      'Former Port Royal harbor master who grew the company’s fleet.',
      'Rose from ship’s navigator to lead the whole company.',
      'Founded a small coastal trading house before joining the company.',
      'Led convoy contracts across the Spanish Main for many years.',
    ],
  },
  {
    role: 'Chief Financial Officer',
    bios: [
      'Ran a colonial trading house’s treasury before joining.',
      'Sets the dividend policy and keeps the company ledgers.',
      'Former Crown customs officer who knows every tariff by heart.',
    ],
  },
  {
    role: 'Chief Operating Officer',
    bios: [
      'Cut port turnaround times across the company’s routes.',
      'Runs the shipyards, crews and supply depots day to day.',
      'Former quartermaster who manages stores and repairs.',
    ],
  },
  {
    role: 'Chief Strategy Officer',
    bios: [
      'Charts new routes and trading posts for the company.',
      'Negotiates charters and partnerships with port authorities.',
      'Studies rival fleets and plans the company’s next moves.',
    ],
  },
];

const POSITIONS_STRONG = ['the dominant flagship of its waters', 'a niche specialist with a defensible cove'] as const;
const POSITIONS_TURNAROUND = ['a turnaround story under new colors'] as const;
const POSITIONS_OTHER = [
  'a nimble challenger gaining share',
  'a steady incumbent with a loyal crew',
  'a mid-sized player among larger rivals',
  'a regional operator with a few strong routes',
] as const;

const MARKETING = [
  (n: string) => `${n} wins merchants through its reputation, exclusive port access and on-time delivery.`,
  (n: string) => `${n} signs long charters with port authorities and gives loyal merchants lower rates.`,
  (n: string) => `${n} advertises in every harbor and prices below larger rivals to win new customers.`,
  (n: string) => `${n} focuses on a few premium customers and charges higher rates for reliable service.`,
] as const;

const RISKS = [
  'Storm seasons that disrupt shipping routes',
  'Crown regulation and shifting tariffs',
  'Rising cost of timber, canvas and powder',
  'Dependence on a handful of profitable routes',
  'Crew retention and leadership succession',
  'Competition from better-armed rivals',
  'Currency swings in doubloons and pieces of eight',
  'Raids on unguarded routes',
] as const;

const DEVELOPMENTS = [
  'Commissioned two new galleons to expand capacity',
  'Signed a multi-season supply pact with Tortuga ports',
  'Opened a new trading post on the Spanish Main',
  'Refit its flagship with copper plating for speed',
  'Settled a long-running dispute with the harbor guild',
  'Won a royal charter for a new trade route',
  'Hired a new fleet captain from a larger rival',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// `+ 0` turns −0 into 0: JSON (and Firestore) would otherwise round-trip −0 to a different value.
const round2 = (v: number) => Math.round(v * 100) / 100 + 0;
const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
const round4 = (v: number) => Math.round(v * 10_000) / 10_000 + 0;

/** Integer cents (may be negative); never returns −0. */
const cents = (v: number) => Math.round(v) + 0;

/** EPS in whole cents that keeps the sign of net income (never 0 for a non-zero result). */
function epsCents(netIncome: number, shares: number): number {
  if (netIncome === 0) return 0;
  return Math.sign(netIncome) * Math.max(1, Math.abs(cents(netIncome / shares)));
}

function pct1(fraction: number): string {
  return (Math.abs(fraction) * 100).toFixed(1);
}

interface Latents {
  nm: number; // net margin (and loss driver)
  turn: number; // asset turnover
  de: number; // low leverage (x high → low D/E)
  cr: number; // liquidity
  acc: number; // low accruals
  gm: number; // gross margin cushion
  g: number; // revenue growth
  md: number; // margin drift
  evol: number; // earnings stability
  iss: number; // low share issuance
  ind: number; // industry growth
  pay: number; // payout
}
const ITEM_KEYS: (keyof Latents)[] = ['nm', 'turn', 'de', 'cr', 'acc', 'gm', 'g', 'md', 'evol', 'iss', 'ind', 'pay'];

function itemLatents(seed: string, id: string, ql: number): Latents {
  const out = {} as Latents;
  for (const k of ITEM_KEYS) {
    const e = new Prng(deriveSeed(seed, `item:${k}:${id}`)).gauss();
    out[k] = k === 'pay' ? PAYOUT_Q * ql + Math.sqrt(1 - PAYOUT_Q ** 2) * e : LOAD_Q * ql + LOAD_E * e;
  }
  return out;
}

/** Everything about one company that does not need the market-wide quality ranking. */
interface Draft {
  entry: RosterEntry;
  ql: number;
  fundamentals: Omit<Fundamentals, 'businessOverview' | 'management' | 'industry' | 'marketingStrategy' | 'riskFactors' | 'recentDevelopments' | 'analyst'> & {
    industryGrowthRate: number;
    tam: number;
  };
  beta: number;
  startPriceCents: number;
}

function draftCompany(seed: string, entry: RosterEntry, ql: number): Draft {
  const p = profileFor(entry.sector);
  const x = itemLatents(seed, entry.id, ql);
  const size = new Prng(deriveSeed(seed, `size:${entry.id}`));
  const hist = new Prng(deriveSeed(seed, `history:${entry.id}`));

  // Income statement scale: size is independent of quality.
  const revenue = cents(Math.exp(Math.log(REVENUE_MIN) + Math.log(REVENUE_MAX / REVENUE_MIN) * size.next()));

  // Net margin within a widened sector band; the weakest ~8% post losses.
  const nmMid = (p.netMarginLow + p.netMarginHigh) / 2;
  const nmHalf = Math.max((p.netMarginHigh - p.netMarginLow) / 2, 0.35 * nmMid);
  const nmBase = nmMid - nmHalf + 2 * nmHalf * normCdf(x.nm);
  const nmRaw = nmBase - Math.min(2 * nmMid, 1.5 * nmMid * Math.max(0, -x.nm - 1));
  const netMarginTarget = Math.abs(nmRaw) >= MIN_ABS_NET_MARGIN ? nmRaw : nmRaw < 0 ? -MIN_ABS_NET_MARGIN : MIN_ABS_NET_MARGIN;
  const netIncome = cents(revenue * netMarginTarget);

  // Balance sheet: TA from turnover (scaled so a typical ROA is ~7%), then D/E splits the non-debt remainder.
  const turnMid = clamp(0.07 / nmMid, 0.25, 1.2);
  const turnover = turnMid * (0.6 + normCdf(x.turn));
  const assetsTarget = cents(revenue / turnover);
  const debtToEquity = round2(0.1 + 2.4 * normCdf(-x.de));
  const nonDebtLiabilities = cents(assetsTarget * (0.12 + 0.25 * size.next()));
  const equity = cents((assetsTarget - nonDebtLiabilities) / (1 + debtToEquity));
  const totalDebt = cents(debtToEquity * equity);
  const totalLiabilities = totalDebt + nonDebtLiabilities;
  const totalAssets = equity + totalLiabilities;
  const currentRatio = round2(0.5 + 2.5 * normCdf(x.cr));
  const cash = cents(totalAssets * (0.03 + 0.1 * normCdf(x.cr)));

  // Operating line consistent with net income: pre-tax (no tax credit on losses) plus interest.
  const interest = cents(INTEREST_RATE * totalDebt);
  const preTax = netIncome > 0 ? netIncome / (1 - TAX_RATE) : netIncome;
  const operatingIncomeBase = cents(preTax + interest);
  const depreciationShare = 0.02 + 0.06 * size.next();
  const overhead = 0.06 + 0.26 * normCdf(x.gm);
  const grossMarginTarget = clamp(operatingIncomeBase / revenue + depreciationShare + overhead, 0.12, 0.95);
  const costOfRevenue = cents(revenue * (1 - grossMarginTarget));
  const grossProfit = revenue - costOfRevenue;

  // Cash flow: accruals from +5% (poor) to −8% (good) of total assets.
  const accruals = 0.05 - 0.13 * normCdf(x.acc);
  const operatingCashFlow = netIncome - cents(accruals * totalAssets);
  const capex = cents(revenue * (0.03 + 0.09 * size.next()));
  const freeCashFlow = operatingCashFlow - capex;

  // Price of quality: quality trades at a premium on average, with plenty of noise.
  const valueRng = new Prng(deriveSeed(seed, `value:${entry.id}`));
  const v = valueRng.gauss();
  const evNoise = valueRng.gauss();
  const cheap = VALUE_Q * ql + VALUE_V * v;
  const mult = Math.exp(-VALUE_SLOPE * cheap);
  const peRef = (p.peLow + p.peHigh) / 2;
  const pe = clamp(peRef * mult, 0.6 * p.peLow, 1.6 * p.peHigh);
  // Profitable companies trade on earnings with P/E inside the sector bounds; loss-makers trade on sales.
  // A sales floor for small earners would push their P/E far outside the bounds (P/E in the thousands)
  // and make low quality look expensive, which hides the price of quality.
  const capTarget = netIncome > 0 ? pe * netIncome : LOSS_SALES_FACTOR * p.psLow * mult * revenue;
  /** The multiple actually applied, relative to the sector reference. */
  const multEff = netIncome > 0 ? pe / peRef : mult;

  // Shares so the start price lands in Ð12–Ð520.
  const pricePick = Math.exp(Math.log(PRICE_TARGET_MIN) + Math.log(PRICE_TARGET_MAX / PRICE_TARGET_MIN) * size.next());
  const sharesOutstanding = clamp(Math.round(capTarget / pricePick / 1e4) * 1e4, SHARES_MIN, SHARES_MAX);
  const startPriceCents = clamp(Math.round(capTarget / sharesOutstanding), START_PRICE_MIN, START_PRICE_MAX);
  const marketCap = startPriceCents * sharesOutstanding;

  // History, built backwards from the latest fiscal year.
  const growth = p.revGrowthLow - 0.05 + (p.revGrowthHigh - p.revGrowthLow + 0.1) * normCdf(x.g);
  const marginDrift = 0.01 * x.md;
  const epsNoise = 0.04 + 0.12 * normCdf(-x.evol);
  const issuance = -0.02 + 0.1 * normCdf(-x.iss);
  const revenues: number[] = new Array(PERIODS.length).fill(0);
  const incomes: number[] = new Array(PERIODS.length).fill(0);
  const last = PERIODS.length - 1;
  revenues[last] = revenue;
  incomes[last] = netIncome;
  for (let k = last - 1; k >= 0; k--) {
    revenues[k] = cents(revenues[k + 1]! / (1 + growth + 0.02 * hist.gauss()));
    const margin = netMarginTarget - marginDrift * (last - k);
    incomes[k] = cents(revenues[k]! * (margin + epsNoise * Math.max(Math.abs(margin), 0.3 * nmMid) * hist.gauss()));
  }
  const history: FinancialPeriod[] = PERIODS.map((period, k) => {
    const shares = sharesOutstanding / (1 + issuance) ** (last - k);
    return { period, revenue: revenues[k]!, netIncome: incomes[k]!, eps: epsCents(incomes[k]!, shares) };
  });

  // Multiples and per-share figures, all from the final market cap.
  const fwdGrowth = clamp(growth + 0.02 + 0.03 * size.gauss(), -0.05, 0.35);
  const peRatio = netIncome > 0 ? round2(marketCap / netIncome) : 0;
  const forwardPe = netIncome > 0 ? round2(marketCap / netIncome / (1 + fwdGrowth)) : 0;
  // D&A is set so EV/EBITDA carries the same sector-relative multiple as P/E
  // (EV/EBITDA ≈ EVref·(P/E ÷ PEref)·noise), bounded so EBITDA stays within gross profit.
  // Where earnings are already too large for that multiple even at the minimum D&A (a high
  // P/E-to-EV/EBITDA sector such as Cartography & Navigation), part of pre-tax income is
  // non-operating (interest on cash, investment gains): operating income is lowered, never
  // below net income, instead of letting the whole sector look cheap on EV/EBITDA.
  const enterpriseValue = marketCap + totalDebt - cash;
  const daFloor = 0.01 * revenue;
  const ebitdaTarget =
    operatingIncomeBase > 0 && enterpriseValue > 0
      ? enterpriseValue / (p.evEbitda * multEff * Math.exp(0.12 * evNoise))
      : operatingIncomeBase + depreciationShare * revenue;
  const operatingIncome =
    netIncome > 0 && ebitdaTarget - daFloor < operatingIncomeBase
      ? Math.max(netIncome, cents(ebitdaTarget - daFloor))
      : operatingIncomeBase;
  const daCap = Math.max(daFloor, grossProfit - operatingIncome - daFloor);
  const depreciation = cents(clamp(ebitdaTarget - operatingIncome, daFloor, daCap));
  const ebitda = operatingIncome + depreciation;
  const evToEbitda = ebitda > 0 && enterpriseValue > 0 ? round2(enterpriseValue / ebitda) : 0;
  // Payout anchored to the sector dividend yield (median yield ≈ research divYield), weakly tied
  // to quality, capped at 90% of earnings and an 8% yield.
  const payoutRatio =
    netIncome > 0
      ? round2(Math.min(PAYOUT_MAX, 2 * normCdf(x.pay) * p.divYield * peRef, (MAX_DIVIDEND_YIELD * marketCap) / netIncome))
      : 0;
  const dividendYield = round4((payoutRatio * netIncome) / marketCap);

  // Beta is public: leverage plus sector cyclicality.
  const beta = round2(clamp(0.85 + 0.25 * normCdf(-x.de) + CYCLICALITY[entry.sector], 0.7, 1.4));

  // A pre-game 52-week range around the start price.
  const sigma = Math.sqrt(beta ** 2 * MODEL.mktVol ** 2 + MODEL.idioVolBase ** 2);
  const week52High = Math.max(startPriceCents + 1, cents(startPriceCents * Math.exp(0.02 + 0.6 * sigma * Math.abs(size.gauss()))));
  const week52Low = Math.max(1, Math.min(startPriceCents - 1, cents(startPriceCents * Math.exp(-0.02 - 0.6 * sigma * Math.abs(size.gauss())))));
  const float = cents(sharesOutstanding * (0.55 + 0.4 * size.next()));

  // Industry growth: the sector band shifted by the growth latent.
  const indMid = (p.revGrowthLow + p.revGrowthHigh) / 2;
  const indHalf = Math.max((p.revGrowthHigh - p.revGrowthLow) / 2, 0.02);
  const industryGrowthRate = round3(indMid + 0.5 * indHalf * x.ind);
  const tam = cents(revenue * (8 + 32 * size.next()));

  return {
    entry,
    ql,
    beta,
    startPriceCents,
    fundamentals: {
      marketCap,
      sharesOutstanding,
      float,
      week52High,
      week52Low,
      peRatio,
      forwardPe,
      psRatio: round2(marketCap / revenue),
      pbRatio: round2(marketCap / equity),
      evToEbitda,
      dividendYield,
      payoutRatio,
      revenue,
      costOfRevenue,
      grossProfit,
      operatingIncome,
      netIncome,
      eps: history[last]!.eps,
      ebitda,
      grossMargin: round4(grossProfit / revenue),
      operatingMargin: round4(operatingIncome / revenue),
      netMargin: round4(netIncome / revenue),
      cash,
      totalAssets,
      totalDebt,
      totalLiabilities,
      equity,
      currentRatio,
      debtToEquity,
      operatingCashFlow,
      capex,
      freeCashFlow,
      roe: round4(netIncome / equity),
      roa: round4(netIncome / totalAssets),
      history,
      beta,
      industryGrowthRate,
      tam,
    },
  };
}

function qualityInput(d: Draft): QualityInput {
  const f = d.fundamentals;
  return {
    id: d.entry.id,
    sector: d.entry.sector,
    grossProfit: f.grossProfit,
    totalAssets: f.totalAssets,
    roe: f.roe,
    operatingCashFlow: f.operatingCashFlow,
    netIncome: f.netIncome,
    debtToEquity: f.debtToEquity,
    currentRatio: f.currentRatio,
    operatingIncome: f.operatingIncome,
    marketCap: f.marketCap,
    totalLiabilities: f.totalLiabilities,
    revenue: f.revenue,
    peRatio: f.peRatio,
    evToEbitda: f.evToEbitda,
    psRatio: f.psRatio,
    industryGrowthRate: f.industryGrowthRate,
    history: f.history.map((h) => ({ revenue: h.revenue, netIncome: h.netIncome, eps: h.eps })),
  };
}

function pickName(rng: Prng, used: Set<string>): string {
  for (;;) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

/** Management is flavor only: nothing here depends on latent or measured quality. */
function management(rng: Prng, used: Set<string>): ManagementMember[] {
  const count = rng.int(2, 4);
  const out: ManagementMember[] = [];
  for (let i = 0; i < count; i++) {
    const r = ROLES[i]!;
    out.push({
      name: pickName(rng, used),
      role: r.role,
      bio: rng.pick(r.bios),
      tenureYears: rng.int(1, 18),
    });
  }
  return out;
}

/**
 * Competitive position from public, score-free facts only: a net loss reads as a turnaround,
 * the largest fifth of the market by revenue as the flagship, everyone else at random. It
 * must never be derived from the hidden quality result (crews may not see it before the end).
 */
function positionFor(rng: Prng, netIncome: number, revenueRank0: number, n: number): string {
  if (netIncome <= 0) return rng.pick(POSITIONS_TURNAROUND);
  if (revenueRank0 < n / 5) return POSITIONS_STRONG[0];
  return rng.pick([...POSITIONS_OTHER, POSITIONS_STRONG[1]]);
}

function riskFactors(rng: Prng, debtToEquity: number, currentRatio: number): string[] {
  const out: string[] = [];
  if (debtToEquity > HEAVY_DEBT_DE) out.push('Heavy debt load');
  if (currentRatio < THIN_CASH_CURRENT_RATIO) out.push('Thin cash cushion');
  return [...out, ...rng.shuffle(RISKS).slice(0, 3)];
}

function industryNotes(sector: Sector, growthRate: number, rng: Prng): string {
  const trend =
    Math.abs(growthRate) < 0.0005
      ? `The ${sector} trade is flat this year.`
      : `The ${sector} trade is ${growthRate > 0 ? 'growing' : 'shrinking'} about ${pct1(growthRate)}% a year.`;
  const rivalry = rng.pick(['Rivalry is strong', 'Rivalry is moderate', 'A few large fleets set prices']);
  const switching = rng.pick(['switching costs are low.', 'switching costs are moderate.', 'switching costs are high.']);
  return `${trend} ${rivalry}, and ${switching}`;
}

/** Deterministic market for `seed`. Company order = ROSTER order. */
export function generateMarket(seed: string): GeneratedMarket {
  const n = ROSTER.length;

  // 1. Latent quality with guaranteed spread (Latin-hypercube stratification).
  const qr = new Prng(deriveSeed(seed, 'q'));
  const perm = qr.shuffle(ROSTER.map((_, i) => i));
  const latent = ROSTER.map((_, i) => invNormCdf((perm[i]! + qr.next()) / n));

  // 2–5. Consistent fundamentals and valuation per company.
  const drafts = ROSTER.map((entry, i) => draftCompany(seed, entry, latent[i]!));

  // 6. Measured quality from the generated statements.
  const qualities = computeQualityScores(drafts.map(qualityInput), sectorRefs());

  // 7. Analyst view: a noisy, optimistic hint of the measured score, rated by quintile.
  const analystZ = drafts.map((d, i) => ANALYST_S * qualities[i]!.score + ANALYST_N * new Prng(deriveSeed(seed, `analyst:${d.entry.id}`)).gauss());
  const byZ = analystZ.map((z, i) => ({ z, i })).sort((a, b) => b.z - a.z || a.i - b.i);
  const ratingIndex = new Array<number>(n).fill(0);
  byZ.forEach(({ i }, rank) => {
    ratingIndex[i] = Math.min(4, Math.floor((5 * rank) / n));
  });
  const ratings = research.analystRatings;

  // 8. Text and final documents.
  const usedNames = new Set<string>();
  const revenueRank0 = new Array<number>(n).fill(0);
  drafts
    .map((d, i) => ({ revenue: d.fundamentals.revenue, i }))
    .sort((a, b) => b.revenue - a.revenue || a.i - b.i)
    .forEach(({ i }, rank) => {
      revenueRank0[i] = rank;
    });
  const companies = drafts.map((d, i): GeneratedCompany => {
    const { entry, startPriceCents } = d;
    const quality = qualities[i]!;
    const { industryGrowthRate, tam, ...base } = d.fundamentals;
    const text = new Prng(deriveSeed(seed, `text:${entry.id}`));
    const position = positionFor(text, base.netIncome, revenueRank0[i]!, n);
    const ships = Math.max(3, Math.round(base.revenue / 8e9)); // about one ship per Ð80M of revenue
    const posts = text.int(2, 9);

    const fundamentals: Fundamentals = {
      ...base,
      businessOverview: `${entry.name} is ${position} in the ${entry.sector} trade. It sails ${ships} ships and runs ${posts} trading posts.`,
      management: management(text, usedNames),
      industry: {
        sector: entry.sector,
        tam,
        growthRate: industryGrowthRate,
        competitivePosition: position.charAt(0).toUpperCase() + position.slice(1),
        notes: industryNotes(entry.sector, industryGrowthRate, text),
      },
      marketingStrategy: text.pick(MARKETING)(entry.name),
      riskFactors: riskFactors(text, base.debtToEquity, base.currentRatio),
      recentDevelopments: text.shuffle(DEVELOPMENTS).slice(0, 3),
      analyst: {
        rating: ratings[ratingIndex[i]!] ?? 'Hold',
        priceTarget: Math.max(1, Math.round(startPriceCents * (1 + ANALYST_OPTIMISM + ANALYST_SLOPE * analystZ[i]!))),
      },
    };

    const company: Company = {
      id: entry.id,
      name: entry.name,
      ticker: entry.ticker,
      sector: entry.sector,
      description: `${entry.name} — ${entry.sector}.`,
      currentPrice: startPriceCents,
      startPrice: startPriceCents,
      sessionOpen: startPriceCents,
      sessionHigh: startPriceCents,
      sessionLow: startPriceCents,
      sessionVolume: 0,
      voyageHigh: startPriceCents,
      voyageLow: startPriceCents,
      sessionChange: 0,
      voyageChange: 0,
      sharesOutstanding: base.sharesOutstanding,
      marketCap: base.marketCap,
      beta: d.beta,
      adv: Math.round(base.sharesOutstanding / MODEL.advDivisor),
      lastTick: 0,
    };

    return { company, fundamentals, quality, idioVol: idioVolFor(seed, entry.id, quality.q), startPriceCents };
  });

  return { seed, companies };
}
