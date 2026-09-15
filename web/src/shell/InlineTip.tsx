/** Inline-expand "?" for rows inside sheets (MOBILE §5.9): the explanation opens under the row, not in another sheet. */
import { useId, useState, type ReactNode } from 'react';
import { InfoTipButton } from '../components/ios/InfoTipButton';
import { InfoTipLines } from '../components/ios/InfoTipSheet';
import { GLOSSARY } from '../lib/glossary';

export function useInlineTip(termId: string, extra?: ReactNode): { button: ReactNode; panel: ReactNode } {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = GLOSSARY[termId];
  if (!entry) return { button: null, panel: null };
  return {
    button: <InfoTipButton entry={entry} mode="inline" expanded={open} controls={id} onClick={() => setOpen((o) => !o)} />,
    panel: open ? (
      <li className="bx-inline-tip" id={id}>
        <InfoTipLines entry={entry} density="inline" headingLevel={4} />
        {extra && <p className="t-subhead bx-inline-tip__extra">{extra}</p>}
      </li>
    ) : null,
  };
}
