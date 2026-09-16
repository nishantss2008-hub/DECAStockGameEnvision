/**
 * Test double for the live store: a real `createTestLiveStore()` behind the one seam module the
 * hooks read, so tests drive the hooks with the same state the transport writes.
 *
 *   vi.mock('./liveState', async () => (await import('./liveMock.testutil')).liveStateModule);
 *   act(() => liveMock.push({ ready: true, game, companyIds: ['kraken'], companies: { kraken } }));
 */

import { useSyncExternalStore } from 'react';
import { createTestLiveStore, type LiveState, type LiveStore } from '../lib/liveStore';
import { EMPTY_LIVE, normalizeLive, type LiveSnapshot } from './normalizeLive';

let store: LiveStore = createTestLiveStore();
let subscriptions = 0;
let listeners = 0;
let lastState: LiveState | null = null;
let lastSnapshot: LiveSnapshot = EMPTY_LIVE;

export const liveMock = {
  /** Merges connection/game state in, as an event would. Defaults to an open, ready stream. */
  push(partial: Partial<LiveState>): void {
    store.patch({ status: 'open', online: true, ready: true, ...partial });
  },
  /** Merges state in without implying the stream is open or ready. */
  patch(partial: Partial<LiveState>): void {
    store.patch(partial);
  },
  state(): LiveState {
    return store.getState();
  },
  /** How many components are subscribed right now (leak check). */
  subscribers(): number {
    return listeners;
  },
  /** How many times anything subscribed since the last reset. */
  subscribeCount(): number {
    return subscriptions;
  },
  reset(): void {
    store = createTestLiveStore();
    subscriptions = 0;
    listeners = 0;
    lastState = null;
    lastSnapshot = EMPTY_LIVE;
  },
};

function read(): LiveSnapshot {
  const state = store.getState();
  if (state !== lastState) {
    lastState = state;
    lastSnapshot = normalizeLive(state);
  }
  return lastSnapshot;
}

function subscribe(onChange: () => void): () => void {
  subscriptions++;
  listeners++;
  const unsubscribe = store.subscribe(() => onChange());
  return () => {
    listeners--;
    unsubscribe();
  };
}

/** The module shape `./liveState` exports, backed by the test store. */
export const liveStateModule = {
  EMPTY_LIVE,
  normalizeLive,
  useLive(): LiveSnapshot {
    return useSyncExternalStore(subscribe, read, read);
  },
};
