/**
 * Pure news / jump schedule (spec §5.4). Generated once at game start from the
 * seed and the clock, stored server-side, and never sent to clients before it fires.
 *
 * Company events (label `jumps:${id}`): n ~ Poisson(K) (Knuth); each event draws
 * exactly six uniforms in order (tick, sign, size, type pick, variant pick, port
 * pick), so headline wording can change without moving any jump. The log jump is
 * model.companyLogJump (the drift compensates for its exact expectation); the type
 * follows the size relative to d.jumpMean: < 0.8× earnings, < 1.4× management or
 * regulatory, else merger/discovery (good) or scandal/storm (bad).
 * Body: "{name} ({ticker}) — {sentence}."
 * Macro events (label `macro`): 1–2 per game, J = ±U(0.02, 0.08), applied to
 * every company as ln(1 + beta·J).
 */

import { MODEL, type GameClock, type NewsType } from '@deca/shared';
import { Prng, deriveSeed } from '../lib/prng';
import { MIN_JUMP_MULTIPLE, companyLogJump, upProbability, type Derived } from './model';

export interface NewsCompany {
  id: string;
  name: string;
  ticker: string;
  sector: string;
  qEff: number;
  beta: number;
}

export interface ScheduledEvent {
  tick: number;
  companyIds: string[];
  jumps: Record<string, number>;
  type: NewsType;
  sentiment: 'bullish' | 'bearish';
  source: 'scheduled' | 'macro' | 'host';
  headline: string;
  body: string;
}

type Sentiment = ScheduledEvent['sentiment'];
/** [headline, one sentence for the body]. `{name}` and `{port}` are filled in. */
type Template = readonly [string, string];

const PORTS = ['Nassau', 'Port Royal', 'Cartagena', 'Cape Verde', 'the Windward Passage', 'the Leeward Isles'] as const;

/**
 * News type by size RELATIVE to the typical jump d.jumpMean, so the mix is the same for every
 * game length (S ~ Exp(jumpMean), and maxJump > 1.4·jumpMean for every K): small (earnings)
 * 1 − e^−0.8 ≈ 55%, medium e^−0.8 − e^−1.4 ≈ 20%, large e^−1.4 ≈ 25%, so each of the four
 * large types (merger, discovery, scandal, storm) is about 6% of company news.
 */
const MEDIUM_JUMP_RATIO = 0.8;
const LARGE_JUMP_RATIO = 1.4;

const TEMPLATES: Record<Exclude<NewsType, 'macro'>, Record<Sentiment, readonly Template[]>> = {
  earnings: {
    bullish: [
      ['{name} beats forecasts as quarterly revenue climbs', 'profit came in above what analysts expected this quarter'],
      ['{name} reports record quarterly profit', 'the latest report showed more profit than forecast'],
      ['{name} tops profit estimates on strong cargo demand', 'strong demand lifted quarterly results above estimates'],
    ],
    bearish: [
      ['{name} misses forecasts as quarterly revenue slips', 'profit came in below what analysts expected this quarter'],
      ['{name} reports a weaker quarter than expected', 'the latest report showed less profit than forecast'],
      ['{name} falls short of profit estimates', 'higher costs pushed quarterly results below estimates'],
    ],
  },
  management: {
    bullish: [
      ['{name} names a seasoned captain as chief executive', 'the new leader has a record of running a tight ship'],
      ['{name} unveils a clearer plan to cut costs', 'the board backed a plan to trim waste and grow steadily'],
    ],
    bearish: [
      ['{name} chief executive resigns without warning', 'the sudden exit leaves the company without a clear leader'],
      ['{name} board splits over a costly expansion plan', 'leaders disagree on strategy after an expensive misstep'],
    ],
  },
  regulatory: {
    bullish: [
      ['Harbor officials approve new trade routes for {name}', 'the approval opens new routes and lowers shipping costs'],
      ['{name} wins a favorable ruling from port authorities', 'officials eased a rule that had limited its business'],
    ],
    bearish: [
      ['Port authorities fine {name} over customs filings', 'the fine adds costs and brings closer checks on its trade'],
      ['{name} hit by stricter harbor rules', 'new rules limit where its ships may dock and add costs'],
    ],
  },
  merger: {
    bullish: [
      ['{name} agrees to acquire a rival fleet at a premium', 'the deal adds ships, crews and customers'],
      ['{name} announces a merger with a trading partner', 'combining the two businesses should bring savings'],
    ],
    bearish: [
      ['{name} merger talks collapse', 'a planned deal fell apart after months of talks'],
      ['{name} deal now looks too costly, investors say', 'the price of a planned purchase has climbed well past early estimates'],
    ],
  },
  discovery: {
    bullish: [
      ['{name} charts a faster trade route to {port}', 'the new route could cut voyage times and add business'],
      ['{name} finds a rich silver deposit near {port}', 'the find could add to income for years'],
    ],
    bearish: [
      ['{name} silver find near {port} proves smaller than hoped', 'surveyors cut their estimate of the deposit'],
      ['{name} route to {port} turns out slower than planned', 'voyages on the route take longer than the company promised'],
    ],
  },
  scandal: {
    bullish: [
      ['Inquiry clears {name} of wrongdoing', 'officials found no fault, removing a worry about fines'],
      ['{name} settles an old dispute on easy terms', 'the settlement ends a long legal fight'],
    ],
    bearish: [
      ['{name} accused of hiding losses from shareholders', 'an inquiry has begun into the company accounts'],
      ['{name} officers caught smuggling cargo', 'the scandal could bring fines and lost customers'],
      ['{name} faces inquiry over forged shipping papers', 'officials say records were changed to dodge port fees'],
    ],
  },
  storm: {
    bullish: [
      ['{name} fleet rides out a storm with little damage', 'its ships came through bad weather better than feared'],
      ['{name} ships return safely from hurricane season near {port}', 'less business was lost to storms than expected'],
    ],
    bearish: [
      ['{name} loses ships to a storm off {port}', 'repairs and lost cargo will weigh on results for a while'],
      ['Hurricane damages {name} warehouses near {port}', 'buildings and stored goods were hit by the storm'],
    ],
  },
};

const MACRO_TEMPLATES: Record<Sentiment, readonly Template[]> = {
  bullish: [
    ['Trade winds favor merchants as shipping lanes reopen', 'Calmer seas and open lanes lift business across the market.'],
    ['Crown lowers harbor taxes across the colonies', 'Lower taxes help most companies at once.'],
  ],
  bearish: [
    ['Naval blockade slows trade across the islands', 'The blockade hurts business for nearly every company.'],
    ['Crown raises harbor taxes across the colonies', 'Higher taxes weigh on most companies at once.'],
  ],
};

function pickIndex(u: number, n: number): number {
  return Math.min(n - 1, Math.floor(u * n));
}

/** Fills `{name}` and `{port}` in one pass with literal text (no `$&`-style patterns, no re-scan of inserted names). */
function fill(text: string, name: string, port: string): string {
  return text.replace(/\{(name|port)\}/g, (_m, key: string) => (key === 'name' ? name : port));
}

function logJump(multipleMinusOne: number): number {
  return Math.log(Math.max(MIN_JUMP_MULTIPLE, 1 + multipleMinusOne));
}

function companyEventType(size: number, jumpMean: number, up: boolean, uType: number): NewsType {
  if (size < MEDIUM_JUMP_RATIO * jumpMean) return 'earnings';
  const first = uType < 0.5;
  if (size < LARGE_JUMP_RATIO * jumpMean) return up ? (first ? 'management' : 'regulatory') : first ? 'regulatory' : 'management';
  return up ? (first ? 'merger' : 'discovery') : first ? 'scandal' : 'storm';
}

function companyEvents(seed: string, clock: GameClock, c: NewsCompany, d: Derived): ScheduledEvent[] {
  const r = new Prng(deriveSeed(seed, `jumps:${c.id}`));
  // Knuth Poisson(K)
  let n = 0;
  const L = Math.exp(-d.K);
  let p = r.next();
  while (p > L) {
    n++;
    p *= r.next();
  }
  const out: ScheduledEvent[] = [];
  const pUp = upProbability(c.qEff);
  for (let k = 0; k < n; k++) {
    const tick = 1 + Math.floor(r.next() * clock.totalTicks);
    const up = r.next() < pUp;
    const size = Math.min(MODEL.maxJump, -d.jumpMean * Math.log(1 - r.next()));
    const uType = r.next();
    const uVariant = r.next();
    const uPort = r.next();
    const jump = companyLogJump(up, size);
    const type = companyEventType(size, d.jumpMean, up, uType);
    const sentiment: Sentiment = up ? 'bullish' : 'bearish';
    const variants = TEMPLATES[type as Exclude<NewsType, 'macro'>][sentiment];
    const [headline, sentence] = variants[pickIndex(uVariant, variants.length)]!;
    const port = PORTS[pickIndex(uPort, PORTS.length)]!;
    out.push({
      tick,
      companyIds: [c.id],
      jumps: { [c.id]: jump },
      type,
      sentiment,
      source: 'scheduled',
      headline: fill(headline, c.name, port),
      body: `${c.name} (${c.ticker}) — ${fill(sentence, c.name, port)}.`,
    });
  }
  return out;
}

function macroEvents(seed: string, clock: GameClock, companies: NewsCompany[]): ScheduledEvent[] {
  const r = new Prng(deriveSeed(seed, 'macro'));
  const byId = [...companies].sort((a, b) => compareIds(a.id, b.id));
  const N = clock.totalTicks;
  const lo = Math.max(1, Math.ceil(0.05 * N));
  const hi = Math.max(lo, Math.floor(0.95 * N));
  const count = r.int(MODEL.macroJumpsMin, MODEL.macroJumpsMax);
  const out: ScheduledEvent[] = [];
  for (let k = 0; k < count; k++) {
    const tick = r.int(lo, hi);
    const up = r.next() < 0.5;
    const size = r.range(MODEL.macroJumpMin, MODEL.macroJumpMax);
    const uVariant = r.next();
    const J = up ? size : -size;
    const sentiment: Sentiment = up ? 'bullish' : 'bearish';
    const variants = MACRO_TEMPLATES[sentiment];
    const [headline, body] = variants[pickIndex(uVariant, variants.length)]!;
    const jumps: Record<string, number> = {};
    for (const c of byId) jumps[c.id] = logJump(c.beta * J);
    out.push({ tick, companyIds: byId.map((c) => c.id), jumps, type: 'macro', sentiment, source: 'macro', headline, body });
  }
  return out;
}

/** Locale-independent string order (never localeCompare). */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const SOURCE_RANK: Record<ScheduledEvent['source'], number> = { scheduled: 0, macro: 1, host: 2 };

/**
 * Full hidden schedule for a game, sorted by tick, then source (company news before
 * macro), then first company id. The sort is stable, so two events of one company on
 * one tick keep their draw order. The result does not depend on the order of `companies`.
 */
export function buildSchedule(seed: string, clock: GameClock, companies: NewsCompany[], d: Derived): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  for (const c of companies) events.push(...companyEvents(seed, clock, c, d));
  events.push(...macroEvents(seed, clock, companies));
  return events.sort(
    (a, b) =>
      a.tick - b.tick ||
      SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
      compareIds(a.companyIds[0] ?? '', b.companyIds[0] ?? ''),
  );
}

/**
 * Host-authored news: magnitude m becomes a log jump ln(1+m) on each chosen known company
 * (unknown and repeated ids are dropped). A non-finite magnitude throws: a NaN jump would
 * poison fair value and the persisted engine state for the rest of the game.
 */
export function hostEvent(
  tick: number,
  companies: NewsCompany[],
  input: { companyIds: string[]; type: NewsType; magnitude: number; headline: string; body: string },
): ScheduledEvent {
  if (!Number.isFinite(input.magnitude)) throw new RangeError(`hostEvent: magnitude must be finite, got ${input.magnitude}`);
  const known = new Set(companies.map((c) => c.id));
  const companyIds = [...new Set(input.companyIds)].filter((id) => known.has(id));
  const jump = logJump(input.magnitude);
  const jumps: Record<string, number> = {};
  for (const id of companyIds) jumps[id] = jump;
  return {
    tick,
    companyIds,
    jumps,
    type: input.type,
    sentiment: input.magnitude >= 0 ? 'bullish' : 'bearish',
    source: 'host',
    headline: input.headline,
    body: input.body,
  };
}

/** Groups events by the tick they fire on. */
export function jumpsAtTick(events: ScheduledEvent[]): Map<number, ScheduledEvent[]> {
  const byTick = new Map<number, ScheduledEvent[]>();
  for (const e of events) {
    const list = byTick.get(e.tick);
    if (list) list.push(e);
    else byTick.set(e.tick, [e]);
  }
  return byTick;
}
