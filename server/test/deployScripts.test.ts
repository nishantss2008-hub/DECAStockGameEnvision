/**
 * Deploy wiring (docs/DEPLOY.md): Google's Node.js buildpack runs the root `gcp-build` script, then
 * starts the container with the root `start` script. The server must start from production
 * dependencies and its own source only: nothing from devDependencies, tests or other dev-only files.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SERVER = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(SERVER, '..');

type Pkg = { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; main?: string };
const pkg = (dir: string): Pkg => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Pkg;

const root = pkg(ROOT);
const server = pkg(SERVER);
const shared = pkg(join(ROOT, 'shared'));

/** Resolves a relative import from a source file to the file it loads (`./x.js` may name `./x.ts`). */
function resolveLocal(from: string, spec: string): string {
  const base = resolve(dirname(from), spec);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  const found = candidates.find((c) => existsSync(c) && statSync(c).isFile());
  if (!found) throw new Error(`cannot resolve ${spec} from ${relative(SERVER, from)}`);
  return found;
}

/** Every file and bare package reachable from an entry file through static and dynamic imports. */
function importGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(file, 'utf8');
    const specs = [
      ...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm),
      ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]!);
    for (const spec of specs) {
      if (spec.startsWith('.')) queue.push(resolveLocal(file, spec));
      else packages.add(spec);
    }
  }
  return { files, packages };
}

const packageName = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
const isBuiltin = (spec: string) => spec.startsWith('node:') || builtinModules.includes(spec.split('/')[0]!);

describe('deploy scripts', () => {
  it('the root package builds the shared contracts (gcp-build) and starts the server (start)', () => {
    expect(root.scripts?.['gcp-build']).toBe('npm run build:shared');
    expect(root.scripts?.start).toBe('npm run start -w @deca/server');
    expect(root.scripts?.['build:shared']).toBe('npm run build -w @deca/shared');
    expect(root.scripts?.['set-host-password']).toBe('npm run set-host-password -w @deca/server');
  });

  it('the server starts with tsx from its production dependencies, not a watcher or a dev tool', () => {
    expect(server.scripts?.start).toBe('tsx src/index.ts');
    expect(server.dependencies).toHaveProperty('tsx');
    expect(server.devDependencies ?? {}).not.toHaveProperty('tsx');
    expect(server.scripts?.['set-host-password']).toBe('tsx src/seed/setHostPassword.ts');
    // The shared package is loaded from its build output, which gcp-build creates.
    expect(shared.main).toBe('dist/index.js');
  });

  for (const entry of ['src/index.ts', 'src/seed/setHostPassword.ts']) {
    it(`${entry} loads only server source and production dependencies`, () => {
      const { files, packages } = importGraph(join(SERVER, entry));
      expect(files.size).toBeGreaterThan(entry === 'src/index.ts' ? 20 : 3);
      for (const file of files) {
        const rel = relative(SERVER, file);
        expect(rel.startsWith('src/'), rel).toBe(true);
        expect(rel, rel).not.toMatch(/\.test\.|testutil|service-account/);
      }
      for (const spec of packages) {
        if (isBuiltin(spec)) continue;
        const name = packageName(spec);
        expect(server.dependencies, `${spec} (imported by the server) must be a production dependency`).toHaveProperty(name);
      }
      if (entry === 'src/index.ts') {
        expect([...packages].map(packageName)).toEqual(expect.arrayContaining(['fastify', '@fastify/static', 'better-sqlite3', '@deca/shared']));
      }
    });
  }

  it('the shared package needs only production dependencies at runtime', () => {
    const { packages } = importGraph(join(ROOT, 'shared/src/index.ts'));
    for (const spec of packages) {
      if (isBuiltin(spec)) continue;
      expect(shared.dependencies, spec).toHaveProperty(packageName(spec));
    }
  });

  it('boot applies ADMIN_PASSWORD before the server starts listening', () => {
    const src = readFileSync(join(SERVER, 'src/index.ts'), 'utf8');
    const apply = src.indexOf('applyAdminPasswordFromEnv(config.adminPassword');
    const listen = src.indexOf('app.listen(');
    expect(apply).toBeGreaterThan(0);
    expect(apply).toBeLessThan(listen);
  });
});
