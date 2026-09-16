/**
 * The live stream over a real socket: the server listens on a real port and the tests read
 * `GET /api/stream` with `fetch`, exactly as the web client does (SSE frames off a ReadableStream).
 *
 * The point of the suite is isolation. Every crew in a classroom holds one of these connections at
 * the same time, so a `portfolio` event must reach ONE crew and the opening snapshot must carry
 * that crew's money and nobody else's — while `tick`, `news` and `phase` reach everyone.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GAME_LENGTH_OPTIONS_MS } from '@deca/shared';
import { buildServer } from '../../src/index';
import { engine } from '../../src/engine/loop';
import { store } from '../../src/store';
import { CREW_PASSWORD, HOST_PASSWORD, bearer, login, runTicks, seedWorld, tempDb } from './helpers';

const db = tempDb('stream');

interface Frame {
  type: string;
  data: unknown;
}

/** One open SSE connection, with the frames it has received so far. */
interface Live {
  frames: Frame[];
  types: () => string[];
  waitFor: (type: string, timeoutMs?: number) => Promise<Frame>;
  close: () => void;
}

/** Opens `/api/stream` and parses the `event:`/`data:` frames as they arrive. */
async function openStream(url: string, init: RequestInit = {}): Promise<Live> {
  const controller = new AbortController();
  const res = await fetch(url, { ...init, signal: controller.signal });
  if (res.status !== 200) {
    controller.abort();
    throw new Error(`stream refused: HTTP ${res.status}`);
  }
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  expect(res.headers.get('cache-control')).toMatch(/no-store/);
  expect(res.headers.get('x-accel-buffering')).toBe('no');

  const frames: Frame[] = [];
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let cut = buffer.indexOf('\n\n');
        while (cut !== -1) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const type = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (type && data !== undefined) frames.push({ type, data: JSON.parse(data) });
          cut = buffer.indexOf('\n\n');
        }
      }
    } catch {
      /* the connection was closed by the test */
    }
  })();

  return {
    frames,
    types: () => frames.map((f) => f.type),
    async waitFor(type, timeoutMs = 4_000): Promise<Frame> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = frames.find((f) => f.type === type);
        if (found) return found;
        if (Date.now() > deadline) throw new Error(`no "${type}" frame arrived (saw ${frames.map((f) => f.type).join(', ')})`);
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    close: () => controller.abort(),
  };
}

let app: FastifyInstance;
let base = '';
let saltwind = '';
let blackfin = '';
let host = '';
let krkn = '';

beforeAll(async () => {
  await seedWorld({
    seed: 'integration-stream-seed',
    crews: ['Saltwind', 'Blackfin'],
    settings: { gameLengthMs: GAME_LENGTH_OPTIONS_MS[0]!, startingCapital: 1_000_000_00 },
  });
  await engine.load();
  app = await buildServer({ logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  saltwind = await login(app, 'Saltwind', CREW_PASSWORD);
  blackfin = await login(app, 'Blackfin', CREW_PASSWORD);
  host = await login(app, 'admin', HOST_PASSWORD);
  krkn = store.companies.all()[0]!.id;
  await engine.startGame();
});

afterAll(async () => {
  await engine.stop();
  await app?.close();
  db.cleanup();
});

async function order(token: string, side: 'buy' | 'sell', quantity: number, clientOrderId: string): Promise<Response> {
  return fetch(`${base}/orders`, {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify({ companyId: krkn, side, quantity, clientOrderId }),
  });
}

describe('the live stream', () => {
  it('refuses a connection without a valid token, and takes one from ?token= for EventSource', async () => {
    await expect(openStream(`${base}/api/stream`)).rejects.toThrow(/HTTP 401/);
    await expect(openStream(`${base}/api/stream?token=nonsense`)).rejects.toThrow(/HTTP 401/);

    const live = await openStream(`${base}/api/stream?token=${encodeURIComponent(saltwind)}`);
    const snapshot = await live.waitFor('snapshot');
    expect((snapshot.data as { portfolio: { team: { id: string } } }).portfolio.team.id).toBe('saltwind');
    live.close();
  });

  it('opens with a snapshot carrying that crew’s own portfolio and no hidden field', async () => {
    const live = await openStream(`${base}/api/stream`, { headers: bearer(blackfin) });
    const snapshot = await live.waitFor('snapshot');
    const body = JSON.stringify(snapshot.data);

    expect((snapshot.data as { portfolio: { team: { id: string } } }).portfolio.team.id).toBe('blackfin');
    expect(body).not.toContain('saltwind');
    for (const key of ['"q"', '"qEff"', '"surprise"', '"quality"', '"fairValue"', '"reveal"']) {
      expect(body, key).not.toContain(key);
    }
    expect(body).not.toContain('integration-stream-seed');
    live.close();
  });

  it('fans a committed tick out to every connection, crews and host alike', async () => {
    const a = await openStream(`${base}/api/stream`, { headers: bearer(saltwind) });
    const b = await openStream(`${base}/api/stream`, { headers: bearer(blackfin) });
    const h = await openStream(`${base}/api/stream`, { headers: bearer(host) });
    await Promise.all([a.waitFor('snapshot'), b.waitFor('snapshot'), h.waitFor('snapshot')]);

    const health = await (await fetch(`${base}/health`)).json();
    expect((health as { connections: number }).connections).toBe(3);

    await runTicks(engine, 1);

    for (const live of [a, b, h]) {
      const tick = await live.waitFor('tick');
      const data = tick.data as { tick: number; prices: Record<string, number>; market: unknown; game: { phase: string } };
      expect(data.tick).toBe(engine.state.currentTick);
      // Every tradeable instrument: 15 companies + 3 funds.
      expect(Object.keys(data.prices)).toHaveLength(18);
      expect(data.game.phase).toBe('live');
      // The public tick never carries a crew's money or a hidden field.
      expect(JSON.stringify(data)).not.toContain('cashBalance');
    }

    a.close();
    b.close();
    h.close();
    // The hub forgets a closed connection.
    await expect
      .poll(async () => ((await (await fetch(`${base}/health`)).json()) as { connections: number }).connections, { timeout: 4_000 })
      .toBe(0);
  });

  it('sends a portfolio update to the crew that traded and to nobody else', async () => {
    const a = await openStream(`${base}/api/stream`, { headers: bearer(saltwind) });
    const b = await openStream(`${base}/api/stream`, { headers: bearer(blackfin) });
    const h = await openStream(`${base}/api/stream`, { headers: bearer(host) });
    await Promise.all([a.waitFor('snapshot'), b.waitFor('snapshot'), h.waitFor('snapshot')]);

    const res = await order(saltwind, 'buy', 60, 'stream-order-1');
    expect(res.status).toBe(200);

    const portfolio = await a.waitFor('portfolio');
    const payload = portfolio.data as { team: { id: string; cashBalance: number }; trades: { id: string }[] };
    expect(payload.team.id).toBe('saltwind');
    expect(payload.trades.length).toBeGreaterThan(0);

    // Blackfin and the host share the same process — and must still never see it.
    await new Promise((r) => setTimeout(r, 120));
    expect(b.types()).not.toContain('portfolio');
    expect(h.types()).not.toContain('portfolio');
    expect(JSON.stringify(b.frames)).not.toContain('stream-order-1');

    a.close();
    b.close();
    h.close();
  });

  it('broadcasts host news and the phase change to everyone', async () => {
    const a = await openStream(`${base}/api/stream`, { headers: bearer(saltwind) });
    const b = await openStream(`${base}/api/stream`, { headers: bearer(blackfin) });
    await Promise.all([a.waitFor('snapshot'), b.waitFor('snapshot')]);

    const fired = await fetch(`${base}/admin/news`, {
      method: 'POST',
      headers: { ...bearer(host), 'content-type': 'application/json' },
      body: JSON.stringify({
        companyIds: [krkn],
        type: 'storm',
        magnitude: 0.2,
        headline: 'A squall off the cape',
        body: 'Shipping lanes closed.',
      }),
    });
    expect(fired.status).toBe(200);
    await runTicks(engine, 1);

    for (const live of [a, b]) {
      const news = await live.waitFor('news');
      const events = news.data as { headline: string }[];
      expect(events.some((e) => e.headline === 'A squall off the cape')).toBe(true);
    }

    await engine.endGame();
    for (const live of [a, b]) {
      const phase = await live.waitFor('phase');
      expect((phase.data as { phase: string }).phase).toBe('ended');
    }

    a.close();
    b.close();
  });
});
