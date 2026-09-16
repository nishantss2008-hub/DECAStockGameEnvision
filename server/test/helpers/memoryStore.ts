/**
 * In-memory `Store` for the engine unit tests: the same contract `store/index.ts`
 * implements on SQLite, with no driver, no file and no network.
 *
 * Extras the tests drive it with:
 *   - `tx` is snapshot-based, so a throw inside it rolls the whole transaction back
 *     exactly like an aborted SQLite transaction (and nesting is flattened).
 *   - `commits` / `txWrites` record what each committed transaction touched, so a test
 *     can assert that a tick is ONE transaction and that it writes only its own tables.
 *   - `failNextCommitMatching` aborts the next transaction that touches a matching key.
 *   - `dump()` / `restore()` snapshot the database for the crash-and-resume tests.
 */

import {
  effectiveQuality,
  surpriseFor,
} from '../../src/engine/model';
import { generateMarket } from '../../src/seed/generateMarket';
import { INDEX_BASE, SEED_KEY, indexQuote, lobbyState, marketBreadth, normalizeSettings } from '../../src/engine/loopHelpers';
import type { Store } from '../../src/store';
import type {
  CompanySecret,
  CrewRow,
  EngineStateRow,
  FundSecret,
  LogEntry,
  NewCrew,
  PricePoint,
  StoredScheduledEvent,
  ValuePoint,
} from '../../src/store/types';

/** A `price_history` row. */
interface PriceRow {
  companyId: string;
  tick: number;
  price: number;
  volume: number;
}
import type { ScheduledEvent } from '../../src/engine/news';
import type {
  Company,
  Fund,
  Fundamentals,
  GameSettings,
  GameState,
  Holding,
  Leaderboard,
  MarketSummary,
  NewsEvent,
  OrderRecord,
  Team,
  Trade,
} from '@deca/shared';

interface Tables {
  meta: Record<string, string>;
  game: GameState | null;
  engine: EngineStateRow | null;
  companies: Record<string, Company>;
  fundamentals: Record<string, Fundamentals>;
  secrets: Record<string, CompanySecret>;
  funds: Record<string, Fund>;
  fundSecrets: Record<string, FundSecret>;
  /** companyId → tick → point */
  history: Record<string, Record<number, PricePoint>>;
  market: MarketSummary | null;
  marketHistory: Record<number, number>;
  crews: Record<string, CrewRow>;
  /** crewId → companyId → holding */
  holdings: Record<string, Record<string, Holding>>;
  /** crewId → tick → value */
  crewHistory: Record<string, Record<number, number>>;
  crewStats: Record<string, { exposure: number; weight: number }>;
  trades: Trade[];
  orders: OrderRecord[];
  news: Record<string, NewsEvent>;
  newsSchedule: ScheduledEvent[];
  firedRows: number[];
  leaderboard: Leaderboard | null;
  audit: LogEntry[];
}

function emptyTables(): Tables {
  return {
    meta: {},
    game: null,
    engine: null,
    companies: {},
    fundamentals: {},
    secrets: {},
    funds: {},
    fundSecrets: {},
    history: {},
    market: null,
    marketHistory: {},
    crews: {},
    holdings: {},
    crewHistory: {},
    crewStats: {},
    trades: [],
    orders: [],
    news: {},
    newsSchedule: [],
    firedRows: [],
    leaderboard: null,
    audit: [],
  };
}

const clone = <T>(x: T): T => structuredClone(x);

export class MemoryStore implements Store {
  t: Tables = emptyTables();

  /** No SQLite handle: touching it from game code is a bug the tests should surface. */
  get raw(): Store['raw'] {
    throw new Error('MemoryStore has no better-sqlite3 handle');
  }

  /** Keys written by each committed transaction, oldest first. */
  commits: string[][] = [];
  /** Keys written by the transaction in progress. */
  txWrites: string[] = [];
  /** Abort the next transaction that writes a matching key (cleared when it fires). */
  failNextCommitMatching: RegExp | null = null;

  private depth = 0;
  private snapshot: Tables | null = null;

  reset(): void {
    this.t = emptyTables();
    this.commits = [];
    this.txWrites = [];
    this.failNextCommitMatching = null;
    this.depth = 0;
    this.snapshot = null;
  }

  dump(): Tables {
    return clone(this.t);
  }

  restore(snapshot: Tables): void {
    this.t = clone(snapshot);
    this.commits = [];
    this.txWrites = [];
  }

  private w(key: string): void {
    this.txWrites.push(key);
  }

  tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn(); // nested: part of the outer transaction
    this.depth = 1;
    this.snapshot = clone(this.t);
    this.txWrites = [];
    try {
      const out = fn();
      const fail = this.failNextCommitMatching;
      if (fail && this.txWrites.some((k) => fail.test(k))) {
        this.failNextCommitMatching = null;
        throw new Error(`injected commit failure (${fail})`);
      }
      this.commits.push([...this.txWrites]);
      return out;
    } catch (err) {
      this.t = this.snapshot!;
      throw err;
    } finally {
      this.depth = 0;
      this.snapshot = null;
    }
  }

  /** Writes made outside an explicit tx still behave atomically per call. */
  private write<T>(key: string, fn: () => T): T {
    return this.tx(() => {
      this.w(key);
      return fn();
    });
  }

  meta = {
    get: (k: string): string | null => this.t.meta[k] ?? null,
    set: (k: string, v: string): void => {
      this.write(`meta/${k}`, () => {
        this.t.meta[k] = v;
      });
    },
    remove: (k: string): void => {
      this.write(`meta/${k}`, () => {
        delete this.t.meta[k];
      });
    },
  };

  game = {
    get: (): GameState | null => (this.t.game ? clone(this.t.game) : null),
    set: (s: GameState): void => {
      this.write('game_state', () => {
        this.t.game = clone(s);
      });
    },
  };

  engine = {
    get: (): EngineStateRow | null => (this.t.engine ? clone(this.t.engine) : null),
    set: (s: EngineStateRow): void => {
      this.write('engine_state', () => {
        this.t.engine = clone(s);
      });
    },
  };

  companies = {
    all: (): Company[] => Object.values(this.t.companies).map(clone),
    get: (id: string): Company | null => (this.t.companies[id] ? clone(this.t.companies[id]!) : null),
    upsertMany: (cs: Company[]): void => {
      this.tx(() => {
        for (const c of cs) {
          this.w(`companies/${c.id}`);
          this.t.companies[c.id] = clone(c);
        }
      });
    },
    update: (id: string, patch: Partial<Company>): void => {
      this.write(`companies/${id}`, () => {
        const row = this.t.companies[id];
        if (row) Object.assign(row, clone(patch));
      });
    },
  };

  fundamentals = {
    all: (): Record<string, Fundamentals> => clone(this.t.fundamentals),
    get: (id: string): Fundamentals | null => (this.t.fundamentals[id] ? clone(this.t.fundamentals[id]!) : null),
    upsertMany: (f: Record<string, Fundamentals>): void => {
      this.tx(() => {
        for (const [id, v] of Object.entries(f)) {
          this.w(`fundamentals/${id}`);
          this.t.fundamentals[id] = clone(v);
        }
      });
    },
  };

  secrets = {
    all: (): Record<string, CompanySecret> => clone(this.t.secrets),
    get: (id: string): CompanySecret | null => (this.t.secrets[id] ? clone(this.t.secrets[id]!) : null),
    upsertMany: (s: Record<string, CompanySecret>): void => {
      this.tx(() => {
        for (const [id, v] of Object.entries(s)) {
          this.w(`company_secret/${id}`);
          this.t.secrets[id] = clone(v);
        }
      });
    },
  };

  funds = {
    all: (): Fund[] => Object.values(this.t.funds).map(clone),
    get: (id: string): Fund | null => (this.t.funds[id] ? clone(this.t.funds[id]!) : null),
    upsertMany: (fs: Fund[]): void => {
      this.tx(() => {
        for (const f of fs) {
          this.w(`funds/${f.id}`);
          this.t.funds[f.id] = clone(f);
        }
      });
    },
    update: (id: string, patch: Partial<Fund>): void => {
      this.write(`funds/${id}`, () => {
        const row = this.t.funds[id];
        if (row) Object.assign(row, clone(patch));
      });
    },
  };

  fundSecrets = {
    all: (): Record<string, FundSecret> => clone(this.t.fundSecrets),
    get: (id: string): FundSecret | null => (this.t.fundSecrets[id] ? clone(this.t.fundSecrets[id]!) : null),
    upsertMany: (s: Record<string, FundSecret>): void => {
      this.tx(() => {
        for (const [id, v] of Object.entries(s)) {
          this.w(`fund_secret/${id}`);
          this.t.fundSecrets[id] = clone(v);
        }
      });
    },
  };

  history = {
    append: (rows: PriceRow[]): void => {
      this.tx(() => {
        for (const r of rows) {
          this.w(`price_history/${r.companyId}`);
          const byTick = (this.t.history[r.companyId] ??= {});
          byTick[r.tick] = { tick: r.tick, price: r.price, volume: r.volume };
        }
      });
    },
    range: (companyId: string, from: number, to: number): PricePoint[] => {
      const byTick = this.t.history[companyId] ?? {};
      return Object.values(byTick)
        .filter((p) => p.tick >= from && p.tick <= to)
        .sort((a, b) => a.tick - b.tick)
        .map(clone);
    },
    latestTick: (companyId: string): number => {
      const ticks = Object.keys(this.t.history[companyId] ?? {}).map(Number);
      return ticks.length > 0 ? Math.max(...ticks) : -1;
    },
  };

  market = {
    get: (): MarketSummary | null => (this.t.market ? clone(this.t.market) : null),
    set: (m: MarketSummary): void => {
      this.write('market_summary', () => {
        this.t.market = clone(m);
      });
    },
    appendHistory: (tick: number, value: number): void => {
      this.write('market_history', () => {
        this.t.marketHistory[tick] = value;
      });
    },
    historyRange: (from: number, to: number): ValuePoint[] =>
      Object.entries(this.t.marketHistory)
        .map(([tick, value]) => ({ tick: Number(tick), value }))
        .filter((p) => p.tick >= from && p.tick <= to)
        .sort((a, b) => a.tick - b.tick),
  };

  crews = {
    all: (): Team[] => Object.values(this.t.crews).map((c) => this.publicCrew(c)),
    get: (id: string): Team | null => (this.t.crews[id] ? this.publicCrew(this.t.crews[id]!) : null),
    byName: (name: string): Team | null => {
      const row = Object.values(this.t.crews).find((c) => c.name === name);
      return row ? this.publicCrew(row) : null;
    },
    create: (row: NewCrew): void => {
      this.write(`crews/${row.id}`, () => {
        this.t.crews[row.id] = {
          id: row.id,
          name: row.name,
          cashBalance: row.startingCapital,
          totalValue: row.startingCapital,
          rank: 0,
          realizedPnl: 0,
          feesPaid: 0,
          tradeCount: 0,
          tradingDisabled: false,
          sessionOpenValue: row.startingCapital,
          holdingsCount: 0,
          createdAt: row.createdAt ?? Date.now(),
          passwordHash: row.passwordHash,
          tokenVersion: 1,
          // Design §6: a new crew has not met the market yet. `clearDynamic` keeps this across a
          // new game with keepCrews (the spread below), exactly as the SQL store does.
          introCompletedAt: null,
        };
      });
    },
    update: (id: string, patch: Partial<CrewRow>): void => {
      this.write(`crews/${id}`, () => {
        const row = this.t.crews[id];
        if (row) Object.assign(row, clone(patch));
      });
    },
    remove: (id: string): void => {
      this.write(`crews/${id}`, () => {
        delete this.t.crews[id];
        delete this.t.holdings[id];
        delete this.t.crewHistory[id];
        delete this.t.crewStats[id];
        // The ledger goes with the crew, exactly as the SQL store's cascade does.
        this.t.trades = this.t.trades.filter((t) => t.teamId !== id);
        this.t.orders = this.t.orders.filter((o) => o.teamId !== id);
      });
    },
    passwordHash: (id: string): string | null => this.t.crews[id]?.passwordHash ?? null,
    tokenVersion: (id: string): number | null => this.t.crews[id]?.tokenVersion ?? null,
    bumpTokenVersion: (id: string): number =>
      this.write(`crews/${id}`, () => {
        const row = this.t.crews[id];
        if (!row) return 0;
        row.tokenVersion += 1;
        return row.tokenVersion;
      }),
  };

  private publicCrew(row: CrewRow): Team {
    const { passwordHash: _p, tokenVersion: _t, ...team } = clone(row);
    return team;
  }

  holdings = {
    forCrew: (id: string): Holding[] => Object.values(this.t.holdings[id] ?? {}).map(clone),
    get: (crewId: string, companyId: string): Holding | null => {
      const h = this.t.holdings[crewId]?.[companyId];
      return h ? clone(h) : null;
    },
    upsert: (crewId: string, h: Holding): void => {
      this.write(`holdings/${crewId}`, () => {
        (this.t.holdings[crewId] ??= {})[h.companyId] = clone(h);
      });
    },
    remove: (crewId: string, companyId: string): void => {
      this.write(`holdings/${crewId}`, () => {
        delete this.t.holdings[crewId]?.[companyId];
      });
    },
    all: (): Record<string, Holding[]> =>
      Object.fromEntries(Object.entries(this.t.holdings).map(([id, byCompany]) => [id, Object.values(byCompany).map(clone)])),
  };

  crewHistory = {
    append: (rows: { crewId: string; tick: number; value: number }[]): void => {
      this.tx(() => {
        for (const r of rows) {
          this.w(`crew_history/${r.crewId}`);
          (this.t.crewHistory[r.crewId] ??= {})[r.tick] = r.value;
        }
      });
    },
    range: (crewId: string, from: number, to: number): ValuePoint[] =>
      Object.entries(this.t.crewHistory[crewId] ?? {})
        .map(([tick, value]) => ({ tick: Number(tick), value }))
        .filter((p) => p.tick >= from && p.tick <= to)
        .sort((a, b) => a.tick - b.tick),
    series: (crewId: string): number[] => {
      const byTick = this.t.crewHistory[crewId] ?? {};
      const ticks = Object.keys(byTick).map(Number);
      if (ticks.length === 0) return [];
      const last = Math.max(...ticks);
      const out: number[] = [];
      for (let t = 0; t <= last; t++) out.push(byTick[t] ?? out[t - 1] ?? byTick[Math.min(...ticks)]!);
      return out;
    },
  };

  crewStats = {
    add: (crewId: string, exposure: number, weight: number): void => {
      this.write(`crew_stats/${crewId}`, () => {
        const row = (this.t.crewStats[crewId] ??= { exposure: 0, weight: 0 });
        row.exposure += exposure;
        row.weight += weight;
      });
    },
    get: (crewId: string): { exposure: number; weight: number } => clone(this.t.crewStats[crewId] ?? { exposure: 0, weight: 0 }),
  };

  trades = {
    insert: (t: Trade): void => {
      this.write(`trades/${t.id}`, () => {
        this.t.trades.push(clone(t));
      });
    },
    forCrew: (id: string, limit: number): Trade[] =>
      this.t.trades
        .filter((t) => t.teamId === id)
        .sort((a, b) => b.executedAt - a.executedAt)
        .slice(0, limit)
        .map(clone),
    sinceTick: (tick: number): Trade[] => this.t.trades.filter((t) => t.tick >= tick).map(clone),
    recent: (limit: number): Trade[] => [...this.t.trades].sort((a, b) => b.executedAt - a.executedAt).slice(0, limit).map(clone),
  };

  orders = {
    insert: (o: OrderRecord): void => {
      this.write(`orders/${o.id}`, () => {
        this.t.orders.push(clone(o));
      });
    },
    byClientId: (crewId: string, clientOrderId: string): OrderRecord | null => {
      const o = this.t.orders.find((x) => x.teamId === crewId && x.clientOrderId === clientOrderId);
      return o ? clone(o) : null;
    },
    forCrew: (id: string, limit: number): OrderRecord[] =>
      this.t.orders
        .filter((o) => o.teamId === id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(clone),
  };

  news = {
    insert: (events: NewsEvent[]): void => {
      this.tx(() => {
        for (const n of events) {
          this.w(`news/${n.id}`);
          this.t.news[n.id] = clone(n);
        }
      });
    },
    recent: (limit: number): NewsEvent[] =>
      Object.values(this.t.news)
        .sort((a, b) => b.firedAt - a.firedAt)
        .slice(0, limit)
        .map(clone),
    forCompany: (id: string, limit: number): NewsEvent[] =>
      Object.values(this.t.news)
        .filter((n) => n.companyIds.includes(id))
        .sort((a, b) => b.firedAt - a.firedAt)
        .slice(0, limit)
        .map(clone),
  };

  newsSchedule = {
    set: (events: ScheduledEvent[]): void => {
      this.write('news_schedule', () => {
        this.t.newsSchedule = clone(events);
      });
    },
    all: (): StoredScheduledEvent[] =>
      clone(this.t.newsSchedule).map((e, i) => ({ ...e, rowId: i + 1, fired: this.t.firedRows.includes(i + 1) })),
    markFired: (ids: number[]): void => {
      this.write('news_schedule', () => {
        this.t.firedRows = [...new Set([...this.t.firedRows, ...ids])];
      });
    },
  };

  leaderboard = {
    get: (): Leaderboard | null => (this.t.leaderboard ? clone(this.t.leaderboard) : null),
    set: (l: Leaderboard): void => {
      this.write('leaderboard', () => {
        this.t.leaderboard = clone(l);
      });
    },
  };

  audit = {
    add: (action: string, actor: string, payload: unknown): void => {
      this.write('audit_log', () => {
        this.t.audit.push({ action, actor, payload: (payload ?? {}) as Record<string, unknown>, timestamp: Date.now() });
      });
    },
    recent: (limit: number): LogEntry[] => [...this.t.audit].slice(-limit).map(clone),
  };

  clearDynamic(opts: { keepCrews: boolean; startingCapital: number }): void {
    this.tx(() => {
      const game = this.t.game;
      const crews = this.t.crews;
      this.t = emptyTables();
      this.t.game = game;
      if (opts.keepCrews) {
        for (const [id, c] of Object.entries(crews)) {
          this.t.crews[id] = {
            ...c,
            cashBalance: opts.startingCapital,
            totalValue: opts.startingCapital,
            rank: 0,
            realizedPnl: 0,
            feesPaid: 0,
            tradeCount: 0,
            sessionOpenValue: opts.startingCapital,
            holdingsCount: 0,
          };
        }
      }
      this.w('clear_dynamic');
    });
  }

  close(): void {
    /* nothing to close */
  }
}

/**
 * The lobby market `services/market.ts` creates, written straight into a store: companies,
 * fundamentals, secrets, the tick-0 price rows, the market summary and a lobby game state.
 * Kept here so the engine tests never depend on the market service.
 */
export function seedMarketInto(store: MemoryStore, seed: string, settings?: Partial<GameSettings>): void {
  const resolved = normalizeSettings(settings);
  const market = generateMarket(seed);
  const now = Date.now();
  const companies: Company[] = [];
  const fundamentals: Record<string, Fundamentals> = {};
  const secrets: Record<string, CompanySecret> = {};
  const funds: Fund[] = [];
  const fundSecrets: Record<string, FundSecret> = {};
  const rows: PriceRow[] = [];
  const sectors = new Set<string>();

  for (const g of market.companies) {
    const { company, quality } = g;
    companies.push(company);
    fundamentals[company.id] = g.fundamentals;
    secrets[company.id] = {
      companyId: company.id,
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      sharesOutstanding: company.sharesOutstanding,
      q: quality.q,
      qEff: effectiveQuality(quality.q, surpriseFor(seed, company.id)),
      surprise: surpriseFor(seed, company.id),
      quality: quality.score,
      grade: quality.grade,
      pillars: quality.pillars,
      idioVol: g.idioVol,
      beta: company.beta,
      adv: company.adv,
      startPriceCents: g.startPriceCents,
    };
    rows.push({ companyId: company.id, tick: 0, price: g.startPriceCents, volume: 0 });
    sectors.add(company.sector);
  }

  for (const g of market.funds) {
    funds.push(g.fund);
    fundSecrets[g.fund.id] = g.secret;
    rows.push({ companyId: g.fund.id, tick: 0, price: g.fund.startPrice, volume: 0 });
  }

  store.tx(() => {
    store.meta.set(SEED_KEY, seed);
    store.companies.upsertMany(companies);
    store.fundamentals.upsertMany(fundamentals);
    store.secrets.upsertMany(secrets);
    store.funds.upsertMany(funds);
    store.fundSecrets.upsertMany(fundSecrets);
    store.history.append(rows);
    store.market.set({
      lastTick: 0,
      updatedAt: now,
      composite: indexQuote(INDEX_BASE, INDEX_BASE),
      sectors: Object.fromEntries([...sectors].map((s) => [s, indexQuote(INDEX_BASE, INDEX_BASE)])),
      breadth: marketBreadth(companies.map((c) => ({ ...c }))),
    });
    store.market.appendHistory(0, INDEX_BASE);
    store.game.set(lobbyState(resolved, now));
  });
  store.commits = [];
}
