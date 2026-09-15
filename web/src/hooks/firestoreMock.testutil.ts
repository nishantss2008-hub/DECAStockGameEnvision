/**
 * In-memory stand-in for the parts of `firebase/firestore` the hooks use. Tests register it with
 *   vi.mock('firebase/firestore', async () => (await import('./firestoreMock.testutil')).firestoreModule);
 * and drive snapshots with `fsMock.emitDoc` / `emitQuery` / `emitError`.
 */

type Constraint = { kind: 'where'; field: string; op: string; value: unknown } | { kind: 'orderBy'; field: string; dir: string } | { kind: 'limit'; n: number };

export interface Ref {
  type: 'doc' | 'collection' | 'group' | 'query';
  path: string;
  constraints: Constraint[];
}

interface Listener {
  ref: Ref;
  next: (snap: unknown) => void;
  error?: (err: { code: string; message: string }) => void;
  active: boolean;
}

const listeners = new Set<Listener>();
let subscribeCount = 0;
const getDocsResults = new Map<string, Array<{ path: string; data: unknown }> | { code: string }>();
const getDocResults = new Map<string, unknown>();

const describeRef = (ref: Ref) =>
  ref.constraints.length === 0
    ? ref.path
    : `${ref.path}?${ref.constraints
        .map((c) => (c.kind === 'where' ? `${c.field}${c.op}${String(c.value)}` : c.kind === 'orderBy' ? `order:${c.field}:${c.dir}` : `limit:${c.n}`))
        .join('&')}`;

function docSnap(path: string, data: unknown, fromCache: boolean) {
  const segments = path.split('/');
  return {
    id: segments[segments.length - 1],
    exists: () => data !== null && data !== undefined,
    data: () => data,
    metadata: { fromCache, hasPendingWrites: false },
    ref: refFor(path),
  };
}

function refFor(path: string): { id: string; path: string; parent: unknown } {
  const segments = path.split('/');
  const id = segments[segments.length - 1]!;
  const parentPath = segments.slice(0, -1).join('/');
  return {
    id,
    path,
    get parent() {
      return parentPath ? refFor(parentPath) : null;
    },
  };
}

function querySnap(docs: Array<{ path: string; data: unknown }>, fromCache: boolean) {
  return { docs: docs.map((d) => docSnap(d.path, d.data, fromCache)), metadata: { fromCache, hasPendingWrites: false }, size: docs.length };
}

export const fsMock = {
  reset() {
    listeners.clear();
    subscribeCount = 0;
    getDocsResults.clear();
    getDocResults.clear();
  },
  /** Descriptions ("path?constraints") of listeners that are still subscribed. */
  active(): string[] {
    return [...listeners].filter((l) => l.active).map((l) => describeRef(l.ref)).sort();
  },
  get subscribeCount() {
    return subscribeCount;
  },
  emitDoc(path: string, data: unknown, fromCache = false) {
    for (const l of [...listeners]) if (l.active && l.ref.type === 'doc' && l.ref.path === path) l.next(docSnap(path, data, fromCache));
  },
  /** Emits to every active query/collection listener whose base path matches. */
  emitQuery(path: string, docs: Array<{ id: string; data: unknown }>, fromCache = false) {
    const full = docs.map((d) => ({ path: `${path}/${d.id}`, data: d.data }));
    for (const l of [...listeners]) if (l.active && l.ref.type !== 'doc' && l.ref.path === path) l.next(querySnap(full, fromCache));
  },
  emitError(description: string, code: string) {
    for (const l of [...listeners]) if (l.active && describeRef(l.ref) === description) l.error?.({ code, message: code });
  },
  setGetDocs(path: string, result: Array<{ path: string; data: unknown }> | { code: string }) {
    getDocsResults.set(path, result);
  },
  setGetDoc(path: string, data: unknown) {
    getDocResults.set(path, data);
  },
};

export const firestoreModule = {
  doc: (_db: unknown, ...segments: string[]): Ref => ({ type: 'doc', path: segments.join('/'), constraints: [] }),
  collection: (_db: unknown, ...segments: string[]): Ref => ({ type: 'collection', path: segments.join('/'), constraints: [] }),
  collectionGroup: (_db: unknown, id: string): Ref => ({ type: 'group', path: `**/${id}`, constraints: [] }),
  where: (field: string, op: string, value: unknown): Constraint => ({ kind: 'where', field, op, value }),
  orderBy: (field: string, dir = 'asc'): Constraint => ({ kind: 'orderBy', field, dir }),
  limit: (n: number): Constraint => ({ kind: 'limit', n }),
  query: (ref: Ref, ...constraints: Constraint[]): Ref => ({ type: 'query', path: ref.path, constraints: [...ref.constraints, ...constraints] }),
  onSnapshot: (ref: Ref, ...args: unknown[]) => {
    const fns = args.filter((a) => typeof a === 'function') as Array<(x: unknown) => void>;
    const listener: Listener = { ref, next: fns[0]!, error: fns[1] as Listener['error'], active: true };
    listeners.add(listener);
    subscribeCount++;
    return () => {
      listener.active = false;
      listeners.delete(listener);
    };
  },
  getDocs: async (ref: Ref) => {
    const result = getDocsResults.get(ref.path) ?? [];
    if (!Array.isArray(result)) throw Object.assign(new Error(result.code), { code: result.code });
    return querySnap(result, false);
  },
  getDoc: async (ref: Ref) => docSnap(ref.path, getDocResults.get(ref.path) ?? null, false),
};
