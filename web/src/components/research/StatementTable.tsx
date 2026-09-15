/**
 * Statement table (MOBILE §7.8 item 4): a real <table> in a sideways-scrolling card with a sticky first column.
 * Each line name is a 44px button with a "?" that opens that term's InfoTip sheet.
 */
import { HelpCircle } from 'lucide-react';
import { GLOSSARY, infoTipAriaLabel } from '../../lib/glossary';
import { useSheet } from '../../shell/useSheet';
import type { StatementTableModel } from './researchModel';
import { RESEARCH } from './researchCopy';

export function StatementTable({ table }: { table: StatementTableModel }) {
  const { open } = useSheet();
  const last = table.years.length - 1;
  return (
    <div className="rs-table-card">
      <div className="rs-table-scroll" tabIndex={0} role="region" aria-label={RESEARCH.statementRegion[table.kind]}>
        <table className="rs-table">
          <thead>
            <tr>
              <th scope="col" className="rs-table__corner">
                <span className="sr-only">{RESEARCH.statements[table.kind]}</span>
              </th>
              {table.years.map((y, i) => (
                <th key={`${y}-${i}`} scope="col" className="t-footnote ios-num" data-latest={i === last || undefined}>
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const entry = GLOSSARY[row.termId];
              return (
                <tr key={row.label}>
                  <th scope="row" className="rs-table__name">
                    {entry ? (
                      <button
                        type="button"
                        className="rs-table__term t-footnote"
                        aria-haspopup="dialog"
                        aria-label={`${row.label}. ${infoTipAriaLabel(entry)}`}
                        onClick={() => open({ kind: 'term', id: row.termId })}
                      >
                        <span>{row.label}</span>
                        <HelpCircle size={17} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="t-footnote">{row.label}</span>
                    )}
                  </th>
                  {row.values.map((v, i) => (
                    <td key={i} className="t-footnote ios-num" data-latest={i === last || undefined}>
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
