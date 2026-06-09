/**
 * Deterministic, research-grounded fundamentals generator.
 *
 * Produces an internally-consistent, real-format financial profile for a company
 * (marketCap = price × shares; netIncome = revenue × margin; EPS = netIncome /
 * shares; P/E = price / EPS; etc.) whose QUALITY is biased by the hidden archetype
 * — so diligent research (strong margins, growing industry, healthy balance sheet,
 * credible management) is a real edge, without ever revealing the price path.
 *
 * Sector ranges come from `research.json` (web-research grounded). All money is in
 * integer cents of Ð.
 */

import type { Archetype, Company, Fundamentals, ManagementMember, Sector } from '@deca/shared';
import { Prng, deriveSeed } from '../lib/prng';
import { ARCHETYPE_PROFILES } from '../engine/archetypes';
import type { RosterEntry } from './roster';
import researchRaw from './research.json';

interface SectorProfile {
  sector: string;
  peLow: number; peHigh: number;
  psLow: number; psHigh: number;
  netMarginLow: number; netMarginHigh: number;
  revGrowthLow: number; revGrowthHigh: number;
  divYield: number; evEbitda: number;
  pbLow?: number; pbHigh?: number;
}
interface MetricRange { min: number; max: number; typical: number }
interface ResearchConfig {
  reportSections: string[];
  analystRatings: string[];
  metricRanges: Record<string, MetricRange>;
  sectorProfiles: SectorProfile[];
}
const research = researchRaw as ResearchConfig;

export interface GeneratedCompany {
  company: Company;
  fundamentals: Fundamentals;
  archetype: Archetype;
  startPriceCents: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Pick within [lo,hi], nudged toward hi when bias>0 (quality companies skew high). */
function lerpBias(rng: Prng, lo: number, hi: number, bias: number, strength = 0.4): number {
  const v = lo + (hi - lo) * rng.next() + bias * (hi - lo) * strength;
  return clamp(v, lo, hi);
}

function range(name: string): MetricRange {
  return research.metricRanges[name] ?? { min: 0, max: 1, typical: 0.1 };
}

const FIRST_NAMES = ['Eleanor', 'Bartholomew', 'Grace', 'Henry', 'Mary', 'Edward', 'Anne', 'Samuel', 'Charlotte', 'Roberts', 'Israel', 'Jacquotte', 'Ching', 'William', 'Rachel'];
const LAST_NAMES = ['Vane', 'Rackham', 'Teach', 'Bonny', 'Read', 'Flint', 'Hornigold', 'Lowther', 'Shih', 'Kidd', 'Morgan', 'Drake', 'Avery', 'Roberts', 'Bellamy'];
const ROLES = [
  { role: 'Captain (CEO)', verb: 'commands' },
  { role: 'Quartermaster (CFO)', verb: 'keeps the books for' },
  { role: 'Bosun (COO)', verb: 'runs operations at' },
  { role: 'Navigator (CSO)', verb: 'charts strategy for' },
];
const POSITIONS = ['the dominant flagship of its waters', 'a nimble challenger gaining share', 'a steady incumbent with a loyal crew', 'a turnaround story under new colors', 'a niche specialist with a defensible cove'];
const RISKS = [
  'Exposure to storm seasons and route disruption',
  'Crown regulation and shifting tariffs',
  'Rising cost of timber, canvas, and powder',
  'Dependence on a handful of lucrative routes',
  'Crew retention and captain succession risk',
  'Competition from better-armed rivals',
  'Currency swings in doubloons and pieces of eight',
];
const DEVELOPMENTS = [
  'Commissioned two new galleons to expand capacity',
  'Signed a multi-season supply pact with Tortuga ports',
  'Opened a new trading post on the Spanish Main',
  'Refit its flagship with copper plating for speed',
  'Settled a long-running dispute with the harbor guild',
];

function ratingFromUpside(upside: number, ratings: string[]): string {
  const [sb, b, h, s, ss] = ratings as [string, string, string, string, string];
  if (upside > 0.2) return sb;
  if (upside > 0.07) return b;
  if (upside > -0.07) return h;
  if (upside > -0.2) return s;
  return ss;
}

function profileFor(sector: Sector): SectorProfile {
  return (
    research.sectorProfiles.find((p) => p.sector === sector) ?? {
      sector,
      peLow: 10, peHigh: 25, psLow: 1, psHigh: 4,
      netMarginLow: 0.05, netMarginHigh: 0.18, revGrowthLow: 0, revGrowthHigh: 0.1,
      divYield: 0.015, evEbitda: 12,
    }
  );
}

function management(rng: Prng): ManagementMember[] {
  const count = rng.int(2, 4);
  const used = new Set<string>();
  const out: ManagementMember[] = [];
  for (let i = 0; i < count; i++) {
    let name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    while (used.has(name)) name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    used.add(name);
    const r = ROLES[Math.min(i, ROLES.length - 1)] as (typeof ROLES)[number];
    const tenure = rng.int(1, 18);
    out.push({
      name,
      role: r.role,
      bio: `${name} ${r.verb} the company and has sailed these waters for ${tenure} years.`,
      tenureYears: tenure,
    });
  }
  return out;
}

export function generateCompanyData(
  seed: number | string,
  entry: RosterEntry,
  archetype: Archetype,
): GeneratedCompany {
  const rng = new Prng(deriveSeed(seed, `fund:${entry.id}`));
  const profile = profileFor(entry.sector);
  const bias = ARCHETYPE_PROFILES[archetype].fundamentalBias;

  // Size & price.
  const startPriceCents = Math.round(rng.range(12, 520) * 100);
  const sharesOutstanding = Math.round(rng.range(8e6, 750e6) / 1e5) * 1e5;
  const marketCap = startPriceCents * sharesOutstanding;

  // Income statement.
  const ps = rng.range(profile.psLow, profile.psHigh);
  const revenue = Math.round(marketCap / ps);
  const netMargin = lerpBias(rng, profile.netMarginLow, profile.netMarginHigh, bias);
  const netIncome = Math.round(revenue * netMargin);
  const grossMargin = clamp(netMargin + rng.range(0.12, 0.4), netMargin + 0.05, 0.9);
  const operatingMargin = clamp(netMargin + rng.range(0.02, 0.12), netMargin, grossMargin);
  const ebitdaMargin = clamp(operatingMargin + rng.range(0.02, 0.08), operatingMargin, grossMargin);
  const costOfRevenue = Math.round(revenue * (1 - grossMargin));
  const grossProfit = revenue - costOfRevenue;
  const operatingIncome = Math.round(revenue * operatingMargin);
  const ebitda = Math.round(revenue * ebitdaMargin);
  const eps = sharesOutstanding > 0 ? Math.max(1, Math.round(netIncome / sharesOutstanding)) : 1;

  // Balance sheet.
  const roe = lerpBias(rng, range('roe').min, range('roe').max, bias);
  const equity = netIncome > 0 ? Math.round(netIncome / roe) : Math.round(marketCap * rng.range(0.3, 0.8));
  const debtToEquity = clamp(lerpBias(rng, range('debtToEquity').min, range('debtToEquity').max, -bias), 0.1, 2.5);
  const totalDebt = Math.round(equity * debtToEquity);
  const cash = Math.round(revenue * rng.range(0.05, 0.3));
  const totalLiabilities = Math.round(totalDebt + revenue * rng.range(0.2, 0.6));
  const totalAssets = equity + totalLiabilities;
  const currentRatio = round2(lerpBias(rng, range('currentRatio').min, range('currentRatio').max, bias));

  // Cash flow & returns.
  const operatingCashFlow = Math.round(netIncome * rng.range(1.0, 1.5));
  const capex = Math.round(revenue * rng.range(0.03, 0.12));
  const freeCashFlow = operatingCashFlow - capex;
  const roa = totalAssets > 0 ? round3(netIncome / totalAssets) : 0;

  // Valuation multiples.
  const peRatio = netIncome > 0 ? round2(marketCap / netIncome) : 0;
  const forwardPe = round2(peRatio * rng.range(0.82, 0.98));
  const psRatio = round2(ps);
  const pbRatio = equity > 0 ? round2(marketCap / equity) : 0;
  const evToEbitda = ebitda > 0 ? round2((marketCap + totalDebt - cash) / ebitda) : profile.evEbitda;
  const cutDividend = bias < -0.3 && rng.bool(0.5);
  const dividendYield = cutDividend ? 0 : round3(profile.divYield * rng.range(0.6, 1.4));
  const payoutRatio = dividendYield > 0 ? round2(rng.range(0.2, 0.6)) : 0;

  // Ranges & analyst view.
  const week52Low = Math.round(startPriceCents * rng.range(0.6, 0.9));
  const week52High = Math.round(startPriceCents * rng.range(1.1, 1.6));
  const float = Math.round(sharesOutstanding * rng.range(0.55, 0.95));
  const upside = round3(bias * 0.18 + rng.range(-0.12, 0.12));
  const priceTarget = Math.round(startPriceCents * (1 + upside));
  const rating = ratingFromUpside(upside, research.analystRatings);

  // Industry.
  const growthRate = round3(lerpBias(rng, profile.revGrowthLow, profile.revGrowthHigh, bias));
  const tam = Math.round(revenue * rng.range(8, 40));

  // 4 years of history trending with the archetype.
  const trend = 1 + (bias * 0.12 + rng.range(-0.04, 0.06));
  const periods = ['FY2022', 'FY2023', 'FY2024', 'FY2025'];
  const history = periods.map((period, i) => {
    const k = periods.length - 1 - i; // years before "now"
    const factor = Math.pow(trend, -k);
    const rev = Math.round(revenue * factor);
    const ni = Math.round(netIncome * factor);
    return { period, revenue: rev, netIncome: ni, eps: sharesOutstanding > 0 ? Math.round(ni / sharesOutstanding) : 0 };
  });

  const fundamentals: Fundamentals = {
    marketCap, sharesOutstanding, float, week52High, week52Low,
    peRatio, forwardPe, psRatio, pbRatio, evToEbitda, dividendYield, payoutRatio,
    revenue, costOfRevenue, grossProfit, operatingIncome, netIncome, eps, ebitda,
    grossMargin: round3(grossMargin), operatingMargin: round3(operatingMargin), netMargin: round3(netMargin),
    cash, totalAssets, totalDebt, totalLiabilities, equity, currentRatio, debtToEquity: round2(debtToEquity),
    operatingCashFlow, capex, freeCashFlow, roe: round3(roe), roa,
    businessOverview: `${entry.name} is ${rng.pick(POSITIONS)} in ${entry.sector.toLowerCase()}, operating across the high seas with a fleet of ships and a seasoned crew.`,
    management: management(rng),
    industry: {
      sector: entry.sector,
      tam,
      growthRate,
      competitivePosition: rng.pick(POSITIONS),
      notes: `The ${entry.sector} trade is ${growthRate >= 0 ? 'expanding' : 'contracting'} at roughly ${Math.round(growthRate * 100)}% a year; rivalry is fierce and switching costs are moderate.`,
    },
    marketingStrategy: `${entry.name} courts merchants and privateers alike through reputation, exclusive port access, and a fearsome flag that commands premium freight rates.`,
    riskFactors: rng.shuffle(RISKS).slice(0, 4),
    recentDevelopments: rng.shuffle(DEVELOPMENTS).slice(0, 3),
    analyst: { rating, priceTarget },
    history,
  };

  const company: Company = {
    id: entry.id,
    name: entry.name,
    ticker: entry.ticker,
    sector: entry.sector,
    emoji: entry.emoji,
    description: `${entry.emoji} ${entry.name} — ${entry.sector}.`,
    currentPrice: startPriceCents,
    prevClose: startPriceCents,
    dayChange: 0,
    sharesOutstanding,
    marketCap,
  };

  return { company, fundamentals, archetype, startPriceCents };
}
