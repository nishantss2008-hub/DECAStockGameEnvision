/**
 * `projectorCopy.ts` is COPY.md §15, verbatim — the contract `introCopy.sync.test.ts` keeps for
 * §14. It also holds the §15 rules: the phase flavors are the §12 ones (the wall and the phones
 * must agree), and nothing on the wall names a health score, a grade or a fair value.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractBlocks } from '../../../scripts/build-glossary.mjs';
import { PHASES } from '../../shell/copy';
import { PROJECTOR } from './projectorCopy';

const repoFile = (path: string) => readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');
const COPY_MD = repoFile('docs/design/COPY.md');

const block = (kind: string): Record<string, unknown> => {
  const found = extractBlocks(COPY_MD).filter((b) => b.kind === kind);
  expect(found, `COPY.md has exactly one yaml ${kind} block`).toHaveLength(1);
  return found[0]!.data as Record<string, unknown>;
};

/** Every string §15 ships, as `path → text`, for the rules that apply to all of them. */
function everyField(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => everyField(child, path ? `${path}.${key}` : key));
}

describe('COPY.md §15 is what the projector ships', () => {
  it('is verbatim', () => {
    expect(JSON.parse(JSON.stringify(PROJECTOR))).toEqual(block('projector'));
  });

  it('is listed in the §0.1 block-kind table', () => {
    expect(COPY_MD).toContain('| `projector` | file (1) |');
  });

  it('keeps the phase flavors the phones already use (COPY §12)', () => {
    expect(PROJECTOR.phases.lobby.flavor).toBe(PHASES.lobby.flavor);
    expect(PROJECTOR.phases.paused.flavor).toBe(PHASES.paused.flavor);
    expect(PROJECTOR.phases.ended.flavor).toBe(PHASES.ended.flavor);
  });
});

describe('COPY.md §15 copy rules', () => {
  const fields = everyField(PROJECTOR);

  it('reads every field it means to check', () => {
    expect(fields.length).toBeGreaterThan(15);
  });

  it('never reveals hidden company data on the wall', () => {
    for (const [path, text] of fields) {
      expect(/quality|health score|fair value|grade/i.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('never judges a crew or tells anyone to trade', () => {
    for (const [path, text] of fields) {
      expect(/\b(should|buy now|best crew|worst|losing crew|beat them)\b/i.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('stays short enough to read from the back of a room', () => {
    for (const [path, text] of fields) {
      expect(text.split(/\s+/).filter(Boolean).length, `${path}: "${text}"`).toBeLessThanOrEqual(25);
    }
  });

  it('uses the true minus sign and no ASCII hyphen-minus in any number word', () => {
    for (const [path, text] of fields) {
      expect(/-\d/.test(text), `${path}: "${text}"`).toBe(false);
    }
  });
});
