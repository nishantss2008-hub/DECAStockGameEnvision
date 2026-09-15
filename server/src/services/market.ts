/**
 * Market lifecycle: clear dynamic data and create a fresh seeded market.
 *
 * Shared by the `npm run seed` / `npm run reset` CLIs and POST /admin/game/new.
 * The seed is written only to the server-only `_schedule/_meta` doc; never return
 * it to a client.
 */

import type { GameSettings, HistoryChunk, MarketSummary, ValueChunk } from '@deca/shared';
import { db } from '../firebase';
import { hashPassword } from '../lib/password';
import { randomToken } from '../lib/secret';
import { ROSTER } from '../seed/roster';
import { generateMarket } from '../seed/generateMarket';
import {
  INDEX_BASE,
  commitInBatches,
  indexQuote,
  lobbyState,
  marketBreadth,
  normalizeSettings,
  type BatchOp,
  type Snapshot,
} from '../engine/loopHelpers';

export interface CreateMarketOptions {
  seed?: string;
  keepCrews: boolean;
  adminPassword?: string;
  settings?: Partial<GameSettings>;
}

export interface CreateMarketResult {
  seed: string;
  companies: number;
  adminPasswordSet: boolean;
  generatedAdminPassword?: string;
}

/** Top-level collections that belong to one market (deleted with all subcollections). */
const MARKET_COLLECTIONS = ['trades', 'orders', 'news', 'leaderboard', 'market', '_engine', '_teamStats', '_schedule'] as const;

/**
 * Recursively deletes every market-scoped collection. Crews:
 *   - keepCrews=true: each team loses its holdings and history and restarts with `startingCapital`.
 *   - keepCrews=false: every team and every `_auth` doc except `_admin` is deleted.
 * `game/state`, `_auth/_admin` and `logs` are kept.
 */
export async function clearDynamicData(opts: { keepCrews: boolean; startingCapital: number }): Promise<void> {
  for (const name of MARKET_COLLECTIONS) await db.recursiveDelete(db.collection(name));

  // Company subcollections first (also catches history under a company doc that no longer exists).
  const companySnap = await db.collection('companies').get();
  const companyIds = new Set([...ROSTER.map((r) => r.id), ...companySnap.docs.map((d) => d.id)]);
  for (const id of companyIds) {
    await db.recursiveDelete(db.collection(`companies/${id}/history`));
    await db.recursiveDelete(db.collection(`companies/${id}/fundamentals`));
  }
  await db.recursiveDelete(db.collection('companies'));

  const teamsSnap = await db.collection('teams').get();
  if (opts.keepCrews) {
    const capital = opts.startingCapital;
    for (const team of teamsSnap.docs) {
      await db.recursiveDelete(team.ref.collection('holdings'));
      await db.recursiveDelete(team.ref.collection('history'));
    }
    await commitInBatches(
      db,
      teamsSnap.docs.map((team) => (b) =>
        b.update(team.ref, {
          cashBalance: capital,
          totalValue: capital,
          rank: 0,
          realizedPnl: 0,
          feesPaid: 0,
          tradeCount: 0,
          sessionOpenValue: capital,
          holdingsCount: 0,
          sessionStartRank: 0,
        }),
      ),
    );
  } else {
    await db.recursiveDelete(db.collection('teams'));
    const authSnap = await db.collection('_auth').get();
    await commitInBatches(
      db,
      authSnap.docs.filter((d) => d.id !== '_admin').map((d) => (b) => b.delete(d.ref)),
    );
  }
}

function definedOnly<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Creates a fresh market in the lobby:
 *   1. settings = existing `game/state` settings (defaults if none) merged with `opts.settings`
 *   2. clearDynamicData
 *   3. generateMarket(seed or a random token)
 *   4. companies, fundamentals, history/0 and `_schedule/{id}` per company
 *   5. `_schedule/_meta`, `market/summary` (+ history/0) and a lobby `game/state`
 *   6. `_auth/_admin` only when a password is given or no admin exists yet
 */
export async function createMarket(opts: CreateMarketOptions): Promise<CreateMarketResult> {
  const existing = (await db.doc('game/state').get()).data() as Partial<GameSettings> | undefined;
  const settings = normalizeSettings({ ...normalizeSettings(existing), ...definedOnly(opts.settings) });

  await clearDynamicData({ keepCrews: opts.keepCrews, startingCapital: settings.startingCapital });

  const seed = opts.seed || randomToken();
  const market = generateMarket(seed);
  const now = Date.now();
  const ops: BatchOp[] = [];
  const snaps: Snapshot[] = [];
  const sectors = new Set<string>();

  for (const g of market.companies) {
    const { company, fundamentals, quality } = g;
    const id = company.id;
    const history: HistoryChunk = { chunk: 0, startTick: 0, prices: [g.startPriceCents], volumes: [0] };
    ops.push((b) => b.set(db.doc(`companies/${id}`), company));
    ops.push((b) => b.set(db.doc(`companies/${id}/fundamentals/data`), fundamentals));
    ops.push((b) => b.set(db.doc(`companies/${id}/history/0`), history));
    ops.push((b) =>
      b.set(db.doc(`_schedule/${id}`), {
        q: quality.q,
        quality: quality.score,
        grade: quality.grade,
        pillars: quality.pillars,
        idioVol: g.idioVol,
        beta: company.beta,
        sharesOutstanding: company.sharesOutstanding,
        adv: company.adv,
        startPriceCents: g.startPriceCents,
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
      }),
    );
    snaps.push({ ...company });
    sectors.add(company.sector);
  }

  const summary: MarketSummary = {
    lastTick: 0,
    updatedAt: now,
    composite: indexQuote(INDEX_BASE, INDEX_BASE),
    sectors: Object.fromEntries([...sectors].map((s) => [s, indexQuote(INDEX_BASE, INDEX_BASE)])),
    breadth: marketBreadth(snaps),
  };
  const summaryHistory: ValueChunk = { chunk: 0, startTick: 0, values: [INDEX_BASE] };
  ops.push((b) => b.set(db.doc('_schedule/_meta'), { seed, createdAt: now }));
  ops.push((b) => b.set(db.doc('market/summary'), summary));
  ops.push((b) => b.set(db.doc('market/summary/history/0'), summaryHistory));
  ops.push((b) => b.set(db.doc('game/state'), lobbyState(settings, now)));
  await commitInBatches(db, ops);

  const adminRef = db.doc('_auth/_admin');
  let adminPasswordSet = false;
  let generatedAdminPassword: string | undefined;
  if (opts.adminPassword) {
    await adminRef.set({ passwordHash: hashPassword(opts.adminPassword), role: 'admin' });
    adminPasswordSet = true;
  } else if (!(await adminRef.get()).exists) {
    generatedAdminPassword = randomToken(9);
    await adminRef.set({ passwordHash: hashPassword(generatedAdminPassword), role: 'admin' });
    adminPasswordSet = true;
  }

  return {
    seed,
    companies: market.companies.length,
    adminPasswordSet,
    ...(generatedAdminPassword ? { generatedAdminPassword } : {}),
  };
}
