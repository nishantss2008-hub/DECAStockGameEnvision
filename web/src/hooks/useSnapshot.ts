/**
 * Internal building blocks for the Firestore hooks: one document, one query, or a set of
 * chunk documents that changes as a chart range moves.
 *
 * Every listener is removed when its key changes or the component unmounts. The first render
 * for a key uses the in-memory snapshot cache when another screen already has that data, and
 * never shows data that belongs to a previous key.
 *
 * Only the public and crew-scoped paths named by the hooks in this folder are read here; the
 * server-only paths are never listened to (see serverOnlyPaths.test.ts).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, type DocumentData, type FirestoreError, type Query } from 'firebase/firestore';
import { db } from '../firebase';
import { readSnapshot, writeSnapshot } from '../lib/snapshotCache';

/** Listener status shared by every hook result. */
export interface SnapshotStatus {
  /** True until the first snapshot (or error) for the current key. */
  loading: boolean;
  /** Firestore `metadata.fromCache`: data may be stale (offline or reconnecting). */
  fromCache: boolean;
  /** Firestore error code of a failed listener ('permission-denied', …), else null. */
  error: string | null;
}

const errorCode = (err: Partial<FirestoreError> | null | undefined): string => (err && typeof err.code === 'string' ? err.code : 'unknown');

// ─── One document ────────────────────────────────────────────────────────────

interface DocState<T> {
  key: string;
  data: T | null;
  fromCache: boolean;
  error: string | null;
}

export interface DocOptions<T> {
  /** Also deliver metadata-only snapshots, so `fromCache` flips when the connection drops or returns. */
  includeMetadataChanges?: boolean;
  /** Called for every snapshot, outside render (for side effects such as the clock-skew estimate). */
  onSnapshotData?: (data: T | null, fromCache: boolean) => void;
}

/** Listens to the document at `path` ('game/state'); null path → no listener. */
export function useDocSnapshot<T>(path: string | null, options: DocOptions<T> = {}): SnapshotStatus & { data: T | null } {
  const [state, setState] = useState<DocState<T> | null>(null);
  const onData = useRef(options.onSnapshotData);
  useEffect(() => {
    onData.current = options.onSnapshotData;
  });
  const includeMetadataChanges = options.includeMetadataChanges ?? false;

  useEffect(() => {
    if (path === null) return undefined;
    return onSnapshot(
      doc(db, path),
      { includeMetadataChanges },
      (snap) => {
        const data = snap.exists() ? (snap.data() as T) : null;
        const fromCache = snap.metadata.fromCache;
        writeSnapshot(path, { data, fromCache });
        setState({ key: path, data, fromCache, error: null });
        onData.current?.(data, fromCache);
      },
      (err) => {
        setState((prev) => ({
          key: path,
          data: prev?.key === path ? prev.data : null,
          fromCache: prev?.key === path ? prev.fromCache : false,
          error: errorCode(err),
        }));
      },
    );
  }, [path, includeMetadataChanges]);

  if (path === null) return { data: null, loading: false, fromCache: false, error: null };
  if (state?.key === path) return { data: state.data, loading: false, fromCache: state.fromCache, error: state.error };
  const cached = readSnapshot(path);
  if (cached) return { data: cached.data as T | null, loading: false, fromCache: cached.fromCache, error: null };
  return { data: null, loading: true, fromCache: false, error: null };
}

// ─── One query ───────────────────────────────────────────────────────────────

export interface QuerySpec<T> {
  /** Unique description of the query (path + constraints); the listener restarts when it changes. */
  key: string;
  build: () => Query<DocumentData>;
  /** Doc id + data → item. */
  map: (id: string, data: DocumentData) => T;
  /** Applied to the mapped items before they are stored (client-side filter or sort). */
  select?: (items: T[]) => T[];
  /**
   * Used once when the primary query fails with `failed-precondition` (its composite index is
   * missing or still building): a simpler query whose items `select` sorts and limits locally.
   */
  fallback?: { build: () => Query<DocumentData>; select: (items: T[]) => T[] };
}

interface QueryState<T> {
  key: string;
  items: T[];
  fromCache: boolean;
  error: string | null;
}

const EMPTY: never[] = [];

/** Listens to a query; null spec → no listener and an empty list. */
export function useQuerySnapshot<T>(spec: QuerySpec<T> | null): SnapshotStatus & { items: T[] } {
  const [state, setState] = useState<QueryState<T> | null>(null);
  const specRef = useRef(spec);
  useEffect(() => {
    specRef.current = spec; // runs before the listener effect below in the same commit
  });
  const key = spec?.key ?? null;

  useEffect(() => {
    const current = specRef.current;
    if (key === null || !current) return undefined;
    let unsubscribe: (() => void) | null = null;
    let active = true;

    const listen = (build: () => Query<DocumentData>, select: ((items: T[]) => T[]) | undefined, allowFallback: boolean) => {
      unsubscribe = onSnapshot(
        build(),
        (snap) => {
          const mapped = snap.docs.map((d) => current.map(d.id, d.data()));
          const items = select ? select(mapped) : mapped;
          const fromCache = snap.metadata.fromCache;
          writeSnapshot(key, { data: items, fromCache });
          setState({ key, items, fromCache, error: null });
        },
        (err) => {
          const code = errorCode(err);
          if (active && allowFallback && code === 'failed-precondition' && current.fallback) {
            unsubscribe?.();
            listen(current.fallback.build, current.fallback.select, false);
            return;
          }
          setState((prev) => ({
            key,
            items: prev?.key === key ? prev.items : EMPTY,
            fromCache: prev?.key === key ? prev.fromCache : false,
            error: code,
          }));
        },
      );
    };

    listen(current.build, current.select, true);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [key]);

  if (key === null) return { items: EMPTY, loading: false, fromCache: false, error: null };
  if (state?.key === key) return { items: state.items, loading: false, fromCache: state.fromCache, error: state.error };
  const cached = readSnapshot(key);
  if (cached) return { items: cached.data as T[], loading: false, fromCache: cached.fromCache, error: null };
  return { items: EMPTY, loading: true, fromCache: false, error: null };
}

// ─── A changing set of documents ─────────────────────────────────────────────

interface ChunkEntry<T> {
  data: T | null;
  fromCache: boolean;
  error: string | null;
}

/**
 * Listens to every document in `paths` and diffs listeners when the list changes: documents
 * that stay in the list keep their listener, new ones subscribe, dropped ones unsubscribe.
 * `chunks[i]` is the data for `paths[i]` (null when missing or not loaded yet).
 */
export function useDocSet<T>(paths: readonly string[]): SnapshotStatus & { chunks: Array<T | null> } {
  const pathsKey = paths.join('|');
  const subscriptions = useRef(new Map<string, () => void>());
  const [entries, setEntries] = useState<Record<string, ChunkEntry<T>>>({});

  useEffect(() => {
    const wanted = new Set(pathsKey ? pathsKey.split('|') : []);
    const subs = subscriptions.current;
    for (const [path, unsubscribe] of subs) {
      if (!wanted.has(path)) {
        unsubscribe();
        subs.delete(path);
      }
    }
    const store = (path: string, entry: ChunkEntry<T>) =>
      setEntries((prev) => {
        const next: Record<string, ChunkEntry<T>> = {};
        for (const p of Object.keys(prev)) if (subs.has(p)) next[p] = prev[p]!;
        next[path] = entry;
        return next;
      });
    for (const path of wanted) {
      if (subs.has(path)) continue;
      subs.set(
        path,
        onSnapshot(
          doc(db, path),
          (snap) => {
            const data = snap.exists() ? (snap.data() as T) : null;
            const fromCache = snap.metadata.fromCache;
            writeSnapshot(path, { data, fromCache });
            store(path, { data, fromCache, error: null });
          },
          (err) => store(path, { data: null, fromCache: false, error: errorCode(err) }),
        ),
      );
    }
  }, [pathsKey]);

  useEffect(() => {
    const subs = subscriptions.current;
    return () => {
      for (const unsubscribe of subs.values()) unsubscribe();
      subs.clear();
    };
  }, []);

  // Recomputed only when a snapshot arrives or the path list changes, so callers can memoize on `chunks`.
  return useMemo(() => {
    let loading = false;
    let fromCache = false;
    let error: string | null = null;
    const chunks = (pathsKey ? pathsKey.split('|') : []).map((path) => {
      const entry = entries[path];
      if (entry) {
        fromCache ||= entry.fromCache;
        error ??= entry.error;
        return entry.data;
      }
      const cached = readSnapshot(path);
      if (cached) {
        fromCache ||= cached.fromCache;
        return cached.data as T | null;
      }
      loading = true;
      return null;
    });
    return { chunks, loading, fromCache, error };
  }, [entries, pathsKey]);
}
