#!/usr/bin/env node
/**
 * crew-sheet.mjs — create the crews for a game and print the handout.
 *
 * One command turns "I need twelve teams by fourth period" into twelve crews on
 * the server and a printable sheet of cut-out cards, each with a crew name, a
 * password a fourteen-year-old can actually type, the game address, and a QR
 * code that opens it.
 *
 *   node deploy/crew-sheet.mjs --url https://decastock.duckdns.org --count 12
 *   node deploy/crew-sheet.mjs --url https://decastock.duckdns.org --names crews.json
 *   node deploy/crew-sheet.mjs --url https://decastock.duckdns.org --count 6 --dry-run
 *
 * Options
 *   --url URL           The address students use. Required.
 *   --count N           Create N crews using ship names from the built-in list.
 *   --names FILE        JSON file: ["Black Pearl", "Sea Dog"] or {"crews": [...]}.
 *   --names-list "A,B"  Comma-separated names, inline.
 *   --password PASS     Host password. Better: leave it out and be prompted,
 *                       or set ADMIN_PASSWORD, so it stays out of your shell history.
 *   --api-base URL      Only if the API is not served from --url.
 *   --out FILE          Where to write the handout. Default ~/crew-sheet.html
 *   --reset-existing    A crew that already exists gets a new password instead
 *                       of stopping the run.
 *   --dry-run           Generate names, passwords and the sheet, but do not
 *                       touch the server. Good for checking the print layout.
 *   --self-test         Run the built-in QR-encoder checks and exit.
 *
 * The output file holds every crew's password, so it is written with mode 600
 * and the passwords are never printed to the terminal. Print it, cut it up,
 * hand it out, then delete the file.
 *
 * No dependencies — not even a QR library. The QR codes below are generated
 * here and emitted as inline SVG, so the handout is a single self-contained
 * file that prints correctly on a school computer with no internet.
 */

import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import process from 'node:process';

// ===========================================================================
// QR code encoder (ISO/IEC 18004), byte mode, versions 1-40, all four EC levels.
//
// Written out rather than installed because a handout that depends on `npm i`
// working on a school laptop the morning of the event is not a handout.
// Run `--self-test` to check it against values from the specification.
// ===========================================================================

/** Error-correction codewords per block, indexed [level][version]. Index 0 is unused. */
const ECC_CODEWORDS_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

/** Number of error-correction blocks, indexed [level][version]. */
const ECC_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

/** The two bits that identify each EC level inside the format information. */
const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/** The 15-bit format information: 5 data bits, 10 BCH bits, XORed with the spec's mask. */
function formatBits(ecl, mask) {
  const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Multiply in GF(256) with the QR primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D). */
function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Reed-Solomon generator polynomial of the given degree, high-to-low, leading 1 implied. */
function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The remainder of data divided by the generator polynomial — i.e. the EC codewords. */
function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
  }
  return result;
}

/** Total data+EC bits available in a symbol of this version, before the 8-bit rounding. */
function numRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Codewords available for the message itself, after error correction takes its share. */
function numDataCodewords(version, ecl) {
  return (
    Math.floor(numRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl][version] * ECC_BLOCKS[ecl][version]
  );
}

/** Row/column centres of the alignment patterns for a version. */
function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** Split the message into blocks, add EC codewords to each, and interleave as the spec requires. */
function addEccAndInterleave(version, ecl, data) {
  const numBlocks = ECC_BLOCKS[ecl][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const divisor = rsDivisor(blockEccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = Array.from(data.slice(k, k + len));
    k += len;
    const ecc = Array.from(rsRemainder(dat, divisor));
    // Short blocks get a placeholder byte so every block is the same length for
    // interleaving; the placeholder is skipped again on the way out.
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
    }
  }
  return result;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

/**
 * Encode `text` as a QR symbol. Returns a square array of arrays of booleans,
 * true meaning a dark module. `ecl` is 'L' | 'M' | 'Q' | 'H'.
 */
function encodeQr(text, ecl = 'M') {
  const bytes = Array.from(Buffer.from(text, 'utf8'));

  // Smallest version the message fits in at this EC level.
  let version = 0;
  for (let v = 1; v <= 40; v++) {
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= numDataCodewords(v, ecl) * 8) {
      version = v;
      break;
    }
  }
  if (version === 0) throw new Error(`"${text.slice(0, 40)}..." is too long for a QR code at EC level ${ecl}`);

  // ---- bit stream: mode indicator, character count, payload, terminator, padding
  const bits = [];
  const appendBits = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  appendBits(0b0100, 4); // byte mode
  appendBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) appendBits(b, 8);

  const capacityBits = numDataCodewords(version, ecl) * 8;
  appendBits(0, Math.min(4, capacityBits - bits.length)); // terminator
  appendBits(0, (8 - (bits.length % 8)) % 8); // pad to a whole byte
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);

  const dataCodewords = new Uint8Array(bits.length / 8);
  bits.forEach((bit, i) => {
    if (bit) dataCodewords[i >>> 3] |= 0x80 >>> (i & 7);
  });

  const allCodewords = addEccAndInterleave(version, ecl, dataCodewords);

  // ---- draw
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };

  const drawAlignment = (cx, cy) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  const drawFormatBits = (mask) => {
    const fmt = formatBits(ecl, mask);
    for (let i = 0; i <= 5; i++) setFunction(8, i, getBit(fmt, i));
    setFunction(8, 7, getBit(fmt, 6));
    setFunction(8, 8, getBit(fmt, 7));
    setFunction(7, 8, getBit(fmt, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getBit(fmt, i));

    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, getBit(fmt, i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, getBit(fmt, i));
    setFunction(8, size - 8, true); // always dark
  };

  const drawVersionBits = () => {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const value = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(value, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  const align = alignmentPositions(version);
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === align.length - 1) ||
        (i === align.length - 1 && j === 0);
      if (!corner) drawAlignment(align[i], align[j]);
    }
  }
  drawFormatBits(0); // placeholder; rewritten once the mask is chosen
  drawVersionBits();

  // Data, in the two-module-wide zigzag from the bottom-right corner.
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < allCodewords.length * 8) {
          modules[y][x] = getBit(allCodewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex++;
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0; break;
        }
        if (invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  /** The spec's four penalty rules; the lowest-scoring mask is the one we keep. */
  const penalty = () => {
    let score = 0;
    const FINDER_A = '10111010000';
    const FINDER_B = '00001011101';

    const scoreLine = (line) => {
      let runColor = line[0];
      let runLength = 1;
      for (let i = 1; i < line.length; i++) {
        if (line[i] === runColor) {
          runLength++;
        } else {
          if (runLength >= 5) score += 3 + (runLength - 5);
          runColor = line[i];
          runLength = 1;
        }
      }
      if (runLength >= 5) score += 3 + (runLength - 5);

      const s = line.join('');
      for (const pattern of [FINDER_A, FINDER_B]) {
        let from = s.indexOf(pattern);
        while (from !== -1) {
          score += 40;
          from = s.indexOf(pattern, from + 1);
        }
      }
    };

    for (let y = 0; y < size; y++) scoreLine(modules[y].map((m) => (m ? '1' : '0')));
    for (let x = 0; x < size; x++) scoreLine(modules.map((row) => (row[x] ? '1' : '0')));

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
      }
    }

    let dark = 0;
    for (const row of modules) for (const m of row) if (m) dark++;
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  };

  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormatBits(mask);
    const score = penalty();
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    applyMask(mask); // XOR again to undo
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);

  // isFunction and codewords come back out only so --self-test can read the
  // symbol again and prove the placement, mask and interleave round-trip.
  return { modules, isFunction, size, version, ecl, mask: bestMask, codewords: allCodewords };
}

/**
 * Render a QR symbol as inline SVG. One `<path>` of rectangles rather than one
 * element per module: a 45x45 symbol is 2,000 modules, and 2,000 <rect>s times
 * 30 cards is a file that crashes a school printer driver.
 */
function qrSvg(text, { size = 120, ecl = 'M', quiet = 4, title = '' } = {}) {
  const { modules, size: n } = encodeQr(text, ecl);
  const dim = n + quiet * 2;
  const parts = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  const label = title ? `<title>${escapeHtml(title)}</title>` : '';
  return (
    `<svg class="qr" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" ` +
    `role="img" aria-label="${escapeHtml(title || 'QR code')}" shape-rendering="crispEdges" ` +
    `xmlns="http://www.w3.org/2000/svg">${label}` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/>` +
    `<path fill="#000" d="${parts.join('')}"/></svg>`
  );
}

// ===========================================================================
// Passwords
// ===========================================================================

// Characters that survive a photocopier, a projector, and a fourteen-year-old
// reading them off a card into a phone. Every classic confusable pair has had
// BOTH halves removed, so there is nothing left to misread:
//   l I 1   ·   O o 0   ·   S s 5   ·   Z z 2   ·   g 9   ·   q (reads as g)
// Everything is lower case, so there is no shift-key guessing either.
const CONSONANTS = 'bcdfghjkmnprtvw';
const VOWELS = 'aeiu';
const DIGITS = '34678';
const PASSWORD_ALPHABET = CONSONANTS + VOWELS + DIGITS;

/**
 * A password like "bako-mitu-47": four pronounceable syllables in two chunks
 * plus two digits. (15 consonants x 4 vowels)^4 x 5^2 is about 28 bits, which
 * against a server that rate limits logins is far more than a classroom game
 * needs — and unlike a random string, it can be read aloud across a room.
 */
function makePassword() {
  const syllable = () => CONSONANTS[randomInt(CONSONANTS.length)] + VOWELS[randomInt(VOWELS.length)];
  const digits = DIGITS[randomInt(DIGITS.length)] + DIGITS[randomInt(DIGITS.length)];
  return `${syllable()}${syllable()}-${syllable()}${syllable()}-${digits}`;
}

// ===========================================================================
// Crew names
// ===========================================================================

const SHIP_NAMES = [
  'Black Pearl', 'Queen Anne', 'Flying Dutchman', 'Sea Dog', 'Jolly Roger',
  'Iron Kraken', 'Salt Wraith', 'Red Lantern', 'Storm Crow', 'Gilded Gull',
  'Bilge Rats', 'Tide Runner', 'Cutlass Dawn', 'Ghost Tide', 'Copper Compass',
  'Rum Runner', 'Silver Sextant', 'Anchor Rats', 'Doubloon Dogs', 'Reef Riders',
  'Wave Breaker', 'Night Harbour', 'Coral Bandits', 'Powder Monkeys', 'Mast Hounds',
  'Windward Nine', 'Leeward Loot', 'Barnacle Bay', 'Sable Sail', 'Brine Company',
  'Lantern Bay', 'Keelhaul Club', 'Cannon Cove', 'Marooned Six', 'Hardtack Crew',
  'Spyglass Ten', 'Grog Traders', 'Plank Walkers', 'Siren Song', 'Dead Reckoning',
];

function pickNames(count) {
  if (count > SHIP_NAMES.length) {
    throw new Error(`--count ${count} is more than the ${SHIP_NAMES.length} built-in ship names. Use --names with your own list.`);
  }
  const pool = SHIP_NAMES.slice();
  const chosen = [];
  for (let i = 0; i < count; i++) chosen.push(...pool.splice(randomInt(pool.length), 1));
  return chosen;
}

/** Same rule as shared/src/constants.ts slugifyTeamName — the crew id the API uses. */
function slugifyTeamName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ===========================================================================
// Server
// ===========================================================================

async function request(base, path, { method = 'GET', body, token, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The routes live at the root today. If they are ever moved behind /api this
 * finds them anyway, so the script does not need editing on the day.
 */
async function resolveApiBase(url, override) {
  const candidates = override ? [override.replace(/\/+$/, '')] : [url.replace(/\/+$/, ''), `${url.replace(/\/+$/, '')}/api`];
  for (const base of candidates) {
    try {
      const res = await request(base, '/health', { timeoutMs: 8000 });
      if (res.ok) return base;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    `Could not reach the game server. Tried:\n  ${candidates.map((c) => `${c}/health`).join('\n  ')}\n` +
      `Check the address, and that the server is up:  sudo systemctl status buccaneer`,
  );
}

async function hostLogin(base, password) {
  const res = await request(base, '/auth/login', { method: 'POST', body: { name: 'admin', password } });
  if (res.status === 401) throw new Error('The host password was refused. Check it and try again.');
  if (!res.ok || !res.json?.token) {
    throw new Error(`Sign-in failed (HTTP ${res.status}). ${res.json?.message ?? res.text?.slice(0, 200) ?? ''}`);
  }
  return res.json.token;
}

async function createCrew(base, token, name, password, resetExisting) {
  const res = await request(base, '/api/admin/teams', { method: 'POST', token, body: { name, password } });
  if (res.ok) return { status: 'created' };

  if (res.status === 409 && res.json?.error === 'exists') {
    if (!resetExisting) {
      return { status: 'exists', message: 'a crew with this name is already in the game (use --reset-existing to give it a new password)' };
    }
    const reset = await request(base, `/api/admin/teams/${encodeURIComponent(slugifyTeamName(name))}/password`, {
      method: 'POST',
      token,
      body: { password },
    });
    if (reset.ok) return { status: 'reset' };
    return { status: 'failed', message: `could not reset the password (HTTP ${reset.status}) ${reset.json?.message ?? ''}` };
  }
  if (res.status === 409) {
    return { status: 'failed', message: res.json?.message ?? 'the server is busy building a new game — wait for it to finish' };
  }
  if (res.status === 403) throw new Error('The server rejected the host token. Sign in again.');
  return { status: 'failed', message: `HTTP ${res.status} ${res.json?.message ?? res.text?.slice(0, 160) ?? ''}` };
}

// ===========================================================================
// The handout
// ===========================================================================

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildHtml({ url, crews, generatedAt, draft = false }) {
  const displayUrl = url.replace(/^https?:\/\//, '');
  const bigQr = qrSvg(url, { size: 520, ecl: 'M', quiet: 4, title: `Open ${displayUrl}` });

  const cards = crews
    .map(
      (crew) => `
      <article class="card">
        <div class="card-main">
          <p class="eyebrow">Your crew</p>
          <h2 class="crew">${escapeHtml(crew.name)}</h2>
          <p class="eyebrow">Your password</p>
          <p class="password">${escapeHtml(crew.password)}</p>
          <p class="note">Type both exactly as printed. Lower case, with the dashes.</p>
        </div>
        <div class="card-qr">
          ${qrSvg(url, { size: 108, ecl: 'M', quiet: 3, title: `Open ${displayUrl}` })}
          <p class="url">${escapeHtml(displayUrl)}</p>
        </div>
      </article>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buccaneer Exchange — crew cards</title>
<style>
  /* Print first: this document exists to come out of a printer. */
  @page { size: letter portrait; margin: 0.45in; }

  :root {
    --ink: #14181a;
    --ink-soft: #55605f;
    --rule: #b9c2c0;
    --accent: #0f4c3a;
  }

  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    padding: 24px;
    color: var(--ink);
    background: #fff;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.35;
  }

  /* ---------- page 1: the one you project or tape to the wall ---------- */
  .projector {
    min-height: 9.4in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 18px;
    break-after: page;
    page-break-after: always;
  }
  .projector .wordmark {
    font-size: 34pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0;
    color: var(--accent);
  }
  .projector .lead { font-size: 17pt; color: var(--ink-soft); margin: 0; }
  .projector .big-url {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 30pt;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 6px 0 0;
    word-break: break-all;
  }
  .projector .qr-wrap { border: 3px solid var(--ink); padding: 14px; background: #fff; }
  .projector .steps {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-size: 13pt;
    color: var(--ink-soft);
  }
  .projector .steps li { margin: 3px 0; }

  /* ---------- pages 2+: the cards you cut up ---------- */
  .sheet-title {
    font-size: 11pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-soft);
    border-bottom: 1px solid var(--rule);
    padding-bottom: 6px;
    margin: 0 0 14px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0;
  }
  .card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    min-height: 2.9in;
    border: 1px dashed var(--rule);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .card-main { min-width: 0; }
  .eyebrow {
    margin: 0;
    font-size: 8.5pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .crew {
    margin: 2px 0 12px;
    font-size: 21pt;
    line-height: 1.1;
    color: var(--accent);
  }
  .password {
    margin: 2px 0 10px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 19pt;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .note { margin: 0; font-size: 8.5pt; color: var(--ink-soft); }
  .card-qr { text-align: center; flex: 0 0 150px; }
  .card-qr .url {
    margin: 5px 0 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 7pt;
    line-height: 1.25;
    color: var(--ink-soft);
    /* break-word, not break-all: a normal host name stays on one line and only
       an unusually long one wraps, instead of every card reading "...duckdns.or / g". */
    overflow-wrap: break-word;
  }
  .card-qr .qr { margin: 0 auto; }
  /* The SVGs carry width/height attributes so they print at an exact physical
     size; this keeps them from pushing the page sideways on a phone screen. */
  .qr { display: block; max-width: 100%; height: auto; }

  footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid var(--rule);
    font-size: 8.5pt;
    color: var(--ink-soft);
  }

  /* --dry-run produced this sheet: the crews are NOT on the server and these
     passwords will not sign anybody in. Say so loudly and on every page, so a
     draft can never be mistaken for the real handout after it is printed. */
  .draft-banner {
    border: 2px solid #8a1c1c;
    background: #fbeaea;
    color: #8a1c1c;
    padding: 10px 14px;
    margin: 0 0 16px;
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: center;
  }
  .draft .card { position: relative; }
  .draft .card::after {
    content: "DRAFT — NOT ON THE SERVER";
    position: absolute;
    inset-inline: 0;
    bottom: 6px;
    text-align: center;
    font-size: 7pt;
    letter-spacing: 0.12em;
    color: #8a1c1c;
  }

  /* On a phone or laptop screen, stop pretending to be paper. */
  @media screen and (max-width: 760px) {
    body { padding: 16px; font-size: 11pt; }
    .cards { grid-template-columns: 1fr; }
    .card { flex-wrap: wrap; min-height: 0; padding: 14px; }
    .card-qr { flex: 0 0 auto; }
    .crew { font-size: 18pt; overflow-wrap: break-word; }
    .password { font-size: 16pt; overflow-wrap: break-word; }
    .projector { min-height: auto; padding: 24px 0 36px; }
    .projector .wordmark { font-size: 22pt; }
    .projector .big-url { font-size: 15pt; }
    .projector .lead, .projector .steps { font-size: 11pt; }
  }
  @media print {
    body { padding: 0; }
    footer { position: static; }
  }
</style>
</head>
<body${draft ? ' class="draft"' : ''}>
${draft ? '<p class="draft-banner">Draft only — these crews were never sent to the server and these passwords will not work. Re-run without --dry-run.</p>' : ''}
<section class="projector">
  <p class="wordmark">Buccaneer Exchange</p>
  <p class="lead">Point a phone camera at this, or type the address.</p>
  <div class="qr-wrap">${bigQr}</div>
  <p class="big-url">${escapeHtml(displayUrl)}</p>
  <ul class="steps">
    <li>1 &middot; Open the address on your phone.</li>
    <li>2 &middot; Sign in with the crew name and password on your card.</li>
    <li>3 &middot; Add it to your home screen when it offers.</li>
  </ul>
</section>

<h1 class="sheet-title">${draft ? 'DRAFT &middot; ' : ''}Crew cards &middot; cut along the dashed lines &middot; ${crews.length} crew${crews.length === 1 ? '' : 's'}</h1>
${draft ? '<p class="draft-banner">Draft only — not on the server.</p>' : ''}

<div class="cards">
${cards}
</div>

<footer>
  Generated ${escapeHtml(generatedAt)} &middot; ${escapeHtml(url)} &middot;
  This sheet contains every crew's password. Hand the cards out, then shred or delete the rest.
</footer>

</body>
</html>
`;
}

// ===========================================================================
// CLI
// ===========================================================================

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument "${token}". Run with --help.`);
    const key = token.slice(2);
    const boolean = ['dry-run', 'self-test', 'reset-existing', 'help'];
    if (boolean.includes(key)) {
      args.flags.add(key);
    } else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value.`);
      args[key] = value;
    }
  }
  return args;
}

function usage() {
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  const doc = src.slice(src.indexOf('/**') + 3, src.indexOf('*/'));
  console.log(doc.replace(/^\s*\* ?/gm, '').trim());
}

/** Read a line from the terminal without echoing it. */
function promptSecret(question) {
  return new Promise((resolveP, rejectP) => {
    if (!process.stdin.isTTY) {
      rejectP(new Error('No terminal to ask for the host password on. Pass --password or set ADMIN_PASSWORD.'));
      return;
    }
    process.stderr.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stderr.write('\n');
          resolveP(value);
          return;
        }
        if (ch === '') {
          process.stdin.setRawMode(false);
          process.stderr.write('\n');
          process.exit(130);
        }
        if (ch === '' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

/**
 * Check the encoder against values taken from the QR specification rather than
 * from another implementation. If these pass, the symbols scan.
 */
function selfTest() {
  const failures = [];
  const check = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok    ${label}`);
    else {
      console.log(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
      failures.push(label);
    }
  };

  // Total codewords per version (spec table 1): 26, 44, 70, 100, 134 ... 3706.
  check('raw codewords v1/v2/v3/v4/v5/v40',
    [1, 2, 3, 4, 5, 40].map((v) => Math.floor(numRawDataModules(v) / 8)),
    [26, 44, 70, 100, 134, 3706]);

  // Data codewords (spec table 7).
  check('data codewords v1 L/M/Q/H', ['L', 'M', 'Q', 'H'].map((e) => numDataCodewords(1, e)), [19, 16, 13, 9]);
  check('data codewords v5 L/M/Q/H', ['L', 'M', 'Q', 'H'].map((e) => numDataCodewords(5, e)), [108, 86, 62, 46]);
  check('data codewords v10 L/M/Q/H', ['L', 'M', 'Q', 'H'].map((e) => numDataCodewords(10, e)), [274, 216, 154, 122]);
  check('data codewords v40 L/M/Q/H', ['L', 'M', 'Q', 'H'].map((e) => numDataCodewords(40, e)), [2956, 2334, 1666, 1276]);

  // Every one of the 160 version/level pairs must produce a legal block layout.
  // A single mistyped digit in the tables above shows up here rather than as a
  // QR code that silently will not scan.
  const layoutProblems = [];
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    for (let v = 1; v <= 40; v++) {
      const raw = Math.floor(numRawDataModules(v) / 8);
      const blocks = ECC_BLOCKS[ecl][v];
      const eccLen = ECC_CODEWORDS_PER_BLOCK[ecl][v];
      const shortLen = Math.floor(raw / blocks);
      const shortBlocks = blocks - (raw % blocks);
      if (!(blocks >= 1 && eccLen >= 1)) layoutProblems.push(`v${v}${ecl} block/ecc count`);
      if (shortLen - eccLen < 1) layoutProblems.push(`v${v}${ecl} blocks hold no data`);
      if (shortBlocks < 1 || shortBlocks > blocks) layoutProblems.push(`v${v}${ecl} short-block count`);
      if (numDataCodewords(v, ecl) !== (shortLen - eccLen) * shortBlocks + (shortLen - eccLen + 1) * (blocks - shortBlocks)) {
        layoutProblems.push(`v${v}${ecl} capacity does not match its blocks`);
      }
    }
  }
  check('all 160 version/level block layouts are legal', layoutProblems, []);

  // Generator polynomials (spec annex A) given there as powers of alpha.
  const exp = new Uint8Array(256);
  for (let i = 0, x = 1; i < 256; i++) {
    exp[i] = x;
    x = gfMultiply(x, 2);
  }
  check('generator polynomial, degree 7',
    Array.from(rsDivisor(7)),
    [87, 229, 146, 149, 238, 102, 21].map((e) => exp[e]));
  check('generator polynomial, degree 10',
    Array.from(rsDivisor(10)),
    [251, 67, 46, 61, 118, 70, 64, 94, 32, 45].map((e) => exp[e]));

  // Alignment pattern centres (spec table E.1).
  check('alignment centres v2', alignmentPositions(2), [6, 18]);
  check('alignment centres v7', alignmentPositions(7), [6, 22, 38]);
  check('alignment centres v32', alignmentPositions(32), [6, 34, 60, 86, 112, 138]);

  // Format information (spec table C.1), as 15-bit strings.
  const fmt = (ecl, mask) => formatBits(ecl, mask).toString(2).padStart(15, '0');
  check('format info L/mask0', fmt('L', 0), '111011111000100');
  check('format info M/mask0', fmt('M', 0), '101010000010010');
  check('format info Q/mask0', fmt('Q', 0), '011010101011111');
  check('format info H/mask0', fmt('H', 0), '001011010001001');
  check('format info M/mask5', fmt('M', 5), '100000011001110');

  // Symbol geometry and the invariants a scanner depends on.
  const sample = encodeQr('https://decastock.duckdns.org', 'M');
  check('symbol size for that URL', sample.size, sample.version * 4 + 17);
  check('finder pattern, top-left corner is dark', sample.modules[0][0], true);
  check('finder separator, (7,7) is light', sample.modules[7][7], false);
  // Row 6 is the horizontal timing pattern: dark on even columns.
  check('horizontal timing pattern alternates',
    [8, 9, 10, 11].map((x) => sample.modules[6][x]),
    [true, false, true, false]);
  check('vertical timing pattern alternates',
    [8, 9, 10, 11].map((y) => sample.modules[y][6]),
    [true, false, true, false]);
  check('dark module at (8, size-8)', sample.modules[sample.size - 8][8], true);
  check('version information absent below v7', encodeQr('hi', 'M').version < 7, true);

  // Long payloads must still fit and stay square.
  const long = encodeQr('x'.repeat(1200), 'M');
  check('1200 bytes needs a version with version info', long.version >= 7, true);
  check('1200-byte symbol is square', long.modules.every((r) => r.length === long.size), true);

  // ---- Round trip: read the finished symbol back the way a scanner would.
  // This is the check that matters. It undoes the chosen mask, walks the same
  // zigzag, and rebuilds the codewords; if placement, masking or the data
  // stream were wrong, the bytes would not come back.
  const readBack = (qr) => {
    const { modules, isFunction, size, mask } = qr;
    const grid = modules.map((row) => row.slice());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0; break;
        }
        if (invert) grid[y][x] = !grid[y][x];
      }
    }
    const bits = [];
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x]) bits.push(grid[y][x] ? 1 : 0);
        }
      }
    }
    const out = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      out.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
    }
    return out;
  };

  const trip = encodeQr('https://decastock.duckdns.org', 'M');
  const recovered = readBack(trip);
  check('every codeword reads back out of the drawn symbol',
    recovered.slice(0, trip.codewords.length),
    trip.codewords);

  // A single-block symbol has no interleaving, so the codewords ARE the
  // message: decode the byte-mode header and compare to the original string.
  const short = encodeQr('BUCCANEER', 'M');
  check('short message uses a single EC block', ECC_BLOCKS.M[short.version], 1);
  const stream = readBack(short);
  const mode = stream[0] >> 4;
  const length = ((stream[0] & 0x0f) << 4) | (stream[1] >> 4);
  const decoded = Array.from({ length }, (_, i) => ((stream[1 + i] & 0x0f) << 4) | (stream[2 + i] >> 4));
  check('decoded mode indicator is byte mode', mode, 0b0100);
  check('decoded length', length, 9);
  check('decoded text', Buffer.from(decoded).toString('utf8'), 'BUCCANEER');

  // The SVG must be one self-contained element with no external references.
  const svg = qrSvg('https://example.org', { size: 100 });
  check('svg has no external reference', /https?:\/\/(?!www\.w3\.org)/.test(svg.replace('https://example.org', '')), false);
  check('svg is a single element', svg.startsWith('<svg') && svg.endsWith('</svg>'), true);

  // Passwords: right shape, and not one character outside the safe alphabet.
  check('safe alphabet excludes every confusable character',
    [...'lI1Oo0Ss5Zz2q9'].filter((c) => PASSWORD_ALPHABET.includes(c)),
    []);
  let malformed = 0;
  let unsafe = 0;
  const distinct = new Set();
  for (let i = 0; i < 5000; i++) {
    const pw = makePassword();
    distinct.add(pw);
    if (!/^[a-z]{4}-[a-z]{4}-[0-9]{2}$/.test(pw)) malformed++;
    for (const ch of pw.replace(/-/g, '')) if (!PASSWORD_ALPHABET.includes(ch)) unsafe++;
  }
  check('5000 passwords are well formed', malformed, 0);
  check('5000 passwords use only the safe alphabet', unsafe, 0);
  check('5000 passwords are near enough all distinct', distinct.size >= 4995, true);
  check('minimum length clears the server\'s 4-character rule', makePassword().length >= 12, true);

  console.log('');
  if (failures.length) {
    console.log(`${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has('help')) return usage();
  if (args.flags.has('self-test')) return selfTest();

  const url = (args.url ?? '').replace(/\/+$/, '');
  if (!url) {
    usage();
    throw new Error('\n--url is required, e.g. --url https://decastock.duckdns.org');
  }
  if (!/^https?:\/\//.test(url)) throw new Error(`--url must start with https:// — got "${url}"`);
  if (url.startsWith('http://')) {
    console.warn('  warning  That is a plain http:// address. Phones will not install the app from it,');
    console.warn('           and passwords cross the school network in the clear.');
  }

  // ---- decide on the crew names
  let names;
  if (args.names) {
    const parsed = JSON.parse(readFileSync(resolvePath(args.names), 'utf8'));
    names = Array.isArray(parsed) ? parsed : parsed.crews;
    if (!Array.isArray(names)) throw new Error(`${args.names} must be a JSON array of names, or {"crews": [...]}.`);
  } else if (args['names-list']) {
    names = args['names-list'].split(',');
  } else if (args.count) {
    const count = Number(args.count);
    if (!Number.isInteger(count) || count < 1) throw new Error(`--count must be a whole number of 1 or more — got "${args.count}"`);
    names = pickNames(count);
  } else {
    throw new Error('Say how many crews you want: --count 12, or --names crews.json, or --names-list "A,B,C".');
  }

  names = names.map((n) => String(n).trim()).filter(Boolean);
  if (!names.length) throw new Error('No crew names after trimming blanks.');
  const seen = new Set();
  for (const name of names) {
    const slug = slugifyTeamName(name);
    if (!slug) throw new Error(`"${name}" has no letters or digits, so it cannot be a crew name.`);
    if (seen.has(slug)) throw new Error(`Two crews would end up with the same id: "${name}". Crew names must be distinct.`);
    seen.add(slug);
  }

  const crews = names.map((name) => ({ name, password: makePassword(), status: 'pending' }));

  // ---- talk to the server, unless asked not to
  const dryRun = args.flags.has('dry-run');
  if (dryRun) {
    console.log('  --dry-run: nothing will be sent to the server.');
    crews.forEach((c) => { c.status = 'not created'; });
  } else {
    process.stdout.write(`  Finding the server at ${url} ... `);
    const base = await resolveApiBase(url, args['api-base']);
    console.log('found.');

    const password =
      args.password ?? process.env.ADMIN_PASSWORD ?? (await promptSecret('  Host password (not shown as you type): '));
    if (!password) throw new Error('The host password was empty.');

    process.stdout.write('  Signing in as the host ... ');
    const token = await hostLogin(base, password);
    console.log('signed in.');

    const resetExisting = args.flags.has('reset-existing');
    // A crew that has been created but whose password is only in this process's
    // memory is the one genuinely unrecoverable outcome here: the crew exists on
    // the server and nobody can sign in to it. So if something goes wrong
    // partway through, stop creating more — but never throw away what has
    // already been made. Fall through and write the sheet for those crews.
    let aborted = null;
    for (const crew of crews) {
      if (aborted) {
        crew.status = 'failed';
        crew.message = 'not attempted — the run stopped earlier';
        continue;
      }
      process.stdout.write(`  ${crew.name.padEnd(20)} `);
      let result;
      try {
        result = await createCrew(base, token, crew.name, crew.password, resetExisting);
      } catch (err) {
        console.log('STOPPED');
        aborted = err;
        crew.status = 'failed';
        crew.message = err.message;
        continue;
      }
      crew.status = result.status;
      crew.message = result.message;
      console.log(
        result.status === 'created' ? 'created'
          : result.status === 'reset' ? 'password reset'
          : `SKIPPED — ${result.message}`,
      );
    }
    if (aborted) {
      console.error(`\n  The run stopped: ${aborted.message}`);
      console.error('  The crews already created are on the server, and their passwords are only');
      console.error('  in the sheet below — it is written anyway so they are not lost.\n');
    }
  }

  // ---- the handout
  const failed = crews.filter((c) => c.status === 'exists' || c.status === 'failed');
  const usable = crews.filter((c) => c.status !== 'exists' && c.status !== 'failed');
  if (!usable.length) throw new Error('No crews were created, so there is nothing to print.');

  // Defaults to your home directory, not the current one. On the server you run
  // this from /opt/buccaneer, and a file full of passwords must not land inside
  // a git checkout where it could be committed by accident.
  const outPath = resolvePath(args.out ?? join(homedir(), 'crew-sheet.html'));
  const html = buildHtml({
    url,
    crews: usable,
    generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    draft: dryRun,
  });
  writeFileSync(outPath, html, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(outPath, 0o600);
  } catch {
    /* some filesystems (a mounted share) do not do modes; the file is still written */
  }

  console.log('');
  console.log(`  ${usable.length} crew${usable.length === 1 ? '' : 's'} ${dryRun ? 'generated' : 'on the server'}.`);
  if (failed.length) {
    console.log(`  ${failed.length} skipped — they are NOT on the printed sheet:`);
    failed.forEach((c) => console.log(`      ${c.name}: ${c.message}`));
    console.log('  Re-run with --reset-existing to give the existing crews new passwords instead.');
  }
  console.log('');
  console.log(`  Handout: ${outPath}`);
  console.log('           Page 1 is the projector / wall sheet. The rest are cards to cut up.');
  console.log('           Open it in a browser and print at 100% scale, no "fit to page".');
  console.log('');
  console.log('  That file contains every password in plain text. It is mode 600.');
  console.log('  Passwords were deliberately not printed here, so they are not in your scrollback.');
  console.log('  Delete the file once the cards are handed out.');
  console.log('');
}

main().catch((err) => {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
});
