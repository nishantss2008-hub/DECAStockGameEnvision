/**
 * End-to-end engine scenario against the Firestore + Auth emulators (spec §12):
 * create market → settings → crew → start → order (+ idempotent retry, interval
 * cap, position limit, insufficient funds) → forced ticks → history/leaderboard/
 * orders → sell with realized P&L → pause/resume → end (closing mark, reveal) →
 * new game that keeps crews.
 *
 * Money is checked to the cent: every expected notional and fee is computed from
 * the engine quote with the shared `notionalFor`/`feeFor`, and cash is reconciled
 * from the stored trade doc. Before the end, no public doc may carry a hidden
 * field (quality, surprise, reveal, jump sizes, the seed).
 *
 * Run with `npm run test:integration` from the repo root. The steps share one
 * market and run in order; the engine timer is stopped after every reload so
 * only `tickOnce(now)` advances the clock.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GRADES,
  HOUR_MS,
  REVEAL_LABELS,
  feeFor,
  intervalShareCap,
  notionalFor,
  type Company,
  type GameState,
  type HistoryChunk,
  type Holding,
  type Leaderboard,
  type MarketSummary,
  type OrderRecord,
  type Team,
  type Trade,
  type ValueChunk,
} from '@deca/shared';
import type { QuerySnapshot } from 'firebase-admin/firestore';
import { adminAuth, db, emulatorMode } from '../../src/firebase';
import { engine } from '../../src/engine/loop';
import { createMarket } from '../../src/services/market';
import { createCrew, removeCrew, resetCrewPassword } from '../../src/services/crews';
import { executeOrder, TradeError } from '../../src/services/trading';
import { finalizeLeaderboard, resetLeaderboardCache } from '../../src/services/leaderboard';

const SEED = 'int-4f9c2a'; // distinctive, so a leak of the seed into a public doc is detectable
const CREW = 'test-crew';
const CAPITAL = 50_000_000;
const LIMIT_PCT = 0.25;
const ORDER_ID = 'int-order-1';

/** Keys that must never appear in a public doc before the game ends (at any depth). */
const HIDDEN_KEYS = [
  'reveal', 'q', 'qEff', 'surprise', 'quality', 'grade', 'pillars', 'idioVol', 'fairValue',
  'expectedReturn', 'luck', 'jumps', 'magnitude', 'seed', 'researchScore', 'researchGrade', 'final',
  'v', 'm', 'f', 'h', 'hM',
];

type CompanyState = { v: number; m: number; f: number; h: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function data<T>(path: string): Promise<T | undefined> {
  return (await db.doc(path).get()).data() as T | undefined;
}

/** Wipes every document in the emulator project (never a real project: setup.ts guarantees the emulator). */
async function clearEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT;
  const res = await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`could not clear the Firestore emulator: HTTP ${res.status}`);
}

/** Loads the market into the engine without its wall-clock timer, so ticks happen only when a test asks. */
async function reloadWithoutTimer(): Promise<void> {
  await engine.reload();
  await engine.stop();
}

function hiddenKeysIn(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => hiddenKeysIn(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(HIDDEN_KEYS.includes(k) ? [`${path}.${k}`] : []),
    ...hiddenKeysIn(v, `${path}.${k}`),
  ]);
}

/** Every doc the security rules make readable to a signed-out visitor. */
async function publicDocs(): Promise<Array<[string, unknown]>> {
  const out: Array<[string, unknown]> = [];
  const add = (snap: QuerySnapshot) => snap.docs.forEach((d) => out.push([d.ref.path, d.data()]));
  for (const path of ['game/state', 'market/summary', 'leaderboard/current']) {
    const snap = await db.doc(path).get();
    if (snap.exists) out.push([path, snap.data()]);
  }
  add(await db.collection('companies').get());
  add(await db.collection('news').get());
  add(await db.collection('market/summary/history').get());
  for (const group of ['fundamentals', 'history']) {
    const snap = await db.collectionGroup(group).get();
    snap.docs
      .filter((d) => d.ref.path.startsWith('companies/'))
      .forEach((d) => out.push([d.ref.path, d.data()]));
  }
  return out;
}

async function expectNothingHiddenInPublicDocs(): Promise<void> {
  const docs = await publicDocs();
  expect(docs.length).toBeGreaterThanOrEqual(3 + 25 * 3); // state + summary + summary history, and 25 × (company, fundamentals, history)
  const leaks = docs.flatMap(([path, doc]) => hiddenKeysIn(doc).map((k) => `${path}${k}`));
  expect(leaks).toEqual([]);
  for (const [path, doc] of docs) expect(JSON.stringify(doc), path).not.toContain(SEED);
}

describe('engine scenario on the emulator', () => {
  let first = '';
  let startAt = 0;
  let tradeId = '';
  let buyFee = 0;

  beforeAll(async () => {
    expect(emulatorMode).toBe(true);
    expect(process.env.GCLOUD_PROJECT).toMatch(/^demo-/);
    await engine.stop();
    await clearEmulator();
    resetLeaderboardCache();
  });

  afterAll(async () => {
    await engine.stop();
    await db.terminate();
  });

  it('1. createMarket seeds 25 companies in the lobby with an admin login; the hidden data stays server-only', async () => {
    const r = await createMarket({ seed: SEED, keepCrews: false, adminPassword: 'pw', settings: { gameLengthMs: HOUR_MS } });
    expect(r).toMatchObject({ seed: SEED, companies: 25, adminPasswordSet: true });
    expect(r.generatedAdminPassword).toBeUndefined();
    expect((await db.collection('companies').get()).size).toBe(25);
    expect(await data('_schedule/_meta')).toMatchObject({ seed: SEED });
    expect((await db.doc('_auth/_admin').get()).exists).toBe(true);
    expect(await data<GameState>('game/state')).toMatchObject({ phase: 'lobby', gameLengthMs: HOUR_MS, totalTicks: 720 });

    const schedule = await db.collection('_schedule').get();
    expect(schedule.size).toBe(25 + 1); // one per company + _meta (the news schedule is built at start)
    await expectNothingHiddenInPublicDocs();
  });

  it('2. reload: lobby, 25 companies, 720 ticks for a 1h game', async () => {
    await reloadWithoutTimer();
    expect(engine.state.phase).toBe('lobby');
    expect(engine.companies()).toHaveLength(25);
    expect(engine.state.totalTicks).toBe(720);
    first = engine.companies()[0]!.id;
    expect(engine.getPrice(first)).toBeGreaterThan(0);
  });

  it('3. settings then a crew: the crew starts with the configured cash', async () => {
    const state = await engine.applySettings({ startingCapital: CAPITAL, maxPositionPct: LIMIT_PCT });
    expect(state).toMatchObject({ startingCapital: CAPITAL, maxPositionPct: LIMIT_PCT });
    expect(await data<GameState>('game/state')).toMatchObject({ startingCapital: CAPITAL, maxPositionPct: LIMIT_PCT });

    const crew = await createCrew('Test Crew', 'pass', CAPITAL);
    expect(crew).toEqual({ id: CREW, name: 'Test Crew' });
    const team = await data<Team>(`teams/${CREW}`);
    expect(team?.cashBalance).toBe(CAPITAL);
    expect((await db.doc(`_auth/${CREW}`).get()).exists).toBe(true);
  });

  it('4. startGame: live, with the hidden news schedule written', async () => {
    await engine.startGame();
    expect(engine.state.phase).toBe('live');
    startAt = engine.state.startAt!;
    expect(startAt).toBeGreaterThan(0);
    expect(await data<GameState>('game/state')).toMatchObject({ phase: 'live', startAt, currentTick: 0 });
    const news = await db.doc('_schedule/_news').get();
    expect(news.exists).toBe(true);
    expect(Array.isArray(news.data()?.events)).toBe(true);
    expect(news.data()?.events.length).toBeGreaterThan(0);
    expect((await db.doc('_engine/state').get()).exists).toBe(true);
    await expectNothingHiddenInPublicDocs();
  });

  it('5. executeOrder fills: the trade doc reconciles cash to the cent (notional + fee), 10 shares held', async () => {
    const last = engine.getPrice(first);
    const quote = engine.quote(first, 'buy', 10, CREW);
    const notional = notionalFor(10, quote.fillPrice);
    const fee = feeFor(notional, engine.state.feeBps);
    expect(fee).toBeGreaterThan(0);
    buyFee = fee;

    const trade = await executeOrder(engine, CREW, {
      companyId: first,
      side: 'buy',
      quantity: 10,
      clientOrderId: ORDER_ID,
      quotedPrice: last,
    });
    tradeId = trade.id;

    expect(trade).toMatchObject({
      teamId: CREW,
      companyId: first,
      side: 'buy',
      quantity: 10,
      price: Math.round(quote.fillPrice),
      lastPrice: last,
      impactBps: quote.impactBps,
      fee,
      realizedPnl: 0,
      cashAfter: CAPITAL - notional - fee,
      sharesAfter: 10,
      clientOrderId: ORDER_ID,
      tick: 0,
    });
    expect(trade.price).toBeGreaterThanOrEqual(last); // a buy pays the impact

    // The stored trade alone accounts for every cent that left the account.
    const stored = await data<Trade>(`trades/${trade.id}`);
    expect(stored).toEqual(trade);
    expect(CAPITAL - stored!.cashAfter - stored!.fee).toBe(notional);
    expect(Math.abs(notional - 10 * stored!.price)).toBeLessThanOrEqual(5); // notional uses the unrounded price

    const team = await data<Team>(`teams/${CREW}`);
    expect(team?.cashBalance).toBe(CAPITAL - notional - fee);
    expect(team).toMatchObject({ cashBalance: trade.cashAfter, tradeCount: 1, feesPaid: fee, realizedPnl: 0, holdingsCount: 1 });

    expect(await data<Holding>(`teams/${CREW}/holdings/${first}`)).toEqual({ companyId: first, shares: 10, avgCost: Math.round(notional / 10) });
    expect(await data<OrderRecord>(`orders/${CREW}_${ORDER_ID}`)).toMatchObject({ status: 'filled', tradeId: trade.id, teamId: CREW });
  });

  it('6. the same clientOrderId returns the same trade without charging twice', async () => {
    const before = await data<Team>(`teams/${CREW}`);
    const intervalBefore = engine.quote(first, 'buy', 1, CREW);
    const again = await executeOrder(engine, CREW, {
      companyId: first,
      side: 'buy',
      quantity: 10,
      clientOrderId: ORDER_ID,
      quotedPrice: engine.getPrice(first),
    });
    expect(again.id).toBe(tradeId);

    const after = await data<Team>(`teams/${CREW}`);
    expect(after).toEqual(before);
    expect(after?.tradeCount).toBe(1);
    expect((await data<Holding>(`teams/${CREW}/holdings/${first}`))?.shares).toBe(10);
    expect((await db.collection('trades').where('teamId', '==', CREW).get()).size).toBe(1);
    // the retry reserved no flow: neither the pending impact nor the crew's interval use moved
    expect(engine.quote(first, 'buy', 1, CREW)).toEqual(intervalBefore);
  });

  it('6b. the interval cap: more than one ADV per crew per price update is rejected, recorded and charges nothing', async () => {
    const before = await data<Team>(`teams/${CREW}`);
    const cap = intervalShareCap(engine.getCompany(first)!.sharesOutstanding);
    expect(engine.quote(first, 'buy', 1, CREW).intervalRemaining).toBe(cap - 10);

    // 10 shares already traded this interval, so cap − 9 more is one share too many.
    const over = executeOrder(engine, CREW, { companyId: first, side: 'buy', quantity: cap - 9, clientOrderId: 'int-interval-1' });
    await expect(over).rejects.toBeInstanceOf(TradeError);
    await expect(over).rejects.toMatchObject({ code: 'interval_limit' });
    const rec = await data<OrderRecord>(`orders/${CREW}_int-interval-1`);
    expect(rec).toMatchObject({ status: 'rejected', code: 'interval_limit', teamId: CREW, companyId: first, quantity: cap - 9 });
    expect(rec?.reason).toMatch(/^Too many shares for one price update\. /);

    // A company the crew has not traded: cap + 1 in one order.
    const second = engine.companies()[1]!;
    const cap2 = intervalShareCap(second.sharesOutstanding);
    await expect(
      executeOrder(engine, CREW, { companyId: second.id, side: 'buy', quantity: cap2 + 1, clientOrderId: 'int-interval-2' }),
    ).rejects.toMatchObject({ code: 'interval_limit' });
    expect(await data<OrderRecord>(`orders/${CREW}_int-interval-2`)).toMatchObject({ status: 'rejected', code: 'interval_limit' });

    expect(await data<Team>(`teams/${CREW}`)).toEqual(before);
    expect(engine.quote(first, 'buy', 1, CREW).intervalRemaining).toBe(cap - 10);
    expect(engine.quote(second.id, 'buy', 1, CREW).intervalRemaining).toBe(cap2);
  });

  it('6c. the position limit: a buy over 25% of the account is rejected, recorded, charges nothing and releases its flow', async () => {
    const before = await data<Team>(`teams/${CREW}`);
    const qtyFor = (id: string) => Math.ceil((0.3 * CAPITAL) / engine.getPrice(id));
    const pick = engine.companies().find((c) => c.id !== first && qtyFor(c.id) <= engine.quote(c.id, 'buy', 1, CREW).intervalRemaining);
    expect(pick, 'a company where 30% of the account fits in one interval').toBeDefined();
    const qty = qtyFor(pick!.id);
    const quoteBefore = engine.quote(pick!.id, 'buy', qty, CREW);
    expect(notionalFor(qty, quoteBefore.fillPrice) * 1.01).toBeLessThan(before!.cashBalance); // affordable: the limit, not cash, rejects it

    const p = executeOrder(engine, CREW, { companyId: pick!.id, side: 'buy', quantity: qty, clientOrderId: 'int-limit' });
    await expect(p).rejects.toMatchObject({ code: 'position_limit' });
    const rec = await data<OrderRecord>(`orders/${CREW}_int-limit`);
    expect(rec).toMatchObject({ status: 'rejected', code: 'position_limit', teamId: CREW, companyId: pick!.id, quantity: qty });
    expect(rec?.reason).toMatch(/^Over the position limit\. This would put more than 25% of your account in /);

    expect(await data<Team>(`teams/${CREW}`)).toEqual(before);
    expect((await db.doc(`teams/${CREW}/holdings/${pick!.id}`).get()).exists).toBe(false);
    expect(engine.quote(pick!.id, 'buy', qty, CREW)).toEqual(quoteBefore); // pending flow and interval use released
  });

  it('6d. insufficient funds: an unaffordable buy is rejected, recorded and charges nothing', async () => {
    const before = (await data<Team>(`teams/${CREW}`))!;
    const qtyFor = (id: string) => Math.ceil((1.2 * before.cashBalance) / engine.getPrice(id));
    const pick = engine.companies().find((c) => qtyFor(c.id) <= engine.quote(c.id, 'buy', 1, CREW).intervalRemaining);
    expect(pick, 'a company where 120% of cash fits in one interval').toBeDefined();
    const quoteBefore = engine.quote(pick!.id, 'buy', 1, CREW);

    const p = executeOrder(engine, CREW, { companyId: pick!.id, side: 'buy', quantity: qtyFor(pick!.id), clientOrderId: 'int-funds' });
    await expect(p).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(await data<OrderRecord>(`orders/${CREW}_int-funds`)).toMatchObject({ status: 'rejected', code: 'insufficient_funds' });
    expect(await data<Team>(`teams/${CREW}`)).toEqual(before);
    expect(engine.quote(pick!.id, 'buy', 1, CREW)).toEqual(quoteBefore);
  });

  it('7. forced ticks write history, market summary, leaderboard and team history', async () => {
    const { tickIntervalMs } = engine.state;
    await engine.tickOnce(startAt + 3 * tickIntervalMs + 10);

    expect(engine.state.currentTick).toBe(3);
    expect(await data<GameState>('game/state')).toMatchObject({ currentTick: 3 });

    const history = await data<HistoryChunk>(`companies/${first}/history/0`);
    expect(history?.prices).toHaveLength(4);
    expect(history?.volumes).toHaveLength(4);
    expect(history?.volumes).toEqual([0, 10, 0, 0]); // only the filled buy is drained into the first tick; rejected orders add nothing
    expect(history?.prices[3]).toBe(engine.getPrice(first));
    expect((await data<Company>(`companies/${first}`))?.currentPrice).toBe(engine.getPrice(first));

    const summary = await data<MarketSummary>('market/summary');
    expect(summary?.lastTick).toBe(3);
    expect((await data<ValueChunk>('market/summary/history/0'))?.values).toHaveLength(4);

    const board = await data<Leaderboard>('leaderboard/current');
    expect(board?.tick).toBe(3);
    expect(board?.entries[0]?.teamId).toBe(CREW);
    expect(board?.entries[0]?.spark.length).toBeGreaterThanOrEqual(1);

    const team = await data<Team>(`teams/${CREW}`);
    expect(team?.totalValue).toBe(team!.cashBalance + 10 * engine.getPrice(first));
    const teamHistory = await db.doc(`teams/${CREW}/history/0`).get();
    expect(teamHistory.exists).toBe(true);
    const values = (teamHistory.data() as ValueChunk).values;
    expect(values).toHaveLength(4);
    expect(values[0]).toBe(CAPITAL);
    expect(values[3]).toBe(team?.totalValue);

    expect((await db.doc('_engine/state').get()).data()?.lastTick).toBe(3);
    expect((await db.doc(`_teamStats/${CREW}`).get()).exists).toBe(true);
    await expectNothingHiddenInPublicDocs();
  });

  it('7b. a sell realizes P&L: cash up by notional − fee, realized = notional − avgCost·qty − fee; overselling is rejected', async () => {
    await sleep(5);
    const before = (await data<Team>(`teams/${CREW}`))!;
    const holdingBefore = (await data<Holding>(`teams/${CREW}/holdings/${first}`))!;
    const last = engine.getPrice(first);
    const quote = engine.quote(first, 'sell', 4, CREW);
    const notional = notionalFor(4, quote.fillPrice);
    const fee = feeFor(notional, engine.state.feeBps);
    const realized = notional - Math.round(holdingBefore.avgCost * 4) - fee;

    const trade = await executeOrder(engine, CREW, { companyId: first, side: 'sell', quantity: 4, clientOrderId: 'int-sell-1', quotedPrice: last });
    expect(trade).toMatchObject({
      side: 'sell',
      quantity: 4,
      price: Math.round(quote.fillPrice),
      lastPrice: last,
      fee,
      realizedPnl: realized,
      cashAfter: before.cashBalance + notional - fee,
      sharesAfter: 6,
      tick: 3,
    });
    expect(trade.price).toBeLessThanOrEqual(last); // a sell receives less than the last price
    const stored = await data<Trade>(`trades/${trade.id}`);
    expect(stored).toEqual(trade);
    expect(stored!.cashAfter - before.cashBalance + stored!.fee).toBe(notional);

    const team = await data<Team>(`teams/${CREW}`);
    expect(team).toMatchObject({
      cashBalance: trade.cashAfter,
      realizedPnl: before.realizedPnl + realized,
      feesPaid: buyFee + fee,
      tradeCount: 2,
      holdingsCount: 1,
    });
    expect(await data<Holding>(`teams/${CREW}/holdings/${first}`)).toEqual({ companyId: first, shares: 6, avgCost: holdingBefore.avgCost });

    const over = executeOrder(engine, CREW, { companyId: first, side: 'sell', quantity: 7, clientOrderId: 'int-oversell' });
    await expect(over).rejects.toMatchObject({ code: 'insufficient_shares' });
    expect(await data<OrderRecord>(`orders/${CREW}_int-oversell`)).toMatchObject({ status: 'rejected', code: 'insufficient_shares' });
    expect(await data<Team>(`teams/${CREW}`)).toEqual(team);
  });

  it('8. pause then resume: live again with startAt and endAt shifted; paused orders are rejected and recorded', async () => {
    const before = { startAt: engine.state.startAt!, endAt: engine.state.endAt! };
    await engine.pauseGame();
    expect(engine.state.phase).toBe('paused');
    expect(await data<GameState>('game/state')).toMatchObject({ phase: 'paused' });

    const paused = executeOrder(engine, CREW, { companyId: first, side: 'buy', quantity: 1, clientOrderId: 'int-order-paused' });
    await expect(paused).rejects.toBeInstanceOf(TradeError);
    await expect(paused).rejects.toMatchObject({ code: 'market_closed' });
    expect(await data<OrderRecord>(`orders/${CREW}_int-order-paused`)).toMatchObject({ status: 'rejected', code: 'market_closed' });
    await expectNothingHiddenInPublicDocs();

    await sleep(30);
    await engine.resumeGame();
    expect(engine.state.phase).toBe('live');
    expect(engine.state.startAt!).toBeGreaterThan(before.startAt);
    expect(engine.state.endAt! - before.endAt).toBe(engine.state.startAt! - before.startAt);
    expect(engine.state.pausedAt).toBeNull();
    expect(await data<GameState>('game/state')).toMatchObject({ phase: 'live', startAt: engine.state.startAt, pausedAt: null });
  });

  it('8b. removing a crew: its sessions are revoked, the standings renumber at once, and its orders fail with no_team', async () => {
    await createCrew('Second Crew', 'pass2', CAPITAL);
    await createCrew('Third Crew', 'pass3', CAPITAL);
    // Second Crew signs in through the Auth emulator, so it has a session to revoke. Third Crew never signs in.
    const token = await adminAuth.createCustomToken('second-crew', { role: 'team', teamId: 'second-crew' });
    const signIn = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) },
    );
    expect(signIn.ok).toBe(true);
    // A user that was never revoked has no tokensValidAfterTime yet.
    const validAfter = async () => Date.parse((await adminAuth.getUser('second-crew')).tokensValidAfterTime ?? '') || 0;
    const validBefore = await validAfter();
    const signedInAt = Date.now();

    await engine.tickOnce(engine.state.startAt! + 4 * engine.state.tickIntervalMs + 10);
    const board = (await data<Leaderboard>('leaderboard/current'))!;
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    const order = board.entries.map((e) => e.teamId);

    await sleep(1_100); // tokensValidAfterTime has one-second resolution
    await removeCrew('second-crew');
    resetLeaderboardCache();
    await engine.refreshStandings();
    // Revoked: refresh tokens issued before now (the sign-in above) no longer renew a session.
    expect(await validAfter()).toBeGreaterThan(validBefore);
    expect(await validAfter()).toBeGreaterThanOrEqual(Math.floor(signedInAt / 1000) * 1000);

    const after = (await data<Leaderboard>('leaderboard/current'))!;
    expect(after.entries.map((e) => e.teamId)).toEqual(order.filter((id) => id !== 'second-crew'));
    expect(after.entries.map((e) => e.rank)).toEqual([1, 2]);
    for (const e of after.entries) expect((await data<Team>(`teams/${e.teamId}`))?.rank, e.teamId).toBe(e.rank);

    await expect(
      executeOrder(engine, 'second-crew', { companyId: first, side: 'buy', quantity: 1, clientOrderId: 'int-removed-1' }),
    ).rejects.toMatchObject({
      code: 'no_team',
      message: "Crew account not found. We couldn't find your crew's account. Sign out, sign back in, and try again; if it keeps happening, tell your host.",
    });
    expect((await db.doc('orders/second-crew_int-removed-1').get()).exists).toBe(false);

    // A crew that never signed in has no Auth user: a reset and a removal still succeed.
    await expect(resetCrewPassword('third-crew', 'pass3-new')).resolves.toBeUndefined();
    await removeCrew('third-crew');
    resetLeaderboardCache();
    await engine.refreshStandings();
    expect((await data<Leaderboard>('leaderboard/current'))!.entries.map((e) => [e.teamId, e.rank])).toEqual([[CREW, 1]]);
  });

  it('9. endGame: closing marks from the engine state, a reveal per company, final standings with a research grade', async () => {
    await engine.endGame();
    expect(engine.state.phase).toBe('ended');
    expect(await data<GameState>('game/state')).toMatchObject({ phase: 'ended' });

    const engineState = (await data<{ companies: Record<string, CompanyState> }>('_engine/state'))!;
    const closeOf = (id: string) => {
      const s = engineState.companies[id]!;
      return Math.max(1, Math.round(Math.exp(s.v + s.m))); // round(exp(v+m)): impact excluded
    };

    const companies = await db.collection('companies').get();
    expect(companies.size).toBe(25);
    for (const doc of companies.docs) {
      const c = doc.data() as Company;
      const s = engineState.companies[doc.id]!;
      const start = engine.getCompany(doc.id)!.startPriceCents;
      expect(c.reveal, doc.id).toBeDefined();
      expect(REVEAL_LABELS).toContain(c.reveal!.label);
      expect(GRADES).toContain(c.reveal!.grade);
      expect(c.currentPrice, doc.id).toBe(closeOf(doc.id));
      expect(c.currentPrice).toBe(engine.closePrice(doc.id));
      expect(c.reveal!.fairValue).toBe(Math.max(1, Math.round(Math.exp(s.v))));
      expect(c.reveal!.actualReturn).toBeCloseTo(Math.log(closeOf(doc.id) / start), 12);
      expect(c.reveal!.luck).toBeCloseTo(c.reveal!.actualReturn - c.reveal!.expectedReturn, 12);
      expect(c.reveal!.surprise).toBeGreaterThanOrEqual(-1);
      expect(c.reveal!.surprise).toBeLessThanOrEqual(1);
      expect(c.reveal!.qEff).toBeCloseTo(0.75 * c.reveal!.q + 0.25 * c.reveal!.surprise, 12);
    }

    const board = await data<Leaderboard>('leaderboard/current');
    const entry = board?.final?.entries[0];
    expect(entry?.teamId).toBe(CREW);
    expect(GRADES).toContain(entry?.researchGrade);
    const team = await data<Team>(`teams/${CREW}`);
    expect(entry?.totalValue).toBe(team!.cashBalance + 6 * closeOf(first));
    expect(team?.totalValue).toBe(entry?.totalValue);
    const stats = (await data<{ exposure: number; weight: number }>(`_teamStats/${CREW}`))!;
    expect(entry?.researchScore).toBeCloseTo(stats.weight > 0 ? stats.exposure / stats.weight : 0, 12);
    expect(stats.weight).toBeGreaterThan(0);
    expect(entry).toMatchObject({ researchWeight: stats.weight, heldAnyShares: true });

    // The closing mark is the last point of each price chart and of the composite history.
    const tick = engine.state.currentTick;
    const chunk = (await data<HistoryChunk>(`companies/${first}/history/0`))!;
    expect(chunk.prices).toHaveLength(tick + 1);
    expect(chunk.prices[tick]).toBe(closeOf(first));
    const composite = (await data<ValueChunk>('market/summary/history/0'))!;
    expect(composite.values).toHaveLength(tick + 1);
    expect(composite.values[tick]).toBe((await data<MarketSummary>('market/summary'))!.composite.value);

    // Trading is closed once the game has ended.
    await expect(
      executeOrder(engine, CREW, { companyId: first, side: 'sell', quantity: 1, clientOrderId: 'int-after-end' }),
    ).rejects.toMatchObject({ code: 'market_closed', message: expect.stringMatching(/^Game ended\. /) });
    expect(await data<Team>(`teams/${CREW}`)).toEqual(team);

    // Finalizing again (a retried end) gives the same standings.
    await finalizeLeaderboard(engine);
    const again = (await data<Leaderboard>('leaderboard/current'))?.final?.entries[0];
    expect(again).toMatchObject({ teamId: CREW, researchGrade: entry!.researchGrade, researchScore: entry!.researchScore, totalValue: entry!.totalValue });
  });

  it('10. a new game that keeps crews: same crew, starting cash again, no holdings, lobby', async () => {
    await engine.stop();
    await createMarket({ keepCrews: true });
    resetLeaderboardCache();
    await reloadWithoutTimer();

    expect(engine.state.phase).toBe('lobby');
    expect(engine.state.startingCapital).toBe(CAPITAL);
    expect(engine.state.gameLengthMs).toBe(HOUR_MS);
    expect(engine.companies()).toHaveLength(25);
    expect(await data<GameState>('game/state')).toMatchObject({ phase: 'lobby', currentTick: 0, startingCapital: CAPITAL });

    const team = await data<Team>(`teams/${CREW}`);
    expect(team).toMatchObject({ cashBalance: CAPITAL, totalValue: CAPITAL, tradeCount: 0, feesPaid: 0, realizedPnl: 0, holdingsCount: 0 });
    expect((await db.collection(`teams/${CREW}/holdings`).get()).empty).toBe(true);
    expect((await db.collection(`teams/${CREW}/history`).get()).empty).toBe(true);
    expect((await db.doc(`_auth/${CREW}`).get()).exists).toBe(true);

    expect((await db.collection('trades').get()).empty).toBe(true);
    expect((await db.collection('orders').get()).empty).toBe(true);
    expect((await db.doc('leaderboard/current').get()).exists).toBe(false);
    expect((await db.doc('_engine/state').get()).exists).toBe(false);
    expect((await db.collection('_teamStats').get()).empty).toBe(true);
    for (const doc of (await db.collection('companies').get()).docs) expect((doc.data() as Company).reveal).toBeUndefined();
    const meta = await data<{ seed: string }>('_schedule/_meta');
    expect(meta?.seed).toBeTruthy();
    expect(meta?.seed).not.toBe(SEED); // a new random market
  });
});
