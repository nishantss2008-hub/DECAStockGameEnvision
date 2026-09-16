/**
 * The two-column stat grid and the sheet one of its cells opens (MOBILE §7.7, spec §3 and §5).
 *
 * A cell shows label, value and the sector comparison as a caption — numbers you can scan. The
 * everyday sentence moves one tap away: every cell is a 44pt `<button>` with `aria-haspopup`, so
 * the explanation is reachable by tap, keyboard and screen reader alike. `StatSheet` renders the
 * same `ExplainRow` the list used to show inline, so no COPY §3.1 word is lost and the two
 * cannot drift. Stats with no explain template (session range, float, …) show their glossary
 * lines instead, the same text the "?" sheet shows anywhere else.
 *
 * The sheet lives in the URL (`?sheet=stat&id=peRatio`, MOBILE §6.5) but is rendered by the page,
 * because only the page has the company, its fundamentals and the sector averages.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleQuestionMark } from 'lucide-react';
import { ExplainRow } from '../ios/ListRow';
import { Sheet } from '../ios/Sheet';
import { INFO_TIP_COPY, InfoTipLines, glossaryTermPath } from '../ios/InfoTipSheet';
import { GLOSSARY } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';
import type { StatCell } from './researchModel';
import '../ios/Button.css';

export function statSheetRequest(cell: StatCell) {
  return { kind: 'stat', id: cell.id } as const;
}

export interface StatGridProps {
  cells: readonly StatCell[];
  onOpen: (cell: StatCell) => void;
  /** Metric id deep-linked from Learn ("See it on a company"), highlighted in place. */
  highlight?: string | null;
  /** Names the grid when it has no section header of its own. */
  'aria-label'?: string;
}

/** A two-column grid of stat cells. Each `<li>` keeps the `metric-{id}` anchor Learn links to. */
export function StatGrid({ cells, onOpen, highlight, 'aria-label': ariaLabel }: StatGridProps) {
  return (
    <ul className="rs-grid" role="list" aria-label={ariaLabel}>
      {cells.map((cell) => (
        <li
          key={cell.id}
          id={`metric-${cell.id}`}
          className="rs-grid__item"
          data-highlighted={highlight === cell.id || undefined}
        >
          <button type="button" className="rs-stat" aria-haspopup="dialog" onClick={() => onOpen(cell)}>
            <span className="rs-stat__label t-footnote">
              {cell.label}
              <CircleQuestionMark className="rs-stat__glyph" size={15} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="rs-stat__value t-title-3 ios-num">{cell.value}</span>
            {cell.caption && <span className="rs-stat__caption t-caption-1 ios-num">{cell.caption}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * `?sheet=stat&id=…`: one stat explained. Keeps the last cell on screen while the sheet animates
 * out, and closes itself when the URL names a stat this page does not show.
 */
export function StatSheet({ cells }: { cells: readonly StatCell[] }) {
  const { sheet, close } = useSheet();
  const id = sheet?.kind === 'stat' ? sheet.id : null;
  const [shownId, setShownId] = useState<string | null>(id);

  useEffect(() => {
    if (id) setShownId(id);
  }, [id]);

  const known = cells.some((c) => c.id === id);
  const open = id !== null && known;
  useEffect(() => {
    if (id !== null && !known && cells.length > 0) close();
  }, [id, known, cells.length, close]);

  const current = cells.find((c) => c.id === (id ?? shownId)) ?? null;
  if (!current) return null;
  const entry = GLOSSARY[current.termId] ?? null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      onClosed={() => setShownId(null)}
      title={current.label}
      subtitle={entry?.term}
      headerLayout="leading"
      detents="fit"
      scrim="info"
      closeLabel={INFO_TIP_COPY.close}
      className="rs-stat-sheet"
    >
      {current.explained ? (
        <ul className="ios-list__card rs-stat-sheet__card" role="list">
          <ExplainRow label={current.label} explained={current.explained} />
        </ul>
      ) : entry ? (
        <InfoTipLines entry={entry} density="inline" />
      ) : null}
      {entry && (
        <div className="rs-stat-sheet__actions">
          <Link to={glossaryTermPath(entry.id)} className="ios-button" data-style="tinted" data-size="medium">
            <span className="ios-button__label">{INFO_TIP_COPY.openInLearn}</span>
          </Link>
        </div>
      )}
    </Sheet>
  );
}
