/**
 * The live fan-out (realtime/hub.ts): what each connection receives, and — the part that matters
 * for a classroom of crews on one server — what it must never receive.
 *
 * The replies are fakes over the same `raw` stream surface Fastify hands the hub, so the frames
 * asserted here are the exact bytes a phone would read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { openStore, useStore, type Store } from '../src/store';
import {
  PING_MS,
  closeAll,
  connectionCount,
  publishNews,
  publishPhase,
  publishPortfolio,
  publishTick,
  subscribe,
  type StreamEvent,
} from '../src/realtime/hub';
import { CREW_A, CREW_B, KRKN, gameState, seedWorld } from './helpers/apiFixtures';

let store: Store;

interface FakeConnection {
  reply: FastifyReply;
  frames: string[];
  events: () => StreamEvent[];
  emit: (event: string) => void;
  headers: Record<string, unknown>;
  ended: () => boolean;
}

function fakeReply(): FakeConnection {
  const frames: string[] = [];
  const handlers = new Map<string, (() => void)[]>();
  let ended = false;
  let headers: Record<string, unknown> = {};
  const raw = {
    writeHead(_code: number, h: Record<string, unknown>) {
      headers = h;
      return raw;
    },
    write(chunk: string) {
      frames.push(chunk);
      return true;
    },
    end() {
      ended = true;
    },
    on(event: string, fn: () => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      return raw;
    },
  };
  return {
    reply: { hijack: () => undefined, raw } as unknown as FastifyReply,
    frames,
    events: () =>
      frames
        .filter((f) => f.startsWith('event:'))
        .map((f) => {
          const [line, ...rest] = f.trim().split('\n');
          return {
            type: line!.slice('event: '.length),
            data: JSON.parse(rest.join('\n').slice('data: '.length)),
          } as StreamEvent;
        }),
    emit: (event) => handlers.get(event)?.forEach((fn) => fn()),
    get headers() {
      return headers;
    },
    ended: () => ended,
  };
}

const typesOf = (c: FakeConnection): string[] => c.events().map((e) => e.type);

beforeEach(() => {
  store = openStore(':memory:');
  useStore(store);
  seedWorld(store);
});

afterEach(() => {
  closeAll();
  useStore(null);
  store.close();
  vi.useRealTimers();
});

describe('opening a stream', () => {
  it('sends SSE headers that no proxy may buffer or cache', () => {
    const c = fakeReply();
    subscribe(c.reply, { role: 'team', teamId: CREW_A });
    expect(c.headers['Content-Type']).toMatch(/text\/event-stream/);
    expect(c.headers['Cache-Control']).toMatch(/no-store/);
    expect(c.headers['X-Accel-Buffering']).toBe('no');
    expect(c.frames[0]).toMatch(/^retry: \d+/);
  });

  it('opens with a snapshot carrying only the crew’s own portfolio', () => {
    const a = fakeReply();
    subscribe(a.reply, { role: 'team', teamId: CREW_A });
    const [snapshot] = a.events();
    expect(snapshot!.type).toBe('snapshot');
    const data = (snapshot as Extract<StreamEvent, { type: 'snapshot' }>).data;
    expect(data.portfolio?.team?.id).toBe(CREW_A);
    expect(data.portfolio?.holdings.map((h) => h.companyId)).toEqual([KRKN]);
    expect(data.portfolio?.trades.every((t) => t.teamId === CREW_A)).toBe(true);
    expect(JSON.stringify(data.portfolio)).not.toContain(CREW_B);
  });

  it('hides the reveal block while the game is running, and shows it once it has ended', () => {
    const live = fakeReply();
    subscribe(live.reply, { role: 'team', teamId: CREW_A });
    const first = (live.events()[0] as Extract<StreamEvent, { type: 'snapshot' }>).data;
    expect(first.companies.some((c) => c.reveal)).toBe(false);
    expect(JSON.stringify(first)).not.toContain('fairValue');

    store.game.set(gameState('ended'));
    const after = fakeReply();
    subscribe(after.reply, { role: 'team', teamId: CREW_A });
    const ended = (after.events()[0] as Extract<StreamEvent, { type: 'snapshot' }>).data;
    expect(ended.companies.find((c) => c.id === KRKN)?.reveal?.grade).toBe('A');
  });

  it('gives the host a snapshot with no portfolio', () => {
    const host = fakeReply();
    subscribe(host.reply, { role: 'admin' });
    const data = (host.events()[0] as Extract<StreamEvent, { type: 'snapshot' }>).data;
    expect(data.portfolio).toBeNull();
  });
});

describe('fan-out', () => {
  it('sends ticks, news and phase changes to every connection', () => {
    const a = fakeReply();
    const b = fakeReply();
    const host = fakeReply();
    subscribe(a.reply, { role: 'team', teamId: CREW_A });
    subscribe(b.reply, { role: 'team', teamId: CREW_B });
    subscribe(host.reply, { role: 'admin' });
    expect(connectionCount()).toBe(3);

    publishTick({ tick: 13, serverTime: Date.now(), prices: { [KRKN]: 1010 }, market: null, leaderboard: null, game: null });
    publishNews(store.news.recent(5));
    publishPhase(gameState('paused'));

    for (const c of [a, b, host]) expect(typesOf(c)).toEqual(['snapshot', 'tick', 'news', 'phase']);
  });

  it('publishes nothing for an empty news batch', () => {
    const a = fakeReply();
    subscribe(a.reply, { role: 'team', teamId: CREW_A });
    publishNews([]);
    expect(typesOf(a)).toEqual(['snapshot']);
  });

  it('sends a portfolio only to that crew’s own connections', () => {
    const a1 = fakeReply();
    const a2 = fakeReply();
    const b = fakeReply();
    const host = fakeReply();
    subscribe(a1.reply, { role: 'team', teamId: CREW_A });
    subscribe(a2.reply, { role: 'team', teamId: CREW_A });
    subscribe(b.reply, { role: 'team', teamId: CREW_B });
    subscribe(host.reply, { role: 'admin' });

    publishPortfolio(CREW_A);

    expect(typesOf(a1)).toEqual(['snapshot', 'portfolio']);
    expect(typesOf(a2)).toEqual(['snapshot', 'portfolio']);
    expect(typesOf(b)).toEqual(['snapshot']);
    expect(typesOf(host)).toEqual(['snapshot']);
    const payload = a1.events()[1] as Extract<StreamEvent, { type: 'portfolio' }>;
    expect(payload.data.team?.id).toBe(CREW_A);
    expect(JSON.stringify(payload.data)).not.toContain(CREW_B);
  });

  it('reads nothing when the crew has no connection open', () => {
    const spy = vi.spyOn(store.crews, 'get');
    publishPortfolio(CREW_A);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('closing', () => {
  it('drops a connection when the socket closes, and stops sending to it', () => {
    const a = fakeReply();
    const b = fakeReply();
    subscribe(a.reply, { role: 'team', teamId: CREW_A });
    subscribe(b.reply, { role: 'team', teamId: CREW_B });

    a.emit('close');
    expect(connectionCount()).toBe(1);
    publishPhase(gameState('ended'));
    expect(typesOf(a)).toEqual(['snapshot']);
    expect(typesOf(b)).toEqual(['snapshot', 'phase']);
  });

  it('returns an unsubscribe that ends the response once', () => {
    const a = fakeReply();
    const stop = subscribe(a.reply, { role: 'team', teamId: CREW_A });
    stop();
    stop();
    expect(a.ended()).toBe(true);
    expect(connectionCount()).toBe(0);
  });

  it('closeAll drops everyone', () => {
    subscribe(fakeReply().reply, { role: 'team', teamId: CREW_A });
    subscribe(fakeReply().reply, { role: 'admin' });
    closeAll();
    expect(connectionCount()).toBe(0);
  });
});

describe('heartbeat', () => {
  it('pings every open connection on a timer and stops when the last one leaves', () => {
    vi.useFakeTimers();
    const a = fakeReply();
    const stop = subscribe(a.reply, { role: 'team', teamId: CREW_A });
    vi.advanceTimersByTime(PING_MS + 1);
    expect(typesOf(a)).toEqual(['snapshot', 'ping']);
    stop();
    vi.advanceTimersByTime(PING_MS * 3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
