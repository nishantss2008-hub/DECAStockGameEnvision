/**
 * Market lifecycle: clear dynamic data and create a fresh seeded market.
 *
 * Shared by the `npm run seed` / `npm run reset` CLIs and POST /admin/game/new.
 * Everything lands in SQLite through `store` (see `store/index.ts`).
 *
 * HIDDEN DATA: the seed goes to the server-only `meta.seed` row, the per-company
 * q / qEff / surprise / quality / grade / pillars go to `company_secret`, and each fund's
 * value-weighted q / qEff / quality go to `fund_secret`. None of it may ever be returned
 * to a crew before `phase === 'ended'`. A fund's HOLDINGS and WEIGHTS are public and live
 * in the `funds` row itself: students must be able to see what a fund holds.
 */

import type { Company, Fund, Fundamentals, GameSettings, MarketSummary } from '@deca/shared';
import { hashPassword } from '../lib/password';
import { randomToken } from '../lib/secret';
import { generateMarket } from '../seed/generateMarket';
import { effectiveQuality, surpriseFor } from '../engine/model';
import { INDEX_BASE, indexQuote, lobbyState, marketBreadth, normalizeSettings, type Snapshot } from '../engine/loopHelpers';
import { store } from '../store';
import type { CompanySecret, FundSecret } from '../store/types';

export interface CreateMarketOptions {
  seed?: string;
  keepCrews: boolean;
  adminPassword?: string;
  settings?: Partial<GameSettings>;
}

export interface CreateMarketResult {
  seed: string;
  companies: number;
  funds: number;
  adminPasswordSet: boolean;
  generatedAdminPassword?: string;
}

/** `meta` key holding the scrypt hash of the host (admin) password. */
export const ADMIN_PASSWORD_KEY = 'admin_password_hash';
/** `meta` key holding the server-only game seed. */
export const SEED_KEY = 'seed';
/** `meta` key holding the epoch ms the current market was created at. */
export const MARKET_CREATED_KEY = 'market_created_at';

/**
 * Clears every piece of market data (companies, secrets, history, engine state,
 * trades, orders, news, leaderboard, crew stats). Crews:
 *   - keepCrews=true: each crew loses its holdings and history and restarts with `startingCapital`.
 *     Its login AND its "Meet the market" completion survive: the same crews play the new game,
 *     and they have already met the market (design §6).
 *   - keepCrews=false: every crew is deleted (its login and its intro state go with it).
 * The game state, the host login and the audit log are kept.
 */
export async function clearDynamicData(opts: { keepCrews: boolean; startingCapital: number }): Promise<void> {
  store.clearDynamic(opts);
}

function definedOnly<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Creates a fresh market in the lobby:
 *   1. settings = stored game settings (defaults if none) merged with `opts.settings`
 *   2. clearDynamicData
 *   3. generateMarket(seed or a random token)
 *   4. companies, fundamentals, company_secret and tick-0 price history per company,
 *      then the funds (public basket) and fund_secret, with their own tick-0 price rows
 *   5. `meta.seed`, the market summary (+ its tick-0 value) and a lobby game state
 *   6. `meta.admin_password_hash` only when a password is given or no host login exists yet
 *
 * Steps 3–5 are one transaction, so a failure never leaves a half-built market.
 */
export async function createMarket(opts: CreateMarketOptions): Promise<CreateMarketResult> {
  const existing = store.game.get();
  const settings = normalizeSettings({ ...normalizeSettings(existing ?? undefined), ...definedOnly(opts.settings) });

  await clearDynamicData({ keepCrews: opts.keepCrews, startingCapital: settings.startingCapital });

  const seed = opts.seed || randomToken();
  const market = generateMarket(seed);
  const now = Date.now();

  const companies: Company[] = [];
  const fundamentals: Record<string, Fundamentals> = {};
  const secrets: Record<string, CompanySecret> = {};
  const history: { companyId: string; tick: number; price: number; volume: number }[] = [];
  const snaps: Snapshot[] = [];
  const sectors = new Set<string>();

  for (const g of market.companies) {
    const { company, quality } = g;
    const id = company.id;
    companies.push(company);
    fundamentals[id] = g.fundamentals;
    secrets[id] = {
      companyId: id,
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      q: quality.q,
      // Same formula the engine uses, evaluated once here: qEff is a pure function of (seed, id, q).
      qEff: effectiveQuality(quality.q, surpriseFor(seed, id)),
      surprise: surpriseFor(seed, id),
      quality: quality.score,
      grade: quality.grade,
      pillars: quality.pillars,
      idioVol: g.idioVol,
      beta: company.beta,
      sharesOutstanding: company.sharesOutstanding,
      adv: company.adv,
      startPriceCents: g.startPriceCents,
    };
    history.push({ companyId: id, tick: 0, price: g.startPriceCents, volume: 0 });
    snaps.push({ ...company });
    sectors.add(company.sector);
  }

  const funds: Fund[] = [];
  const fundSecrets: Record<string, FundSecret> = {};
  for (const g of market.funds) {
    funds.push(g.fund);
    fundSecrets[g.fund.id] = g.secret;
    // A fund's quote is a price_history row like a company's, so every chart path is one path.
    history.push({ companyId: g.fund.id, tick: 0, price: g.fund.startPrice, volume: 0 });
  }

  const summary: MarketSummary = {
    lastTick: 0,
    updatedAt: now,
    composite: indexQuote(INDEX_BASE, INDEX_BASE),
    sectors: Object.fromEntries([...sectors].map((s) => [s, indexQuote(INDEX_BASE, INDEX_BASE)])),
    breadth: marketBreadth(snaps),
  };

  store.tx(() => {
    store.companies.upsertMany(companies);
    store.fundamentals.upsertMany(fundamentals);
    store.secrets.upsertMany(secrets);
    store.funds.upsertMany(funds);
    store.fundSecrets.upsertMany(fundSecrets);
    store.history.append(history);
    store.market.set(summary);
    store.market.appendHistory(0, INDEX_BASE);
    store.meta.set(SEED_KEY, seed);
    store.meta.set(MARKET_CREATED_KEY, String(now));
    store.game.set(lobbyState(settings, now));
  });

  let adminPasswordSet = false;
  let generatedAdminPassword: string | undefined;
  if (opts.adminPassword) {
    store.meta.set(ADMIN_PASSWORD_KEY, hashPassword(opts.adminPassword));
    adminPasswordSet = true;
  } else if (!store.meta.get(ADMIN_PASSWORD_KEY)) {
    generatedAdminPassword = randomToken(9);
    store.meta.set(ADMIN_PASSWORD_KEY, hashPassword(generatedAdminPassword));
    adminPasswordSet = true;
  }

  return {
    seed,
    companies: market.companies.length,
    funds: market.funds.length,
    adminPasswordSet,
    ...(generatedAdminPassword ? { generatedAdminPassword } : {}),
  };
}
