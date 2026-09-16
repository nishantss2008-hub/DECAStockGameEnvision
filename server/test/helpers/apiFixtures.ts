/**
 * A tiny, fully-populated world for the route and stream tests: two companies (one carrying a
 * reveal block), two crews with their own holdings, trades and orders, news, standings and history.
 *
 * Everything is written through the real `Store`, so the tests exercise the same reads the server
 * answers in production.
 */

import type {
  Company,
  CompanyReveal,
  Fundamentals,
  GameState,
  Leaderboard,
  MarketSummary,
  NewsEvent,
  OrderRecord,
  Phase,
  Trade,
} from '@deca/shared';
import { lobbyState, normalizeSettings } from '../../src/engine/loopHelpers';
import { hashPassword } from '../../src/lib/password';
import type { Store } from '../../src/store';

export const CREW_A = 'saltwind';
export const CREW_B = 'blackfin';
export const PASSWORD_A = 'kraken-tide-42';
export const KRKN = 'krkn';
export const GALE = 'gale';

export function gameState(phase: Phase = 'live'): GameState {
  const base = lobbyState(normalizeSettings(undefined), Date.now());
  return {
    ...base,
    phase,
    startAt: phase === 'lobby' ? null : Date.now() - 60_000,
    endedAt: phase === 'ended' ? Date.now() : null,
    currentTick: 12,
  };
}

function company(id: string, ticker: string, price: number): Company {
  return {
    id,
    name: `${ticker} Trading Co`,
    ticker,
    sector: 'Shipping & Salvage',
    description: 'A company.',
    currentPrice: price,
    startPrice: price,
    sessionOpen: price,
    sessionHigh: price,
    sessionLow: price,
    sessionVolume: 0,
    voyageHigh: price,
    voyageLow: price,
    sessionChange: 0,
    voyageChange: 0,
    sharesOutstanding: 1_000_000,
    marketCap: price * 1_000_000,
    beta: 1,
    adv: 10_000,
    lastTick: 12,
  } as Company;
}

/** The hidden block the engine writes at the end — it must never reach a crew before then. */
export const REVEAL: CompanyReveal = {
  quality: 0.42,
  q: 0.31,
  qEff: 0.28,
  surprise: -0.2,
  grade: 'A' as const,
  pillars: { prof: 1, grow: 1, safe: 1, val: 1 },
  fairValue: 12_345,
  expectedReturn: 0.1,
  actualReturn: 0.2,
  luck: 0.1,
  label: 'compounder',
};

function fundamentals(): Fundamentals {
  return { marketCap: 1, sharesOutstanding: 1, float: 1, week52High: 1, week52Low: 1 } as Fundamentals;
}

function trade(id: string, teamId: string, companyId: string, tick: number): Trade {
  return {
    id,
    teamId,
    companyId,
    side: 'buy',
    quantity: 10,
    price: 1000,
    lastPrice: 1000,
    impactBps: 1,
    fee: 10,
    realizedPnl: 0,
    executedAt: Date.now() - tick * 1000,
    tick,
    cashAfter: 500_000,
    sharesAfter: 10,
    clientOrderId: `${id}-client`,
  };
}

function order(teamId: string, clientOrderId: string, tradeId: string): OrderRecord {
  return {
    id: `${teamId}_${clientOrderId}`,
    teamId,
    clientOrderId,
    companyId: KRKN,
    side: 'buy',
    quantity: 10,
    status: 'filled',
    tradeId,
    createdAt: Date.now(),
    tick: 12,
  };
}

export interface World {
  game: GameState;
  companies: Company[];
  news: NewsEvent[];
  leaderboard: Leaderboard;
  market: MarketSummary;
}

/** Fills the store with a live game, two companies, two crews and their rows. */
export function seedWorld(store: Store, phase: Phase = 'live'): World {
  const game = gameState(phase);
  const krkn: Company = { ...company(KRKN, 'KRKN', 1000), reveal: REVEAL };
  const gale = company(GALE, 'GALE', 2000);
  const market: MarketSummary = {
    lastTick: 12,
    updatedAt: Date.now(),
    composite: { value: 1000, open: 1000, sessionOpen: 1000, change: 0, sessionChange: 0 },
    sectors: {},
    breadth: {
      advancers: 1,
      decliners: 1,
      unchanged: 0,
      voyageHighs: 0,
      voyageLows: 0,
      sessionVolume: 0,
      advancingVolume: 0,
      decliningVolume: 0,
    },
  };
  const news: NewsEvent[] = [
    {
      id: 'n1',
      headline: 'Kraken sighted',
      body: 'A big one.',
      companyIds: [KRKN],
      type: 'storm',
      sentiment: 'bearish',
      source: 'scheduled',
      tick: 5,
      firedAt: Date.now() - 5000,
      priceAtFire: { [KRKN]: 1000 },
    },
  ];
  const leaderboard: Leaderboard = {
    updatedAt: Date.now(),
    tick: 12,
    entries: [
      {
        teamId: CREW_A,
        name: CREW_A,
        totalValue: 1_000_000,
        rank: 1,
        prevRank: 2,
        returnPct: 0.1,
        sessionChangePct: 0.01,
        cashPct: 0.5,
        holdings: 1,
        spark: [1, 2, 3],
      },
      {
        teamId: CREW_B,
        name: CREW_B,
        totalValue: 900_000,
        rank: 2,
        prevRank: 1,
        returnPct: -0.1,
        sessionChangePct: -0.01,
        cashPct: 0.9,
        holdings: 1,
        spark: [3, 2, 1],
      },
    ],
  };

  store.tx(() => {
    store.game.set(game);
    store.companies.upsertMany([krkn, gale]);
    store.fundamentals.upsertMany({ [KRKN]: fundamentals(), [GALE]: fundamentals() });
    store.secrets.upsertMany({
      [KRKN]: {
        companyId: KRKN,
        ticker: 'KRKN',
        name: 'KRKN Trading Co',
        sector: 'Shipping & Salvage',
        q: 0.31,
        qEff: 0.28,
        surprise: -0.2,
        quality: 0.42,
        grade: 'A',
        pillars: REVEAL.pillars,
        idioVol: 0.2,
        beta: 1,
        sharesOutstanding: 1_000_000,
        adv: 10_000,
        startPriceCents: 1000,
      },
    });
    store.history.append([
      { companyId: KRKN, tick: 11, price: 990, volume: 100 },
      { companyId: KRKN, tick: 12, price: 1000, volume: 120 },
    ]);
    store.market.set(market);
    store.market.appendHistory(11, 999);
    store.market.appendHistory(12, 1000);
    store.news.insert(news);
    store.leaderboard.set(leaderboard);

    store.crews.create({ id: CREW_A, name: 'Saltwind', passwordHash: hashPassword(PASSWORD_A), startingCapital: 1_000_000 });
    store.crews.create({ id: CREW_B, name: 'Blackfin', passwordHash: hashPassword('other-password-9'), startingCapital: 1_000_000 });
    store.holdings.upsert(CREW_A, { companyId: KRKN, shares: 10, avgCost: 1000 });
    store.holdings.upsert(CREW_B, { companyId: GALE, shares: 5, avgCost: 2000 });
    store.crewHistory.append([
      { crewId: CREW_A, tick: 11, value: 1_000_000 },
      { crewId: CREW_A, tick: 12, value: 1_001_000 },
      { crewId: CREW_B, tick: 12, value: 900_000 },
    ]);
    store.trades.insert(trade('trade-a', CREW_A, KRKN, 12));
    store.trades.insert(trade('trade-b', CREW_B, GALE, 12));
    store.orders.insert(order(CREW_A, 'client-a', 'trade-a'));
    store.orders.insert(order(CREW_B, 'client-b', 'trade-b'));
  });

  return { game, companies: [krkn, gale], news, leaderboard, market };
}
