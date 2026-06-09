/**
 * Hidden news schedule. Generated deterministically at game creation and stored
 * server-only (in `_schedule`). Events fire at hidden ticks; their magnitude is
 * correlated with a company's archetype (good-fundamentals companies get more &
 * larger positive surprises on average) — reinforcing "research is rewarded"
 * while any individual event is still a surprise.
 */

import type { Archetype, NewsImpact } from '@deca/shared';
import { TOTAL_TICKS } from '@deca/shared';
import { Prng, deriveSeed } from '../lib/prng';
import { ARCHETYPE_PROFILES } from '../engine/archetypes';

export interface ScheduledNews {
  tick: number;
  companyIds: string[];
  impact: NewsImpact;
  magnitude: number; // signed fractional price jump
  headline: string;
  body: string;
}

export interface NewsCompany {
  id: string;
  name: string;
  sector: string;
  archetype: Archetype;
}

/** Magnitude range per impact type (absolute, before sign + archetype scaling). */
const RANGES: Record<NewsImpact, [number, number]> = {
  merger: [0.08, 0.22],
  discovery: [0.06, 0.2],
  earnings: [0.03, 0.15],
  management: [0.03, 0.12],
  regulatory: [0.04, 0.16],
  scandal: [0.06, 0.2],
  storm: [0.05, 0.18],
  macro: [0.02, 0.08],
};

/** Inherent sign of an impact type (0 => can go either way). */
const INHERENT: Record<NewsImpact, number> = {
  merger: 1,
  discovery: 1,
  earnings: 0,
  management: 0,
  regulatory: -1,
  scandal: -1,
  storm: -1,
  macro: 0,
};

const HEADLINES: Record<NewsImpact, { pos: string[]; neg: string[] }> = {
  merger: {
    pos: ['{n} to be acquired at a hefty buccaneer premium', '{n} strikes a lucrative merger with a rival fleet'],
    neg: ['{n} overpays in a questionable merger, crew grumbles'],
  },
  discovery: {
    pos: ['{n} uncovers a fabled treasure trove', '{n} charts a profitable new trade route'],
    neg: ['{n} treasure map proves a forgery'],
  },
  earnings: {
    pos: ['{n} reports plunder well above the manifest', '{n} posts blowout quarterly doubloons'],
    neg: ['{n} misses its haul, coffers run light', '{n} earnings sink below the waterline'],
  },
  management: {
    pos: ['{n} names a celebrated captain to the helm', '{n} lands a respected quartermaster'],
    neg: ['{n} captain walks the plank amid turmoil', '{n} loses its navigator to a rival'],
  },
  regulatory: {
    pos: ['{n} cleared by the Crown’s inspectors', '{n} wins a coveted royal charter'],
    neg: ['{n} fined by the Crown for smuggling', '{n} hit with a blockade and new tariffs'],
  },
  scandal: {
    pos: ['{n} clears its name in the mutiny inquiry'],
    neg: ['{n} rocked by a mutiny scandal', '{n} accused of cooking the ledgers'],
  },
  storm: {
    pos: ['{n} fleet rides out the gale unharmed'],
    neg: ['{n} loses ships to a monstrous storm', '{n} fleet scattered by a kraken sighting'],
  },
  macro: {
    pos: ['Fair winds: trade booms across the Spanish Main', 'Crown lifts tariffs — markets surge'],
    neg: ['Storm season batters shipping lanes', 'Crown raises tariffs — markets wobble'],
  },
};

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function signedMagnitude(rng: Prng, impact: NewsImpact, archetype: Archetype): number {
  const bias = ARCHETYPE_PROFILES[archetype].fundamentalBias;
  const pPos = Math.max(0.1, Math.min(0.9, 0.5 + 0.35 * bias));
  const inherent = INHERENT[impact];
  const sign = inherent !== 0 ? inherent : rng.bool(pPos) ? 1 : -1;
  const [lo, hi] = RANGES[impact];
  let mag = rng.range(lo, hi) * sign;
  if ((sign > 0 && bias > 0) || (sign < 0 && bias < 0)) mag *= rng.range(1.0, 1.3);
  return round3(mag);
}

function pickHeadline(rng: Prng, impact: NewsImpact, name: string, positive: boolean): string {
  const pool = HEADLINES[impact];
  const list = positive ? pool.pos : pool.neg;
  const fallback = positive ? pool.neg : pool.pos;
  const chosen = (list.length ? list : fallback)[rng.int(0, (list.length ? list : fallback).length - 1)] as string;
  return chosen.replace('{n}', name);
}

const COMPANY_IMPACTS: NewsImpact[] = ['merger', 'discovery', 'earnings', 'management', 'regulatory', 'scandal', 'storm'];

export function generateNewsSchedule(
  seed: number | string,
  companies: NewsCompany[],
  ticks: number = TOTAL_TICKS,
): ScheduledNews[] {
  const rng = new Prng(deriveSeed(seed, 'news'));
  const events: ScheduledNews[] = [];

  // Per-company events spread across the game (avoid the first/last few ticks).
  for (const co of companies) {
    const count = rng.int(2, 5);
    for (let i = 0; i < count; i++) {
      const tick = rng.int(Math.floor(ticks * 0.03), Math.floor(ticks * 0.97));
      const impact = COMPANY_IMPACTS[rng.int(0, COMPANY_IMPACTS.length - 1)] as NewsImpact;
      const magnitude = signedMagnitude(rng, impact, co.archetype);
      events.push({
        tick,
        companyIds: [co.id],
        impact,
        magnitude,
        headline: pickHeadline(rng, impact, co.name, magnitude >= 0),
        body: `${co.name} (${co.sector}): ${impact} event moves the stock ${magnitude >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(magnitude * 100))}%.`,
      });
    }
  }

  // A handful of market-wide macro events touching a random slice of companies.
  const macroCount = rng.int(3, 6);
  for (let i = 0; i < macroCount; i++) {
    const tick = rng.int(Math.floor(ticks * 0.05), Math.floor(ticks * 0.95));
    const positive = rng.bool(0.5);
    const mag = round3(rng.range(...RANGES.macro) * (positive ? 1 : -1));
    const affected = rng.shuffle(companies).slice(0, rng.int(4, Math.max(4, Math.floor(companies.length * 0.6))));
    events.push({
      tick,
      companyIds: affected.map((c) => c.id),
      impact: 'macro',
      magnitude: mag,
      headline: pickHeadline(rng, 'macro', '', positive),
      body: `A market-wide event nudges ${affected.length} companies ${positive ? 'up' : 'down'}.`,
    });
  }

  return events.sort((a, b) => a.tick - b.tick);
}
