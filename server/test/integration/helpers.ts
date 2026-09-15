/**
 * Shared helpers for the emulator integration tests (not a test file: vitest only collects *.int.test.ts).
 *
 * Everything here talks to the local emulators that setup.ts has already checked for; nothing reaches a real
 * project.
 */

import type { DocumentReference, WriteBatch } from 'firebase-admin/firestore';
import { adminAuth, db } from '../../src/firebase';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function data<T>(path: string): Promise<T | undefined> {
  return (await db.doc(path).get()).data() as T | undefined;
}

/** Wipes every document in the emulator project (setup.ts guarantees a local demo- emulator). */
export async function clearEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT;
  const res = await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`could not clear the Firestore emulator: HTTP ${res.status}`);
}

/** Exchanges a custom token at the Auth emulator for an ID token (what a browser does after /auth/login). */
export async function idTokenFor(customToken: string): Promise<string> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) throw new Error('FIREBASE_AUTH_EMULATOR_HOST is not set');
  const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(body)}`);
  return body.idToken;
}

/** An ID token for a crew or the host, minted directly (skips the password check). */
export async function tokenFor(uid: string): Promise<string> {
  const claims = uid === 'admin' ? { role: 'admin' } : { role: 'team', teamId: uid };
  return idTokenFor(await adminAuth.createCustomToken(uid, claims));
}

/**
 * Makes the next batch commit that writes `path` fail, as if the process died before that batch reached
 * Firestore (earlier batches of the same logical commit still land). Returns a function that removes the hook.
 */
export function crashCommitWriting(path: string): () => void {
  const original = db.batch.bind(db);
  let armed = true;
  const hooked = db as unknown as { batch: () => WriteBatch };
  hooked.batch = () => {
    const real = original();
    const paths: string[] = [];
    const proxy: WriteBatch = new Proxy(real, {
      get(target, prop) {
        if (prop === 'set' || prop === 'update' || prop === 'delete' || prop === 'create') {
          return (ref: DocumentReference, ...rest: unknown[]) => {
            paths.push(ref.path);
            (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop]!(ref, ...rest);
            return proxy;
          };
        }
        if (prop === 'commit') {
          return async () => {
            if (armed && paths.includes(path)) {
              armed = false;
              throw new Error(`injected crash before the batch writing ${path}`);
            }
            return target.commit();
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    return proxy;
  };
  return () => {
    delete (db as unknown as { batch?: unknown }).batch;
  };
}

/** Paths of every document under `root` (a doc or collection path), at any depth. */
export async function pathsUnder(root: string): Promise<string[]> {
  const out: string[] = [];
  const walkDoc = async (ref: DocumentReference): Promise<void> => {
    if ((await ref.get()).exists) out.push(ref.path);
    for (const col of await ref.listCollections()) {
      for (const doc of await col.listDocuments()) await walkDoc(doc);
    }
  };
  const segments = root.split('/').length;
  if (segments % 2 === 0) {
    await walkDoc(db.doc(root));
  } else {
    for (const doc of await db.collection(root).listDocuments()) await walkDoc(doc);
  }
  return out.sort();
}
