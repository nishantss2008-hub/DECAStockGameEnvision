/**
 * glossary.data.ts is generated from docs/design/COPY.md by web/scripts/build-glossary.mjs.
 * This test re-runs the parser and fails when the committed file is out of date.
 * Fix: `node web/scripts/build-glossary.mjs` from the repo root.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCopyData, extractBlocks, renderModule } from '../../scripts/build-glossary.mjs';
import { COPY_DATA } from './glossary.data';

const COPY_PATH = fileURLToPath(new URL('../../../docs/design/COPY.md', import.meta.url));
const DATA_PATH = fileURLToPath(new URL('./glossary.data.ts', import.meta.url));

describe('glossary.data.ts is in sync with COPY.md', () => {
  const markdown = readFileSync(COPY_PATH, 'utf8');
  const fresh = buildCopyData(markdown);

  it('matches a fresh parse of COPY.md', () => {
    expect(COPY_DATA).toEqual(fresh);
  });

  it('is identical to what the generator would write (line endings aside, so CRLF checkouts pass)', () => {
    expect(readFileSync(DATA_PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(renderModule(fresh));
  });

  it('parses the same data from a CRLF copy of COPY.md', () => {
    expect(buildCopyData(markdown.replace(/\r?\n/g, '\r\n'))).toEqual(fresh);
  });

  it('parses every yaml data fence (none silently skipped by an indent, a tilde fence or a capital letter)', () => {
    const fences = (md: string) => md.split(/\r?\n/).filter((line) => /^\s*(```|~~~)\s*yaml\b/i.test(line)).length;
    expect(extractBlocks(markdown)).toHaveLength(fences(markdown));
    const skipped = markdown.replace(/^```yaml news$/m, '```YAML news');
    expect(extractBlocks(skipped).length).toBeLessThan(fences(skipped));
  });

  it('has the documented shape: 73 glossary terms, 8 news types, 19 explain templates', () => {
    expect(fresh.glossary).toHaveLength(73);
    expect(new Set(fresh.glossary.map((g) => g.id)).size).toBe(73);
    expect(fresh.news.map((n) => n.type)).toEqual(['earnings', 'merger', 'discovery', 'management', 'regulatory', 'scandal', 'storm', 'macro']);
    expect(fresh.explain).toHaveLength(19);
  });

  it('only relates glossary ids to other glossary ids', () => {
    const ids = new Set(fresh.glossary.map((g) => g.id));
    for (const g of fresh.glossary) for (const r of g.related) expect(ids.has(r), `${g.id} → ${r}`).toBe(true);
  });
});
