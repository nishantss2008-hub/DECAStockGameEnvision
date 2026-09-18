/**
 * The Market status sheet's tick stamp has to fit its row (MOBILE §7.9).
 *
 * REPORTED after the sheet was tightened to 307px: "Tick 1,284 of 5,760 · 22.3% · as of 14:02:30" was cut
 * off at the sheet's right edge. The height had nothing to do with it. The row is a `KeyValueRow` rendered
 * `stacked`, so the value already gets its own full-width line — but `.ios-row__kv-value` was
 * `white-space: nowrap` in every layout, which is right beside a short label and wrong on a line of its
 * own: the stamp is about 285px of text against the 224px a 320px phone leaves inside the row, and
 * `.ios-list__card` is `overflow: clip`, so the overflow was cut rather than scrolled. Now it wraps.
 *
 * jsdom does no layout, so what these pin is the chain that makes clipping possible and the one rule that
 * breaks it — plus the arithmetic of the narrowest supported width, which is what made it visible.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GameState } from '@deca/shared';

const HOUR = 3_600_000;
const NOW = new Date(2026, 8, 14, 14, 2, 40).getTime();

/** A 48-hour game: the longest tick stamp the app can print (5,760 ticks, a 4-digit total). */
const GAME = {
  phase: 'live',
  gameLengthMs: 48 * HOUR,
  startingCapital: 25_000_000,
  feeBps: 10,
  researchEdge: 'normal',
  maxPositionPct: 0.5,
  currency: { name: 'doubloons', symbol: 'Ð' },
  startAt: NOW - 10 * HOUR,
  endAt: NOW + 38 * HOUR,
  pausedAt: null,
  endedAt: null,
  currentTick: 1284,
  tickIntervalMs: 30_000,
  totalTicks: 5760,
  sessionTicks: 720,
  serverTime: NOW,
  lastTickAt: NOW - 10_000,
  marketCreatedAt: 0,
} as GameState;

vi.mock('../shell/ShellData', () => ({
  useShellGame: () => ({ game: GAME, team: { id: 'crew-2', name: 'Tortuga Capital' }, online: true }),
  useShellNow: () => NOW,
}));

import StatusSheet from './StatusSheet';

const css = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
const listRowCss = css('../components/ios/ListRow.css');
const listCss = css('../components/ios/InsetGroupedList.css');

/** The declarations of the first rule whose selector contains `needle`. */
function rule(sheet: string, needle: string): string {
  const match = sheet.split('}').find((block) => block.split('{')[0]?.includes(needle));
  return match?.split('{')[1] ?? '';
}

const show = () =>
  render(
    <MemoryRouter initialEntries={['/portfolio?sheet=status']}>
      <StatusSheet open onClose={vi.fn()} onClosed={vi.fn()} />
    </MemoryRouter>,
  );

/**
 * The narrowest supported phone, spent from the outside in: the sheet body's own `--sheet-pad`, the
 * shell's `--gutter-*` on `.bx-sheet-body`, and the row's 16px padding. `--margin` is 16px below 744px.
 */
const COLUMN_320 = 320 - 2 * (16 + 16 + 16);

describe('the tick stamp fits the status sheet', () => {
  it('leaves 224px inside the row at 320px, which one line of the stamp cannot have', () => {
    expect(COLUMN_320).toBe(224);
    // ~8px per character at Body 17px is generous for tabular digits; the stamp is far past the column.
    const stamp = 'Tick 1,284 of 5,760 · 22.3% · as of 14:02:30';
    expect(stamp.length * 8).toBeGreaterThan(COLUMN_320);
  });

  it('is clipped, not scrolled, when it overflows — so it must never overflow', () => {
    expect(rule(listCss, '.ios-list__card')).toMatch(/overflow:\s*clip/);
  });

  it('wraps on its own line, in the stacked layout and under large text alike', () => {
    const stacked = rule(listRowCss, '.ios-row--stacked) .ios-row__kv-value');
    expect(stacked).toMatch(/white-space:\s*normal/);
    // The valve for one token wider than the column, e.g. a renamed currency at AX5.
    expect(stacked).toMatch(/overflow-wrap:\s*anywhere/);
    // Both layouts that put the value on its own line are covered by that one selector.
    const selector = listRowCss.split('}').find((b) => b.includes('.ios-row--stacked) .ios-row__kv-value'))?.split('{')[0] ?? '';
    expect(selector).toContain('html[data-large-text] .ios-row');
  });

  it('still keeps a short value whole beside its label', () => {
    // Side by side, a value is a tabular number: "Ð84.12" must not break across two lines.
    expect(rule(listRowCss, '.ios-row__kv-value')).toMatch(/white-space:\s*nowrap/);
  });

  it('gives the stamp its own line and prints all of it', async () => {
    show();
    const dialog = await screen.findByRole('dialog');
    const value = within(dialog).getByText(/Tick 1,284 of 5,760/);
    // Nothing is truncated at the source: the whole stamp, ending in the time, is in the DOM.
    expect(value.textContent).toBe('Tick 1,284 of 5,760 · 22.3% · as of 14:02:30');
    // `stacked` is what moves it off the label's line; without it there is no room to wrap into.
    expect(value.closest('.ios-row')).toHaveClass('ios-row--stacked');
  });

  it('keeps the label and its "?" reachable beside the wrapped value', async () => {
    show();
    const dialog = await screen.findByRole('dialog');
    // The label's last word is wrapped with its "?" so the two never separate (labelText.ts).
    expect(dialog.querySelector('.ios-row__label')?.textContent).toContain('Price update');
    expect(within(dialog).getByRole('button', { name: /What is Price update/ })).toBeInTheDocument();
  });
});
