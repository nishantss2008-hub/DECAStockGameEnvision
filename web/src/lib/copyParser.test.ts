import { describe, it, expect } from 'vitest';
import { parseYaml, extractBlocks } from '../../scripts/build-glossary.mjs';

describe('parseYaml (COPY.md subset)', () => {
  it('reads scalars: quoted strings, numbers, null and booleans', () => {
    expect(
      parseYaml(
        [
          'id: stock',
          'label: "Share of a company: \\"quoted\\""',
          "single: 'it''s'",
          'n: 0.140',
          'big: 6.61e9',
          'neg: -0.035',
          'none: null',
          'tilde: ~',
          'yes: true',
          'fix: null',
        ].join('\n'),
      ),
    ).toEqual({
      id: 'stock',
      label: 'Share of a company: "quoted"',
      single: "it's",
      n: 0.14,
      big: 6.61e9,
      neg: -0.035,
      none: null,
      tilde: null,
      yes: true,
      fix: null,
    });
  });

  it('reads nested maps, flow sequences, flow maps and block sequences', () => {
    const src = [
      'related: [price, marketCap]',
      'values:',
      '  price: { value: 84.12, source: brief }',
      '  byYear: { value: [6.61e9, 7.18e9], source: brief, note: "a, b: c" }',
      'examples:',
      '  - "Sector average: 22.1"',
      '  - plain text here',
      'steps:',
      '  - id: research',
      '    title: "Research a company"',
      '  - id: order',
      '    title: "Place an order"',
      'empty: []',
      'emptyMap: {}',
      '# a comment line',
      'trailing: value # comment',
    ].join('\n');
    expect(parseYaml(src)).toEqual({
      related: ['price', 'marketCap'],
      values: {
        price: { value: 84.12, source: 'brief' },
        byYear: { value: [6.61e9, 7.18e9], source: 'brief', note: 'a, b: c' },
      },
      examples: ['Sector average: 22.1', 'plain text here'],
      steps: [
        { id: 'research', title: 'Research a company' },
        { id: 'order', title: 'Place an order' },
      ],
      empty: [],
      emptyMap: {},
      trailing: 'value',
    });
  });

  it('keeps # inside quoted strings and rejects malformed lines', () => {
    expect(parseYaml('k: "a # b"')).toEqual({ k: 'a # b' });
    expect(() => parseYaml('just words without a colon')).toThrow(/line 1/);
    expect(() => parseYaml('a: 1\na: 2')).toThrow(/duplicate key/i);
  });
});

describe('extractBlocks', () => {
  it('routes fenced ```yaml <kind> blocks and ignores other fences', () => {
    const md = ['# Title', '```yaml glossary', 'id: a', '```', 'text', '```yaml', 'ignored: true', '```', '```yaml news', 'type: storm', '```'].join('\n');
    expect(extractBlocks(md).map((b) => [b.kind, b.data])).toEqual([
      ['glossary', { id: 'a' }],
      ['news', { type: 'storm' }],
    ]);
  });
});
