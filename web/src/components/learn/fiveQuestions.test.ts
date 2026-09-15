import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractBlocks } from '../../../scripts/build-glossary.mjs';
import { FIVE_QUESTIONS } from './fiveQuestions';
import { GLOSSARY } from '../../lib/glossary';

describe('five questions', () => {
  it('has the five questions in order and only references real glossary terms', () => {
    expect(FIVE_QUESTIONS.map((q) => q.id)).toEqual(['profit', 'growth', 'debt', 'price', 'news']);
    for (const q of FIVE_QUESTIONS) for (const id of q.lookAt) expect(GLOSSARY[id], id).toBeDefined();
  });
});

describe('five questions match COPY.md §6 verbatim', () => {
  const md = readFileSync(fileURLToPath(new URL('../../../../docs/design/COPY.md', import.meta.url)), 'utf8');
  const blocks = extractBlocks(md).filter((b) => b.kind === 'five-questions').map((b) => b.data as Record<string, unknown>);

  it('has one entry per COPY block, with every field (compare and example included) copied exactly', () => {
    expect(blocks).toHaveLength(5);
    expect(FIVE_QUESTIONS.map((q, i) => ({ ...q, number: i + 1 }))).toEqual(blocks);
  });

  it('every question has compare and example text', () => {
    for (const q of FIVE_QUESTIONS) {
      expect(q.compare.length, q.id).toBeGreaterThan(20);
      expect(q.example.length, q.id).toBeGreaterThan(20);
    }
  });
});
