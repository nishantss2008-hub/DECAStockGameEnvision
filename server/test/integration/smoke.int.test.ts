/**
 * Engine smoke test on the emulator (ported from the Wave 2 gate script `smoke.ts`).
 *
 * One market, driven step by step through the engine API with hand-written crew docs and trades:
 * create market → reload → settings → start → reserve flow → ticks (history, summary, standings, stats)
 * → scheduled news priceAtFire → host news → restart determinism with pending flow → recovery without
 * `_engine/state` → pause/resume → catch-up across a chunk boundary → end (closing marks, reveal, grades)
 * → new game keeping crews → a full 720-tick catch-up that ends the game → reset.
 *
 * The steps share state and run in order. Run with `npm run test:integration` from the repo root.
 */

import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { GRADES, HOUR_MS, intervalShareCap } from '@deca/shared';
import { db, emulatorMode } from '../../src/firebase';
import { EngineError, GameEngine, engine, type EngineCompany, type FlowReservation } from '../../src/engine/loop';
import { resetLeaderboardCache } from '../../src/services/leaderboard';
import { clearDynamicData, createMarket } from '../../src/services/market';
import { clearEmulator } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

const get = async (path: string): Promise<Doc> => (await db.doc(path).get()).data();

async function expectEngineError(fn: () => unknown, code: string): Promise<string> {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof EngineError, `expected EngineError ${code}, got ${e}`);
    assert.equal(e.code, code);
    return e.message;
  }
  assert.fail(`expected EngineError ${code}`);
}

function crewDoc(id: string, name: string, cash: number, now: number): Doc {
  return {
    id,
    name,
    cashBalance: cash,
    totalValue: cash,
    rank: 0,
    realizedPnl: 0,
    feesPaid: 0,
    tradeCount: 0,
    tradingDisabled: false,
    sessionOpenValue: cash,
    holdingsCount: 0,
    createdAt: now,
  };
}

describe('engine smoke on the emulator', () => {
  const t0 = Date.now();
  let first!: EngineCompany;
  let startAt = 0;
  let interval = 0;
  let r!: FlowReservation;
  let target10 = 0;
  let sa = 0;
  let closes: Record<string, number> = {};

  beforeAll(async () => {
    assert.equal(emulatorMode, true);
    assert.match(process.env.GCLOUD_PROJECT ?? '', /^demo-/);
    await engine.stop();
    await clearEmulator();
    resetLeaderboardCache();
  });

  afterAll(async () => {
    await engine.stop();
    await db.terminate();
  });

  it('1. createMarket writes 25 companies, the meta seed and the market summary', async () => {
    const res = await createMarket({ seed: 'int', keepCrews: false, adminPassword: 'pw', settings: { gameLengthMs: HOUR_MS } });
    assert.equal(res.companies, 25);
    assert.equal(res.adminPasswordSet, true);
    assert.equal(res.generatedAdminPassword, undefined);
    assert.equal((await get('_schedule/_meta')).seed, 'int');
    assert.equal((await get('market/summary')).composite.value, 1000);
  });

  it('2. reload: lobby, 25 companies, 720 ticks, effective quality and impact derived', async () => {
    await engine.reload();
    await engine.stop();
    assert.equal(engine.state.phase, 'lobby');
    assert.equal(engine.companies().length, 25);
    assert.equal(engine.state.totalTicks, 720);
    assert.equal(engine.state.maxPositionPct, 0.5);
    first = engine.companies()[0]!;
    assert.ok(first.lambda > 0 && Math.abs(first.qEff - (0.75 * first.q + 0.25 * first.surprise)) < 1e-12);
  });

  it('3. applySettings persists; the lobby rejects reserveFlow (market_closed) but quotes', async () => {
    const st = await engine.applySettings({ startingCapital: 50_000_000, maxPositionPct: 0.25 });
    assert.equal(st.startingCapital, 50_000_000);
    assert.equal(st.maxPositionPct, 0.25);
    assert.equal((await get('game/state')).startingCapital, 50_000_000);
    await engine.applySettings({ maxPositionPct: 0.5 });
    const now = Date.now();
    await db.doc('teams/test-crew').set(crewDoc('test-crew', 'Test Crew', 50_000_000, now));
    await db.doc('teams/other-crew').set(crewDoc('other-crew', 'Other Crew', 50_000_000, now));
    await expectEngineError(() => engine.reserveFlow('test-crew', first.id, 'buy', 10), 'market_closed');
    const lobbyQuote = engine.quote(first.id, 'buy', 10);
    assert.ok(lobbyQuote.fillPrice >= lobbyQuote.lastPrice);
  });

  it('4. startGame: live with a scheduled news list; a second start and settings are refused (not_lobby)', async () => {
    await engine.startGame();
    assert.equal(engine.state.phase, 'live');
    const news = await get('_schedule/_news');
    assert.ok(Array.isArray(news.events) && news.events.length > 0);
    assert.equal((await get('_engine/state')).lastTick, 0);
    assert.equal((await get('game/state')).phase, 'live');
    await expectEngineError(() => engine.startGame(), 'not_lobby');
    assert.equal(
      await expectEngineError(() => engine.applySettings({ feeBps: 5 }), 'not_lobby'),
      'Locked while the game is running. You can change settings only in the lobby.',
    );
  });

  it('5. reserveFlow prices like a quote, raises the next fill, enforces the interval cap and releases', async () => {
    startAt = engine.state.startAt!;
    interval = engine.state.tickIntervalMs;
    const q0 = engine.quote(first.id, 'buy', 1000, 'test-crew');
    r = engine.reserveFlow('test-crew', first.id, 'buy', 1000);
    assert.ok(Math.abs(r.fillPrice - q0.fillPrice) < 1e-9, 'reserve prices like quote');
    assert.equal(r.tick, 0);
    const q1 = engine.quote(first.id, 'buy', 1000, 'test-crew');
    assert.ok(q1.fillPrice > r.fillPrice, 'pending flow raises the next fill');
    assert.equal(q1.intervalRemaining, intervalShareCap(first.sharesOutstanding) - 1000);
    const capMsg = await expectEngineError(() => engine.reserveFlow('test-crew', first.id, 'buy', intervalShareCap(first.sharesOutstanding)), 'interval_limit');
    assert.match(capMsg, /^You already traded 1,000 shares of [A-Z]+ in this price update\. You can trade [\d,]+ more now, or the rest after the next update\.$/);
    const rel = engine.reserveFlow('other-crew', first.id, 'sell', 400);
    rel.release();
    assert.equal(engine.adminMarket()[0]!.netFlow, 1000);
    const notional = Math.round(1000 * r.fillPrice);
    await db.doc(`teams/test-crew/holdings/${first.id}`).set({ companyId: first.id, shares: 1000, avgCost: Math.round(notional / 1000) });
    await db.doc('teams/test-crew').update({ cashBalance: 50_000_000 - notional, holdingsCount: 1, tradeCount: 1 });
    await db.doc('trades/t1').set({
      id: 't1',
      teamId: 'test-crew',
      companyId: first.id,
      side: 'buy',
      quantity: 1000,
      price: Math.round(r.fillPrice),
      lastPrice: r.lastPrice,
      impactBps: r.impactBps,
      fee: 0,
      realizedPnl: 0,
      executedAt: Date.now(),
      tick: r.tick,
      cashAfter: 50_000_000 - notional,
      sharesAfter: 1000,
      clientOrderId: 'int-order-1',
    });
  });

  it('6. tickOnce → tick 3: chunk prices, volumes drained once, summary, standings, team history and stats', async () => {
    await engine.tickOnce(startAt + 3 * interval + 10);
    assert.equal(engine.state.currentTick, 3);
    const h0 = await get(`companies/${first.id}/history/0`);
    assert.equal(h0.prices.length, 4);
    assert.deepEqual(h0.volumes.slice(0, 4), [0, 1000, 0, 0]);
    assert.equal(h0.prices[3], engine.getPrice(first.id));
    assert.equal((await get('market/summary')).lastTick, 3);
    assert.equal((await get('market/summary/history/0')).values.length, 4);
    const lb = await get('leaderboard/current');
    assert.equal(lb.tick, 3);
    assert.ok(lb.entries[0].spark.length >= 1);
    assert.equal(lb.entries.length, 2);
    assert.equal((await get('teams/test-crew/history/0')).values.length, 4);
    const stats = await get('_teamStats/test-crew');
    assert.ok(stats.weight > 0 && Number.isFinite(stats.exposure));
    const gs = await get('game/state');
    assert.equal(gs.currentTick, 3);
    assert.ok(gs.lastTickAt >= t0);
    const co = await get(`companies/${first.id}`);
    assert.equal(co.lastTick, 3);
    assert.equal(co.currentPrice, engine.getPrice(first.id));
    assert.equal(co.sessionVolume, 1000);
    assert.equal((await get('_engine/state')).lastTick, 3);
    const team = await get('teams/test-crew');
    assert.equal(team.totalValue, team.cashBalance + 1000 * engine.getPrice(first.id));
    assert.ok(team.rank >= 1);
  });

  it('7. scheduled news: priceAtFire is the price at the end of the tick before, and no jump size is public', async () => {
    const upcoming = engine.scheduledNews().find((e) => !e.fired && e.tick > 3 && e.tick < 118 && e.source === 'scheduled');
    assert.ok(upcoming, 'an early scheduled event exists');
    await engine.tickOnce(startAt + upcoming.tick * interval + 10);
    assert.equal(engine.state.currentTick, upcoming.tick);
    const newsSnap = await db.collection('news').where('tick', '==', upcoming.tick).get();
    assert.ok(newsSnap.size >= 1);
    const fired = newsSnap.docs.map((d) => d.data()).find((n) => n.source === 'scheduled')!;
    const cid = fired.companyIds[0];
    const hc = await get(`companies/${cid}/history/0`);
    assert.equal(fired.priceAtFire[cid], hc.prices[upcoming.tick - 1], 'priceAtFire = price at end of t-1');
    assert.equal(fired.magnitude, undefined);
    assert.equal(fired.jumps, undefined);
    assert.ok(engine.scheduledNews().find((e) => e.tick === upcoming.tick && e.headline === fired.headline)!.fired);
  });

  it('8. host news fires at the next tick, moves the price and moves from pending into the schedule', async () => {
    const hostTick = engine.state.currentTick + 1;
    await engine.queueHostNews({ companyIds: [first.id], type: 'merger', magnitude: 0.1, headline: 'Host headline', body: '' });
    assert.equal((await get('_schedule/_news')).pending.length, 1);
    const beforeHost = engine.getPrice(first.id);
    await engine.tickOnce(startAt + hostTick * interval + 10);
    const hostDoc = (await get(`news/host-${hostTick}-${first.id}-0`)) ?? (await db.collection('news').where('source', '==', 'host').get()).docs[0]?.data();
    assert.ok(hostDoc, 'host news doc');
    assert.equal(hostDoc.priceAtFire[first.id], beforeHost);
    const ratio = engine.getPrice(first.id) / beforeHost;
    assert.ok(ratio > 1.05 && ratio < 1.16, `host jump ratio ${ratio}`);
    const nd = await get('_schedule/_news');
    assert.equal(nd.pending.length, 0);
    assert.ok(nd.events.some((e: { source: string }) => e.source === 'host'));
  });

  it('9. a fresh engine load rebuilds pending flow and gives identical prices after 5 more ticks', async () => {
    engine.reserveFlow('test-crew', first.id, 'sell', 300);
    await db.doc('trades/t2').set({
      id: 't2',
      teamId: 'test-crew',
      companyId: first.id,
      side: 'sell',
      quantity: 300,
      price: 1,
      lastPrice: 1,
      impactBps: 0,
      fee: 0,
      realizedPnl: 0,
      executedAt: Date.now() + 1,
      tick: engine.state.currentTick,
      cashAfter: 0,
      sharesAfter: 700,
      clientOrderId: 'int-order-2',
    });
    const B = new GameEngine();
    await B.load();
    assert.equal(B.state.currentTick, engine.state.currentTick);
    assert.equal(B.adminMarket()[0]!.netFlow, -300, 'pending flow rebuilt from trades priced at the committed tick');
    for (const c of engine.companies()) assert.equal(B.getPrice(c.id), engine.getPrice(c.id));
    const target9 = engine.state.currentTick + 5;
    await B.tickOnce(startAt + target9 * interval + 10);
    const pricesB = engine.companies().map((c) => B.getPrice(c.id));
    await engine.tickOnce(startAt + target9 * interval + 10);
    const pricesA = engine.companies().map((c) => engine.getPrice(c.id));
    assert.deepEqual(pricesB, pricesA);
  });

  it('10. recovery without _engine/state: replayed fair values identical, next prices within a cent', async () => {
    const fairA = engine.adminMarket().map((row) => row.fairValue);
    await db.doc('_engine/state').delete();
    const C = new GameEngine();
    await C.load();
    assert.deepEqual(C.adminMarket().map((row) => row.fairValue), fairA, 'replayed fair value matches');
    for (const c of engine.companies()) assert.equal(C.getPrice(c.id), engine.getPrice(c.id));
    target10 = engine.state.currentTick + 2;
    await C.tickOnce(startAt + target10 * interval + 10);
    const pricesC = engine.companies().map((c) => C.getPrice(c.id));
    await engine.tickOnce(startAt + target10 * interval + 10);
    const diffs = engine.companies().map((c, i) => Math.abs(engine.getPrice(c.id) - pricesC[i]!));
    assert.ok(Math.max(...diffs) <= 1, `recovered prices within a cent: ${Math.max(...diffs)}`);
  });

  it('11. pause stops the clock and orders; resume shifts startAt', async () => {
    await engine.pauseGame();
    assert.equal(engine.state.phase, 'paused');
    assert.equal((await get('game/state')).phase, 'paused');
    assert.equal(
      await expectEngineError(() => engine.reserveFlow('test-crew', first.id, 'buy', 1), 'market_closed'),
      'The host has paused trading. We kept your order details, so you can place it as soon as trading resumes.',
    );
    await engine.tickOnce(startAt + (target10 + 3) * interval);
    assert.equal(engine.state.currentTick, target10, 'paused game does not tick');
    await new Promise((res) => setTimeout(res, 60));
    await engine.resumeGame();
    assert.equal(engine.state.phase, 'live');
    assert.ok(engine.state.startAt! >= startAt + 60);
    assert.equal((await get('game/state')).startAt, engine.state.startAt);
  });

  it('12. a catch-up to 125 splits price, summary and team chunks at 120; health reports ticksBehind', async () => {
    sa = engine.state.startAt!;
    await engine.tickOnce(sa + 125 * interval + 10);
    assert.equal(engine.state.currentTick, 125);
    const c0 = await get(`companies/${first.id}/history/0`);
    const c1 = await get(`companies/${first.id}/history/1`);
    assert.equal(c0.prices.length, 120);
    assert.equal(c1.prices.length, 6);
    assert.equal(c1.startTick, 120);
    assert.equal((await get('market/summary/history/1')).values.length, 6);
    assert.equal((await get('teams/test-crew/history/0')).values.length, 120);
    assert.equal((await get('teams/test-crew/history/1')).values.length, 6);
    const health = engine.health(sa + 125 * interval + 10);
    assert.deepEqual(
      { ...health, serverTime: 0 },
      { ok: true, phase: 'live', tick: 125, totalTicks: 720, serverTime: 0, lastTickAt: engine.state.lastTickAt, ticksBehind: 0 },
    );
    assert.equal(engine.health(sa + 130 * interval + 10).ticksBehind, 5);
  });

  it('13. endGame: closing marks, a reveal on every company, final standings with grades; a restart keeps the close', async () => {
    closes = Object.fromEntries(engine.companies().map((c) => [c.id, engine.closePrice(c.id)]));
    await engine.endGame();
    assert.equal(engine.state.phase, 'ended');
    const gsEnd = await get('game/state');
    assert.equal(gsEnd.phase, 'ended');
    assert.ok(gsEnd.endedAt >= t0);
    const cosSnap = await db.collection('companies').get();
    for (const d of cosSnap.docs) {
      const c = d.data();
      assert.ok(c.reveal, `reveal on ${d.id}`);
      assert.equal(c.currentPrice, closes[d.id]);
      for (const k of ['quality', 'q', 'qEff', 'surprise', 'fairValue', 'expectedReturn', 'actualReturn', 'luck']) {
        assert.ok(Number.isFinite(c.reveal[k]), `${d.id}.${k}`);
      }
      assert.ok(Math.abs(c.reveal.actualReturn - Math.log(closes[d.id]! / c.startPrice)) < 1e-12);
      assert.ok(Math.abs(c.reveal.luck - (c.reveal.actualReturn - c.reveal.expectedReturn)) < 1e-12);
    }
    const lbEnd = await get('leaderboard/current');
    assert.ok(lbEnd.final && lbEnd.final.entries.length === 2);
    assert.ok(GRADES.includes(lbEnd.final.entries[0].researchGrade));
    const tc = lbEnd.final.entries.find((e: { teamId: string }) => e.teamId === 'test-crew');
    const teamEnd = await get('teams/test-crew');
    const holdEnd = await get(`teams/test-crew/holdings/${first.id}`);
    assert.equal(teamEnd.totalValue, teamEnd.cashBalance + holdEnd.shares * closes[first.id]!);
    assert.equal(tc.totalValue, teamEnd.totalValue);
    const other = lbEnd.final.entries.find((e: { teamId: string }) => e.teamId === 'other-crew');
    assert.equal(other.researchScore, 0);
    assert.equal(other.heldAnyShares, false);
    assert.equal(tc.heldAnyShares, true);
    await engine.endGame(); // no-op
    await expectEngineError(() => engine.queueHostNews({ companyIds: [first.id], type: 'merger', magnitude: 0.1, headline: 'x', body: '' }), 'not_live');
    const D = new GameEngine();
    await D.load();
    assert.equal(D.state.phase, 'ended');
    assert.equal(D.closePrice(first.id), closes[first.id]);
  });

  it('14. createMarket(keepCrews) + reload: lobby, capital kept, crews reset, dynamic data cleared, new random seed', async () => {
    await engine.stop();
    await createMarket({ keepCrews: true });
    resetLeaderboardCache();
    await engine.reload();
    await engine.stop();
    assert.equal(engine.state.phase, 'lobby');
    assert.equal(engine.state.startingCapital, 50_000_000);
    const teamNew = await get('teams/test-crew');
    assert.equal(teamNew.cashBalance, 50_000_000);
    assert.equal(teamNew.holdingsCount, 0);
    assert.equal(teamNew.tradeCount, 0);
    assert.equal(teamNew.sessionStartRank, 0);
    assert.equal((await db.collection('teams/test-crew/holdings').get()).size, 0);
    assert.equal((await db.collection('teams/test-crew/history').get()).size, 0);
    assert.equal((await db.collection('news').get()).size, 0);
    assert.equal((await db.collection('trades').get()).size, 0);
    assert.equal((await db.collection('_teamStats').get()).size, 0);
    assert.equal(await get('_engine/state'), undefined);
    assert.equal((await get('_auth/_admin')).role, 'admin');
    assert.equal((await db.collection(`companies/${first.id}/history`).get()).size, 1);
    assert.notEqual((await get('_schedule/_meta')).seed, 'int');
  });

  it('15. a full 720-tick catch-up ends the game automatically with final standings', async () => {
    await engine.startGame();
    const sa2 = engine.state.startAt!;
    await engine.tickOnce(sa2 + 720 * engine.state.tickIntervalMs + 10);
    assert.equal(engine.state.currentTick, 720);
    assert.equal(engine.state.phase, 'ended');
    assert.ok((await get('leaderboard/current')).final);
    assert.equal((await get(`companies/${first.id}/history/5`)).prices.length, 120);
    const last = await get(`companies/${first.id}/history/6`);
    assert.equal(last.prices.length, 1); // the closing mark, once
    assert.equal(last.prices[0], engine.closePrice(first.id));
  });

  it('16. clearDynamicData(keepCrews=false) removes crews and logins but keeps _admin', async () => {
    await clearDynamicData({ keepCrews: false, startingCapital: 50_000_000 });
    assert.equal((await db.collection('teams').get()).size, 0);
    assert.deepEqual((await db.collection('_auth').get()).docs.map((d) => d.id), ['_admin']);
    assert.equal((await db.collection('companies').get()).size, 0);
  });
});
