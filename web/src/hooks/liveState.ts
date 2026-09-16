/**
 * The single seam between the hooks and the live store (`lib/liveStore.ts` + `lib/live.ts`).
 *
 * The store holds everything the server pushes over `/api/stream`: the opening `snapshot` from
 * `GET /api/bootstrap`, then `tick`, `news`, `phase` and the crew's own `portfolio`. Hooks never
 * touch the store directly — they call `useLive()` and select from the normalized snapshot, so
 * there is one place to change if the transport changes, and one module for the tests to fake.
 *
 * `useSyncExternalStore` needs a referentially stable snapshot, so the projection is cached per
 * store state: the same state always yields the same object, and hooks can `useMemo` on its
 * fields.
 */

import { useSyncExternalStore } from 'react';
import { getLiveStore, startLive } from '../lib/live';
import type { LiveState } from '../lib/liveStore';
import { EMPTY_LIVE, normalizeLive, type LiveSnapshot } from './normalizeLive';

export { EMPTY_LIVE, normalizeLive };
export type { LivePortfolio, LiveSnapshot } from './normalizeLive';

let lastState: LiveState | null = null;
let lastSnapshot: LiveSnapshot = EMPTY_LIVE;

/** Stable per store state: `useSyncExternalStore` compares by identity. */
function snapshot(): LiveSnapshot {
  const state = getLiveStore().getState();
  if (state !== lastState) {
    lastState = state;
    lastSnapshot = normalizeLive(state);
  }
  return lastSnapshot;
}

function subscribe(onChange: () => void): () => void {
  // The stream is opened by the first hook that needs it and kept for the session; startLive()
  // is a no-op without a session and while one is already open.
  startLive();
  return getLiveStore().subscribe(() => onChange());
}

/** The live snapshot, re-rendering the component whenever the server pushes an update. */
export function useLive(): LiveSnapshot {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
