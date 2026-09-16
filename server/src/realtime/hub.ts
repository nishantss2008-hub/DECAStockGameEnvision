/**
 * The live fan-out (SSE). One process holds every phone's connection, so publishing is a loop over
 * a Map — no broker, no polling, no Firestore listeners.
 *
 * Public events (`tick`, `news`, `phase`, `ping`) go to every connection; `portfolio` goes only to
 * the connections of the crew it belongs to, so one crew can never see another's cash, holdings or
 * trades. The opening `snapshot` is built per connection through realtime/snapshot.ts, which is the
 * single place hidden fields are stripped.
 *
 * The engine calls `publishTick` / `publishNews` / `publishPhase` AFTER its transaction commits, so
 * a client never sees a tick the database does not already hold.
 */

import type { FastifyReply } from 'fastify';
import type { GameState, Leaderboard, MarketSummary, NewsEvent, Role } from '@deca/shared';
import { buildSnapshot, portfolioFor, type PortfolioPayload, type Snapshot, type StreamContext } from './snapshot';

export interface TickPayload {
  tick: number;
  serverTime: number;
  /** companyId → last price in integer cents. */
  prices: Record<string, number>;
  market: MarketSummary | null;
  leaderboard: Leaderboard | null;
  game: GameState | null;
}

export type StreamEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'tick'; data: TickPayload }
  | { type: 'news'; data: NewsEvent[] }
  | { type: 'portfolio'; data: PortfolioPayload }
  | { type: 'phase'; data: GameState }
  | { type: 'ping'; data: { t: number } };

/** Heartbeat interval: short enough to keep proxies and phone radios from dropping the connection. */
export const PING_MS = 15_000;
/** Clients reconnect after this many ms when the stream drops (SSE `retry:`). */
export const RETRY_MS = 3_000;

interface Connection {
  id: number;
  role: Role;
  teamId?: string;
  send(event: StreamEvent): void;
  close(): void;
}

const connections = new Map<number, Connection>();
let nextId = 1;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function frame(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function startPing(): void {
  if (pingTimer || connections.size === 0) return;
  pingTimer = setInterval(() => {
    const t = Date.now();
    for (const c of [...connections.values()]) c.send({ type: 'ping', data: { t } });
  }, PING_MS);
  // Never hold the process open for a heartbeat.
  (pingTimer as unknown as { unref?: () => void }).unref?.();
}

function stopPingIfIdle(): void {
  if (pingTimer && connections.size === 0) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

/**
 * Attaches a reply to the hub as an SSE stream and returns its unsubscribe function. The reply is
 * hijacked: Fastify stops managing it and the socket stays open until the client goes away.
 */
export function subscribe(reply: FastifyReply, ctx: StreamContext): () => void {
  const id = nextId++;
  const res = reply.raw;
  reply.hijack();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    // nginx and friends buffer text/event-stream by default, which would stall every update.
    'X-Accel-Buffering': 'no',
  });

  let open = true;
  const unsubscribe = (): void => {
    if (!open) return;
    open = false;
    connections.delete(id);
    stopPingIfIdle();
    try {
      res.end();
    } catch {
      /* already torn down */
    }
  };

  const connection: Connection = {
    id,
    role: ctx.role,
    teamId: ctx.teamId,
    send(event) {
      if (!open) return;
      try {
        res.write(frame(event));
      } catch {
        // A dead socket takes its connection with it rather than throwing into the engine.
        unsubscribe();
      }
    },
    close: unsubscribe,
  };

  connections.set(id, connection);
  try {
    res.write(`retry: ${RETRY_MS}\n\n`);
  } catch {
    unsubscribe();
    return unsubscribe;
  }
  connection.send({ type: 'snapshot', data: buildSnapshot(ctx) });
  res.on('close', unsubscribe);
  res.on('error', unsubscribe);
  startPing();
  return unsubscribe;
}

function broadcast(event: StreamEvent): void {
  for (const c of [...connections.values()]) c.send(event);
}

/** Public: every connection gets the same tick. Nothing here is crew-specific or hidden. */
export function publishTick(data: TickPayload): void {
  broadcast({ type: 'tick', data });
}

/** Public: news that has already fired (the schedule itself never leaves the server). */
export function publishNews(events: NewsEvent[]): void {
  if (events.length === 0) return;
  broadcast({ type: 'news', data: events });
}

/** Public: lobby → live → paused → ended. */
export function publishPhase(game: GameState): void {
  broadcast({ type: 'phase', data: game });
}

/**
 * Rebuilds every connection's opening payload in place, one snapshot per connection so each is
 * filtered for its own role and crew.
 *
 * Used when the world changed wholesale rather than by a tick: a new game (every company, price,
 * holding and news item is different) and the end of a game (the reveal is now public). Without it
 * only the host that pressed the button would see the change, and everyone else would have to
 * reconnect to catch up.
 */
export function publishSnapshot(): void {
  for (const c of [...connections.values()]) {
    c.send({ type: 'snapshot', data: buildSnapshot({ role: c.role, teamId: c.teamId }) });
  }
}

/**
 * Private: the crew's own cash, holdings, trades and orders, sent only to that crew's connections.
 * Reads nothing when the crew has no connection open.
 */
export function publishPortfolio(teamId: string): void {
  const targets = [...connections.values()].filter((c) => c.teamId === teamId);
  if (targets.length === 0) return;
  const data = portfolioFor(teamId);
  for (const c of targets) c.send({ type: 'portfolio', data });
}

/** How many phones are listening (GET /health). */
export function connectionCount(): number {
  return connections.size;
}

/** Drops every connection (shutdown, and between tests). */
export function closeAll(): void {
  for (const c of [...connections.values()]) c.close();
  connections.clear();
  stopPingIfIdle();
}
