/**
 * GameEngine — the always-on authority that advances the market.
 *
 * Holds the hidden state in memory (intrinsic paths, per-company volatility, the
 * news schedule, the shared order-flow book) and, each tick, computes the new
 * realized price for every company and persists it to Firestore. The intrinsic
 * paths + news are deterministic from the seed and the per-tick noise is seeded by
 * (companyId, tick), so the engine is fully RESUME-SAFE: after any restart it reads
 * the persisted clock and continues exactly where it should be.
 *
 * The same engine instance is shared with the trading service, which feeds buy/sell
 * pressure into the order-flow book — that's how trade volume moves prices.
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { Archetype, GameState, NewsEvent } from '@deca/shared';
import { ENGINE_PARAMS, TICK_INTERVAL_MS, TOTAL_TICKS, CURRENCY, STARTING_CAPITAL } from '@deca/shared';
import { db } from '../firebase';
import { config } from '../config';
import { Prng, deriveSeed } from '../lib/prng';
import { generateIntrinsicPath, companySigma } from './intrinsic';
import { OrderFlowBook } from './orderflow';
import { stepPrice } from './engine';
import { resumeTick, computeEndAt } from './state';
import { NewsScheduler } from '../news/scheduler';
import type { ScheduledNews } from '../news/schedule';
import { recomputeLeaderboard } from '../services/leaderboard';
import { auditLog } from '../lib/logger';

const DAY_TICKS = Math.floor((24 * 60 * 60 * 1000) / TICK_INTERVAL_MS);

interface CompanyRuntime {
  id: string;
  sharesOutstanding: number;
  startPriceCents: number;
  archetype: Archetype;
  path: number[];
  sigma: number;
}

export class GameEngine {
  private companies = new Map<string, CompanyRuntime>();
  private prices = new Map<string, number>();
  private dayOpen = new Map<string, number>();
  private orderFlow = new OrderFlowBook();
  private scheduler = new NewsScheduler([]);

  phase: GameState['phase'] = 'lobby';
  startAt: number | null = null;
  endAt: number | null = null;
  currentTick = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  /** Load all state from Firestore and rebuild the in-memory hidden market. */
  async load(): Promise<void> {
    const stateSnap = await db.doc('game/state').get();
    const state = stateSnap.data() as GameState | undefined;
    if (state) {
      this.phase = state.phase;
      this.startAt = state.startAt;
      this.endAt = state.endAt;
      this.currentTick = state.currentTick ?? 0;
    }

    const [companiesSnap, scheduleSnap, newsDoc] = await Promise.all([
      db.collection('companies').get(),
      db.collection('_schedule').get(),
      db.doc('_schedule/_news').get(),
    ]);

    const scheduleById = new Map<string, { archetype: Archetype; startPriceCents: number }>();
    scheduleSnap.forEach((d) => {
      if (d.id === '_news') return;
      const data = d.data() as { archetype: Archetype; startPriceCents: number };
      scheduleById.set(d.id, data);
    });

    companiesSnap.forEach((doc) => {
      const c = doc.data() as { sharesOutstanding: number; currentPrice: number; prevClose?: number };
      const sched = scheduleById.get(doc.id);
      if (!sched) return;
      const path = generateIntrinsicPath(config.seed, doc.id, sched.archetype);
      this.companies.set(doc.id, {
        id: doc.id,
        sharesOutstanding: c.sharesOutstanding,
        startPriceCents: sched.startPriceCents,
        archetype: sched.archetype,
        path,
        sigma: companySigma(config.seed, doc.id, sched.archetype, ENGINE_PARAMS.sigmaBase),
      });
      this.prices.set(doc.id, c.currentPrice);
      this.dayOpen.set(doc.id, c.prevClose ?? c.currentPrice);
    });

    const newsData = newsDoc.data() as { events?: ScheduledNews[] } | undefined;
    this.scheduler = new NewsScheduler(newsData?.events ?? []);
  }

  /** Begin the tick interval. Safe to call once after load(). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tickOnce();
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getPrice(id: string): number {
    return this.prices.get(id) ?? 0;
  }

  /** Trade pressure from the trading service flows in here. */
  recordOrderFlow(companyId: string, side: 'buy' | 'sell', shares: number): void {
    this.orderFlow.record(companyId, side, shares);
  }

  // ── Admin game-control ────────────────────────────────────────────────────
  async startGame(): Promise<void> {
    const now = Date.now();
    this.phase = 'live';
    this.startAt = now;
    this.endAt = computeEndAt(now, TICK_INTERVAL_MS);
    this.currentTick = 0;
    for (const [id, c] of this.companies) this.dayOpen.set(id, this.prices.get(id) ?? c.startPriceCents);
    await this.persistState();
    await auditLog('game.start', 'admin', { startAt: now, endAt: this.endAt });
  }

  async pauseGame(): Promise<void> {
    if (this.phase !== 'live') return;
    this.phase = 'paused';
    (this as { pausedAt?: number }).pausedAt = Date.now();
    await this.persistState();
    await auditLog('game.pause', 'admin', { tick: this.currentTick });
  }

  async resumeGame(): Promise<void> {
    if (this.phase !== 'paused') return;
    const pausedAt = (this as { pausedAt?: number }).pausedAt ?? Date.now();
    const delta = Date.now() - pausedAt;
    if (this.startAt != null) this.startAt += delta;
    if (this.endAt != null) this.endAt += delta;
    this.phase = 'live';
    await this.persistState();
    await auditLog('game.resume', 'admin', { tick: this.currentTick, delta });
  }

  async endGame(): Promise<void> {
    this.phase = 'ended';
    await this.persistState();
    // Post-game reveal: expose each company's hidden archetype + final intrinsic value.
    const batch = db.batch();
    for (const [id, c] of this.companies) {
      batch.update(db.doc(`companies/${id}`), {
        revealedArchetype: c.archetype,
        revealedIntrinsic: Math.round(c.startPriceCents * (c.path[TOTAL_TICKS] ?? 1)),
      });
    }
    await batch.commit();
    await auditLog('game.end', 'admin', { tick: this.currentTick });
  }

  async fireManualNews(event: Omit<ScheduledNews, 'tick'>): Promise<void> {
    this.scheduler.queueManual({ ...event, tick: this.currentTick + 1 });
    await auditLog('news.manual', 'admin', { ...event });
  }

  private async persistState(): Promise<void> {
    const state: GameState = {
      phase: this.phase,
      startAt: this.startAt,
      endAt: this.endAt,
      currentTick: this.currentTick,
      tickIntervalMs: TICK_INTERVAL_MS,
      serverTime: Date.now(),
      currency: { name: CURRENCY.name, symbol: CURRENCY.symbol },
      startingCapital: STARTING_CAPITAL,
    };
    await db.doc('game/state').set(state, { merge: true });
  }

  // ── The tick ──────────────────────────────────────────────────────────────
  private async tickOnce(): Promise<void> {
    if (this.ticking) return;
    if (this.phase !== 'live' || this.startAt == null) return;
    this.ticking = true;
    try {
      const now = Date.now();
      const target = resumeTick(now, this.startAt, TICK_INTERVAL_MS);
      if (target <= this.currentTick) {
        await db.doc('game/state').update({ serverTime: now });
        return;
      }

      const firedNews: NewsEvent[] = [];
      const writeHistory = target - this.currentTick <= 8; // skip per-tick history during big catch-up

      const batch = db.batch();
      for (let t = this.currentTick + 1; t <= target; t++) {
        const events = this.scheduler.eventsAtTick(t).concat(t === target ? this.scheduler.takePending() : []);
        const jump = new Map<string, number>();
        for (const ev of events) {
          for (const cid of ev.companyIds) jump.set(cid, (jump.get(cid) ?? 0) + ev.magnitude);
        }

        const isNewDay = t % DAY_TICKS === 0;
        for (const c of this.companies.values()) {
          const prev = this.prices.get(c.id) ?? c.startPriceCents;
          const idx = Math.min(t, c.path.length - 1);
          const intrinsicCents = Math.round(c.startPriceCents * (c.path[idx] ?? 1));
          const flowImpact = this.orderFlow.step(c.id, c.sharesOutstanding);
          const rng = new Prng(deriveSeed(config.seed, `noise:${c.id}:${t}`));
          const price = stepPrice({
            prevCents: prev,
            intrinsicCents,
            sigma: c.sigma,
            flowImpact,
            newsJumpFrac: jump.get(c.id) ?? 0,
            rng,
          });
          this.prices.set(c.id, price);
          if (isNewDay) this.dayOpen.set(c.id, price);
          const volume = this.orderFlow.drainVolume(c.id);

          if (writeHistory) {
            batch.set(db.doc(`companies/${c.id}/priceHistory/${t}`), {
              tick: t,
              timestamp: this.startAt + t * TICK_INTERVAL_MS,
              price,
              volume,
            });
          }
        }

        // Record fired events for posting once (use the tick's timestamp).
        for (const ev of events) {
          firedNews.push({
            id: `${ev.impact}-${t}-${ev.companyIds[0] ?? 'mkt'}`,
            headline: ev.headline,
            body: ev.body,
            companyIds: ev.companyIds,
            impact: ev.impact,
            magnitude: ev.magnitude,
            firedAt: this.startAt + t * TICK_INTERVAL_MS,
          });
        }
      }

      // Persist company snapshots (current price, day change, market cap).
      for (const c of this.companies.values()) {
        const price = this.prices.get(c.id) ?? c.startPriceCents;
        const open = this.dayOpen.get(c.id) ?? price;
        batch.update(db.doc(`companies/${c.id}`), {
          currentPrice: price,
          prevClose: open,
          dayChange: open > 0 ? (price - open) / open : 0,
          marketCap: price * c.sharesOutstanding,
        });
      }

      // Post fired news.
      for (const n of firedNews) {
        batch.set(db.doc(`news/${n.id}`), n);
      }

      this.currentTick = target;
      batch.set(db.doc('game/state'), { currentTick: target, serverTime: now }, { merge: true });
      await batch.commit();

      for (const n of firedNews) {
        await auditLog('news.fired', 'engine', { id: n.id, impact: n.impact, magnitude: n.magnitude });
      }

      await recomputeLeaderboard(this);

      if (target >= TOTAL_TICKS || (this.endAt != null && now >= this.endAt)) {
        await this.endGame();
      }
    } catch (err) {
      console.error('[engine] tick failed', err);
    } finally {
      this.ticking = false;
    }
  }
}

/** Process-wide singleton. */
export const engine = new GameEngine();
