#!/usr/bin/env node
/**
 * Generates web/src/lib/glossary.data.ts from docs/design/COPY.md.
 *
 * COPY.md §0.1: data lives only in fenced code blocks whose info string is `yaml <kind>`.
 * This script reads the kinds the glossary and the explain/compare layer need:
 *   glossary · news · news-extra · explain · explain-extra · formats · example-company
 * and writes them as one typed constant, COPY_DATA. Every word players read in InfoTips,
 * the Learn glossary, "What this means" lines and ExplainRows comes from that constant.
 *
 * The YAML reader below is a small, strict subset parser (block maps and sequences, flow
 * `[...]` and `{...}`, quoted and plain scalars, comments). It needs no dependency and
 * throws with a COPY.md line number on anything it does not understand.
 *
 * Usage (from the repo root or web/):
 *   node web/scripts/build-glossary.mjs           write src/lib/glossary.data.ts
 *   node web/scripts/build-glossary.mjs --check   exit 1 when the file is out of date
 *
 * web/src/lib/glossary.sync.test.ts re-runs the parser and fails when the file is stale.
 */

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COPY_PATH = resolve(HERE, '../../docs/design/COPY.md');
export const OUT_PATH = resolve(HERE, '../src/lib/glossary.data.ts');

// ─── YAML subset ─────────────────────────────────────────────────────────────

class YamlError extends Error {
  constructor(lineNo, message) {
    super(`line ${lineNo}: ${message}`);
    this.name = 'YamlError';
  }
}

/** Removes a `#` comment that starts outside quotes (at column 0 or after whitespace). */
function stripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote === '"') {
      if (c === '\\') i++;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'") {
        if (raw[i + 1] === "'") i++;
        else quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t')) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const PLAIN_KEY = /^[A-Za-z_$][\w$.-]*$/;

/** YAML 1.2 core-schema resolution of a plain scalar. */
function plainScalar(text, lineNo) {
  const s = text.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s === 'true' || s === 'True' || s === 'TRUE') return true;
  if (s === 'false' || s === 'False' || s === 'FALSE') return false;
  if (NUMBER.test(s)) return Number(s);
  if (/^[&*!|>%@`]/.test(s)) throw new YamlError(lineNo, `unsupported YAML syntax "${s}"`);
  return s;
}

const ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', '0': '\0', b: '\b', f: '\f' };

/** Parses one inline value: quoted string, flow sequence/map or plain scalar. */
function parseInline(src, lineNo) {
  let i = 0;
  const fail = (msg) => {
    throw new YamlError(lineNo, `${msg} in "${src}"`);
  };
  const skipWs = () => {
    while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
  };

  const doubleQuoted = () => {
    i++;
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        const e = src[i + 1];
        if (e === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad \\u escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        if (e === undefined || !(e in ESCAPES)) fail(`unsupported escape \\${e ?? ''}`);
        out += ESCAPES[e];
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
    return fail('unterminated string');
  };

  const singleQuoted = () => {
    i++;
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === "'") {
        if (src[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        i++;
        return out;
      }
      out += c;
      i++;
    }
    return fail('unterminated string');
  };

  const plain = (inFlow) => {
    const start = i;
    while (i < src.length) {
      const c = src[i];
      if (inFlow && (c === ',' || c === ']' || c === '}')) break;
      i++;
    }
    return plainScalar(src.slice(start, i), lineNo);
  };

  const flowKey = () => {
    skipWs();
    if (src[i] === '"') return doubleQuoted();
    if (src[i] === "'") return singleQuoted();
    const start = i;
    while (i < src.length && src[i] !== ':' && src[i] !== ',' && src[i] !== '}') i++;
    const key = src.slice(start, i).trim();
    if (!PLAIN_KEY.test(key)) fail(`bad key "${key}"`);
    return key;
  };

  const value = (inFlow) => {
    skipWs();
    const c = src[i];
    if (c === '"') return doubleQuoted();
    if (c === "'") return singleQuoted();
    if (c === '[') return flowSeq();
    if (c === '{') return flowMap();
    return plain(inFlow);
  };

  function flowSeq() {
    i++;
    const out = [];
    skipWs();
    if (src[i] === ']') {
      i++;
      return out;
    }
    for (;;) {
      out.push(value(true));
      skipWs();
      if (src[i] === ',') {
        i++;
        continue;
      }
      if (src[i] === ']') {
        i++;
        return out;
      }
      return fail('expected "," or "]"');
    }
  }

  function flowMap() {
    i++;
    const out = {};
    skipWs();
    if (src[i] === '}') {
      i++;
      return out;
    }
    for (;;) {
      const key = flowKey();
      skipWs();
      if (src[i] !== ':') fail(`expected ":" after "${key}"`);
      i++;
      if (Object.prototype.hasOwnProperty.call(out, key)) fail(`duplicate key "${key}"`);
      out[key] = value(true);
      skipWs();
      if (src[i] === ',') {
        i++;
        continue;
      }
      if (src[i] === '}') {
        i++;
        return out;
      }
      return fail('expected "," or "}"');
    }
  }

  const result = value(false);
  skipWs();
  if (i < src.length) fail(`unexpected "${src.slice(i)}"`);
  return result;
}

/** Splits `key: rest` (rest may be empty). Returns null when the text is not a map entry. */
function splitEntry(text) {
  let key;
  let after;
  if (text[0] === '"' || text[0] === "'") {
    const q = text[0];
    let j = 1;
    let raw = '';
    for (; j < text.length; j++) {
      if (q === '"' && text[j] === '\\') {
        raw += text[j] + text[j + 1];
        j++;
        continue;
      }
      if (text[j] === q) {
        if (q === "'" && text[j + 1] === "'") {
          raw += "''";
          j++;
          continue;
        }
        break;
      }
      raw += text[j];
    }
    if (j >= text.length) return null;
    after = text.slice(j + 1);
    if (!(after.startsWith(': ') || after === ':')) return null;
    key = parseInline(q + raw + q, 0);
    return { key, rest: after.slice(1).trim() };
  }
  const m = /^([^\s:"'{}[\],#][^:]*?):(?:\s+|$)/.exec(text);
  if (!m) return null;
  key = m[1].trim();
  if (!PLAIN_KEY.test(key)) return null;
  return { key, rest: text.slice(m[0].length).trim() };
}

const isSeqItem = (text) => text === '-' || text.startsWith('- ');

/**
 * Parses a YAML document made of block maps, block sequences and inline values.
 * `firstLine` is the 1-based line number of `text` inside its file, for error messages.
 */
export function parseYaml(text, firstLine = 1) {
  const lines = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const no = firstLine + index;
    const stripped = stripComment(raw).replace(/\s+$/, '');
    if (stripped.trim() === '') return;
    const indent = /^ */.exec(stripped)[0].length;
    if (stripped[indent] === '\t') throw new YamlError(no, 'tabs are not allowed for indentation');
    lines.push({ indent, text: stripped.slice(indent), no });
  });
  if (lines.length === 0) return null;

  let pos = 0;

  const parseNode = (indent) => (isSeqItem(lines[pos].text) ? parseSeq(indent) : parseMap(indent));

  /** Value of a `key:` or `-` with nothing after it: the indented block below, or null. */
  const nestedBlock = (indent, allowSameIndentSeq) => {
    const next = lines[pos];
    if (next && (next.indent > indent || (allowSameIndentSeq && next.indent === indent && isSeqItem(next.text)))) {
      return parseNode(next.indent);
    }
    return null;
  };

  function parseMap(indent) {
    const out = {};
    while (pos < lines.length) {
      const line = lines[pos];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new YamlError(line.no, 'unexpected indentation');
      if (isSeqItem(line.text)) throw new YamlError(line.no, 'sequence item where a "key: value" line was expected');
      const entry = splitEntry(line.text);
      if (!entry) throw new YamlError(line.no, `expected "key: value", got "${line.text}"`);
      if (Object.prototype.hasOwnProperty.call(out, entry.key)) {
        throw new YamlError(line.no, `duplicate key "${entry.key}"`);
      }
      pos++;
      out[entry.key] = entry.rest === '' ? nestedBlock(indent, true) : parseInline(entry.rest, line.no);
    }
    return out;
  }

  function parseSeq(indent) {
    const out = [];
    while (pos < lines.length) {
      const line = lines[pos];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new YamlError(line.no, 'unexpected indentation');
      if (!isSeqItem(line.text)) break;
      const rest = line.text.slice(1).trimStart();
      if (rest === '') {
        pos++;
        out.push(nestedBlock(indent, false));
      } else if (rest[0] !== '[' && rest[0] !== '{' && splitEntry(rest)) {
        // "- key: value" opens a map whose later keys align with "key".
        const column = indent + (line.text.length - rest.length);
        lines[pos] = { indent: column, text: rest, no: line.no };
        out.push(parseMap(column));
      } else {
        pos++;
        out.push(parseInline(rest, line.no));
      }
    }
    return out;
  }

  const value = parseNode(lines[0].indent);
  if (pos < lines.length) throw new YamlError(lines[pos].no, 'unexpected indentation');
  return value;
}

// ─── COPY.md blocks ──────────────────────────────────────────────────────────

const OPEN_DATA = /^```yaml[ \t]+([a-z][a-z0-9-]*)[ \t]*$/;
const OPEN_ANY = /^```/;
const CLOSE = /^```[ \t]*$/;

/** Every ```yaml <kind> block in document order, parsed. Other fenced blocks are skipped. */
export function extractBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN_DATA.exec(lines[i]);
    if (!open && !OPEN_ANY.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !CLOSE.test(lines[end])) end++;
    if (end >= lines.length) throw new YamlError(i + 1, 'unterminated code fence');
    if (open) {
      const body = lines.slice(i + 1, end).join('\n');
      blocks.push({ kind: open[1], line: i + 1, data: parseYaml(body, i + 2) });
    }
    i = end;
  }
  return blocks;
}

// ─── Shaping and validation ──────────────────────────────────────────────────

const GLOSSARY_GROUPS = ['basics', 'profit', 'growth', 'debt', 'value', 'trading', 'game'];
const GLOSSARY_KEYS = ['id', 'group', 'label', 'term', 'whatItIs', 'whyItMatters', 'usuallyGoodWhen', 'related'];
const NEWS_KEYS = ['type', 'badge', 'bullish', 'bearish'];
const EXPLAIN_STRING_KEYS = ['id', 'label', 'valueFormat', 'sentence'];
const EXPLAIN_OPTIONAL_KEYS = ['money', 'pct', 'flatBelow', 'compareNote', 'whenZero', 'whenFlat', 'whenNegative', 'whenNull', 'nullWhen'];
const EXPLAIN_EXAMPLE_KEYS = ['example', 'lossExample', 'nullExample', 'zeroExample'];

function where(block) {
  return `COPY.md line ${block.line} (${block.kind})`;
}

function requireObject(block) {
  if (!block.data || typeof block.data !== 'object' || Array.isArray(block.data)) {
    throw new Error(`${where(block)}: expected a map`);
  }
  return block.data;
}

function rejectUnknownKeys(block, data, allowed) {
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) throw new Error(`${where(block)}: unknown key "${key}" (update build-glossary.mjs and copyTypes.ts)`);
  }
}

function requireString(block, data, key) {
  if (typeof data[key] !== 'string' || data[key].length === 0) {
    throw new Error(`${where(block)}: "${key}" must be a non-empty string`);
  }
  return data[key];
}

function shapeGlossary(block) {
  const d = requireObject(block);
  rejectUnknownKeys(block, d, GLOSSARY_KEYS);
  const entry = {};
  for (const key of GLOSSARY_KEYS.slice(0, 7)) entry[key] = requireString(block, d, key);
  if (!GLOSSARY_GROUPS.includes(entry.group)) throw new Error(`${where(block)}: unknown group "${entry.group}"`);
  if (!Array.isArray(d.related) || d.related.some((r) => typeof r !== 'string')) {
    throw new Error(`${where(block)}: "related" must be a list of ids`);
  }
  entry.related = [...d.related];
  return entry;
}

function shapeNews(block) {
  const d = requireObject(block);
  rejectUnknownKeys(block, d, NEWS_KEYS);
  const entry = {};
  for (const key of NEWS_KEYS) entry[key] = requireString(block, d, key);
  return entry;
}

function shapeExample(block, key, ex) {
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) throw new Error(`${where(block)}: "${key}" must be a map`);
  rejectUnknownKeys(block, ex, ['value', 'valueText', 'sentence', 'averageText']);
  if (!(ex.value === null || typeof ex.value === 'number')) throw new Error(`${where(block)}: ${key}.value must be a number or null`);
  const out = { value: ex.value, valueText: requireString(block, ex, 'valueText'), sentence: requireString(block, ex, 'sentence') };
  if (ex.averageText !== undefined) out.averageText = requireString(block, ex, 'averageText');
  return out;
}

function shapeExplain(block) {
  const d = requireObject(block);
  rejectUnknownKeys(block, d, [...EXPLAIN_STRING_KEYS, ...EXPLAIN_OPTIONAL_KEYS, ...EXPLAIN_EXAMPLE_KEYS]);
  const entry = {};
  for (const key of EXPLAIN_STRING_KEYS) entry[key] = requireString(block, d, key);
  for (const key of EXPLAIN_OPTIONAL_KEYS) {
    if (d[key] === undefined) continue;
    if (key === 'flatBelow') {
      if (typeof d[key] !== 'number') throw new Error(`${where(block)}: "flatBelow" must be a number`);
      entry[key] = d[key];
    } else {
      entry[key] = requireString(block, d, key);
    }
  }
  for (const key of EXPLAIN_EXAMPLE_KEYS) {
    if (d[key] !== undefined) entry[key] = shapeExample(block, key, d[key]);
  }
  return entry;
}

function uniqueBy(list, key, kind) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item[key])) throw new Error(`COPY.md: duplicate ${kind} "${item[key]}"`);
    seen.add(item[key]);
  }
  return list;
}

/** Parses COPY.md and returns the COPY_DATA object written to glossary.data.ts. */
export function buildCopyData(markdown) {
  const blocks = extractBlocks(markdown);
  const ofKind = (kind) => blocks.filter((b) => b.kind === kind);
  const single = (kind) => {
    const list = ofKind(kind);
    if (list.length !== 1) throw new Error(`COPY.md: expected exactly one "yaml ${kind}" block, found ${list.length}`);
    return requireObject(list[0]);
  };
  return {
    glossary: uniqueBy(ofKind('glossary').map(shapeGlossary), 'id', 'glossary id'),
    news: uniqueBy(ofKind('news').map(shapeNews), 'type', 'news type'),
    newsExtra: single('news-extra'),
    explain: uniqueBy(ofKind('explain').map(shapeExplain), 'id', 'explain id'),
    explainExtra: single('explain-extra'),
    formats: single('formats'),
    exampleCompany: single('example-company'),
  };
}

/** The TypeScript module text for glossary.data.ts. */
export function renderModule(data) {
  return [
    '// AUTO-GENERATED by web/scripts/build-glossary.mjs from docs/design/COPY.md. Do not edit by hand.',
    '// Edit COPY.md, then run `node web/scripts/build-glossary.mjs`. glossary.sync.test.ts fails when this is stale.',
    "import type { CopyData } from './copyTypes';",
    '',
    `export const COPY_DATA: CopyData = ${JSON.stringify(data, null, 2)};`,
    '',
  ].join('\n');
}

function main(args) {
  const data = buildCopyData(readFileSync(COPY_PATH, 'utf8'));
  const text = renderModule(data);
  const shown = relative(process.cwd(), OUT_PATH);
  if (args.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT_PATH, 'utf8');
    } catch {
      current = '';
    }
    // Line endings aside: a CRLF checkout of an up-to-date file is still up to date.
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error(`${shown} is out of date. Run: node web/scripts/build-glossary.mjs`);
      process.exit(1);
    }
    console.log(`${shown} is up to date.`);
    return;
  }
  writeFileSync(OUT_PATH, text);
  console.log(
    `Wrote ${shown}: ${data.glossary.length} glossary terms, ${data.news.length} news types, ${data.explain.length} explain templates.`,
  );
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) main(process.argv.slice(2));
