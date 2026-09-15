/**
 * Minimal in-memory Firestore for unit tests of the engine IO layer (no emulator,
 * no network, no credentials). It implements only what loop.ts, leaderboard.ts,
 * market.ts and logger.ts use, and it is STRICTER than Firestore where that finds
 * bugs:
 *   - undefined, non-finite numbers, functions, nested arrays and class instances are rejected
 *   - update() on a missing doc fails with code 5 (NOT_FOUND); a failing batch writes nothing
 *   - a batch may hold at most 500 writes
 *
 * FieldValue.increment is recognised as `{ __fake: 'increment', operand }` (mock
 * `firebase-admin/firestore` in the test file to produce that shape).
 */

type Data = Record<string, unknown>;

interface Increment {
  __fake: 'increment';
  operand: number;
}

function isIncrement(x: unknown): x is Increment {
  return typeof x === 'object' && x !== null && (x as Increment).__fake === 'increment';
}

function validate(value: unknown, where: string, inArray = false): void {
  if (value === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${where}")`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`fake firestore: non-finite number in field "${where}"`);
    return;
  }
  if (typeof value === 'function') throw new Error(`fake firestore: function in field "${where}"`);
  if (Array.isArray(value)) {
    if (inArray) throw new Error(`fake firestore: nested arrays are not supported (field "${where}")`);
    value.forEach((v, i) => validate(v, `${where}[${i}]`, true));
    return;
  }
  if (typeof value === 'object') {
    if (isIncrement(value)) return;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`fake firestore: custom prototype ${proto?.constructor?.name} in field "${where}"`);
    }
    for (const [k, v] of Object.entries(value as Data)) validate(v, where ? `${where}.${k}` : k);
    return;
  }
  throw new Error(`fake firestore: unsupported value in field "${where}"`);
}

function clone<T>(x: T): T {
  return structuredClone(x);
}

function segments(path: string): string[] {
  const s = path.split('/');
  if (s.some((p) => p.length === 0)) throw new Error(`fake firestore: bad path "${path}"`);
  return s;
}

function notFound(path: string): Error {
  return Object.assign(new Error(`5 NOT_FOUND: No document to update: ${path}`), { code: 5 });
}

export class FakeDocSnapshot {
  constructor(
    readonly ref: FakeDocRef,
    private readonly value: Data | undefined,
  ) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.value !== undefined;
  }
  data(): Data | undefined {
    return this.value === undefined ? undefined : clone(this.value);
  }
}

export class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
}

type Op = '>' | '>=' | '<' | '<=' | '==' | '!=';

export class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    readonly path: string,
    private readonly filters: { field: string; op: Op; value: unknown }[] = [],
    private readonly max: number | null = null,
    private readonly group = false,
  ) {}

  where(field: string, op: Op, value: unknown): FakeQuery {
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.max, this.group);
  }

  limit(n: number): FakeQuery {
    return new FakeQuery(this.db, this.path, this.filters, n, this.group);
  }

  orderBy(): FakeQuery {
    return this;
  }

  async get(): Promise<FakeQuerySnapshot> {
    const out: FakeDocSnapshot[] = [];
    for (const [path, data] of [...this.db.docs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const s = path.split('/');
      const parent = s.slice(0, -1).join('/');
      const matches = this.group ? s[s.length - 2] === this.path : parent === this.path;
      if (!matches) continue;
      if (!this.filters.every((f) => compare(data[f.field], f.op, f.value))) continue;
      out.push(new FakeDocSnapshot(this.db.doc(path), clone(data)));
      if (this.max !== null && out.length >= this.max) break;
    }
    return new FakeQuerySnapshot(out);
  }
}

function compare(a: unknown, op: Op, b: unknown): boolean {
  if (a === undefined) return false;
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '>':
      return (a as number) > (b as number);
    case '>=':
      return (a as number) >= (b as number);
    case '<':
      return (a as number) < (b as number);
    case '<=':
      return (a as number) <= (b as number);
  }
}

export class FakeCollectionRef extends FakeQuery {
  constructor(db: FakeFirestore, path: string) {
    super(db, path);
    if (segments(path).length % 2 !== 1) throw new Error(`fake firestore: "${path}" is not a collection path`);
  }
  get id(): string {
    return this.path.split('/').pop()!;
  }
  get parent(): FakeDocRef | null {
    const s = this.path.split('/');
    return s.length > 1 ? this.db.doc(s.slice(0, -1).join('/')) : null;
  }
  doc(id?: string): FakeDocRef {
    return this.db.doc(`${this.path}/${id ?? this.db.autoId()}`);
  }
  async add(data: Data): Promise<FakeDocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
  ) {
    if (segments(path).length % 2 !== 0) throw new Error(`fake firestore: "${path}" is not a document path`);
  }
  get id(): string {
    return this.path.split('/').pop()!;
  }
  get parent(): FakeCollectionRef {
    return this.db.collection(this.path.split('/').slice(0, -1).join('/'));
  }
  collection(name: string): FakeCollectionRef {
    return this.db.collection(`${this.path}/${name}`);
  }
  async get(): Promise<FakeDocSnapshot> {
    const v = this.db.docs.get(this.path);
    return new FakeDocSnapshot(this, v === undefined ? undefined : clone(v));
  }
  async set(data: Data, opts?: { merge?: boolean }): Promise<void> {
    this.db.commitOps([{ kind: 'set', path: this.path, data, merge: Boolean(opts?.merge) }]);
  }
  async update(data: Data): Promise<void> {
    this.db.commitOps([{ kind: 'update', path: this.path, data, merge: true }]);
  }
  async delete(): Promise<void> {
    this.db.commitOps([{ kind: 'delete', path: this.path }]);
  }
}

type WriteOp =
  | { kind: 'set' | 'update'; path: string; data: Data; merge: boolean }
  | { kind: 'delete'; path: string };

export class FakeBatch {
  private readonly ops: WriteOp[] = [];
  private committed = false;
  constructor(private readonly db: FakeFirestore) {}
  set(ref: FakeDocRef, data: Data, opts?: { merge?: boolean }): FakeBatch {
    this.ops.push({ kind: 'set', path: ref.path, data: clone(data), merge: Boolean(opts?.merge) });
    return this;
  }
  update(ref: FakeDocRef, data: Data): FakeBatch {
    this.ops.push({ kind: 'update', path: ref.path, data: clone(data), merge: true });
    return this;
  }
  delete(ref: FakeDocRef): FakeBatch {
    this.ops.push({ kind: 'delete', path: ref.path });
    return this;
  }
  async commit(): Promise<void> {
    if (this.committed) throw new Error('fake firestore: batch already committed');
    this.committed = true;
    if (this.ops.length > 500) throw new Error(`fake firestore: batch of ${this.ops.length} writes exceeds 500`);
    this.db.batchSizes.push(this.ops.length);
    this.db.commitOps(this.ops);
  }
}

export class FakeFirestore {
  docs = new Map<string, Data>();
  /** Every committed write, in order. */
  writes: { kind: WriteOp['kind']; path: string }[] = [];
  /** Size of every committed batch. */
  batchSizes: number[] = [];
  /** When set, the next commit touching a path matching it throws (and writes nothing). */
  failNextCommitMatching: RegExp | null = null;
  private seq = 0;

  reset(): void {
    this.docs = new Map();
    this.writes = [];
    this.batchSizes = [];
    this.failNextCommitMatching = null;
  }

  dump(): Map<string, Data> {
    return clone(this.docs);
  }

  restore(docs: Map<string, Data>): void {
    this.docs = clone(docs);
  }

  autoId(): string {
    this.seq++;
    return `auto${String(this.seq).padStart(6, '0')}`;
  }

  doc(path: string): FakeDocRef {
    return new FakeDocRef(this, path);
  }

  collection(path: string): FakeCollectionRef {
    return new FakeCollectionRef(this, path);
  }

  collectionGroup(id: string): FakeQuery {
    return new FakeQuery(this, id, [], null, true);
  }

  batch(): FakeBatch {
    return new FakeBatch(this);
  }

  async recursiveDelete(ref: FakeDocRef | FakeCollectionRef): Promise<void> {
    const prefix = `${ref.path}/`;
    const ops: WriteOp[] = [];
    for (const path of this.docs.keys()) {
      if (path === ref.path || path.startsWith(prefix)) ops.push({ kind: 'delete', path });
    }
    this.commitOps(ops);
  }

  /** Validates every op first, then applies all of them (atomic). */
  commitOps(ops: WriteOp[]): void {
    if (this.failNextCommitMatching && ops.some((o) => this.failNextCommitMatching!.test(o.path))) {
      this.failNextCommitMatching = null;
      throw new Error('fake firestore: injected commit failure');
    }
    const exists = new Map<string, boolean>();
    const has = (p: string) => exists.get(p) ?? this.docs.has(p);
    for (const op of ops) {
      segments(op.path);
      if (op.kind === 'delete') {
        exists.set(op.path, false);
        continue;
      }
      validate(op.data, '');
      if (op.kind === 'update') {
        if (!has(op.path)) throw notFound(op.path);
        if (Object.keys(op.data).some((k) => k.includes('.'))) throw new Error('fake firestore: dotted update paths are not supported');
      }
      exists.set(op.path, true);
    }
    for (const op of ops) {
      if (op.kind === 'delete') {
        this.docs.delete(op.path);
      } else {
        const prev = op.merge ? (this.docs.get(op.path) ?? {}) : {};
        const next: Data = { ...clone(prev) };
        for (const [k, v] of Object.entries(op.data)) {
          next[k] = isIncrement(v) ? (typeof prev[k] === 'number' ? (prev[k] as number) : 0) + v.operand : clone(v);
        }
        this.docs.set(op.path, next);
      }
      this.writes.push({ kind: op.kind, path: op.path });
    }
  }
}
