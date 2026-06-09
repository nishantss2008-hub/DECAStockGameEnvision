/**
 * Runtime news scheduler. Holds the hidden schedule indexed by tick and a queue
 * of host-triggered ("manual") events to inject on the next tick. The engine asks
 * it which events fire at the current tick; firing applies the price jump, posts
 * the public news doc, and logs.
 */

import type { ScheduledNews } from './schedule';

export class NewsScheduler {
  private byTick = new Map<number, ScheduledNews[]>();
  private pending: ScheduledNews[] = [];

  constructor(schedule: ScheduledNews[]) {
    for (const e of schedule) {
      const arr = this.byTick.get(e.tick) ?? [];
      arr.push(e);
      this.byTick.set(e.tick, arr);
    }
  }

  /** Scheduled events that fire at this tick. */
  eventsAtTick(tick: number): ScheduledNews[] {
    return this.byTick.get(tick) ?? [];
  }

  /** Queue a host-triggered event to fire on the next processed tick. */
  queueManual(event: ScheduledNews): void {
    this.pending.push(event);
  }

  /** Drain queued manual events. */
  takePending(): ScheduledNews[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }
}
