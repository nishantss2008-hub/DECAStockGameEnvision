/**
 * Sample data for the dev-only component gallery (kit.html). Numbers are BRIEF §7 exactly — the
 * 2026-09-16 rebuild: a 30-minute voyage on 5-second ticks, a Ð250,000 chest and the 15-company
 * roster. Series shapes between the BRIEF anchors are illustrative and deterministic (no
 * randomness), so every screenshot of the gallery is identical.
 */
import type { RangeTab, Sector } from '@deca/shared';
import type { AllocationItem } from '../components/charts/allocation';
import type { Point } from '../components/charts/scale';
import type { ScatterPoint } from '../components/charts/ScatterChart';
import type { PodiumEntry } from '../components/ios/Podium';

/** Tick of the "as of" price and its wall-clock time (BRIEF §7: tick 86 of 360, session 2 of 8). */
export const AS_OF_TICK = 86;
export const AS_OF_TIME = '14:02:30';
/** `deriveClock` puts every host game length (10–30 minutes) on the 5-second tick floor. */
export const TICK_SECONDS = 5;
/** Session 2 starts at tick 45 (360 ticks ÷ 8 sessions). */
export const SESSION_START_TICK = 45;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Clock time of a tick, counted back from 14:02:30 at tick 86. */
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

/** KRKN this session: open Ð82.22, range Ð81.90–Ð84.60, last Ð84.12 (BRIEF §7). 42 ticks so far. */
export const KRKN_SESSION: Point[] = toPoints(
  pathThrough(
    [
      [0, 8222],
      [7, 8190],
      [19, 8310],
      [31, 8460],
      [37, 8352],
      [41, 8412],
    ],
    AS_OF_TICK - SESSION_START_TICK + 1,
    16,
    3,
  ),
  SESSION_START_TICK,
);

/** Account value since the game began: Ð250,000.00 → Ð271,049.55 (+8.42%). */
export const ACCOUNT_VALUE: Point[] = toPoints(
  pathThrough(
    [
      [0, 25_000_000],
      [14, 24_802_500],
      [35, 25_615_000],
      [53, 25_395_000],
      [74, 26_732_500],
      [86, 27_104_955],
    ],
    AS_OF_TICK + 1,
    15_000,
    5,
  ),
  0,
);

/** Pirate Composite rebased to starting cash: 1,000.00 → 1,048.62 (+4.86%). */
export const COMPOSITE_REBASED: Point[] = toPoints(
  pathThrough(
    [
      [0, 25_000_000],
      [25, 25_380_000],
      [60, 25_810_000],
      [86, 26_215_500],
    ],
    AS_OF_TICK + 1,
    10_000,
    9,
  ),
  0,
);

/** Chart range tabs for a 30-minute game on 5-second ticks (rangeTabs() in @deca/shared). */
export const RANGE_TABS: RangeTab[] = [
  { key: '1m', label: '1M', ticks: 12 },
  { key: '5m', label: '5M', ticks: 60 },
  { key: '15m', label: '15M', ticks: 180 },
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

/**
 * BRIEF §7 positions for Saltwind Traders, biggest first. Every row is that crew's own arithmetic:
 * value = shares × last, sessionGain = shares × sessionChangePerShare, totalGain = shares ×
 * (last − avgCost). The seven sum to Ð214,603.00 invested, +Ð1,919.80 this session and +Ð18,601.20
 * unrealized. FDUT is the only position under water.
 */
export const HOLDINGS: SampleHolding[] = [
  { ticker: 'KRKN', name: 'Kraken Shipping Lines', sector: 'Shipping & Salvage', shares: 750, avgCost: 7350, last: 8412, sessionChangePerShare: 190, sessionChange: 0.0231, value: 6_309_000, sessionGain: 142_500, totalGain: 796_500, totalGainPct: 0.1445 },
  { ticker: 'PRYL', name: 'Port Royal Banking', sector: 'Treasure Banking', shares: 200, avgCost: 18400, last: 21240, sessionChangePerShare: 185, sessionChange: 0.0088, value: 4_248_000, sessionGain: 37_000, totalGain: 568_000, totalGainPct: 0.1543 },
  { ticker: 'CMPS', name: 'Compass Rose Navigation', sector: 'Cartography & Navigation', shares: 300, avgCost: 10475, last: 11205, sessionChangePerShare: -74, sessionChange: -0.0066, value: 3_361_500, sessionGain: -22_200, totalGain: 219_000, totalGainPct: 0.0697 },
  { ticker: 'MRED', name: 'Mary Read Munitions', sector: 'Naval Arms', shares: 500, avgCost: 5800, last: 6430, sessionChangePerShare: 126, sessionChange: 0.02, value: 3_215_000, sessionGain: 63_000, totalGain: 315_000, totalGainPct: 0.1086 },
  { ticker: 'BBRD', name: 'Blackbeard Incorporated', sector: 'Naval Arms', shares: 60, avgCost: 31073, last: 31840, sessionChangePerShare: -112, sessionChange: -0.0035, value: 1_910_400, sessionGain: -6_720, totalGain: 46_020, totalGainPct: 0.0247 },
  { ticker: 'CJST', name: 'Calico Jack Spice Traders', sector: 'Provisions & Spice', shares: 400, avgCost: 3900, last: 4118, sessionChangePerShare: -22, sessionChange: -0.0053, value: 1_647_200, sessionGain: -8_800, totalGain: 87_200, totalGainPct: 0.0559 },
  { ticker: 'FDUT', name: 'Flying Dutchman Freight', sector: 'Shipping & Salvage', shares: 80, avgCost: 11760, last: 9615, sessionChangePerShare: -160, sessionChange: -0.0164, value: 769_200, sessionGain: -12_800, totalGain: -171_600, totalGainPct: -0.1824 },
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
  value: 27_104_955,
  cash: 5_644_655,
  invested: 21_460_300,
  sessionGain: 191_980,
  sessionPct: 0.0071,
  totalGain: 2_104_955,
  totalPct: 0.0842,
  startingCash: 25_000_000,
};

export interface SampleQuote {
  ticker: string;
  name: string;
  sector: Sector;
  /** Cents. */
  price: number;
  change: number;
}

/** BRIEF §7 other quotes: the rest of the roster, so HOLDINGS + QUOTES is every company exactly once. */
export const QUOTES: SampleQuote[] = [
  { ticker: 'CNBR', name: 'Cannonbright Foundries', sector: 'Naval Arms', price: 10266, change: 0.0612 },
  { ticker: 'LVTH', name: 'Leviathan Logistics', sector: 'Shipping & Salvage', price: 5703, change: 0.0449 },
  { ticker: 'GLGD', name: 'Galleon Goods Co.', sector: 'Provisions & Spice', price: 5890, change: -0.0072 },
  { ticker: 'BRTH', name: 'Bartholomew Provisions', sector: 'Provisions & Spice', price: 4960, change: 0.003 },
  { ticker: 'MRGN', name: 'Henry Morgan Capital', sector: 'Treasure Banking', price: 26735, change: 0.0077 },
  { ticker: 'ABON', name: 'Anne Bonny Cartography', sector: 'Cartography & Navigation', price: 44619, change: 0.0012 },
  { ticker: 'SPYG', name: 'Spyglass Instruments', sector: 'Cartography & Navigation', price: 6340, change: 0.0096 },
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

/** BRIEF §7 standings (14 crews; first 5 shown), every return against the Ð250,000 chest. Rank moves are illustrative. */
export const STANDINGS: SampleStanding[] = [
  { rank: 1, crew: "Queen Anne's Revenue", initials: 'QA', value: 28_020_410, totalReturn: 0.1208, session: 0.0094, move: 0 },
  { rank: 2, crew: 'Tortuga Capital', initials: 'TC', value: 27_442_500, totalReturn: 0.0977, session: 0.014, move: 1 },
  { rank: 3, crew: 'Saltwind Traders', initials: 'SW', value: 27_104_955, totalReturn: 0.0842, session: 0.0071, move: 1, you: true },
  { rank: 4, crew: 'The Salty Ledger', initials: 'SL', value: 26_275_233, totalReturn: 0.051, session: -0.002, move: -2 },
  { rank: 5, crew: 'Doubloon Dynasty', initials: 'DD', value: 24_665_000, totalReturn: -0.0134, session: -0.0085, move: 0 },
];

/** MOBILE §7.13 page 1 podium (final values, Ð250,000 start). */
export const PODIUM: PodiumEntry[] = [
  { id: 'qa', rank: 1, name: "Queen Anne's Revenue", initials: 'QA', valueText: 'Ð296,855.17', valueSpoken: '296,855.17 doubloons', change: 0.1874 },
  { id: 'tc', rank: 2, name: 'Tortuga Capital', initials: 'TC', valueText: 'Ð285,726.33', valueSpoken: '285,726.33 doubloons', change: 0.1429 },
  { id: 'sw', rank: 3, name: 'Saltwind Traders', initials: 'SW', valueText: 'Ð276,157.55', valueSpoken: '276,157.55 doubloons', change: 0.1046 },
];

/** Holdings then cash for the allocation bar (cents). */
export const ALLOCATION: AllocationItem[] = [
  ...HOLDINGS.map((h) => ({ id: h.ticker, label: h.ticker, value: h.value, sector: h.sector, kind: 'holding' as const })),
  { id: 'cash', label: 'Cash', value: ACCOUNT.cash, kind: 'cash' as const },
];

/**
 * Market reveal scatter: health score (0–100) vs. actual return, one dot per company on the roster.
 * The crew's positions (HOLDINGS) are the highlighted dots. Illustrative except the MOBILE §7.13 scores.
 */
export const SCATTER: ScatterPoint[] = [
  { id: 'krkn', label: 'KRKN', x: 84, y: 0.196, highlight: true },
  { id: 'pryl', label: 'PRYL', x: 74, y: 0.141, highlight: true },
  { id: 'cmps', label: 'CMPS', x: 69, y: 0.083, highlight: true },
  { id: 'mred', label: 'MRED', x: 58, y: 0.112, highlight: true },
  { id: 'cjst', label: 'CJST', x: 47, y: 0.021, highlight: true },
  { id: 'fdut', label: 'FDUT', x: 52, y: 0.034, highlight: true },
  { id: 'bbrd', label: 'BBRD', x: 81, y: -0.214, highlight: true },
  { id: 'lvth', label: 'LVTH', x: 44, y: 0.262 },
  { id: 'cnbr', label: 'CNBR', x: 77, y: 0.171 },
  { id: 'glgd', label: 'GLGD', x: 39, y: -0.062 },
  { id: 'abon', label: 'ABON', x: 71, y: 0.102 },
  { id: 'kidd', label: 'KIDD', x: 58, y: -0.009 },
  { id: 'spyg', label: 'SPYG', x: 64, y: 0.091 },
  { id: 'mrgn', label: 'MRGN', x: 79, y: 0.128 },
  { id: 'brth', label: 'BRTH', x: 53, y: 0.026 },
];
