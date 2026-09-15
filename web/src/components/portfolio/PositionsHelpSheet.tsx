/**
 * "What these numbers mean" (MOBILE §7.4, `?sheet=help&set=positions`): each PositionRow line explained
 * with its glossary entry. Labels are COPY §1.3 `position.*` display labels.
 */
import { Sheet } from '../ios/Sheet';
import { InfoTipLines } from '../ios/InfoTipSheet';
import { GLOSSARY } from '../../lib/glossary';

export const POSITIONS_HELP: { label: string; termId: string }[] = [
  { label: 'Current value (market value)', termId: 'invested' },
  { label: 'Total gain/loss (since you bought)', termId: 'totalGain' },
  { label: 'Shares owned (quantity)', termId: 'stock' },
  { label: 'Average price paid (average cost)', termId: 'avgCost' },
  { label: 'Change this session (session gain/loss)', termId: 'sessionChange' },
];

export const NUMBERS_HELP_TITLE = 'What these numbers mean';

export function PositionsHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title={NUMBERS_HELP_TITLE} detents="medium-large" showClose closeLabel="Done">
      <div className="pf-help">
        {POSITIONS_HELP.map(({ label, termId }) => {
          const entry = GLOSSARY[termId];
          if (!entry) return null;
          return (
            <section key={termId} className="pf-help__item" aria-labelledby={`pf-help-${termId}`}>
              <h3 id={`pf-help-${termId}`} className="t-headline pf-help__title">
                {label}
              </h3>
              <InfoTipLines entry={entry} headingLevel={4} density="inline" />
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
