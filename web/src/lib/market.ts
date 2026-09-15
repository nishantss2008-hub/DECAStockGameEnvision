/**
 * Pure market helpers for Markets, News and Portfolio screens: movers lists,
 * cap-weighted sector summaries and "since the news" price moves.
 */

import { SECTORS, type Company, type NewsEvent, type Sector } from '@deca/shared';

export type MoverKind = 'gainers' | 'losers' | 'active';

const num = (x: number) => (Number.isFinite(x) ? x : 0);

/**
 * Top `n` companies (default 6): gainers by session change descending, losers ascending,
 * active by session volume descending. Ties break by ticker then id so lists never jitter.
 * Never mutates the input.
 */
export function movers(companies: Company[], kind: MoverKind, n = 6): Company[] {
  const key = kind === 'active' ? (c: Company) => num(c.sessionVolume) : (c: Company) => num(c.sessionChange);
  const dir = kind === 'losers' ? 1 : -1;
  return [...companies]
    .sort((a, b) => {
      const d = key(a) - key(b);
      if (d !== 0) return dir * d;
      return (a.ticker ?? '').localeCompare(b.ticker ?? '') || a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, n));
}

export interface SectorSummary {
  sector: Sector;
  /** Market-cap-weighted session change (signed fraction). */
  sessionChange: number;
  /** Market-cap-weighted change since the game began (signed fraction). */
  voyageChange: number;
  /** Sum of member market caps, integer cents. */
  marketCap: number;
}

/**
 * One summary per sector present, in `SECTORS` order (callers sort by change when they need to).
 * Changes are weighted by market cap; a sector whose caps sum to zero falls back to a plain mean.
 */
export function sectorSummaries(companies: Company[]): SectorSummary[] {
  const groups = new Map<string, Company[]>();
  for (const c of companies) {
    const list = groups.get(c.sector);
    if (list) list.push(c);
    else groups.set(c.sector, [c]);
  }
  const order = (s: string) => {
    const i = (SECTORS as readonly string[]).indexOf(s);
    return i === -1 ? SECTORS.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([sector, members]) => {
      const cap = members.reduce((s, c) => s + Math.max(0, num(c.marketCap)), 0);
      const weighted = (pick: (c: Company) => number) =>
        cap > 0
          ? members.reduce((s, c) => s + Math.max(0, num(c.marketCap)) * num(pick(c)), 0) / cap
          : members.reduce((s, c) => s + num(pick(c)), 0) / members.length;
      return {
        sector: sector as Sector,
        sessionChange: weighted((c) => c.sessionChange),
        voyageChange: weighted((c) => c.voyageChange),
        marketCap: cap,
      };
    });
}

/**
 * Price move of each company named in a dispatch since it fired: currentPrice ÷ priceAtFire − 1.
 * Companies without a positive price at fire time, or missing from `byId`, are skipped.
 */
export function sinceReport(event: NewsEvent, byId: Record<string, Company>): { companyId: string; pct: number }[] {
  const out: { companyId: string; pct: number }[] = [];
  for (const companyId of event.companyIds ?? []) {
    const then = event.priceAtFire?.[companyId];
    const company = byId[companyId];
    if (!company || !(typeof then === 'number' && then > 0) || !Number.isFinite(company.currentPrice)) continue;
    out.push({ companyId, pct: company.currentPrice / then - 1 });
  }
  return out;
}
