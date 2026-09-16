/**
 * The SSE wire and the reconnect policy — the two pieces that decide whether a phone in a gym
 * keeps up with the game. Both are pure, so they are tested without a network.
 */
import { describe, it, expect, vi } from 'vitest';
import { backoffDelay, createSseParser, DEFAULT_RETRY_MS, MAX_BACKOFF_MS, type SseMessage } from './live';

function collect(): { messages: SseMessage[]; parser: ReturnType<typeof createSseParser> } {
  const messages: SseMessage[] = [];
  const parser = createSseParser((m) => messages.push(m));
  return { messages, parser };
}

describe('createSseParser', () => {
  it('parses a named event with JSON data', () => {
    const { messages, parser } = collect();
    parser.push('event: tick\ndata: {"tick":7}\n\n');
    expect(messages).toEqual([{ event: 'tick', data: '{"tick":7}' }]);
  });

  it('reassembles a frame split across chunks, mid-line and mid-field', () => {
    const { messages, parser } = collect();
    parser.push('event: sna');
    parser.push('pshot\ndata: {"serverTi');
    parser.push('me":1}\n');
    expect(messages).toHaveLength(0); // no blank line yet: nothing is dispatched
    parser.push('\nevent: ping\ndata: {"t":2}\n\n');
    expect(messages).toEqual([
      { event: 'snapshot', data: '{"serverTime":1}' },
      { event: 'ping', data: '{"t":2}' },
    ]);
  });

  it('joins multi-line data with newlines and keeps only one leading space off each value', () => {
    const { messages, parser } = collect();
    parser.push('event: news\ndata: line one\ndata:  line two\ndata:\n\n');
    expect(messages[0]).toEqual({ event: 'news', data: 'line one\n line two\n' });
  });

  it('ignores comments and heartbeats without dispatching an empty frame', () => {
    const { messages, parser } = collect();
    parser.push(':\n\n'); // proxy keep-alive
    parser.push(': heartbeat\n\n');
    parser.push('\n\n'); // blank frames carry no data
    expect(messages).toHaveLength(0);
    parser.push('data: {"ok":true}\n\n');
    expect(messages).toEqual([{ event: 'message', data: '{"ok":true}' }]);
  });

  it('delivers a lone retry hint at once, and carries an id onto later frames', () => {
    const { messages, parser } = collect();
    parser.push('retry: 3000\n\n'); // the server's first write, before any event
    expect(messages).toEqual([{ event: 'retry', data: '', retry: 3000 }]);
    parser.push('id: 9\ndata: a\n\n');
    parser.push('data: b\n\n');
    expect(messages[1]).toEqual({ event: 'message', data: 'a', id: '9' });
    expect(messages[2]).toEqual({ event: 'message', data: 'b', id: '9' });
  });

  it('accepts CRLF and bare CR line endings', () => {
    const { messages, parser } = collect();
    parser.push('event: phase\r\ndata: {"phase":"live"}\r\n\r\n');
    parser.push('event: phase\rdata: {"phase":"ended"}\r\r');
    expect(messages.map((m) => m.data)).toEqual(['{"phase":"live"}', '{"phase":"ended"}']);
  });

  it('ignores unknown fields and a field with no colon', () => {
    const { messages, parser } = collect();
    parser.push('weird\nfoo: bar\ndata: kept\n\n');
    expect(messages).toEqual([{ event: 'message', data: 'kept' }]);
  });

  it('reset() drops a half-received frame so a new connection starts clean', () => {
    const { messages, parser } = collect();
    parser.push('event: tick\ndata: {"tick":1}\n');
    parser.reset();
    parser.push('\n');
    expect(messages).toHaveLength(0);
  });
});

describe('backoffDelay', () => {
  it('doubles from the base and caps, with jitter off', () => {
    const opts = { base: 1000, max: 8000, jitter: 0 };
    expect([0, 1, 2, 3, 4, 9].map((a) => backoffDelay(a, opts))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it("defaults to the server's retry hint and the 30s ceiling", () => {
    expect(backoffDelay(0, { jitter: 0 })).toBe(DEFAULT_RETRY_MS);
    expect(backoffDelay(40, { jitter: 0 })).toBe(MAX_BACKOFF_MS);
  });

  it('spreads the delay by ±jitter so phones do not reconnect in lockstep', () => {
    const at = (r: number) => backoffDelay(2, { base: 1000, max: 30_000, jitter: 0.25, random: () => r });
    expect(at(0)).toBe(3000); // -25%
    expect(at(0.5)).toBe(4000); // centre
    expect(at(0.999)).toBe(4998); // just under +25%
  });

  it('never returns a negative delay, and treats a bad attempt as the first retry', () => {
    expect(backoffDelay(-5, { base: 1000, jitter: 0 })).toBe(1000);
    expect(backoffDelay(0, { base: 1000, jitter: 4, random: () => 0 })).toBe(0);
  });

  it('uses Math.random by default', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(backoffDelay(0, { base: 1000 })).toBe(1000);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
