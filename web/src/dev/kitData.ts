/**
 * Sample data for the dev-only component gallery (kit.html). Numbers are BRIEF §7 exactly; series
 * shapes between the BRIEF anchors are illustrative and deterministic (no randomness), so every
 * screenshot of the gallery is identical.
 */
import type { RangeTab, Sector } from '@deca/shared';
import type { AllocationItem } from '../components/charts/allocation';
import type { Point } from '../components/charts/scale';
import type { ScatterPoint } from '../components/charts/ScatterChart';
import type { PodiumEntry } from '../components/ios/Podium';

/** Tick of the "as of" price and its wall-clock time (BRIEF §7). */
export const AS_OF_TICK = 1284;
export const AS_OF_TIME = '14:02:30';
export const TICK_SECONDS = 30;
/** Session 2 starts at tick 720 (5,760 ticks ÷ 8 sessions). */
export const SESSION_START_TICK = 720;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Clock time of a tick, counted back from 14:02:30 at tick 1,284. */
export function tickTime(tick: number): string {
  const asOf = 14 * 3600 + 2 * 60 + 30;
  const s = (((asOf - (AS_OF_TICK - tick) * TICK_SECONDS) % 86400) + 86400) % 86400;
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/**
 * A series of `length` integer values through the given anchors (index → value), with a small
 * deterministic wiggle that fades out at every anchor, clamped to the anchors' min and max so the
 * BRIEF range stays exact.
 */
export function pathThrough(anchors: ReadonlyArray<readonly [number, number]>, length: number, wiggle: number, seed = 1): number[] {
  // Wiggle frequencies scale with the series length, so long series stay as smooth as short ones.
  const f = Math.min(1, 565 / Math.max(1, length));
  const sorted = [...anchors].sort((a, b) => a[0] - b[0]);
  const values = sorted.map((a) => a[1]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    let k = 0;
    while (k < sorted.length - 2 && sorted[k + 1]![0] <= i) k++;
    const [i0, v0] = sorted[k]!;
    const [i1, v1] = sorted[k + 1] ?? sorted[k]!;
    const t = i1 === i0 ? 0 : Math.min(1, Math.max(0, (i - i0) / (i1 - i0)));
    const base = v0 + (v1 - v0) * t;
    const fade = Math.sin(Math.PI * t);
    const noise = Math.sin(i * 0.37 * f + seed) * 0.6 + Math.sin(i * 1.13 * f + seed * 2.1) * 0.4;
    out.push(Math.round(Math.min(hi, Math.max(lo, base + wiggle * fade * noise))));
  }
  for (const [i, v] of sorted) if (i >= 0 && i < length) out[i] = v;
  return out;
}

const toPoints = (values: readonly number[], firstTick: number): Point[] => values.map((y, i) => ({ x: firstTick + i, y }));

/** KRKN this session: open Ð82.22, range Ð81.90–Ð84.60, last Ð84.12 (BRIEF §7). */
export const KRKN_SESSION: Point[] = toPoints(
  pathThrough(
    [
      [0, 8222],
      [90, 8190],
      [260, 8310],
      [430, 8460],
      [510, 8352],
      [564, 8412],
    ],
    AS_OF_TICK - SESSION_START_TICK + 1,
    16,
    3,
  ),
  SESSION_START_TICK,
);

/** Account value since the game began: Ð1,000,000.00 → Ð1,084,219.55 (+8.42%). */
export const ACCOUNT_VALUE: Point[] = toPoints(
  pathThrough(
    [
      [0, 100_000_000],
      [210, 99_210_000],
      [520, 102_460_000],
      [790, 101_580_000],
      [1100, 106_930_000],
      [1284, 108_421_955],
    ],
    AS_OF_TICK + 1,
    60_000,
    5,
  ),
  0,
);

/** Pirate Composite rebased to starting cash: 1,000.00 → 1,048.62 (+4.86%). */
export const COMPOSITE_REBASED: Point[] = toPoints(
  pathThrough(
    [
      [0, 100_000_000],
      [380, 101_520_000],
      [900, 103_240_000],
      [1284, 104_862_000],
    ],
    AS_OF_TICK + 1,
    40_000,
    9,
  ),
  0,
);

/** Chart range tabs for a 48-hour game with 30-second ticks (rangeTabs() in @deca/shared). */
export const RANGE_TABS: RangeTab[] = [
  { key: '1h', label: '1H', ticks: 120 },
  { key: '6h', label: '6H', ticks: 720 },
  { key: '24h', label: '24H', ticks: 2880 },
  { key: 'all', label: 'All', ticks: null },
];

export interface SampleHolding {
  ticker: string;
  name: string;
  sector: Sector;
  shares: number;
  /** Cents. */
  avgCost: number;
  /** Cents. */
  last: number;
  /** Cents per share this session. */
  sessionChangePerShare: number;
  /** Fraction. */
  sessionChange: number;
  /** Cents. */
  value: number;
  /** Cents. */
  sessionGain: number;
  /** Cents. */
  totalGain: number;
  /** Fraction. */
  totalGainPct: number;
}

/** BRIEF §7 positions for Saltwind Traders. */
export const HOLDINGS: SampleHolding[] = [
  { ticker: 'KRKN', name: 'Kraken Shipping Lines', sector: 'Shipping & Salvage', shares: 3000, avgCost: 7350, last: 8412, sessionChangePerShare: 190, sessionChange: 0.0231, value: 25_236_000, sessionGain: 570_000, totalGain: 3_186_000, totalGainPct: 0.1445 },
  { ticker: 'PRYL', name: 'Port Royal Banking', sector: 'Treasure Banking', shares: 800, avgCost: 18400, last: 21240, sessionChangePerShare: 185, sessionChange: 0.0088, value: 16_992_000, sessionGain: 148_000, totalGain: 2_272_000, totalGainPct: 0.1543 },
  { ticker: 'ASTR', name: 'Astrolabe Analytics', sector: 'Maps & Instruments', shares: 1000, avgCost: 13700, last: 14655, sessionChangePerShare: 60, sessionChange: 0.0041, value: 14_655_000, sessionGain: 60_000, totalGain: 955_000, totalGainPct: 0.0697 },
  { ticker: 'MRED', name: 'Mary Read Munitions', sector: 'Naval Arms', shares: 2000, avgCost: 5800, last: 6430, sessionChangePerShare: 126, sessionChange: 0.02, value: 12_860_000, sessionGain: 252_000, totalGain: 1_260_000, totalGainPct: 0.1086 },
  { ticker: 'CJST', name: 'Calico Jack Spice Traders', sector: 'Provisions & Spice', shares: 1500, avgCost: 3900, last: 4118, sessionChangePerShare: -22, sessionChange: -0.0053, value: 6_177_000, sessionGain: -33_000, totalGain: 327_000, totalGainPct: 0.0559 },
  { ticker: 'SALT', name: 'Saltbeard Shipping', sector: 'Shipping & Salvage', shares: 2500, avgCost: 1780, last: 1824, sessionChangePerShare: -14, sessionChange: -0.0076, value: 4_560_000, sessionGain: -35_000, totalGain: 110_000, totalGainPct: 0.0247 },
  { ticker: 'CRSD', name: 'Cursed Doubloon Relics', sector: 'Cursed Relics', shares: 1000, avgCost: 3800, last: 3107, sessionChangePerShare: -111, sessionChange: -0.0346, value: 3_107_000, sessionGain: -111_000, totalGain: -693_000, totalGainPct: -0.1824 },
];

/** Session sparkline for a holding: session open → last, 60 points. */
export function sessionSpark(h: Pick<SampleHolding, 'last' | 'sessionChangePerShare'>, seed: number): number[] {
  const open = h.last - h.sessionChangePerShare;
  // A flat session still moves a little (about 0.3% of the price) before closing where it opened.
  const swing = Math.max(Math.round(h.last * 0.003), Math.abs(h.sessionChangePerShare));
  const flat = h.sessionChangePerShare === 0;
  return pathThrough(
    [
      [0, open],
      [22, open + Math.round(swing * (h.sessionChangePerShare >= 0 ? -0.2 : 0.35))],
      [44, flat ? open + Math.round(swing * 0.3) : open + Math.round(h.sessionChangePerShare * 0.7)],
      [59, h.last],
    ],
    60,
    swing * 0.12,
    seed,
  );
}

export const ACCOUNT = {
  crew: 'Saltwind Traders',
  initials: 'SW',
  rank: 3,
  crews: 14,
  /** Cents. */
  value: 108_421_955,
  cash: 24_834_955,
  invested: 83_587_000,
  sessionGain: 851_000,
  sessionPct: 0.0079,
  totalGain: 8_421_955,
  totalPct: 0.0842,
  startingCash: 100_000_000,
};

export interface SampleQuote {
  ticker: string;
  name: string;
  sector: Sector;
  /** Cents. */
  price: number;
  change: number;
}

/** BRIEF §7 other quotes. */
export const QUOTES: SampleQuote[] = [
  { ticker: 'CNBR', name: 'Cannonbright Foundries', sector: 'Naval Arms', price: 10266, change: 0.0612 },
  { ticker: 'LVTH', name: 'Leviathan Logistics', sector: 'Shipping & Salvage', price: 5703, change: 0.0448 },
  { ticker: 'GLGD', name: 'Galleon Goods Co.', sector: 'Provisions & Spice', price: 5890, change: -0.0073 },
  { ticker: 'TRTG', name: 'Tortuga Harbor Inns', sector: 'Tortuga Hospitality', price: 2755, change: -0.021 },
  { ticker: 'PRRT', name: 'Parrot & Plume Livestock', sector: 'Parrot & Livestock', price: 2230, change: 0.0305 },
  { ticker: 'LMAQ', name: 'Letters of Marque Assurance', sector: 'Letters of Marque (Insurance)', price: 13180, change: 0.0054 },
  { ticker: 'ABON', name: 'Anne Bonny Cartography', sector: 'Cartography & Navigation', price: 44619, change: 0.0012 },
  { ticker: 'SPYG', name: 'Spyglass Instruments', sector: 'Maps & Instruments', price: 6340, change: 0.0095 },
  { ticker: 'KIDD', name: 'Kidd Treasure Trust', sector: 'Treasure Banking', price: 18890, change: -0.0021 },
];

export interface SampleStanding {
  rank: number;
  crew: string;
  initials: string;
  /** Cents. */
  value: number;
  totalReturn: number;
  session: number;
  /** Places moved since last session (positive = up). */
  move: number;
  you?: boolean;
}

/** BRIEF §7 standings (14 crews; first 7 shown). Rank moves are illustrative. */
export const STANDINGS: SampleStanding[] = [
  { rank: 1, crew: "Queen Anne's Revenue", initials: 'QA', value: 112_080_410, totalReturn: 0.1208, session: 0.0094, move: 0 },
  { rank: 2, crew: 'Tortuga Capital', initials: 'TC', value: 109_770_000, totalReturn: 0.0977, session: 0.014, move: 1 },
  { rank: 3, crew: 'Saltwind Traders', initials: 'SW', value: 108_421_955, totalReturn: 0.0842, session: 0.0079, move: 1, you: true },
  { rank: 4, crew: 'The Salty Ledger', initials: 'SL', value: 105_100_233, totalReturn: 0.051, session: -0.002, move: -2 },
  { rank: 5, crew: 'Doubloon Dynasty', initials: 'DD', value: 98_660_000, totalReturn: -0.0134, session: -0.0085, move: 0 },
];

/** MOBILE §7.13 page 1 podium. */
export const PODIUM: PodiumEntry[] = [
  { id: 'qa', rank: 1, name: "Queen Anne's Revenue", initials: 'QA', valueText: 'Ð1,187,420.66', valueSpoken: '1,187,420.66 doubloons', change: 0.1874 },
  { id: 'tc', rank: 2, name: 'Tortuga Capital', initials: 'TC', valueText: 'Ð1,142,905.30', valueSpoken: '1,142,905.30 doubloons', change: 0.1429 },
  { id: 'sw', rank: 3, name: 'Saltwind Traders', initials: 'SW', valueText: 'Ð1,104,630.18', valueSpoken: '1,104,630.18 doubloons', change: 0.1046 },
];

/** Holdings then cash for the allocation bar (cents). */
export const ALLOCATION: AllocationItem[] = [
  ...HOLDINGS.map((h) => ({ id: h.ticker, label: h.ticker, value: h.value, sector: h.sector, kind: 'holding' as const })),
  { id: 'cash', label: 'Cash', value: ACCOUNT.cash, kind: 'cash' as const },
];

/** Market reveal scatter: health score (0–100) vs. actual return. Illustrative except the MOBILE §7.13 scores. */
export const SCATTER: ScatterPoint[] = [
  { id: 'krkn', label: 'KRKN', x: 84, y: 0.196, highlight: true },
  { id: 'pryl', label: 'PRYL', x: 74, y: 0.141, highlight: true },
  { id: 'astr', label: 'ASTR', x: 69, y: 0.083, highlight: true },
  { id: 'mred', label: 'MRED', x: 58, y: 0.112, highlight: true },
  { id: 'cjst', label: 'CJST', x: 47, y: 0.021, highlight: true },
  { id: 'salt', label: 'SALT', x: 52, y: 0.034, highlight: true },
  { id: 'crsd', label: 'CRSD', x: 81, y: -0.214, highlight: true },
  { id: 'lvth', label: 'LVTH', x: 44, y: 0.262 },
  { id: 'cnbr', label: 'CNBR', x: 77, y: 0.171 },
  { id: 'glgd', label: 'GLGD', x: 39, y: -0.062 },
  { id: 'bbrd', label: 'BBRD', x: 66, y: 0.058 },
  { id: 'djon', label: 'DJON', x: 55, y: 0.044 },
  { id: 'fdut', label: 'FDUT', x: 33, y: -0.118 },
  { id: 'abon', label: 'ABON', x: 71, y: 0.102 },
  { id: 'trtg', label: 'TRTG', x: 28, y: -0.151 },
  { id: 'lmaq', label: 'LMAQ', x: 62, y: 0.067 },
  { id: 'jlly', label: 'JLLY', x: 49, y: 0.012 },
  { id: 'kidd', label: 'KIDD', x: 58, y: -0.009 },
  { id: 'spyg', label: 'SPYG', x: 64, y: 0.091 },
  { id: 'cmps', label: 'CMPS', x: 41, y: -0.034 },
  { id: 'prrt', label: 'PRRT', x: 36, y: 0.052 },
  { id: 'sirn', label: 'SIRN', x: 31, y: -0.087 },
  { id: 'mlsm', label: 'MLSM', x: 46, y: -0.121 },
  { id: 'mrgn', label: 'MRGN', x: 79, y: 0.128 },
  { id: 'brth', label: 'BRTH', x: 53, y: 0.026 },
];
